import { supabase } from '../supabase';
import type { Resultado } from '../erros';
import { executar, intervalo } from './base';
import { padraoBusca, paginar } from './catalogo';
import type { Pagina } from '../tipos/catalogo';
import type {
  DadosAjuste,
  DadosDevolucao,
  DadosEntrada,
  DadosEstorno,
  FiltroMovimentos,
  FiltroSaldos,
  MovimentoEstoque,
  MovimentoEstoqueCusto,
  ResultadoMovimento,
  SaldoEstoque
} from '../tipos/estoque';

const COLUNAS_SALDO =
  'org_id, item_id, codigo, descricao, unidade, localizacao, estoque_minimo::text, ativo, saldo::text, negativo, abaixo_minimo';

const COLUNAS_MOVIMENTO =
  'id, org_id, item_id, tipo, quantidade::text, motivo, fornecedor_id, os_id, nota_fiscal, estorna_id, entrada_id, ' +
  'criado_por, criado_em';

/** Saldos por peça (estoque/leitura). */
export function listarSaldos(filtro: FiltroSaldos = {}, sinal?: AbortSignal): Promise<Resultado<Pagina<SaldoEstoque>>> {
  const pagina = filtro.pagina ?? 1;
  const { from, to } = intervalo(pagina);
  return paginar<SaldoEstoque>(() => {
    let q = supabase.from('estoque_saldo').select(COLUNAS_SALDO, { count: 'estimated' });
    if (!filtro.mostrarInativos) q = q.eq('ativo', true);
    if (filtro.somenteAbaixoMinimo) q = q.eq('abaixo_minimo', true);
    if (filtro.somenteNegativos) q = q.eq('negativo', true);
    const busca = padraoBusca(filtro.busca);
    if (busca) q = q.ilike('busca', busca);
    q = q.order('descricao').order('item_id').range(from, to);
    if (sinal) q = q.abortSignal(sinal);
    return q;
  }, pagina);
}

export function obterSaldo(itemId: string): Promise<Resultado<SaldoEstoque | null>> {
  return executar<SaldoEstoque | null>(() =>
    supabase.from('estoque_saldo').select(COLUNAS_SALDO).eq('item_id', itemId).maybeSingle()
  );
}

/** Movimentos, do mais recente ao mais antigo. */
export function listarMovimentos(
  filtro: FiltroMovimentos = {},
  sinal?: AbortSignal
): Promise<Resultado<Pagina<MovimentoEstoque>>> {
  const pagina = filtro.pagina ?? 1;
  const { from, to } = intervalo(pagina);
  return paginar<MovimentoEstoque>(() => {
    let q = supabase.from('movimento_estoque').select(COLUNAS_MOVIMENTO, { count: 'estimated' });
    if (filtro.itemId) q = q.eq('item_id', filtro.itemId);
    if (filtro.tipo) q = q.eq('tipo', filtro.tipo);
    if (filtro.fornecedorId) q = q.eq('fornecedor_id', filtro.fornecedorId);
    q = q.order('criado_em', { ascending: false }).order('id', { ascending: false }).range(from, to);
    if (sinal) q = q.abortSignal(sinal);
    return q;
  }, pagina);
}

/** Ids de movimentos que já têm estorno (para esconder o botão "Estornar"). */
export function listarEstornados(movimentoIds: string[]): Promise<Resultado<string[]>> {
  if (movimentoIds.length === 0) return Promise.resolve({ ok: true, dados: [] });
  return executar<string[]>(async () => {
    const { data, error } = await supabase
      .from('movimento_estoque')
      .select('estorna_id')
      .in('estorna_id', movimentoIds);
    if (error) return { data: null, error };
    const linhas = (data ?? []) as { estorna_id: string }[];
    return { data: linhas.map((l) => l.estorna_id), error: null };
  });
}

/** Custos unitários dos movimentos (vazio sem 'financeiro'). */
export function listarCustosMovimentos(movimentoIds: string[]): Promise<Resultado<MovimentoEstoqueCusto[]>> {
  if (movimentoIds.length === 0) return Promise.resolve({ ok: true, dados: [] });
  return executar<MovimentoEstoqueCusto[]>(() =>
    supabase
      .from('movimento_estoque_custo')
      .select('movimento_id, org_id, custo_unitario_centavos, criado_em')
      .in('movimento_id', movimentoIds)
  );
}

/** Entrada de compra (estoque/escrita). Recalcula o custo médio no banco. */
export function registrarEntrada(d: DadosEntrada): Promise<Resultado<ResultadoMovimento>> {
  return executar<ResultadoMovimento>(() =>
    supabase.rpc('registrar_entrada_estoque', {
      p_item_id: d.item_id,
      p_quantidade: d.quantidade,
      p_custo_unitario_centavos: d.custo_unitario_centavos,
      p_fornecedor_id: d.fornecedor_id,
      p_nota_fiscal: d.nota_fiscal,
      p_idempotency_key: d.idempotency_key ?? null
    })
  );
}

/** Ajuste com motivo obrigatório. */
export function registrarAjuste(d: DadosAjuste): Promise<Resultado<ResultadoMovimento>> {
  return executar<ResultadoMovimento>(() =>
    supabase.rpc('registrar_ajuste_estoque', {
      p_item_id: d.item_id,
      p_delta: d.delta,
      p_motivo: d.motivo,
      p_idempotency_key: d.idempotency_key ?? null
    })
  );
}

/** Devolução ao fornecedor de parte de uma entrada (sai pelo custo dela). */
export function registrarDevolucao(d: DadosDevolucao): Promise<Resultado<ResultadoMovimento>> {
  return executar<ResultadoMovimento>(() =>
    supabase.rpc('registrar_devolucao_estoque', {
      p_entrada_id: d.entrada_id,
      p_quantidade: d.quantidade,
      p_motivo: d.motivo,
      p_idempotency_key: d.idempotency_key ?? null
    })
  );
}

/** Estorno = movimento inverso (um por movimento). */
export function estornarMovimento(d: DadosEstorno): Promise<Resultado<ResultadoMovimento>> {
  return executar<ResultadoMovimento>(() =>
    supabase.rpc('estornar_movimento', { p_movimento_id: d.movimento_id, p_motivo: d.motivo })
  );
}
