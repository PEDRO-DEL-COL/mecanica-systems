-- =============================================================================
-- Catálogo, estoque e fornecedores (Onda A, tarefa A4).
--
-- Tabelas:
--   fornecedor              cadastro simples (estoque/financeiro)
--   item_catalogo           serviços e peças com PREÇO DE VENDA (sem custo)
--   item_custo              custo médio ponderado e último custo (só financeiro)
--   movimento_estoque       APPEND-ONLY; quantidade com sinal (+ entra, - sai)
--   movimento_estoque_custo custo unitário do movimento (só financeiro)
--   estoque_saldo (view)    saldo = soma dos movimentos (security_invoker)
--
-- Custos ocultos: RLS filtra LINHAS, não colunas, e GRANT por coluna vale
-- para todos os usuários de authenticated. Por isso o custo mora em
-- tabelas-sombra com RLS de 'financeiro/leitura' (REGRAS §6).
--
-- Movimentos só nascem pelas RPCs security definer abaixo (sem GRANT de
-- INSERT); UPDATE/DELETE/TRUNCATE bloqueados por trigger para todos,
-- inclusive dono e postgres. Correção = movimento inverso (estorno).
--
-- Sinal da quantidade por tipo:
--   entrada   > 0  (compra; grava custo e recalcula custo médio)
--   saida_os  < 0  (baixa pela OS; RPC da tarefa B5)
--   devolucao < 0  (devolução ao fornecedor, sai pelo custo da entrada)
--   ajuste   != 0  (motivo obrigatório; não mexe no custo médio)
--   estorno  != 0  (inverso exato de outro movimento, 1 por movimento)
--
-- os_id fica sem FK até a migração de OS (B5) criar ordem_servico.
-- Idempotente: pode ser reaplicada.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- fornecedor
-- -----------------------------------------------------------------------------
create table if not exists public.fornecedor (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default private.org_do_usuario() references public.organizacao (id),
  nome text not null check (nome = btrim(nome) and char_length(nome) between 1 and 200),
  documento text check (documento is null or documento ~ '^([0-9]{11}|[0-9]{14})$'),
  contato text check (contato is null or char_length(contato) <= 200),
  telefone text check (telefone is null or telefone ~ '^[0-9]{10,11}$'),
  email text check (email is null or (email = lower(btrim(email)) and position('@' in email) > 1
                                      and char_length(email) <= 254)),
  observacao text check (observacao is null or char_length(observacao) <= 1000),
  ativo boolean not null default true,
  -- busca sem acento (mesma expressão no índice trigram e no filtro ilike)
  busca text generated always as (private.texto_busca(nome)) stored,
  versao integer not null default 1,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  constraint fornecedor_org_id_id_key unique (org_id, id)
);

create index if not exists fornecedor_org_id_nome_idx on public.fornecedor (org_id, ativo, nome);
create index if not exists fornecedor_busca_trgm_idx
  on public.fornecedor using gin (busca extensions.gin_trgm_ops);
create unique index if not exists fornecedor_org_id_documento_ativo_key
  on public.fornecedor (org_id, documento) where ativo and documento is not null;

-- -----------------------------------------------------------------------------
-- item_catalogo (sem nenhuma coluna de custo)
-- -----------------------------------------------------------------------------
create table if not exists public.item_catalogo (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default private.org_do_usuario() references public.organizacao (id),
  tipo text not null check (tipo in ('servico', 'peca')),
  codigo text check (codigo is null or (codigo = btrim(codigo) and char_length(codigo) between 1 and 60)),
  codigo_fabricante text check (codigo_fabricante is null
    or (codigo_fabricante = btrim(codigo_fabricante) and char_length(codigo_fabricante) between 1 and 60)),
  descricao text not null check (descricao = btrim(descricao) and char_length(descricao) between 1 and 300),
  unidade text not null default 'un' check (unidade = btrim(unidade) and char_length(unidade) between 1 and 10),
  preco_venda_centavos bigint not null default 0 check (preco_venda_centavos >= 0),
  -- só peça controla estoque
  controla_estoque boolean not null default false,
  estoque_minimo numeric(12, 3) not null default 0 check (estoque_minimo >= 0),
  -- prateleira/gaveta
  localizacao text check (localizacao is null or char_length(localizacao) <= 60),
  ativo boolean not null default true,
  busca text generated always as (
    private.texto_busca(coalesce(codigo, '') || ' ' || coalesce(codigo_fabricante, '') || ' ' || descricao)
  ) stored,
  versao integer not null default 1,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  constraint item_catalogo_org_id_id_key unique (org_id, id),
  constraint item_catalogo_controla_estoque_peca check (tipo = 'peca' or not controla_estoque)
);

create index if not exists item_catalogo_org_id_descricao_idx
  on public.item_catalogo (org_id, ativo, tipo, descricao);
create index if not exists item_catalogo_busca_trgm_idx
  on public.item_catalogo using gin (busca extensions.gin_trgm_ops);
