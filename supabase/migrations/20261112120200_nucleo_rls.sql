-- =============================================================================
-- Núcleo multi-oficina: RLS, policies e grants mínimos.
--
-- Modelo:
-- * Todo acesso exige role authenticated; anon não tem GRANT em nada.
-- * Isolamento: org_id = (select private.org_do_usuario()).
-- * Área/nível: (select private.pode('<area>', 'leitura'|'escrita')).
-- * Gestão de equipe (membro, membro_permissao, convite) é SÓ do dono no MVP:
--   assim um funcionário nunca consegue se dar mais permissões (nem com
--   'equipe/escrita', nem convidando outro e-mail dele mesmo).
-- * Nada de DELETE em dados (campo ativo), exceto membro_permissao, que é
--   configuração de acesso ("sem acesso = sem linha").
-- * (select ...) em volta de auth.uid()/private.* faz o Postgres avaliar uma
--   vez por consulta (initPlan) em vez de uma vez por linha.
-- Idempotente: drop policy if exists + create; revoke/grant são reaplicáveis.
-- =============================================================================

alter table public.organizacao enable row level security;
alter table public.perfil enable row level security;
alter table public.membro enable row level security;
alter table public.membro_permissao enable row level security;
alter table public.convite enable row level security;

-- SEGURANÇA: o Supabase concede ALL em tabelas novas do schema public para
-- anon/authenticated por default privileges. Revogamos tudo e concedemos só
-- o necessário (inclusive por coluna). RLS é a 2ª barreira, não a única.
revoke all on table public.organizacao, public.perfil, public.membro,
  public.membro_permissao, public.convite from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- organizacao
-- -----------------------------------------------------------------------------
-- Inserção só via RPC criar_oficina. Atualiza só nome/documento
-- (assinatura_status, trial_expira_em e ativo NÃO são editáveis pelo cliente).
grant select on public.organizacao to authenticated;
grant update (nome, documento) on public.organizacao to authenticated;

drop policy if exists organizacao_select on public.organizacao;
create policy organizacao_select on public.organizacao
  for select to authenticated
  using (id = (select private.org_do_usuario()));

drop policy if exists organizacao_update on public.organizacao;
create policy organizacao_update on public.organizacao
  for update to authenticated
  using (
    id = (select private.org_do_usuario())
    and (select private.pode('configuracoes', 'escrita'))
  )
  with check (
    id = (select private.org_do_usuario())
    and (select private.pode('configuracoes', 'escrita'))
  );

-- -----------------------------------------------------------------------------
-- perfil
-- -----------------------------------------------------------------------------
grant select on public.perfil to authenticated;
grant insert (user_id, nome) on public.perfil to authenticated;
grant update (nome) on public.perfil to authenticated;

drop policy if exists perfil_select on public.perfil;
create policy perfil_select on public.perfil
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or private.mesma_org(user_id)
  );

-- Cada um cria/edita só o próprio perfil.
drop policy if exists perfil_insert on public.perfil;
create policy perfil_insert on public.perfil
  for insert to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists perfil_update on public.perfil;
create policy perfil_update on public.perfil
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- -----------------------------------------------------------------------------
-- membro
-- -----------------------------------------------------------------------------
-- SEGURANÇA: sem GRANT INSERT — ninguém vira membro por insert direto.
-- Entrada só por criar_oficina (dono) ou, no futuro, pela RPC de aceite de
-- convite. Única coluna editável: ativo (papel nunca muda pelo cliente).
grant select on public.membro to authenticated;
grant update (ativo) on public.membro to authenticated;

drop policy if exists membro_select on public.membro;
create policy membro_select on public.membro
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or (
      org_id = (select private.org_do_usuario())
      and (select private.pode('equipe', 'leitura'))
    )
  );

-- Só o dono ativa/desativa FUNCIONÁRIOS da própria org (não a si mesmo).
drop policy if exists membro_update on public.membro;
create policy membro_update on public.membro
  for update to authenticated
  using (
    org_id = (select private.org_do_usuario())
    and (select private.eh_dono())
    and papel = 'funcionario'
  )
  with check (
    org_id = (select private.org_do_usuario())
    and (select private.eh_dono())
    and papel = 'funcionario'
  );

-- -----------------------------------------------------------------------------
-- membro_permissao
-- -----------------------------------------------------------------------------
grant select on public.membro_permissao to authenticated;
grant insert (org_id, membro_id, area, nivel) on public.membro_permissao to authenticated;
grant update (nivel) on public.membro_permissao to authenticated;
grant delete on public.membro_permissao to authenticated;

-- Funcionário vê as PRÓPRIAS permissões (para montar o menu); com
-- 'equipe/leitura' (ou dono) vê as da equipe toda.
drop policy if exists membro_permissao_select on public.membro_permissao;
create policy membro_permissao_select on public.membro_permissao
  for select to authenticated
  using (
    org_id = (select private.org_do_usuario())
    and (
      (select private.pode('equipe', 'leitura'))
      or exists (
        select 1 from public.membro m
        where m.id = membro_id and m.user_id = (select auth.uid())
      )
    )
  );

-- SEGURANÇA: só o dono grava permissões, e só para funcionários da org dele.
drop policy if exists membro_permissao_insert on public.membro_permissao;
create policy membro_permissao_insert on public.membro_permissao
  for insert to authenticated
  with check (
    org_id = (select private.org_do_usuario())
    and (select private.eh_dono())
    and private.eh_funcionario_da_minha_org(membro_id)
  );

drop policy if exists membro_permissao_update on public.membro_permissao;
create policy membro_permissao_update on public.membro_permissao
  for update to authenticated
  using (
    org_id = (select private.org_do_usuario())
    and (select private.eh_dono())
  )
  with check (
    org_id = (select private.org_do_usuario())
    and (select private.eh_dono())
    and private.eh_funcionario_da_minha_org(membro_id)
  );

drop policy if exists membro_permissao_delete on public.membro_permissao;
create policy membro_permissao_delete on public.membro_permissao
  for delete to authenticated
  using (
    org_id = (select private.org_do_usuario())
    and (select private.eh_dono())
  );

-- -----------------------------------------------------------------------------
-- convite (só dono; token_hash nunca sai para funcionário)
-- -----------------------------------------------------------------------------
grant select on public.convite to authenticated;
grant insert (org_id, email, token_hash, permissoes, expira_em) on public.convite to authenticated;
-- Cancelar = ativo false. aceito_em/aceito_por só pela futura RPC de aceite.
grant update (ativo) on public.convite to authenticated;

drop policy if exists convite_select on public.convite;
create policy convite_select on public.convite
  for select to authenticated
  using (
    org_id = (select private.org_do_usuario())
    and (select private.eh_dono())
  );

drop policy if exists convite_insert on public.convite;
create policy convite_insert on public.convite
  for insert to authenticated
  with check (
    org_id = (select private.org_do_usuario())
    and (select private.eh_dono())
    and aceito_em is null
  );

drop policy if exists convite_update on public.convite;
create policy convite_update on public.convite
  for update to authenticated
  using (
    org_id = (select private.org_do_usuario())
    and (select private.eh_dono())
  )
  with check (
    org_id = (select private.org_do_usuario())
    and (select private.eh_dono())
  );
