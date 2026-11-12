-- =============================================================================
-- Comum (Onda 0): extensões de busca, oficina_config, contador de numeração,
-- auditoria (evento) e triggers genéricos reutilizáveis.
-- Áreas de permissão, aceitar_convite e definir_permissoes ficam em
-- 20261113100100_comum_areas.sql.
-- Idempotente: pode ser reaplicada (create ... if not exists / or replace,
-- drop ... if exists + create).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Extensões. No Supabase o schema "extensions" já existe (e está no
-- search_path padrão); o "if not exists" cobre o PGlite dos testes.
-- Uso em migrations: sempre qualificado (extensions.gin_trgm_ops,
-- extensions.similarity, operador extensions.%  via operator(extensions.%)).
-- -----------------------------------------------------------------------------
create schema if not exists extensions;
create extension if not exists pg_trgm with schema extensions;
create extension if not exists unaccent with schema extensions;

-- unaccent() é só STABLE (depende do dicionário/search_path), então não pode
-- ir em índice. O wrapper fixa o dicionário qualificado e o search_path,
-- o que torna seguro declará-lo IMMUTABLE (padrão recomendado para índices
-- de busca). Se o dicionário mudar, reindexar.
create or replace function private.sem_acento(p text)
returns text
language sql
immutable
strict
parallel safe
set search_path = ''
as $$
  select extensions.unaccent('extensions.unaccent'::regdictionary, p);
$$;

-- Forma canônica para busca: sem acento, minúscula, espaços colapsados.
-- Usar a MESMA expressão no índice (gin ... extensions.gin_trgm_ops) e na consulta.
create or replace function private.texto_busca(p text)
returns text
language sql
immutable
strict
parallel safe
set search_path = ''
as $$
  select lower(regexp_replace(btrim(private.sem_acento(p)), '\s+', ' ', 'g'));
$$;

-- -----------------------------------------------------------------------------
-- Triggers genéricos.
-- -----------------------------------------------------------------------------

-- versao/atualizado_em: para toda tabela editável com as colunas
-- "versao int not null default 1" e "atualizado_em timestamptz not null".
-- INSERT: versao = 1. UPDATE que muda algo: versao + 1 e atualizado_em = now().
-- Concorrência otimista: o cliente atualiza com ".eq('versao', v)"; 0 linhas
-- afetadas = "Alterado por outra pessoa. Recarregue." (versao nunca recebe
-- GRANT de UPDATE, então só este trigger a altera).
-- Uso: create trigger <t>_versao before insert or update on public.<t>
--        for each row execute function private.trg_versao();
create or replace function private.trg_versao()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.versao := 1;
    new.atualizado_em := now();
  elsif to_jsonb(new) is distinct from to_jsonb(old) then
    new.versao := old.versao + 1;
    new.atualizado_em := now();
  end if;
  return new;
end;
$$;

-- Bloqueio de UPDATE/DELETE/TRUNCATE para tabelas append-only (evento,
-- estoque_movimento, pagamento...). Vale para TODOS, inclusive funções
-- security definer e o postgres: correção = nova linha (estorno).
-- Uso: create trigger <t>_append_only before update or delete on public.<t>
--        for each row execute function private.trg_somente_insercao();
--      create trigger <t>_sem_truncate before truncate on public.<t>
--        for each statement execute function private.trg_somente_insercao();
create or replace function private.trg_somente_insercao()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'Registro somente de inclusão: % não permitido em %.', tg_op, tg_table_name
    using errcode = '42501';
end;
$$;

-- -----------------------------------------------------------------------------
-- evento: auditoria append-only.
-- -----------------------------------------------------------------------------
create table if not exists public.evento (
  id bigint generated always as identity primary key,
  org_id uuid not null references public.organizacao (id),
  entidade text not null check (char_length(entidade) between 1 and 60),
  entidade_id uuid,
  acao text not null check (char_length(acao) between 1 and 60),
  -- diff/dados sem PII sensível (colunas sensíveis são omitidas pelo trigger)
  dados jsonb not null default '{}'::jsonb check (jsonb_typeof(dados) = 'object'),
  usuario_id uuid default auth.uid(),
  em timestamptz not null default now()
);

create index if not exists evento_org_id_em_idx on public.evento (org_id, em desc);
create index if not exists evento_org_id_entidade_idx
  on public.evento (org_id, entidade, entidade_id, em desc);

drop trigger if exists evento_append_only on public.evento;
create trigger evento_append_only
  before update or delete on public.evento
  for each row execute function private.trg_somente_insercao();

drop trigger if exists evento_sem_truncate on public.evento;
create trigger evento_sem_truncate
  before truncate on public.evento
  for each statement execute function private.trg_somente_insercao();