-- Código único por oficina entre ativos (sem diferenciar maiúsculas).
create unique index if not exists item_catalogo_org_id_codigo_ativo_key
  on public.item_catalogo (org_id, lower(codigo)) where ativo and codigo is not null;

-- -----------------------------------------------------------------------------
-- item_custo: 1:1 com item_catalogo, criado na 1ª entrada (ou definir_custo_item).
-- Sem GRANT de escrita: só as RPCs definer gravam.
-- -----------------------------------------------------------------------------
create table if not exists public.item_custo (
  item_id uuid primary key,
  org_id uuid not null,
  custo_medio_centavos bigint not null default 0 check (custo_medio_centavos >= 0),
  ultimo_custo_centavos bigint check (ultimo_custo_centavos is null or ultimo_custo_centavos >= 0),
  atualizado_em timestamptz not null default now(),
  constraint item_custo_item_fk foreign key (org_id, item_id)
    references public.item_catalogo (org_id, id)
);

create index if not exists item_custo_org_id_idx on public.item_custo (org_id, item_id);

-- -----------------------------------------------------------------------------
-- movimento_estoque (append-only)
-- -----------------------------------------------------------------------------
create table if not exists public.movimento_estoque (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizacao (id),
  item_id uuid not null,
  tipo text not null check (tipo in ('entrada', 'saida_os', 'estorno', 'ajuste', 'devolucao')),
  quantidade numeric(12, 3) not null check (quantidade <> 0),
  motivo text check (motivo is null or (motivo = btrim(motivo) and char_length(motivo) between 3 and 500)),
  fornecedor_id uuid,
  os_id uuid,
  nota_fiscal text check (nota_fiscal is null or (nota_fiscal = btrim(nota_fiscal)
                                                  and char_length(nota_fiscal) between 1 and 60)),
  -- estorno: movimento estornado (no máximo 1 estorno por movimento)
  estorna_id uuid,
  -- devolução: entrada de origem (custo e fornecedor)
  entrada_id uuid,
  idempotency_key uuid,
  criado_por uuid default auth.uid(),
  criado_em timestamptz not null default now(),
  constraint movimento_estoque_org_id_id_key unique (org_id, id),
  constraint movimento_estoque_item_fk foreign key (org_id, item_id)
    references public.item_catalogo (org_id, id),
  constraint movimento_estoque_fornecedor_fk foreign key (org_id, fornecedor_id)
    references public.fornecedor (org_id, id),
  constraint movimento_estoque_estorna_fk foreign key (org_id, estorna_id)
    references public.movimento_estoque (org_id, id),
  constraint movimento_estoque_entrada_fk foreign key (org_id, entrada_id)
    references public.movimento_estoque (org_id, id),
  constraint movimento_estoque_sinal check (
    (tipo = 'entrada' and quantidade > 0)
    or (tipo in ('saida_os', 'devolucao') and quantidade < 0)
    or tipo in ('ajuste', 'estorno')
  ),
  constraint movimento_estoque_motivo_obrigatorio check (
    tipo not in ('ajuste', 'estorno') or motivo is not null
  ),
  constraint movimento_estoque_estorna check ((tipo = 'estorno') = (estorna_id is not null)),
  constraint movimento_estoque_entrada check ((tipo = 'devolucao') = (entrada_id is not null))
);

create index if not exists movimento_estoque_org_id_item_idx
  on public.movimento_estoque (org_id, item_id, criado_em desc);
create index if not exists movimento_estoque_org_id_criado_em_idx
  on public.movimento_estoque (org_id, criado_em desc);
create index if not exists movimento_estoque_org_id_entrada_idx
  on public.movimento_estoque (org_id, entrada_id) where entrada_id is not null;
create index if not exists movimento_estoque_org_id_os_idx
  on public.movimento_estoque (org_id, os_id) where os_id is not null;
-- Um estorno por movimento (também segura corrida entre dois estornos).
create unique index if not exists movimento_estoque_estorna_id_key
  on public.movimento_estoque (estorna_id) where estorna_id is not null;
create unique index if not exists movimento_estoque_idempotency_key
  on public.movimento_estoque (org_id, idempotency_key) where idempotency_key is not null;

-- -----------------------------------------------------------------------------
-- movimento_estoque_custo (append-only; só financeiro lê)
-- -----------------------------------------------------------------------------
create table if not exists public.movimento_estoque_custo (
  movimento_id uuid primary key,
  org_id uuid not null,
  custo_unitario_centavos bigint not null check (custo_unitario_centavos >= 0),
  criado_em timestamptz not null default now(),
  constraint movimento_estoque_custo_movimento_fk foreign key (org_id, movimento_id)
    references public.movimento_estoque (org_id, id)
);

create index if not exists movimento_estoque_custo_org_id_idx
  on public.movimento_estoque_custo (org_id, movimento_id);

