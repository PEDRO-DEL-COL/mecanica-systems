// Helpers para testar as migrations num Postgres WASM (PGlite), sem Docker.
// O stub reproduz o mínimo do ambiente Supabase que as migrations usam:
// schema auth, auth.users, auth.uid() (lê request.jwt.claims), roles
// anon/authenticated/service_role e os default privileges do schema public
// (o Supabase dá ALL para anon/authenticated em tabelas/funções novas — o stub
// faz o mesmo para provar que as migrations revogam o que não deve existir).
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';

const PASTA_MIGRATIONS = join(process.cwd(), 'supabase', 'migrations');

const STUB_SUPABASE = `
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin noinherit; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin noinherit; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin noinherit bypassrls; end if;
end $$;

create schema if not exists auth;
grant usage on schema auth to anon, authenticated, service_role;

create table if not exists auth.users (
  id uuid primary key,
  email text,
  email_confirmed_at timestamptz,
  raw_user_meta_data jsonb not null default '{}'::jsonb
);

create or replace function auth.uid() returns uuid
language sql stable as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid
$$;
grant execute on function auth.uid() to anon, authenticated, service_role;

grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
`;

export function arquivosMigrations(): string[] {
  return readdirSync(PASTA_MIGRATIONS)
    .filter((f) => /^\d{14}_.+\.sql$/.test(f))
    .sort();
}

export async function aplicarMigrations(db: PGlite): Promise<void> {
  for (const arquivo of arquivosMigrations()) {
    await db.exec(readFileSync(join(PASTA_MIGRATIONS, arquivo), 'utf8'));
  }
}

/** Cria um Postgres em memória com o stub do Supabase e as migrations aplicadas. */
export async function criarBanco(opcoes: { aplicarDuasVezes?: boolean } = {}): Promise<PGlite> {
  const db = new PGlite();
  await db.exec(STUB_SUPABASE);
  await aplicarMigrations(db);
  if (opcoes.aplicarDuasVezes) await aplicarMigrations(db);
  return db;
}

/** Volta para o superusuário (postgres), sem JWT. */
export async function comoAdmin(db: PGlite): Promise<void> {
  await db.exec(`reset role; select set_config('request.jwt.claims', '', false);`);
}

/** Simula uma requisição com a anon key (sem login). */
export async function comoAnon(db: PGlite): Promise<void> {
  await comoAdmin(db);
  await db.query(`select set_config('request.jwt.claims', $1, false)`, [
    JSON.stringify({ role: 'anon' })
  ]);
  await db.exec('set role anon');
}

/** Simula uma requisição autenticada do usuário `id` (JWT com sub = id). */
export async function comoUsuario(db: PGlite, id: string): Promise<void> {
  await comoAdmin(db);
  await db.query(`select set_config('request.jwt.claims', $1, false)`, [
    JSON.stringify({ sub: id, role: 'authenticated' })
  ]);
  await db.exec('set role authenticated');
}

/** Cria um usuário em auth.users (como admin) e devolve o id. */
export async function criarUsuario(
  db: PGlite,
  opcoes: { email?: string; confirmado?: boolean; nome?: string } = {}
): Promise<string> {
  const id = randomUUID();
  const email = opcoes.email ?? `u-${id.slice(0, 8)}@teste.dev`;
  await comoAdmin(db);
  await db.query(
    `insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data)
     values ($1, $2, $3, $4)`,
    [
      id,
      email,
      opcoes.confirmado === false ? null : new Date().toISOString(),
      JSON.stringify(opcoes.nome ? { nome: opcoes.nome } : {})
    ]
  );
  return id;
}

/** Cria usuário confirmado + oficina via RPC; devolve ids. */
export async function criarDonoComOficina(
  db: PGlite,
  nome = 'Oficina Teste'
): Promise<{ userId: string; orgId: string; membroId: string }> {
  const userId = await criarUsuario(db);
  await comoUsuario(db, userId);
  const r = await db.query<{ id: string }>('select public.criar_oficina($1) as id', [nome]);
  const orgId = r.rows[0].id;
  await comoAdmin(db);
  const m = await db.query<{ id: string }>('select id from public.membro where user_id = $1', [userId]);
  return { userId, orgId, membroId: m.rows[0].id };
}

/**
 * Adiciona um funcionário diretamente (como admin — no app real isso será a
 * RPC de aceite de convite) e grava as permissões informadas.
 */
export async function criarFuncionario(
  db: PGlite,
  orgId: string,
  permissoes: Record<string, 'leitura' | 'escrita'> = {}
): Promise<{ userId: string; membroId: string }> {
  const userId = await criarUsuario(db);
  await comoAdmin(db);
  const m = await db.query<{ id: string }>(
    `insert into public.membro (org_id, user_id, papel) values ($1, $2, 'funcionario') returning id`,
    [orgId, userId]
  );
  const membroId = m.rows[0].id;
  for (const [area, nivel] of Object.entries(permissoes)) {
    await db.query(
      `insert into public.membro_permissao (org_id, membro_id, area, nivel) values ($1, $2, $3, $4)`,
      [orgId, membroId, area, nivel]
    );
  }
  await db.query(`insert into public.perfil (user_id, nome) values ($1, 'Funcionário')`, [userId]);
  return { userId, membroId };
}

/** Executa e devolve a mensagem de erro (ou null se não falhou). */
export async function erroDe(p: Promise<unknown>): Promise<string | null> {
  try {
    await p;
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
}
