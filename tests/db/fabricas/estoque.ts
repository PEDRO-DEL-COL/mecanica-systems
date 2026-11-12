// Fábricas para tests/db/catalogo_estoque.test.ts (catálogo, fornecedores, movimentos).
import type { PGlite } from '@electric-sql/pglite';
import { comoAdmin, comoUsuario } from '../helpers';

export type RespostaMovimento = { movimento_id: string; item_id: string; saldo: string; negativo: boolean };

let seq = 0;

/** Cria item do catálogo como admin (padrão: peça com controle de estoque). */
export async function criarItem(
  db: PGlite,
  orgId: string,
  dados: {
    tipo?: 'servico' | 'peca';
    codigo?: string | null;
    descricao?: string;
    precoVenda?: number;
    controlaEstoque?: boolean;
    estoqueMinimo?: string;
  } = {}
): Promise<string> {
  const tipo = dados.tipo ?? 'peca';
  await comoAdmin(db);
  const r = await db.query<{ id: string }>(
    `insert into public.item_catalogo
       (org_id, tipo, codigo, descricao, preco_venda_centavos, controla_estoque, estoque_minimo)
     values ($1, $2, $3, $4, $5, $6, $7) returning id`,
    [
      orgId,
      tipo,
      dados.codigo ?? null,
      dados.descricao ?? `Item ${++seq}`,
      dados.precoVenda ?? 0,
      dados.controlaEstoque ?? tipo === 'peca',
      dados.estoqueMinimo ?? '0'
    ]
  );
  return r.rows[0].id;
}

/** Cria fornecedor como admin. */
export async function criarFornecedor(db: PGlite, orgId: string, nome = `Fornecedor ${++seq}`): Promise<string> {
  await comoAdmin(db);
  const r = await db.query<{ id: string }>(
    'insert into public.fornecedor (org_id, nome) values ($1, $2) returning id',
    [orgId, nome]
  );
  return r.rows[0].id;
}

async function rpc(db: PGlite, userId: string, sql: string, params: unknown[]): Promise<RespostaMovimento> {
  await comoUsuario(db, userId);
  const r = await db.query<{ v: RespostaMovimento }>(sql, params);
  return r.rows[0].v;
}

export function entrada(
  db: PGlite,
  userId: string,
  itemId: string,
  qtd: string,
  custo: number,
  opcoes: { fornecedorId?: string; chave?: string } = {}
): Promise<RespostaMovimento> {
  return rpc(
    db,
    userId,
    'select public.registrar_entrada_estoque($1, $2::numeric, $3::bigint, $4, null, $5) as v',
    [itemId, qtd, custo, opcoes.fornecedorId ?? null, opcoes.chave ?? null]
  );
}

export function ajuste(
  db: PGlite,
  userId: string,
  itemId: string,
  delta: string,
  motivo: string | null
): Promise<RespostaMovimento> {
  return rpc(db, userId, 'select public.registrar_ajuste_estoque($1, $2::numeric, $3) as v', [itemId, delta, motivo]);
}

export function devolucao(db: PGlite, userId: string, entradaId: string, qtd: string): Promise<RespostaMovimento> {
  return rpc(db, userId, `select public.registrar_devolucao_estoque($1, $2::numeric, 'Peça com defeito') as v`, [
    entradaId,
    qtd
  ]);
}

export function estornar(db: PGlite, userId: string, movimentoId: string, motivo: string | null): Promise<RespostaMovimento> {
  return rpc(db, userId, 'select public.estornar_movimento($1, $2) as v', [movimentoId, motivo]);
}

/** Soma dos movimentos (admin). */
export async function somaMovimentos(db: PGlite, itemId: string): Promise<string> {
  await comoAdmin(db);
  const r = await db.query<{ v: string }>(
    'select coalesce(sum(quantidade), 0)::numeric(15,3)::text as v from public.movimento_estoque where item_id = $1',
    [itemId]
  );
  return r.rows[0].v;
}

/** Custo médio e último custo (admin). */
export async function custoDe(
  db: PGlite,
  itemId: string
): Promise<{ medio: number; ultimo: number | null } | null> {
  await comoAdmin(db);
  const r = await db.query<{ medio: number; ultimo: number | null }>(
    'select custo_medio_centavos::int as medio, ultimo_custo_centavos::int as ultimo from public.item_custo where item_id = $1',
    [itemId]
  );
  return r.rows[0] ?? null;
}
