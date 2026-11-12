-- =============================================================================
-- Núcleo multi-oficina: schema, tabelas e índices.
-- Idempotente: pode ser reaplicada num projeto limpo (ou já migrado) sem erro.
-- RLS, policies e grants ficam em 20261112120200_nucleo_rls.sql.
-- =============================================================================

-- Schema "private": funções auxiliares e configuração interna.
-- SEGURANÇA: não deve ser exposto na API (não adicionar em "Exposed schemas"
-- do Supabase). anon não recebe USAGE; authenticated recebe só USAGE + EXECUTE
-- nas funções usadas pelas policies (ver migration de RLS).
create schema if not exists private;
revoke all on schema private from public;

-- Configuração interna do banco (chave/valor). Só acessível por postgres
-- (SQL Editor / migrations); nenhuma role da API tem acesso.
create table if not exists private.configuracao (
  chave text primary key,
  valor text not null,
  descricao text
);
revoke all on private.configuracao from public;

-- exigir_email_confirmado = 'true' em produção.
-- RISCO (DEV): com 'false', qualquer pessoa que crie conta com um e-mail que
-- não é dela consegue criar oficina em nome desse e-mail. Só desligar no
-- projeto de desenvolvimento onde a confirmação de e-mail do Auth está off.
insert into private.configuracao (chave, valor, descricao)
values (
  'exigir_email_confirmado',
  'true',
  'Se true, criar_oficina exige auth.users.email_confirmed_at. Só usar false em DEV.'
)
on conflict (chave) do nothing;

-- -----------------------------------------------------------------------------
-- organizacao: a oficina (tenant).
-- -----------------------------------------------------------------------------
create table if not exists public.organizacao (
  id uuid primary key default gen_random_uuid(),
  nome text not null check (char_length(btrim(nome)) between 1 and 200),
  documento text check (documento is null or char_length(documento) <= 30),
  ativo boolean not null default true,
  -- Gancho para assinatura/trial (sem cobrança no MVP). Não editável pelo
  -- cliente: só nome/documento recebem GRANT UPDATE.
  assinatura_status text not null default 'trial'
    check (assinatura_status in ('trial', 'ativa', 'suspensa', 'cancelada')),
  trial_expira_em timestamptz,
  criado_em timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- perfil: dados públicos do usuário (1:1 com auth.users).
-- -----------------------------------------------------------------------------
create table if not exists public.perfil (
  user_id uuid primary key references auth.users (id),
  nome text not null check (char_length(btrim(nome)) between 1 and 200),
  criado_em timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- membro: vínculo usuário x oficina. papel 'dono' = acesso total.
-- -----------------------------------------------------------------------------
create table if not exists public.membro (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizacao (id),
  user_id uuid not null references auth.users (id),
  papel text not null check (papel in ('dono', 'funcionario')),
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  -- alvo da FK composta de membro_permissao (garante mesma org)
  constraint membro_org_id_id_key unique (org_id, id)
);

-- Lista de membros da oficina.
create index if not exists membro_org_id_user_id_idx on public.membro (org_id, user_id);
-- SEGURANÇA/MVP: 1 pessoa = 1 oficina ativa. Também protege criar_oficina
-- contra corrida (duas chamadas simultâneas). Exceção à regra "índice começa
-- por org_id": é a busca por usuário usada em toda policy (org_do_usuario).
create unique index if not exists membro_user_id_ativo_key
  on public.membro (user_id) where ativo;
-- Uma oficina tem exatamente um dono ativo no MVP.
create unique index if not exists membro_org_id_dono_key
  on public.membro (org_id) where papel = 'dono' and ativo;

-- -----------------------------------------------------------------------------
-- membro_permissao: acesso por área para funcionários.
-- Sem acesso = sem linha. 'escrita' implica 'leitura'.
-- -----------------------------------------------------------------------------
create table if not exists public.membro_permissao (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  membro_id uuid not null,
  area text not null check (area in (
    'clientes', 'veiculos', 'catalogo', 'estoque',
    'ordens', 'financeiro', 'equipe', 'configuracoes'
  )),
  nivel text not null check (nivel in ('leitura', 'escrita')),
  criado_em timestamptz not null default now(),
  -- SEGURANÇA: FK composta impede apontar para membro de outra oficina.
  constraint membro_permissao_membro_fk
    foreign key (org_id, membro_id) references public.membro (org_id, id),
  constraint membro_permissao_area_key unique (org_id, membro_id, area)
);

-- Valida o jsonb de permissões do convite: {"area": "leitura"|"escrita", ...}.
-- Imutável, sem acesso a tabelas (usada em CHECK).
create or replace function private.permissoes_validas(p jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select jsonb_typeof(p) = 'object'
    and not exists (
      select 1
      from jsonb_each(p) as e(area, nivel)
      where e.area not in ('clientes', 'veiculos', 'catalogo', 'estoque',
                           'ordens', 'financeiro', 'equipe', 'configuracoes')
         or e.nivel not in ('"leitura"'::jsonb, '"escrita"'::jsonb)
    );
$$;
revoke all on function private.permissoes_validas(jsonb) from public;

-- -----------------------------------------------------------------------------
-- convite: convite de funcionário por e-mail (RPC de aceite vem depois).
-- Só o hash do token é guardado; o token em claro vai apenas no link.
-- -----------------------------------------------------------------------------
create table if not exists public.convite (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizacao (id),
  email text not null check (email = lower(btrim(email)) and position('@' in email) > 1),
  token_hash text not null unique check (char_length(token_hash) >= 32),
  permissoes jsonb not null default '{}'::jsonb
    check (private.permissoes_validas(permissoes)),
  criado_por uuid references auth.users (id) default auth.uid(),
  criado_em timestamptz not null default now(),
  expira_em timestamptz not null default (now() + interval '7 days'),
  aceito_em timestamptz,
  aceito_por uuid references auth.users (id),
  ativo boolean not null default true
);

create index if not exists convite_org_id_criado_em_idx on public.convite (org_id, criado_em desc);
-- Um convite pendente por e-mail por oficina.
create unique index if not exists convite_org_id_email_pendente_key
  on public.convite (org_id, email) where aceito_em is null and ativo;
