// Fábricas para tests/db/clientes_veiculos.test.ts. Inserem como o USUÁRIO
// informado (passam pela RLS e pelos GRANTs) e voltam para admin.
import type { PGlite } from '@electric-sql/pglite';
import { comoAdmin, comoUsuario } from '../helpers';

let seq = 0;

/** Placa antiga única por chamada (TST0001...). */
export function placaUnica(): string {
  seq += 1;
  return `TST${String(seq).padStart(4, '0')}`;
}

export type Contexto = { userId: string; orgId: string };

export async function criarCliente(
  db: PGlite,
  ctx: Contexto,
  dados: Partial<{ nome: string; telefone: string | null; documento: string | null; email: string | null }> = {}
): Promise<string> {
  await comoUsuario(db, ctx.userId);
  try {
    const r = await db.query<{ id: string }>(
      `insert into public.cliente (org_id, nome, telefone, documento, email)
       values ($1, $2, $3, $4, $5) returning id`,
      [
        ctx.orgId,
        dados.nome ?? 'Cliente Teste',
        dados.telefone === undefined ? null : dados.telefone,
        dados.documento === undefined ? null : dados.documento,
        dados.email === undefined ? null : dados.email
      ]
    );
    return r.rows[0].id;
  } finally {
    await comoAdmin(db);
  }
}

export async function criarVeiculo(
  db: PGlite,
  ctx: Contexto,
  clienteId: string,
  dados: Partial<{ placa: string; marca: string; modelo: string; chassi: string | null }> = {}
): Promise<{ id: string; placa: string }> {
  const placa = dados.placa ?? placaUnica();
  await comoUsuario(db, ctx.userId);
  try {
    const r = await db.query<{ id: string }>(
      `insert into public.veiculo (org_id, cliente_id, placa, marca, modelo, chassi)
       values ($1, $2, $3, $4, $5, $6) returning id`,
      [
        ctx.orgId,
        clienteId,
        placa,
        dados.marca ?? 'Fiat',
        dados.modelo ?? 'Uno',
        dados.chassi === undefined ? null : dados.chassi
      ]
    );
    return { id: r.rows[0].id, placa };
  } finally {
    await comoAdmin(db);
  }
}

/** Dá permissões ao funcionário como o DONO, via RPC (aplica dependências). */
export async function definirPermissoes(
  db: PGlite,
  dono: { userId: string },
  membroId: string,
  permissoes: Record<string, 'leitura' | 'escrita'>
): Promise<void> {
  await comoUsuario(db, dono.userId);
  try {
    await db.query('select public.definir_permissoes($1, $2)', [membroId, JSON.stringify(permissoes)]);
  } finally {
    await comoAdmin(db);
  }
}
