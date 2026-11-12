/** Catálogo (serviços e peças). Espelha public.item_catalogo / public.item_custo. */

export type TipoItem = 'servico' | 'peca';

export const TIPOS_ITEM: readonly TipoItem[] = ['servico', 'peca'];

/** Página de uma lista paginada no servidor (25 por página). */
export interface Pagina<T> {
  itens: T[];
  /** Total aproximado (count estimado), ou null se indisponível. */
  total: number | null;
  pagina: number;
}

/** Linha de public.item_catalogo (sem custo: custo fica em ItemCusto). */
export interface ItemCatalogo {
  id: string;
  org_id: string;
  tipo: TipoItem;
  codigo: string | null;
  codigo_fabricante: string | null;
  descricao: string;
  unidade: string;
  preco_venda_centavos: number;
  controla_estoque: boolean;
  /** numeric(12,3) como string decimal ('2.000'). */
  estoque_minimo: string;
  /** Prateleira/gaveta. */
  localizacao: string | null;
  ativo: boolean;
  versao: number;
  criado_em: string;
  atualizado_em: string;
}

/** Campos que o usuário informa ao criar/editar um item. */
export interface DadosItemCatalogo {
  tipo: TipoItem;
  codigo: string | null;
  codigo_fabricante: string | null;
  descricao: string;
  unidade: string;
  preco_venda_centavos: number;
  controla_estoque: boolean;
  estoque_minimo: string;
  localizacao: string | null;
}

/** Linha de public.item_custo (visível só com 'financeiro'). */
export interface ItemCusto {
  item_id: string;
  org_id: string;
  custo_medio_centavos: number;
  ultimo_custo_centavos: number | null;
  atualizado_em: string;
}

export interface FiltroCatalogo {
  /** Texto livre (descrição/código), sem acento; mínimo 2 caracteres. */
  busca?: string;
  tipo?: TipoItem;
  mostrarInativos?: boolean;
  /** 1-based. */
  pagina?: number;
}