-- -----------------------------------------------------------------------------
-- Triggers: versão, auditoria, append-only, guarda de tipo do item.
-- -----------------------------------------------------------------------------
drop trigger if exists fornecedor_versao on public.fornecedor;
create trigger fornecedor_versao
  before insert or update on public.fornecedor
  for each row execute function private.trg_versao();

drop trigger if exists fornecedor_auditoria on public.fornecedor;
create trigger fornecedor_auditoria
  after insert or update or delete on public.fornecedor
  for each row execute function private.trg_auditar('documento', 'telefone', 'email', 'busca');

drop trigger if exists item_catalogo_versao on public.item_catalogo;
create trigger item_catalogo_versao
  before insert or update on public.item_catalogo
  for each row execute function private.trg_versao();

drop trigger if exists item_catalogo_auditoria on public.item_catalogo;
create trigger item_catalogo_auditoria
  after insert or update or delete on public.item_catalogo
  for each row execute function private.trg_auditar('busca');

drop trigger if exists movimento_estoque_auditoria on public.movimento_estoque;
create trigger movimento_estoque_auditoria
  after insert on public.movimento_estoque
  for each row execute function private.trg_auditar();

drop trigger if exists movimento_estoque_append_only on public.movimento_estoque;
create trigger movimento_estoque_append_only
  before update or delete on public.movimento_estoque
  for each row execute function private.trg_somente_insercao();

drop trigger if exists movimento_estoque_sem_truncate on public.movimento_estoque;
create trigger movimento_estoque_sem_truncate
  before truncate on public.movimento_estoque
  for each statement execute function private.trg_somente_insercao();

drop trigger if exists movimento_estoque_custo_append_only on public.movimento_estoque_custo;
create trigger movimento_estoque_custo_append_only
  before update or delete on public.movimento_estoque_custo
  for each row execute function private.trg_somente_insercao();

drop trigger if exists movimento_estoque_custo_sem_truncate on public.movimento_estoque_custo;
create trigger movimento_estoque_custo_sem_truncate
  before truncate on public.movimento_estoque_custo
  for each statement execute function private.trg_somente_insercao();

-- Item com movimentos não pode deixar de ser peça com controle de estoque
-- (o saldo perderia o sentido). definer: quem edita o catálogo pode não ter
-- leitura de estoque, e a RLS esconderia os movimentos.
create or replace function private.trg_item_catalogo_guarda()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (new.tipo is distinct from old.tipo or (old.controla_estoque and not new.controla_estoque))
     and exists (
       select 1 from public.movimento_estoque m
       where m.org_id = old.org_id and m.item_id = old.id
     ) then
    raise exception 'Item com movimentos de estoque: não é possível mudar o tipo nem desligar o controle de estoque.'
      using errcode = 'P0001';
  end if;
  if new.org_id is distinct from old.org_id then
    raise exception 'Não é possível mudar a oficina do item.' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists item_catalogo_guarda on public.item_catalogo;
create trigger item_catalogo_guarda
  before update on public.item_catalogo
  for each row execute function private.trg_item_catalogo_guarda();

-- -----------------------------------------------------------------------------
-- View de saldo: soma dos movimentos por peça controlada.
-- security_invoker: aplica a RLS de quem consulta; exige estoque/leitura
-- (sem isso, quem só lê catálogo veria saldo 0 falso).
-- -----------------------------------------------------------------------------
create or replace view public.estoque_saldo
with (security_invoker = true)
as
select
  i.org_id,
  i.id as item_id,
  i.codigo,
  i.descricao,
  i.unidade,
  i.localizacao,
  i.estoque_minimo,
  i.ativo,
  i.busca,
  coalesce(s.saldo, 0)::numeric(15, 3) as saldo,
  coalesce(s.saldo, 0) < 0 as negativo,
  coalesce(s.saldo, 0) < i.estoque_minimo as abaixo_minimo
from public.item_catalogo i
left join lateral (
  select sum(m.quantidade) as saldo
  from public.movimento_estoque m
  where m.org_id = i.org_id and m.item_id = i.id
) s on true
where i.tipo = 'peca'
  and i.controla_estoque
  and (select private.pode('estoque', 'leitura'));

-- -----------------------------------------------------------------------------
-- Funções internas (sem EXECUTE para roles da API; chamadas só por RPCs
-- definer, que rodam como o dono das tabelas).
-- -----------------------------------------------------------------------------

-- Org do usuário logado se ele tem a área/nível; senão erro.
create or replace function private.exigir_acesso_estoque(p_area text, p_nivel text)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_org uuid;
begin
  if (select auth.uid()) is null then
    raise exception 'Não autenticado.' using errcode = '28000';
  end if;
  v_org := private.org_do_usuario();
  if v_org is null or not private.pode(p_area, p_nivel) then
    raise exception 'Você não tem permissão para esta ação.' using errcode = '42501';
  end if;
  return v_org;
end;
$$;

