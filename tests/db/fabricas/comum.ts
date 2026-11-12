// Fábricas para os testes de tests/db/comum.test.ts (convites, eventos, config).
import { createHash, randomBytes } from 'node:crypto';
import type { PGlite } from '@electric-sql/pglite';
import { comoAdmin, comoUsuario } from '../helpers';

export type Permissoes = Record<string, 'leitura' | 'escrita'>;

/** Token aleatório do link de convite (o app gera igual: 32 bytes, base64url). */
export function novoToken(): string {
  return randomBytes(32).toString('base64url');
}

/** Mesmo hash que aceitar_convite calcula: hex(SHA-256(token UTF-8)). */
export function hashToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

/**
 * Cria um convite como o DONO (passa pela RLS de convite) e devolve o token
 * em claro. `expiraEm` no passado gera convite expirado.
 */
export async function criarConvite(
  db: PGlite,
  dono: { userId: string; orgId: string },
  opcoes: { email: string; permissoes?: Permissoes; expiraEm?: Date }
): Promise<{ id: string; token: string }> {
  const token = novoToken();
  await comoUsuario(db, dono.userId);
  const r = await db.query<{ id: string }>(
    `insert into public.convite (org_id, email, token_hash, permissoes, expira_em)
     values ($1, $2, $3, $4, $5) returning id`,
    [
      dono.orgId,
      opcoes.email,
      hashToken(token),
      JSON.stringify(opcoes.permissoes ?? {}),
      (opcoes.expiraEm ?? new Date(Date.now() + 7 * 24 * 3600 * 1000)).toISOString()
    ]
  );
  await comoAdmin(db);
  return { id: r.rows[0].id, token };
}

/** Permissões gravadas de um membro como objeto {area: nivel} (lido como admin). */
export async function permissoesDe(db: PGlite, membroId: string): Promise<Permissoes> {
  await comoAdmin(db);
  const r = await db.query<{ area: string; nivel: 'leitura' | 'escrita' }>(
    'select area, nivel from public.membro_permissao where membro_id = $1 order by area',
    [membroId]
  );
  return Object.fromEntries(r.rows.map((l) => [l.area, l.nivel]));
}

export type Evento = {
  entidade: string;
  entidade_id: string | null;
  acao: string;
  dados: Record<string, unknown>;
  usuario_id: string | null;
};

/** Eventos da oficina (como admin), do mais antigo ao mais novo. */
export async function eventosDe(db: PGlite, orgId: string, entidade?: string): Promise<Evento[]> {
  await comoAdmin(db);
  const r = await db.query<Evento>(
    `select entidade, entidade_id, acao, dados, usuario_id from public.evento
     where org_id = $1 and ($2::text is null or entidade = $2) order by id`,
    [orgId, entidade ?? null]
  );
  return r.rows;
}