-- Grava um evento explícito (transição, aprovação, estorno...). Chamada só de
-- dentro de RPCs security definer: sem EXECUTE para nenhuma role da API.
-- Recebe org_id porque quem chama já decidiu o acesso.
create or replace function private.registrar_evento(
  p_org_id uuid,
  p_entidade text,
  p_entidade_id uuid,
  p_acao text,
  p_dados jsonb default '{}'::jsonb
)
returns void
language sql
volatile
set search_path = ''
as $$
  insert into public.evento (org_id, entidade, entidade_id, acao, dados, usuario_id)
  values (p_org_id, p_entidade, p_entidade_id, p_acao, coalesce(p_dados, '{}'::jsonb), auth.uid());
$$;

-- Trigger genérico de auditoria (AFTER, por linha). Requisitos da tabela:
-- coluna org_id; coluna id uuid (sem id => entidade_id = org_id, para
-- tabelas 1:1 com a oficina como oficina_config).
-- Argumentos opcionais: nomes de colunas com PII que NÃO entram nos dados
-- (no UPDATE aparecem só como {"omitido": true} quando mudam).
-- dados: INSERT/DELETE = linha (sem omitidas e sem versao/criado_em/
-- atualizado_em); UPDATE = {"coluna": {"de": x, "para": y}} só do que mudou
-- (UPDATE sem mudança real não gera evento).
-- acao: criar | alterar | desativar | reativar | excluir.
-- Uso: create trigger <t>_auditoria after insert or update or delete on public.<t>
--        for each row execute function private.trg_auditar('documento', 'telefone');
create or replace function private.trg_auditar()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ignorar constant text[] := array['versao', 'criado_em', 'atualizado_em'];
  v_omitir text[] := coalesce(tg_argv::text[], '{}'::text[]);
  v_novo jsonb;
  v_velho jsonb;
  v_linha jsonb;
  v_dados jsonb := '{}'::jsonb;
  v_acao text;
  v_chave text;
  v_id text;
begin
  if tg_op = 'INSERT' then
    v_novo := to_jsonb(new);
    v_linha := v_novo;
    v_acao := 'criar';
  elsif tg_op = 'UPDATE' then
    v_novo := to_jsonb(new);
    v_velho := to_jsonb(old);
    v_linha := v_novo;
    v_acao := 'alterar';
  else
    v_velho := to_jsonb(old);
    v_linha := v_velho;
    v_acao := 'excluir';
  end if;

  if tg_op = 'UPDATE' then
    for v_chave in select jsonb_object_keys(v_novo) loop
      continue when v_chave = any (v_ignorar);
      if (v_novo -> v_chave) is distinct from (v_velho -> v_chave) then
        if v_chave = any (v_omitir) then
          v_dados := v_dados || jsonb_build_object(v_chave, jsonb_build_object('omitido', true));
        else
          v_dados := v_dados || jsonb_build_object(
            v_chave, jsonb_build_object('de', v_velho -> v_chave, 'para', v_novo -> v_chave));
        end if;
      end if;
    end loop;
    if v_dados = '{}'::jsonb then
      return null;
    end if;
    if (v_velho -> 'ativo') = 'true'::jsonb and (v_novo -> 'ativo') = 'false'::jsonb then
      v_acao := 'desativar';
    elsif (v_velho -> 'ativo') = 'false'::jsonb and (v_novo -> 'ativo') = 'true'::jsonb then
      v_acao := 'reativar';
    end if;
  else
    v_dados := (v_linha - v_ignorar) - v_omitir;
  end if;

  if (v_linha ->> 'org_id') is null then
    raise exception 'trg_auditar: % sem org_id.', tg_table_name;
  end if;

  v_id := coalesce(v_linha ->> 'id', v_linha ->> 'org_id');
  insert into public.evento (org_id, entidade, entidade_id, acao, dados, usuario_id)
  values (
    (v_linha ->> 'org_id')::uuid,
    tg_table_name,
    case when v_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
         then v_id::uuid end,
    v_acao,
    v_dados,
    auth.uid()
  );
  return null;
end;
$$;

-- -----------------------------------------------------------------------------
-- contador: numeração sequencial por oficina (OS e futuros documentos).
-- Nunca zera. Só funções internas leem/escrevem (sem GRANT).
-- -----------------------------------------------------------------------------
create table if not exists public.contador (
  org_id uuid not null references public.organizacao (id),
  chave text not null check (chave ~ '^[a-z][a-z0-9_]{0,39}$'),
  ultimo bigint not null default 0 check (ultimo >= 0),
  primary key (org_id, chave)
);

