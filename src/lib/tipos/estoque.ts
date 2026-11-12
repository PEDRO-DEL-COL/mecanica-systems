/** Estoque. Espelha public.movimento_estoque, public.movimento_estoque_custo e a view public.estoque_saldo. */

export type TipoMovimento = 'entrada' | 'saida_os' | 'estorno' | 'ajuste' | 'devolucao';

export const TIPOS_MOVIMENTO: readonly TipoMovimento[] = ['entrada', 'saida_os', 'estorno', 'ajuste', 'devolucao'];

/** Linha de public.movimento_estoque (append-only; quantidade com sinal). */
export interface MovimentoEstoque {
  id: string;
  org_id: string;
  item_id: string;
  tipo: TipoMovimento;
  /** numeric(12,3) com sinal, como string ('-1.500'). */
  quantidade: string;
  motivo: string | null;
  fornecedor_id: string | null;
  os_id: string | null;
  nota_fiscal: string | null;
  estorna_id: string | null;
  entrada_id: string | null;
  criado_por: string | null;
  criado_em: string;
}

/** Linha de public.movimento_estoque_custo (visível só com 'financeiro'). */
export interface MovimentoEstoqueCusto {
  movimento_id: string;
  org_id: string;
  custo_unitario_centavos: number;
  criado_em: string;
}

/** Linha da view public.estoque_saldo (saldo = soma dos movimentos). */
export interface SaldoEstoque {
  org_id: string;
  item_id: string;
  codigo: string | null;
  descricao: string;
  unidade: string;
  localizacao: string | null;
  estoque_minimo: string;
  ativo: boolean;
  saldo: string;
  negativo: boolean;
  abaixo_minimo: boolean;
}

/** Resposta das RPCs de movimento (nunca traz custo). */
export interface ResultadoMovimento {
  movimento_id: string;
  item_id: string;
  /** Saldo do item após o movimento, string decimal. */
  saldo: string;
  /** true = saldo ficou negativo (avisar o usuário). */
  negativo: boolean;
}

export interface DadosEntrada {
  item_id: string;
  quantidade: string;
  custo_unitario_centavos: number;
  fornecedor_id: string | null;
  nota_fiscal: string | null;
  /** uuid gerado no cliente para não duplicar em reenvio. */
  idempotency_key?: string;
}

export interface DadosAjuste {
  item_id: string;
  /** Com sinal: '2' entra, '-1.5' sai. */
  delta: string;
  motivo: string;
  idempotency_key?: string;
}

export interface DadosDevolucao {
  entrada_id: string;
  quantidade: string;
  motivo: string | null;
  idempotency_key?: string;
}

export interface DadosEstorno {
  movimento_id: string;
  motivo: string;
}

export interface FiltroSaldos {
  busca?: string;
  somenteAbaixoMinimo?: boolean;
  somenteNegativos?: boolean;
  mostrarInativos?: boolean;
  pagina?: number;
}

export interface FiltroMovimentos {
  itemId?: string;
  tipo?: TipoMovimento;
  fornecedorId?: string;
  pagina?: number;
}
