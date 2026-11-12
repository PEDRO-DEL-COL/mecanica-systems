-- =============================================================================
-- Comum (Onda 0): áreas de permissão (nova área 'caixa'), dependências entre
-- áreas e RPCs aceitar_convite / definir_permissoes.
-- Idempotente (drop constraint if exists + add; create or replace).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Áreas de permissão: FONTE ÚNICA da lista.
--   clientes, veiculos, catalogo, estoque, ordens,
--   caixa        -> receber pagamentos e operar o caixa (balcão);
--   financeiro   -> única que vê custos, margens, contas a pagar e relatórios;
--   equipe, configuracoes.
-- Para criar uma área nova: migração nova com create or replace desta função
-- (o CHECK de membro_permissao e permissoes_validas leem daqui).
-- -----------------------------------------------------------------------------
create or replace function private.areas()
returns text[]
language sql
immutable
parallel safe
set search_path = ''
as $$
  select array[
    'clientes', 'veiculos', 'catalogo', 'estoque', 'ordens',
    'caixa', 'financeiro', 'equipe', 'configuracoes'
  ]::text[];
$$;

-- Troca o CHECK literal do núcleo (8 áreas) pelo da lista única.
alter table public.membro_permissao drop constraint if exists membro_permissao_area_check;
alter table public.membro_permissao add constraint membro_permissao_area_check
  check (area = any (private.areas()));

-- Substitui a do núcleo: valida {"area": "leitura"|"escrita"} com a lista única.
create or replace function private.permissoes_validas(p jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select jsonb_typeof(p) = 'object'
    and not exists (
      select 1
      from jsonb_each(case when jsonb_typeof(p) = 'object' then p else '{}'::jsonb end) as e(area, nivel)
      where not (e.area = any (private.areas()))
         or e.nivel not in ('"leitura"'::jsonb, '"escrita"'::jsonb)
    );
$$;

-- -----------------------------------------------------------------------------
-- DEPENDÊNCIAS DE PERMISSÃO (fonte única; a UI de equipe deve espelhar).
-- Ter uma área (leitura OU escrita) concede LEITURA nas áreas listadas, de
-- forma transitiva, sem nunca rebaixar uma 'escrita' já concedida:
--   ordens     => clientes, veiculos          (OS mostra cliente e veículo)
--   caixa      => ordens                      (=> clientes, veiculos)
--   financeiro => ordens, caixa               (=> clientes, veiculos)
--   estoque    => catalogo                    (saldo é por item do catálogo)
-- 'caixa' NÃO dá 'financeiro': quem recebe no balcão não vê custos/margens.
-- -----------------------------------------------------------------------------
create or replace function private.dependencias_permissao()
returns jsonb
language sql
immutable
parallel safe
set search_path = ''
as $$
  select '{
    "ordens": ["clientes", "veiculos"],
    "caixa": ["ordens"],
    "financeiro": ["ordens", "caixa"],
    "estoque": ["catalogo"]
  }'::jsonb;
$$;

-- Aplica as dependências (fecho transitivo) a um jsonb de permissões.
create or replace function private.expandir_permissoes(p jsonb)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_deps constant jsonb := private.dependencias_permissao();
  v jsonb := coalesce(p, '{}'::jsonb);
  v_antes jsonb;
  v_dep text;
begin
  loop
    v_antes := v;
    for v_dep in
      select d.dep
      from jsonb_object_keys(v) as k(area)
      cross join lateral jsonb_array_elements_text(coalesce(v_deps -> k.area, '[]'::jsonb)) as d(dep)
    loop
      if not (v ? v_dep) then
        v := v || jsonb_build_object(v_dep, 'leitura');
      end if;
    end loop;
    exit when v = v_antes;
  end loop;
  return v;
end;
$$;