-- Próximo número da sequência (org, tipo), atômico:
-- o INSERT ... ON CONFLICT DO UPDATE trava a linha do contador até o fim da
-- transação; chamadas simultâneas da mesma oficina esperam e recebem o valor
-- seguinte (sem duplicar). Se a transação da RPC sofrer rollback, o
-- incremento volta junto (sem buraco). Oficinas diferentes não se bloqueiam.
-- SEGURANÇA: recebe org_id, então NÃO tem EXECUTE para nenhuma role da API;
-- só é chamada por RPCs security definer que já calcularam a org do usuário.
create or replace function private.proximo_numero(p_org_id uuid, p_tipo text)
returns bigint
language sql
volatile
set search_path = ''
as $$
  insert into public.contador as c (org_id, chave, ultimo)
  values (p_org_id, p_tipo, 1)
  on conflict (org_id, chave) do update set ultimo = c.ultimo + 1
  returning c.ultimo;
$$;

-- Número exibido: NNNNNN.AAAA/MM (ex.: 000001.2026/11). Sequência com no
-- mínimo 6 dígitos (cresce para 7+ acima de 999999, nunca trunca);
-- AAAA/MM = competência da criação em America/Sao_Paulo.
create or replace function private.formatar_numero(p_seq bigint, p_criado_em timestamptz)
returns text
language sql
immutable
strict
parallel safe
set search_path = ''
as $$
  select lpad(p_seq::text, greatest(6, char_length(p_seq::text)), '0')
    || '.'
    || lpad(extract(year from (p_criado_em at time zone 'America/Sao_Paulo'))::int::text, 4, '0')
    || '/'
    || lpad(extract(month from (p_criado_em at time zone 'America/Sao_Paulo'))::int::text, 2, '0');
$$;

-- -----------------------------------------------------------------------------
-- oficina_config: 1:1 com organizacao (criada por criar_oficina).
-- -----------------------------------------------------------------------------
-- Etiquetas do pátio: cada uma com 1..40 caracteres (sem espaços nas pontas).
create or replace function private.etiquetas_validas(p text[])
returns boolean
language sql
immutable
parallel safe
set search_path = ''
as $$
  select p is not null
    and cardinality(p) <= 30
    and not exists (
      select 1 from unnest(p) as e(t)
      where e.t is null or e.t <> btrim(e.t) or char_length(e.t) not between 1 and 40
    );
$$;

