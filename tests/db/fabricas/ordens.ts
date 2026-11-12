// Fábricas para tests/db/ordens*.test.ts. Chamam as RPCs como o USUÁRIO
// informado (passam por permissão/RLS) e voltam para admin.
import type { PGlite } from '@electric-sql/pglite';
import { comoAdmin, comoUsuario } from '../helpers';
import { criarCliente, criarVeiculo } from './clientes';

export type StatusOs = 'orcamento' | 'aprovado' | 'em_execucao' | 'concluido' | 'entregue' | 'cancelado';

export interface Os {
  id: string;
  org_id: string;
  numero_seq: number;
  numero: string;
  tipo: string;
  os_origem_id: string | null;
  status: StatusOs;
  versao: number;
  km_entrada: number;
  aditivo_atual: number;
  total_centavos: number;
  total_aprovado_centavos: number;
  total_servicos_centavos: number;
  total_pecas_centavos: number;
  validade_ate: string | null;
  data_entrega: string | null;
  garantia_ate: string | null;
  motivo_cancelamento: string | null;
  criado_em: string;
}

export interface ItemOs {
  id: string;
  os_id: string;
  tipo: string;
  situacao: 'pendente' | 'aprovado' | 'recusado';
  quantidade: string;
  preco_unitario_centavos: number;
  desconto_centavos: number;
  total_centavos: number;
  aditivo_n: number;
  condicao: string | null;
  baixa_movimento_id: string | null;
  versao: number;
}

export interface VersaoOs {
  id: string;
  numero: number;
  tipo: string;
  aditivo_n: number;
  hash: string;
  total_centavos: number;
  validade_ate: string;
  snapshot: { itens: { id: string }[]; total_centavos: number };
}

/** Literal de array do Postgres para uuid[]. */
function arrayPg(v: string[]): string {
  return `{${v.join(',')}}`;
}

/**
 * Chama public.<fn>(p_x => $1, ...) como o usuário e devolve to_jsonb(resultado).
 * Arrays viram uuid[].
 */
export async function rpc<T>(db: PGlite, userId: string, fn: string, args: Record<string, unknown>): Promise<T> {
  const nomes = Object.keys(args);
  const params = nomes.map((n) => {
    const v = args[n];
    return Array.isArray(v) ? arrayPg(v as string[]) : v;
  });
  const lista = nomes
    .map((n, i) => `${n} => $${i + 1}${Array.isArray(args[n]) ? '::uuid[]' : ''}`)
    .join(', ');
  await comoUsuario(db, userId);
  try {
    const r = await db.query<{ v: T }>(`select to_jsonb(public.${fn}(${lista})) as v`, params);
    return r.rows[0].v;
  } finally {
    await comoAdmin(db);
  }
}

/** Lê a OS como admin. */
export async function lerOs(db: PGlite, id: string): Promise<Os> {
  await comoAdmin(db);
  const r = await db.query<{ v: Os }>('select to_jsonb(o) as v from public.ordem_servico o where id = $1', [id]);
  return r.rows[0].v;
}

export async function lerItem(db: PGlite, id: string): Promise<ItemOs> {
  await comoAdmin(db);
  const r = await db.query<{ v: ItemOs }>('select to_jsonb(i) as v from public.item_os i where id = $1', [id]);
  return r.rows[0].v;
}

/** Cliente + veículo (criados pelo dono). */
export async function cenario(
  db: PGlite,
  dono: { userId: string; orgId: string }
): Promise<{ clienteId: string; veiculoId: string }> {
  const clienteId = await criarCliente(db, dono, { nome: 'Cliente OS' });
  const v = await criarVeiculo(db, dono, clienteId);
  return { clienteId, veiculoId: v.id };
}

export function criarOs(
  db: PGlite,
  userId: string,
  base: { clienteId: string; veiculoId: string },
  extra: Record<string, unknown> = {}
): Promise<Os> {
  return rpc<Os>(db, userId, 'os_criar_orcamento', {
    p_cliente_id: base.clienteId,
    p_veiculo_id: base.veiculoId,
    p_km_entrada: 1000,
    ...extra
  });
}

export function salvarItem(db: PGlite, userId: string, osId: string, dados: Record<string, unknown> = {}): Promise<ItemOs> {
  return rpc<ItemOs>(db, userId, 'os_salvar_item', {
    p_os_id: osId,
    p_tipo: 'servico',
    p_descricao: 'Troca de óleo',
    p_quantidade: '1',
    p_preco_unitario_centavos: 10000,
    ...dados
  });
}

export async function gerarVersao(db: PGlite, userId: string, osId: string): Promise<VersaoOs> {
  const os = await lerOs(db, osId);
  return rpc<VersaoOs>(db, userId, 'os_gerar_versao', { p_os_id: osId, p_versao: os.versao });
}

export async function aprovar(
  db: PGlite,
  userId: string,
  osId: string,
  versaoId: string,
  opcoes: Record<string, unknown> = {}
): Promise<Os> {
  const os = await lerOs(db, osId);
  return rpc<Os>(db, userId, 'os_registrar_aprovacao', {
    p_os_id: osId,
    p_versao: os.versao,
    p_versao_id: versaoId,
    p_decisao: 'total',
    p_canal: 'whatsapp',
    p_aprovador_nome: 'Maria Cliente',
    p_aprovador_relacao: 'proprietario',
    p_prova: 'Aprovou por WhatsApp às 10h',
    ...opcoes
  });
}

/** RPC de transição com a versão atual da OS. */
export async function transicao(
  db: PGlite,
  userId: string,
  fn: 'os_iniciar_execucao' | 'os_concluir' | 'os_entregar' | 'os_criar_aditivo' | 'os_cancelar' | 'os_reabrir' | 'os_retomar_execucao',
  osId: string,
  extra: Record<string, unknown> = {}
): Promise<Os> {
  const os = await lerOs(db, osId);
  return rpc<Os>(db, userId, fn, { p_os_id: osId, p_versao: os.versao, ...extra });
}

/**
 * Cria uma OS (pelo dono) com 1 serviço e, opcionalmente, 1 peça de catálogo,
 * e a leva até o status pedido pelo caminho normal.
 */
export async function levarAte(
  db: PGlite,
  dono: { userId: string },
  base: { clienteId: string; veiculoId: string },
  status: StatusOs,
  opcoes: { pecaCatalogoId?: string; quantidadePeca?: string } = {}
): Promise<Os> {
  const u = dono.userId;
  const os = await criarOs(db, u, base);
  await salvarItem(db, u, os.id);
  if (opcoes.pecaCatalogoId) {
    await salvarItem(db, u, os.id, {
      p_tipo: 'peca',
      p_descricao: null,
      p_preco_unitario_centavos: null,
      p_item_catalogo_id: opcoes.pecaCatalogoId,
      p_quantidade: opcoes.quantidadePeca ?? '2'
    });
  }
  if (status === 'orcamento') return lerOs(db, os.id);
  if (status === 'cancelado') return transicao(db, u, 'os_cancelar', os.id, { p_motivo: 'Cliente desistiu' });
  const v = await gerarVersao(db, u, os.id);
  await aprovar(db, u, os.id, v.id);
  if (status === 'aprovado') return lerOs(db, os.id);
  await transicao(db, u, 'os_iniciar_execucao', os.id);
  if (status === 'em_execucao') return lerOs(db, os.id);
  await transicao(db, u, 'os_concluir', os.id);
  if (status === 'concluido') return lerOs(db, os.id);
  return transicao(db, u, 'os_entregar', os.id);
}
