-- =============================================================================
-- Núcleo multi-oficina: funções auxiliares (schema private) e RPC criar_oficina.
--
-- SEGURANÇA (vale para todas as funções abaixo):
-- * security definer: rodam como o dono das tabelas (postgres), que ignora RLS.
--   Isso evita recursão infinita de policies (policy de membro consultando
--   membro) e mantém as consultas baratas. Por isso:
--   - search_path = '' e nomes sempre qualificados (public., auth.), para que
--     ninguém sequestre a função criando objetos com o mesmo nome;
--   - só leem dados do PRÓPRIO usuário (auth.uid()), nunca recebem user_id/org_id
--     de fora para decidir acesso.
-- * stable: o planejador pode avaliar uma vez por consulta; nas policies elas
--   aparecem como (select private.f()) para virar initPlan (cache por consulta).
-- * EXECUTE é revogado de public/anon; authenticated recebe só o necessário.
-- =============================================================================

-- Oficina (org) ativa do usuário logado, ou null.
create or replace function private.org_do_usuario()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select m.org_id
  from public.membro m
  join public.organizacao o on o.id = m.org_id
  where m.user_id = (select auth.uid())
    and m.ativo
    and o.ativo
  limit 1;
$$;

-- true se o usuário logado é o dono ativo da sua oficina.
create or replace function private.eh_dono()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.membro m
    join public.organizacao o on o.id = m.org_id
    where m.user_id = (select auth.uid())
      and m.ativo
      and o.ativo
      and m.papel = 'dono'
  );
$$;

-- Pode o usuário logado acessar a ÁREA no NÍVEL pedido?
-- dono: sempre. funcionário: conforme membro_permissao ('escrita' implica
-- 'leitura'). Sem linha = sem acesso. Membro/org inativos = sem acesso.
create or replace function private.pode(p_area text, p_nivel text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.membro m
    join public.organizacao o on o.id = m.org_id
    where m.user_id = (select auth.uid())
      and m.ativo
      and o.ativo
      and (
        m.papel = 'dono'
        or exists (
          select 1
          from public.membro_permissao mp
          where mp.org_id = m.org_id
            and mp.membro_id = m.id
            and mp.area = p_area
            and (mp.nivel = 'escrita' or p_nivel = 'leitura')
        )
      )
  );
$$;

-- true se user_id é membro ativo da mesma oficina do usuário logado
-- (para ver o nome dos colegas em perfil).
create or replace function private.mesma_org(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.membro m
    where m.user_id = p_user_id
      and m.ativo
      and m.org_id = (select private.org_do_usuario())
  );
$$;

-- true se o membro informado é FUNCIONÁRIO (não dono) da oficina do usuário.
-- Usada para impedir permissões gravadas para o dono ou para outra org.
create or replace function private.eh_funcionario_da_minha_org(p_membro_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.membro m
    where m.id = p_membro_id
      and m.papel = 'funcionario'
      and m.org_id = (select private.org_do_usuario())
  );
$$;

-- Lê uma configuração booleana interna (private.configuracao).
create or replace function private.config_bool(p_chave text, p_padrao boolean)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select c.valor::boolean from private.configuracao c where c.chave = p_chave),
    p_padrao
  );
$$;

-- -----------------------------------------------------------------------------
-- RPC public.criar_oficina: cadastro da oficina pelo usuário logado.
-- Cria organizacao + membro 'dono' + perfil na MESMA transação.
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
  -- SEGURANÇA: só usuário autenticado (anon não tem EXECUTE, mas checa de novo).
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

  -- SEGURANÇA: exige e-mail confirmado. A flag existe só para o projeto DEV
  -- (confirmação desligada no Auth). Ver private.configuracao.
  if private.config_bool('exigir_email_confirmado', true)
     and v_usuario.email_confirmed_at is null then
    raise exception 'Confirme seu e-mail antes de cadastrar a oficina.'
      using errcode = '42501';
  end if;

  if char_length(v_nome) not between 1 and 200 then
    raise exception 'Nome da oficina inválido.' using errcode = '22023';
  end if;

  -- MVP: 1 pessoa = 1 oficina. O índice único membro_user_id_ativo_key
  -- garante isso mesmo com chamadas simultâneas.
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

  return v_org_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- Privilégios de EXECUTE (funções nascem com EXECUTE para PUBLIC).
-- -----------------------------------------------------------------------------
revoke all on function private.org_do_usuario() from public, anon, authenticated;
revoke all on function private.eh_dono() from public, anon, authenticated;
revoke all on function private.pode(text, text) from public, anon, authenticated;
revoke all on function private.mesma_org(uuid) from public, anon, authenticated;
revoke all on function private.eh_funcionario_da_minha_org(uuid) from public, anon, authenticated;
revoke all on function private.config_bool(text, boolean) from public, anon, authenticated;
revoke all on function private.permissoes_validas(jsonb) from public, anon, authenticated;
revoke all on function public.criar_oficina(text, text) from public, anon, authenticated;

-- authenticated precisa de USAGE no schema e EXECUTE nas funções chamadas
-- pelas policies/CHECKs (são avaliadas com os privilégios de quem consulta).
-- O schema private não é exposto na API, então não dá para chamá-las via REST.
grant usage on schema private to authenticated;
grant execute on function private.org_do_usuario() to authenticated;
grant execute on function private.eh_dono() to authenticated;
grant execute on function private.pode(text, text) to authenticated;
grant execute on function private.mesma_org(uuid) to authenticated;
grant execute on function private.eh_funcionario_da_minha_org(uuid) to authenticated;
grant execute on function private.permissoes_validas(jsonb) to authenticated;
-- config_bool: só usada dentro de criar_oficina (definer) — sem grant.

grant execute on function public.criar_oficina(text, text) to authenticated;