create table if not exists public.oficina_config (
  org_id uuid primary key references public.organizacao (id),
  telefone text check (telefone is null or telefone ~ '^[0-9]{10,11}$'),
  endereco text check (endereco is null or char_length(endereco) <= 500),
  -- CDC art. 40: validade do orçamento (padrão 10 dias).
  validade_orcamento_dias integer not null default 10
    check (validade_orcamento_dias between 1 and 365),
  -- CDC art. 26 II: nunca menos que 90 dias [JUR].
  garantia_dias integer not null default 90
    check (garantia_dias between 90 and 3650),
  termo_garantia text check (termo_garantia is null or char_length(termo_garantia) <= 5000),
  rodape_pdf text check (rodape_pdf is null or char_length(rodape_pdf) <= 1000),
  etiquetas text[] not null
    default array['Aguardando peça', 'Serviço de terceiro', 'Aguardando cliente']::text[]
    check (private.etiquetas_validas(etiquetas)),
  versao integer not null default 1,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

-- Oficinas criadas antes desta migration.
insert into public.oficina_config (org_id)
select o.id from public.organizacao o
on conflict (org_id) do nothing;

drop trigger if exists oficina_config_versao on public.oficina_config;
create trigger oficina_config_versao
  before insert or update on public.oficina_config
  for each row execute function private.trg_versao();

drop trigger if exists oficina_config_auditoria on public.oficina_config;
create trigger oficina_config_auditoria
  after insert or update or delete on public.oficina_config
  for each row execute function private.trg_auditar();

-- -----------------------------------------------------------------------------
-- criar_oficina (substitui a do núcleo): agora também cria oficina_config.
-- -----------------------------------------------------------------------------
create or replace function public.criar_oficina(p_nome text, p_documento text default null)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_usuario record;
  v_org_id uuid;
  v_nome text := btrim(coalesce(p_nome, ''));
  v_doc text := nullif(btrim(coalesce(p_documento, '')), '');
begin
  if v_uid is null then
    raise exception 'Não autenticado.' using errcode = '28000';
  end if;

  select u.email, u.email_confirmed_at, u.raw_user_meta_data
    into v_usuario
  from auth.users u
  where u.id = v_uid;

  if not found then
    raise exception 'Usuário não encontrado.' using errcode = '28000';
  end if;

  if private.config_bool('exigir_email_confirmado', true)
     and v_usuario.email_confirmed_at is null then
    raise exception 'Confirme seu e-mail antes de cadastrar a oficina.'
      using errcode = '42501';
  end if;

  if char_length(v_nome) not between 1 and 200 then
    raise exception 'Nome da oficina inválido.' using errcode = '22023';
  end if;

  if exists (select 1 from public.membro m where m.user_id = v_uid and m.ativo) then
    raise exception 'Você já faz parte de uma oficina.' using errcode = '23505';
  end if;

  insert into public.organizacao (nome, documento)
  values (v_nome, v_doc)
  returning id into v_org_id;

  insert into public.membro (org_id, user_id, papel)
  values (v_org_id, v_uid, 'dono');

  insert into public.perfil (user_id, nome)
  values (
    v_uid,
    left(coalesce(
      nullif(btrim(v_usuario.raw_user_meta_data ->> 'nome'), ''),
      nullif(btrim(v_usuario.raw_user_meta_data ->> 'full_name'), ''),
      nullif(split_part(coalesce(v_usuario.email, ''), '@', 1), ''),
      'Dono'
    ), 200)
  )
  on conflict (user_id) do nothing;

  insert into public.oficina_config (org_id)
  values (v_org_id)
  on conflict (org_id) do nothing;

  return v_org_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- RLS e grants.
-- -----------------------------------------------------------------------------
alter table public.evento enable row level security;
alter table public.contador enable row level security;
alter table public.oficina_config enable row level security;

revoke all on table public.evento, public.contador, public.oficina_config
  from public, anon, authenticated;
revoke all on sequence public.evento_id_seq from public, anon, authenticated;

-- evento: só leitura. Dono vê tudo da oficina; quem lê 'ordens' vê a
-- timeline das OS (eventos com entidade = 'ordem_servico'). Inserção só por
-- trigger/RPC definer; UPDATE/DELETE bloqueados por trigger para todos.
grant select on public.evento to authenticated;

drop policy if exists evento_select on public.evento;
create policy evento_select on public.evento
  for select to authenticated
  using (
    org_id = (select private.org_do_usuario())
    and (
      (select private.eh_dono())
      or (entidade = 'ordem_servico' and (select private.pode('ordens', 'leitura')))
    )
  );

-- contador: nenhum acesso pela API (só private.proximo_numero via RPC definer).

-- oficina_config: qualquer membro ativo lê (validade, garantia, rodapé e
-- etiquetas são usados por OS/impressão; não há dado sensível); só
-- 'configuracoes/escrita' edita. Inserção só via criar_oficina.
grant select on public.oficina_config to authenticated;
grant update (telefone, endereco, validade_orcamento_dias, garantia_dias,
  termo_garantia, rodape_pdf, etiquetas) on public.oficina_config to authenticated;

drop policy if exists oficina_config_select on public.oficina_config;
create policy oficina_config_select on public.oficina_config
  for select to authenticated
  using (org_id = (select private.org_do_usuario()));

drop policy if exists oficina_config_update on public.oficina_config;
create policy oficina_config_update on public.oficina_config
  for update to authenticated
  using (
    org_id = (select private.org_do_usuario())
    and (select private.pode('configuracoes', 'escrita'))
  )
  with check (
    org_id = (select private.org_do_usuario())
    and (select private.pode('configuracoes', 'escrita'))
  );

-- Funções: EXECUTE revogado de todos; authenticated só nas usadas em
-- consultas/CHECKs (puras). Trigger functions não precisam de EXECUTE.
revoke all on function private.sem_acento(text) from public, anon, authenticated;
revoke all on function private.texto_busca(text) from public, anon, authenticated;
revoke all on function private.trg_versao() from public, anon, authenticated;
revoke all on function private.trg_somente_insercao() from public, anon, authenticated;
revoke all on function private.trg_auditar() from public, anon, authenticated;
revoke all on function private.registrar_evento(uuid, text, uuid, text, jsonb) from public, anon, authenticated;
revoke all on function private.proximo_numero(uuid, text) from public, anon, authenticated;
revoke all on function private.formatar_numero(bigint, timestamptz) from public, anon, authenticated;
revoke all on function private.etiquetas_validas(text[]) from public, anon, authenticated;
revoke all on function public.criar_oficina(text, text) from public, anon, authenticated;

grant execute on function private.sem_acento(text) to authenticated;
grant execute on function private.texto_busca(text) to authenticated;
grant execute on function private.formatar_numero(bigint, timestamptz) to authenticated;
grant execute on function private.etiquetas_validas(text[]) to authenticated;
grant execute on function public.criar_oficina(text, text) to authenticated;
