import { supabase } from '../supabase';
import type { Resultado } from '../erros';
import { executar, intervalo } from './base';
import type { DadosItemCatalogo, FiltroCatalogo, ItemCatalogo, ItemCusto, Pagina } from '../tipos/catalogo';

/** Colunas de item_catalogo (numeric como texto para não virar float). */
const COLUNAS_ITEM =
  'id, org_id, tipo, codigo, codigo_fabricante, descricao, unidade, preco_venda_centavos, controla_estoque, ' +
  'estoque_minimo::text, localizacao, ativo, versao, criado_em, atualizado_em';

const COLUNAS_CUSTO = 'item_id, org_id, custo_medio_centavos, ultimo_custo_centavos, atualizado_em';

/**
 * Texto de busca na mesma forma da coluna `busca` do banco (private.texto_busca):
 * sem acento, minúsculo, espaços colapsados. Devolve o padrão ilike ou null se < 2 caracteres.
 */
export function padraoBusca(texto: string | null | undefined): string | null {
  const t = String(texto ?? '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[\\%_*]/g, '');
  return t.length >= 2 ? `%${t}%` : null;
}

interface RespostaContada {
  data: unknown;
  error: unknown;
  count: number | null;
}

/** Executa uma consulta com count e devolve Pagina<T>. */
export function paginar<T>(consulta: () => PromiseLike<RespostaContada>, pagina: number): Promise<Resultado<Pagina<T>>> {
  return executar<Pagina<T>>(async () => {
    const { data, error, count } = await consulta();
    if (error) return { data: null, error };
    return { data: { itens: (data ?? []) as T[], total: count ?? null, pagina }, error: null };
  });
}

export function listarItens(filtro: FiltroCatalogo = {}, sinal?: AbortSignal): Promise<Resultado<Pagina<ItemCatalogo>>> {
  const pagina = filtro.pagina ?? 1;
  const { from, to } = intervalo(pagina);
  return paginar<ItemCatalogo>(() => {
    let q = supabase.from('item_catalogo').select(COLUNAS_ITEM, { count: 'estimated' });
    if (!filtro.mostrarInativos) q = q.eq('ativo', true);
    if (filtro.tipo) q = q.eq('tipo', filtro.tipo);
    const busca = padraoBusca(filtro.busca);
    if (busca) q = q.ilike('busca', busca);
    q = q.order('descricao').order('id').range(from, to);
    if (sinal) q = q.abortSignal(sinal);
    return q;
  }, pagina);
}

export function obterItem(id: string): Promise<Resultado<ItemCatalogo>> {
  return executar<ItemCatalogo>(() => supabase.from('item_catalogo').select(COLUNAS_ITEM).eq('id', id).single());
}

/** Cria item (org_id vem do banco: oficina do usuário). `id` opcional gerado no cliente. */
export function criarItem(dados: DadosItemCatalogo, id?: string): Promise<Resultado<ItemCatalogo>> {
  const linha: DadosItemCatalogo & { id?: string } = id ? { ...dados, id } : dados;
  return executar<ItemCatalogo>(() => supabase.from('item_catalogo').insert(linha).select(COLUNAS_ITEM).single());
}

/** Atualiza com concorrência otimista: versão diferente => erro 'conflito'. */
export function atualizarItem(
  id: string,
  versao: number,
  dados: Partial<DadosItemCatalogo>
): Promise<Resultado<ItemCatalogo>> {
  return executar<ItemCatalogo>(
    () => supabase.from('item_catalogo').update(dados).eq('id', id).eq('versao', versao).select(COLUNAS_ITEM).single(),
    { conflitoVersao: true }
  );
}

export function definirAtivoItem(id: string, versao: number, ativo: boolean): Promise<Resultado<ItemCatalogo>> {
  return executar<ItemCatalogo>(
    () => supabase.from('item_catalogo').update({ ativo }).eq('id', id).eq('versao', versao).select(COLUNAS_ITEM).single(),
    { conflitoVersao: true }
  );
}

/** Custo do item: null se não houver ou se o usuário não tem 'financeiro' (RLS). */
export function obterCustoItem(itemId: string): Promise<Resultado<ItemCusto | null>> {
  return executar<ItemCusto | null>(() =>
    supabase.from('item_custo').select(COLUNAS_CUSTO).eq('item_id', itemId).maybeSingle()
  );
}

/** Custos de vários itens (para a lista); vazio sem 'financeiro'. */
export function listarCustosItens(itemIds: string[]): Promise<Resultado<ItemCusto[]>> {
  if (itemIds.length === 0) return Promise.resolve({ ok: true, dados: [] });
  return executar<ItemCusto[]>(() => supabase.from('item_custo').select(COLUNAS_CUSTO).in('item_id', itemIds));
}

/** Custo médio informado à mão (financeiro/escrita). */
export function definirCustoItem(itemId: string, custoMedioCentavos: number): Promise<Resultado<null>> {
  return executar<null>(() =>
    supabase.rpc('definir_custo_item', { p_item_id: itemId, p_custo_medio_centavos: custoMedioCentavos })
  );
}