-- Trava o item (serializa movimentos concorrentes do mesmo item) e valida.
create or replace function private.estoque_travar_item(p_org_id uuid, p_item_id uuid, p_exigir_ativo boolean)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_item record;
begin
  select i.tipo, i.controla_estoque, i.ativo into v_item
  from public.item_catalogo i
  where i.org_id = p_org_id and i.id = p_item_id
  for update;
  if not found then
    raise exception 'Item não encontrado.' using errcode = 'P0001';
  end if;
  if v_item.tipo <> 'peca' or not v_item.controla_estoque then
    raise exception 'Este item não controla estoque.' using errcode = 'P0001';
  end if;
  if p_exigir_ativo and not v_item.ativo then
    raise exception 'Item inativo.' using errcode = 'P0001';
  end if;
end;
$$;

create or replace function private.estoque_saldo_item(p_org_id uuid, p_item_id uuid)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(sum(m.quantidade), 0)
  from public.movimento_estoque m
  where m.org_id = p_org_id and m.item_id = p_item_id;
$$;

-- Recalcula o custo médio ponderado ao movimentar p_qtd (com sinal) a
-- p_custo por unidade, a partir do saldo ANTES do movimento:
--   entrada (q>0): saldo <= 0 => médio = custo; senão (S*M + q*c)/(S+q)
--   saída a custo próprio (q<0, devolução/estorno de entrada):
--     S > 0 e S+q > 0 => (S*M + q*c)/(S+q) (mínimo 0); senão mantém.
-- Arredonda para o centavo (meio para cima).
create or replace function private.estoque_aplicar_custo(
  p_org_id uuid, p_item_id uuid, p_saldo_antes numeric, p_qtd numeric, p_custo bigint
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_medio bigint;
  v_novo bigint;
  v_saldo_depois numeric := p_saldo_antes + p_qtd;
begin
  insert into public.item_custo (item_id, org_id) values (p_item_id, p_org_id)
  on conflict (item_id) do nothing;

  select c.custo_medio_centavos into v_medio
  from public.item_custo c
  where c.item_id = p_item_id and c.org_id = p_org_id
  for update;

  if p_qtd > 0 then
    if p_saldo_antes <= 0 then
      v_novo := p_custo;
    else
      v_novo := round((p_saldo_antes * v_medio + p_qtd * p_custo) / v_saldo_depois)::bigint;
    end if;
  elsif p_saldo_antes > 0 and v_saldo_depois > 0 then
    v_novo := greatest(0, round((p_saldo_antes * v_medio + p_qtd * p_custo) / v_saldo_depois))::bigint;
  else
    v_novo := v_medio;
  end if;

  update public.item_custo c
     set custo_medio_centavos = v_novo, atualizado_em = now()
   where c.item_id = p_item_id and c.org_id = p_org_id;
end;
$$;

-- Último custo = custo da entrada mais recente não estornada (null se nenhuma).
create or replace function private.estoque_atualizar_ultimo_custo(p_org_id uuid, p_item_id uuid)
returns void
language sql
volatile
security definer
set search_path = ''
as $$
  update public.item_custo c
     set ultimo_custo_centavos = (
           select mc.custo_unitario_centavos
           from public.movimento_estoque m
           join public.movimento_estoque_custo mc on mc.org_id = m.org_id and mc.movimento_id = m.id
           where m.org_id = p_org_id and m.item_id = p_item_id and m.tipo = 'entrada'
             and not exists (select 1 from public.movimento_estoque e
                             where e.org_id = m.org_id and e.estorna_id = m.id)
           order by m.criado_em desc, m.id desc
           limit 1
         ),
         atualizado_em = now()
   where c.org_id = p_org_id and c.item_id = p_item_id;
$$;

-- Resposta padrão das RPCs: saldo como texto decimal (o TS trata quantidade
-- como string) e sinalização de saldo negativo.
create or replace function private.estoque_resposta(p_org_id uuid, p_item_id uuid, p_movimento_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_saldo numeric := private.estoque_saldo_item(p_org_id, p_item_id);
begin
  return jsonb_build_object(
    'movimento_id', p_movimento_id,
    'item_id', p_item_id,
    'saldo', v_saldo::numeric(15, 3)::text,
    'negativo', v_saldo < 0
  );
end;
$$;

-- Movimento já registrado com esta chave de idempotência (ou null).
create or replace function private.estoque_movimento_por_chave(
  p_org_id uuid, p_chave uuid, out o_id uuid, out o_item_id uuid
)
language sql
stable
security definer
set search_path = ''
as $$
  select m.id, m.item_id
  from public.movimento_estoque m
  where m.org_id = p_org_id and m.idempotency_key = p_chave;
$$;

-- Estorno sem checagem de permissão (quem chama já decidiu o acesso).
-- Reutilizável pela RPC da OS (B5) para estornar saida_os.
-- Cria o movimento inverso; se o original tem custo, refaz o custo médio
-- com o mesmo custo unitário. Devolve o id do estorno.
create or replace function private.estoque_estornar(p_org_id uuid, p_movimento_id uuid, p_motivo text)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_orig record;
  v_custo bigint;
  v_saldo numeric;
  v_motivo text := nullif(btrim(coalesce(p_motivo, '')), '');
  v_id uuid;
begin
  if v_motivo is null or char_length(v_motivo) not between 3 and 500 then
    raise exception 'Informe o motivo do estorno (3 a 500 caracteres).' using errcode = 'P0001';
  end if;

  select m.id, m.item_id, m.tipo, m.quantidade, m.fornecedor_id, m.os_id into v_orig
  from public.movimento_estoque m
  where m.org_id = p_org_id and m.id = p_movimento_id;
  if not found then
    raise exception 'Movimento não encontrado.' using errcode = 'P0001';
  end if;
  if v_orig.tipo = 'estorno' then
    raise exception 'Não é possível estornar um estorno.' using errcode = 'P0001';
  end if;

  perform private.estoque_travar_item(p_org_id, v_orig.item_id, false);

  if exists (select 1 from public.movimento_estoque e
             where e.org_id = p_org_id and e.estorna_id = p_movimento_id) then
    raise exception 'Este movimento já foi estornado.' using errcode = 'P0001';
  end if;
  if v_orig.tipo = 'entrada' and exists (
    select 1 from public.movimento_estoque d
    where d.org_id = p_org_id and d.entrada_id = p_movimento_id
      and not exists (select 1 from public.movimento_estoque e
                      where e.org_id = d.org_id and e.estorna_id = d.id)
  ) then
    raise exception 'Esta entrada tem devoluções. Estorne as devoluções antes.' using errcode = 'P0001';
  end if;

  v_saldo := private.estoque_saldo_item(p_org_id, v_orig.item_id);

  insert into public.movimento_estoque
    (org_id, item_id, tipo, quantidade, motivo, fornecedor_id, os_id, estorna_id)
  values
    (p_org_id, v_orig.item_id, 'estorno', -v_orig.quantidade, v_motivo,
     v_orig.fornecedor_id, v_orig.os_id, p_movimento_id)
  returning id into v_id;

  select mc.custo_unitario_centavos into v_custo
  from public.movimento_estoque_custo mc
  where mc.org_id = p_org_id and mc.movimento_id = p_movimento_id;

  if v_custo is not null then
    insert into public.movimento_estoque_custo (movimento_id, org_id, custo_unitario_centavos)
    values (v_id, p_org_id, v_custo);
    perform private.estoque_aplicar_custo(p_org_id, v_orig.item_id, v_saldo, -v_orig.quantidade, v_custo);
    if v_orig.tipo = 'entrada' then
      perform private.estoque_atualizar_ultimo_custo(p_org_id, v_orig.item_id);
    end if;
  end if;

  return v_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- RPCs públicas (estoque/escrita). Não recebem org/usuário: tudo sai de
-- auth.uid(). Quem tem só estoque/escrita DIGITA o custo da entrada mas não
-- consegue ler item_custo (RLS de financeiro) nem recebe o custo de volta.
-- -----------------------------------------------------------------------------

-- Entrada de compra: grava movimento + custo e recalcula o custo médio.
create or replace function public.registrar_entrada_estoque(
  p_item_id uuid,
  p_quantidade numeric,
  p_custo_unitario_centavos bigint,
  p_fornecedor_id uuid default null,
  p_nota_fiscal text default null,
  p_idempotency_key uuid default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_org uuid := private.exigir_acesso_estoque('estoque', 'escrita');
  v_existente record;
  v_saldo numeric;
  v_id uuid;
  v_nf text := nullif(btrim(coalesce(p_nota_fiscal, '')), '');
begin
  if p_idempotency_key is not null then
    select * into v_existente from private.estoque_movimento_por_chave(v_org, p_idempotency_key);
    if v_existente.o_id is not null then
      return private.estoque_resposta(v_org, v_existente.o_item_id, v_existente.o_id);
    end if;
  end if;

  if p_quantidade is null or p_quantidade <= 0 or p_quantidade <> round(p_quantidade, 3)
     or p_quantidade >= 1000000000 then
    raise exception 'Quantidade inválida: maior que zero, até 3 casas decimais.' using errcode = 'P0001';
  end if;
  if p_custo_unitario_centavos is null or p_custo_unitario_centavos < 0 then
    raise exception 'Informe o custo unitário (zero ou mais).' using errcode = 'P0001';
  end if;
  if p_fornecedor_id is not null and not exists (
    select 1 from public.fornecedor f
    where f.org_id = v_org and f.id = p_fornecedor_id and f.ativo
  ) then
    raise exception 'Fornecedor não encontrado ou inativo.' using errcode = 'P0001';
  end if;

  perform private.estoque_travar_item(v_org, p_item_id, true);
  v_saldo := private.estoque_saldo_item(v_org, p_item_id);

  insert into public.movimento_estoque
    (org_id, item_id, tipo, quantidade, fornecedor_id, nota_fiscal, idempotency_key)
  values
    (v_org, p_item_id, 'entrada', p_quantidade, p_fornecedor_id, v_nf, p_idempotency_key)
  returning id into v_id;

  insert into public.movimento_estoque_custo (movimento_id, org_id, custo_unitario_centavos)
  values (v_id, v_org, p_custo_unitario_centavos);

  perform private.estoque_aplicar_custo(v_org, p_item_id, v_saldo, p_quantidade, p_custo_unitario_centavos);
  update public.item_custo c
     set ultimo_custo_centavos = p_custo_unitario_centavos
   where c.org_id = v_org and c.item_id = p_item_id;

  return private.estoque_resposta(v_org, p_item_id, v_id);
end;
$$;

-- Ajuste (inventário, perda, achado): delta com sinal e motivo obrigatório.
-- Não altera o custo médio.
create or replace function public.registrar_ajuste_estoque(
  p_item_id uuid,
  p_delta numeric,
  p_motivo text,
  p_idempotency_key uuid default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_org uuid := private.exigir_acesso_estoque('estoque', 'escrita');
  v_existente record;
  v_motivo text := nullif(btrim(coalesce(p_motivo, '')), '');
  v_id uuid;
begin
  if p_idempotency_key is not null then
    select * into v_existente from private.estoque_movimento_por_chave(v_org, p_idempotency_key);
    if v_existente.o_id is not null then
      return private.estoque_resposta(v_org, v_existente.o_item_id, v_existente.o_id);
    end if;
  end if;

  if v_motivo is null or char_length(v_motivo) not between 3 and 500 then
    raise exception 'Informe o motivo do ajuste (3 a 500 caracteres).' using errcode = 'P0001';
  end if;
  if p_delta is null or p_delta = 0 or p_delta <> round(p_delta, 3) or abs(p_delta) >= 1000000000 then
    raise exception 'Quantidade do ajuste inválida: diferente de zero, até 3 casas decimais.'
      using errcode = 'P0001';
  end if;

  perform private.estoque_travar_item(v_org, p_item_id, true);

  insert into public.movimento_estoque (org_id, item_id, tipo, quantidade, motivo, idempotency_key)
  values (v_org, p_item_id, 'ajuste', p_delta, v_motivo, p_idempotency_key)
  returning id into v_id;

  return private.estoque_resposta(v_org, p_item_id, v_id);
end;
$$;

-- Devolução ao fornecedor de parte (ou toda) uma entrada: sai pelo custo
-- daquela entrada e refaz o custo médio.
create or replace function public.registrar_devolucao_estoque(
  p_entrada_id uuid,
  p_quantidade numeric,
  p_motivo text default null,
  p_idempotency_key uuid default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_org uuid := private.exigir_acesso_estoque('estoque', 'escrita');
  v_existente record;
  v_entrada record;
  v_custo bigint;
  v_devolvido numeric;
  v_saldo numeric;
  v_motivo text := nullif(btrim(coalesce(p_motivo, '')), '');
  v_id uuid;
begin
  if p_idempotency_key is not null then
    select * into v_existente from private.estoque_movimento_por_chave(v_org, p_idempotency_key);
    if v_existente.o_id is not null then
      return private.estoque_resposta(v_org, v_existente.o_item_id, v_existente.o_id);
    end if;
  end if;

  if p_quantidade is null or p_quantidade <= 0 or p_quantidade <> round(p_quantidade, 3) then
    raise exception 'Quantidade inválida: maior que zero, até 3 casas decimais.' using errcode = 'P0001';
  end if;
  if v_motivo is not null and char_length(v_motivo) not between 3 and 500 then
    raise exception 'Motivo deve ter de 3 a 500 caracteres.' using errcode = 'P0001';
  end if;

  select m.id, m.item_id, m.quantidade, m.fornecedor_id into v_entrada
  from public.movimento_estoque m
  where m.org_id = v_org and m.id = p_entrada_id and m.tipo = 'entrada';
  if not found then
    raise exception 'Entrada não encontrada.' using errcode = 'P0001';
  end if;

  perform private.estoque_travar_item(v_org, v_entrada.item_id, false);

  if exists (select 1 from public.movimento_estoque e
             where e.org_id = v_org and e.estorna_id = p_entrada_id) then
    raise exception 'Esta entrada foi estornada.' using errcode = 'P0001';
  end if;

  select coalesce(-sum(d.quantidade), 0) into v_devolvido
  from public.movimento_estoque d
  where d.org_id = v_org and d.entrada_id = p_entrada_id
    and not exists (select 1 from public.movimento_estoque e
                    where e.org_id = d.org_id and e.estorna_id = d.id);
  if v_devolvido + p_quantidade > v_entrada.quantidade then
    raise exception 'Quantidade maior que a disponível para devolução desta entrada.' using errcode = 'P0001';
  end if;

  select mc.custo_unitario_centavos into v_custo
  from public.movimento_estoque_custo mc
  where mc.org_id = v_org and mc.movimento_id = p_entrada_id;

  v_saldo := private.estoque_saldo_item(v_org, v_entrada.item_id);

  insert into public.movimento_estoque
    (org_id, item_id, tipo, quantidade, motivo, fornecedor_id, entrada_id, idempotency_key)
  values
    (v_org, v_entrada.item_id, 'devolucao', -p_quantidade, v_motivo, v_entrada.fornecedor_id,
     p_entrada_id, p_idempotency_key)
  returning id into v_id;

  if v_custo is not null then
    insert into public.movimento_estoque_custo (movimento_id, org_id, custo_unitario_centavos)
    values (v_id, v_org, v_custo);
    perform private.estoque_aplicar_custo(v_org, v_entrada.item_id, v_saldo, -p_quantidade, v_custo);
  end if;

  return private.estoque_resposta(v_org, v_entrada.item_id, v_id);
end;
$$;

-- Estorno manual: entrada, ajuste ou devolução (saída de OS é estornada
-- pela própria OS). Um estorno por movimento.
create or replace function public.estornar_movimento(p_movimento_id uuid, p_motivo text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_org uuid := private.exigir_acesso_estoque('estoque', 'escrita');
  v_tipo text;
  v_item uuid;
  v_id uuid;
begin
  select m.tipo, m.item_id into v_tipo, v_item
  from public.movimento_estoque m
  where m.org_id = v_org and m.id = p_movimento_id;
  if not found then
    raise exception 'Movimento não encontrado.' using errcode = 'P0001';
  end if;
  if v_tipo = 'saida_os' then
    raise exception 'Saída de OS é estornada pela própria OS.' using errcode = 'P0001';
  end if;

  v_id := private.estoque_estornar(v_org, p_movimento_id, p_motivo);
  return private.estoque_resposta(v_org, v_item, v_id);
end;
$$;

-- Custo médio informado à mão (ex.: serviço, estoque inicial): financeiro/escrita.
create or replace function public.definir_custo_item(p_item_id uuid, p_custo_medio_centavos bigint)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_org uuid := private.exigir_acesso_estoque('financeiro', 'escrita');
  v_antes bigint;
begin
  if p_custo_medio_centavos is null or p_custo_medio_centavos < 0 then
    raise exception 'Custo inválido.' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.item_catalogo i where i.org_id = v_org and i.id = p_item_id) then
    raise exception 'Item não encontrado.' using errcode = 'P0001';
  end if;

  insert into public.item_custo (item_id, org_id) values (p_item_id, v_org)
  on conflict (item_id) do nothing;
  select c.custo_medio_centavos into v_antes
  from public.item_custo c where c.org_id = v_org and c.item_id = p_item_id for update;

  update public.item_custo c
     set custo_medio_centavos = p_custo_medio_centavos, atualizado_em = now()
   where c.org_id = v_org and c.item_id = p_item_id;

  if v_antes is distinct from p_custo_medio_centavos then
    perform private.registrar_evento(v_org, 'item_custo', p_item_id, 'definir_custo',
      jsonb_build_object('custo_medio_centavos', jsonb_build_object('de', v_antes, 'para', p_custo_medio_centavos)));
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- RLS e grants.
-- -----------------------------------------------------------------------------
alter table public.fornecedor enable row level security;
alter table public.item_catalogo enable row level security;
alter table public.item_custo enable row level security;
alter table public.movimento_estoque enable row level security;
alter table public.movimento_estoque_custo enable row level security;

revoke all on table public.fornecedor, public.item_catalogo, public.item_custo,
  public.movimento_estoque, public.movimento_estoque_custo, public.estoque_saldo
  from public, anon, authenticated;

-- fornecedor: estoque lê/escreve; financeiro também (contas a pagar).
grant select on public.fornecedor to authenticated;
grant insert (id, org_id, nome, documento, contato, telefone, email, observacao, ativo)
  on public.fornecedor to authenticated;
grant update (nome, documento, contato, telefone, email, observacao, ativo)
  on public.fornecedor to authenticated;

drop policy if exists fornecedor_select on public.fornecedor;
create policy fornecedor_select on public.fornecedor
  for select to authenticated
  using (
    org_id = (select private.org_do_usuario())
    and ((select private.pode('estoque', 'leitura')) or (select private.pode('financeiro', 'leitura')))
  );

drop policy if exists fornecedor_insert on public.fornecedor;
create policy fornecedor_insert on public.fornecedor
  for insert to authenticated
  with check (
    org_id = (select private.org_do_usuario())
    and ((select private.pode('estoque', 'escrita')) or (select private.pode('financeiro', 'escrita')))
  );

drop policy if exists fornecedor_update on public.fornecedor;
create policy fornecedor_update on public.fornecedor
  for update to authenticated
  using (
    org_id = (select private.org_do_usuario())
    and ((select private.pode('estoque', 'escrita')) or (select private.pode('financeiro', 'escrita')))
  )
  with check (
    org_id = (select private.org_do_usuario())
    and ((select private.pode('estoque', 'escrita')) or (select private.pode('financeiro', 'escrita')))
  );

-- item_catalogo: catalogo lê (estoque também, pela dependência
-- estoque => catalogo; repetido aqui para não depender só dela);
-- catalogo/escrita cria, edita preço de venda e desativa.
grant select on public.item_catalogo to authenticated;
grant insert (id, org_id, tipo, codigo, codigo_fabricante, descricao, unidade, preco_venda_centavos,
  controla_estoque, estoque_minimo, localizacao, ativo) on public.item_catalogo to authenticated;
grant update (tipo, codigo, codigo_fabricante, descricao, unidade, preco_venda_centavos,
  controla_estoque, estoque_minimo, localizacao, ativo) on public.item_catalogo to authenticated;

drop policy if exists item_catalogo_select on public.item_catalogo;
create policy item_catalogo_select on public.item_catalogo
  for select to authenticated
  using (
    org_id = (select private.org_do_usuario())
    and ((select private.pode('catalogo', 'leitura')) or (select private.pode('estoque', 'leitura')))
  );

drop policy if exists item_catalogo_insert on public.item_catalogo;
create policy item_catalogo_insert on public.item_catalogo
  for insert to authenticated
  with check (
    org_id = (select private.org_do_usuario())
    and (select private.pode('catalogo', 'escrita'))
  );

drop policy if exists item_catalogo_update on public.item_catalogo;
create policy item_catalogo_update on public.item_catalogo
  for update to authenticated
  using (
    org_id = (select private.org_do_usuario())
    and (select private.pode('catalogo', 'escrita'))
  )
  with check (
    org_id = (select private.org_do_usuario())
    and (select private.pode('catalogo', 'escrita'))
  );

-- item_custo / movimento_estoque_custo: só leitura e só com financeiro.
grant select on public.item_custo to authenticated;
grant select on public.movimento_estoque_custo to authenticated;

drop policy if exists item_custo_select on public.item_custo;
create policy item_custo_select on public.item_custo
  for select to authenticated
  using (
    org_id = (select private.org_do_usuario())
    and (select private.pode('financeiro', 'leitura'))
  );

drop policy if exists movimento_estoque_custo_select on public.movimento_estoque_custo;
create policy movimento_estoque_custo_select on public.movimento_estoque_custo
  for select to authenticated
  using (
    org_id = (select private.org_do_usuario())
    and (select private.pode('financeiro', 'leitura'))
  );

-- movimento_estoque: só leitura (estoque); inserção só via RPC.
grant select on public.movimento_estoque to authenticated;

drop policy if exists movimento_estoque_select on public.movimento_estoque;
create policy movimento_estoque_select on public.movimento_estoque
  for select to authenticated
  using (
    org_id = (select private.org_do_usuario())
    and (select private.pode('estoque', 'leitura'))
  );

grant select on public.estoque_saldo to authenticated;

-- Funções.
revoke all on function private.trg_item_catalogo_guarda() from public, anon, authenticated;
revoke all on function private.exigir_acesso_estoque(text, text) from public, anon, authenticated;
revoke all on function private.estoque_travar_item(uuid, uuid, boolean) from public, anon, authenticated;
revoke all on function private.estoque_saldo_item(uuid, uuid) from public, anon, authenticated;
revoke all on function private.estoque_aplicar_custo(uuid, uuid, numeric, numeric, bigint) from public, anon, authenticated;
revoke all on function private.estoque_atualizar_ultimo_custo(uuid, uuid) from public, anon, authenticated;
revoke all on function private.estoque_resposta(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function private.estoque_movimento_por_chave(uuid, uuid, out uuid, out uuid) from public, anon, authenticated;
revoke all on function private.estoque_estornar(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.registrar_entrada_estoque(uuid, numeric, bigint, uuid, text, uuid) from public, anon, authenticated;
revoke all on function public.registrar_ajuste_estoque(uuid, numeric, text, uuid) from public, anon, authenticated;
revoke all on function public.registrar_devolucao_estoque(uuid, numeric, text, uuid) from public, anon, authenticated;
revoke all on function public.estornar_movimento(uuid, text) from public, anon, authenticated;
revoke all on function public.definir_custo_item(uuid, bigint) from public, anon, authenticated;

grant execute on function public.registrar_entrada_estoque(uuid, numeric, bigint, uuid, text, uuid) to authenticated;
grant execute on function public.registrar_ajuste_estoque(uuid, numeric, text, uuid) to authenticated;
grant execute on function public.registrar_devolucao_estoque(uuid, numeric, text, uuid) to authenticated;
grant execute on function public.estornar_movimento(uuid, text) to authenticated;
grant execute on function public.definir_custo_item(uuid, bigint) to authenticated;