-- -----------------------------------------------------------------------------
-- RPC public.definir_permissoes(membro, jsonb): SÓ o dono.
-- Substitui todas as permissões do funcionário pelas informadas + dependências.
-- Devolve o jsonb efetivamente gravado. Registra evento (antes/depois).
-- p_membro_id é conferido contra a oficina do próprio usuário (não decide org).
-- -----------------------------------------------------------------------------
create or replace function public.definir_permissoes(p_membro_id uuid, p_permissoes jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_org_id uuid := private.org_do_usuario();
  v_membro record;
  v_antes jsonb;
  v_depois jsonb;
begin
  if (select auth.uid()) is null then
    raise exception 'Não autenticado.' using errcode = '28000';
  end if;
  if v_org_id is null or not private.eh_dono() then
    raise exception 'Só o dono pode definir permissões.' using errcode = '42501';
  end if;

  select m.id, m.papel into v_membro
  from public.membro m
  where m.id = p_membro_id and m.org_id = v_org_id
  for update;

  if not found then
    raise exception 'Membro não encontrado.' using errcode = 'P0001';
  end if;
  if v_membro.papel <> 'funcionario' then
    raise exception 'O dono já tem acesso total.' using errcode = 'P0001';
  end if;
  if p_permissoes is null or not private.permissoes_validas(p_permissoes) then
    raise exception 'Permissões inválidas.' using errcode = '22023';
  end if;

  v_depois := private.expandir_permissoes(p_permissoes);

  select coalesce(jsonb_object_agg(mp.area, mp.nivel), '{}'::jsonb) into v_antes
  from public.membro_permissao mp
  where mp.org_id = v_org_id and mp.membro_id = p_membro_id;

  delete from public.membro_permissao mp
  where mp.org_id = v_org_id and mp.membro_id = p_membro_id;

  insert into public.membro_permissao (org_id, membro_id, area, nivel)
  select v_org_id, p_membro_id, e.key, e.value
  from jsonb_each_text(v_depois) as e;

  if v_antes is distinct from v_depois then
    perform private.registrar_evento(v_org_id, 'membro', p_membro_id, 'definir_permissoes',
      jsonb_build_object('antes', v_antes, 'depois', v_depois));
  end if;

  return v_depois;
end;
$$;

-- -----------------------------------------------------------------------------
-- RPC public.aceitar_convite(token): o convidado logado entra na oficina.
-- token_hash = hex(SHA-256(token em UTF-8)), minúsculo (o app gera o token
-- aleatório, >= 32 bytes, e grava só o hash). Regras: convite ativo, não
-- usado, não expirado; e-mail do usuário logado (auth.users) confirmado e
-- igual ao do convite; usuário sem oficina ativa. Cria membro funcionário,
-- perfil (se faltar) e permissões (com dependências); marca uso único.
-- Devolve o org_id.
-- -----------------------------------------------------------------------------
create or replace function public.aceitar_convite(p_token text)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_usuario record;
  v_convite record;
  v_membro_id uuid;
  v_permissoes jsonb;
begin
  if v_uid is null then
    raise exception 'Não autenticado.' using errcode = '28000';
  end if;
  if p_token is null or char_length(p_token) not between 16 and 512 then
    raise exception 'Convite inválido.' using errcode = 'P0001';
  end if;

  select u.email, u.email_confirmed_at, u.raw_user_meta_data
    into v_usuario
  from auth.users u
  where u.id = v_uid;
  if not found then
    raise exception 'Usuário não encontrado.' using errcode = '28000';
  end if;

  -- Trava o convite: duas aceitações simultâneas do mesmo token serializam
  -- e a segunda vê aceito_em preenchido.
  select c.id, c.org_id, c.email, c.permissoes, c.expira_em, c.aceito_em, c.ativo
    into v_convite
  from public.convite c
  where c.token_hash = encode(sha256(convert_to(p_token, 'UTF8')), 'hex')
  for update;

  if not found then
    raise exception 'Convite inválido.' using errcode = 'P0001';
  end if;
  if v_convite.aceito_em is not null then
    raise exception 'Este convite já foi usado.' using errcode = 'P0001';
  end if;
  if not v_convite.ativo then
    raise exception 'Este convite foi cancelado.' using errcode = 'P0001';
  end if;
  if v_convite.expira_em <= now() then
    raise exception 'Este convite expirou. Peça um novo ao dono da oficina.' using errcode = 'P0001';
  end if;
  if private.config_bool('exigir_email_confirmado', true)
     and v_usuario.email_confirmed_at is null then
    raise exception 'Confirme seu e-mail antes de aceitar o convite.' using errcode = '42501';
  end if;
  if lower(btrim(coalesce(v_usuario.email, ''))) <> v_convite.email then
    raise exception 'Este convite foi enviado para outro e-mail.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.organizacao o where o.id = v_convite.org_id and o.ativo) then
    raise exception 'Oficina indisponível.' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.membro m where m.user_id = v_uid and m.ativo) then
    raise exception 'Você já faz parte de uma oficina.' using errcode = '23505';
  end if;

  insert into public.membro (org_id, user_id, papel)
  values (v_convite.org_id, v_uid, 'funcionario')
  returning id into v_membro_id;

  insert into public.perfil (user_id, nome)
  values (
    v_uid,
    left(coalesce(
      nullif(btrim(v_usuario.raw_user_meta_data ->> 'nome'), ''),
      nullif(btrim(v_usuario.raw_user_meta_data ->> 'full_name'), ''),
      nullif(split_part(coalesce(v_usuario.email, ''), '@', 1), ''),
      'Funcionário'
    ), 200)
  )
  on conflict (user_id) do nothing;

  v_permissoes := private.expandir_permissoes(v_convite.permissoes);
  insert into public.membro_permissao (org_id, membro_id, area, nivel)
  select v_convite.org_id, v_membro_id, e.key, e.value
  from jsonb_each_text(v_permissoes) as e;

  update public.convite
     set aceito_em = now(), aceito_por = v_uid
   where id = v_convite.id;

  perform private.registrar_evento(v_convite.org_id, 'convite', v_convite.id, 'aceitar',
    jsonb_build_object('membro_id', v_membro_id, 'permissoes', v_permissoes));

  return v_convite.org_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- Privilégios.
-- -----------------------------------------------------------------------------
revoke all on function private.areas() from public, anon, authenticated;
revoke all on function private.permissoes_validas(jsonb) from public, anon, authenticated;
revoke all on function private.dependencias_permissao() from public, anon, authenticated;
revoke all on function private.expandir_permissoes(jsonb) from public, anon, authenticated;
revoke all on function public.definir_permissoes(uuid, jsonb) from public, anon, authenticated;
revoke all on function public.aceitar_convite(text) from public, anon, authenticated;

-- areas/permissoes_validas: avaliadas nos CHECKs de membro_permissao/convite
-- com os privilégios de quem grava.
grant execute on function private.areas() to authenticated;
grant execute on function private.permissoes_validas(jsonb) to authenticated;
grant execute on function public.definir_permissoes(uuid, jsonb) to authenticated;
grant execute on function public.aceitar_convite(text) to authenticated;
