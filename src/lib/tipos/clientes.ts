// Espelha public.cliente (snake_case, como no banco). A coluna `busca` é gerada
// pelo banco e não faz parte do tipo.

export interface Cliente {
  id: string;
  org_id: string;
  nome: string;
  /** Só dígitos (CPF 11 ou CNPJ 14). */
  documento: string | null;
  /** Só dígitos com DDD (10 ou 11). */
  telefone: string | null;
  email: string | null;
  endereco: string | null;
  observacoes: string | null;
  ativo: boolean;
  versao: number;
  criado_em: string;
  atualizado_em: string;
}

/** Campos editáveis (o que o formulário envia). */
export interface ClienteEntrada {
  nome: string;
  documento: string | null;
  telefone: string | null;
  email: string | null;
  endereco: string | null;
  observacoes: string | null;
}

export interface ListaClientesParametros {
  /** Texto livre (nome ou telefone); menos de 2 caracteres = sem filtro. */
  busca?: string;
  /** Página 1-based (25 por página). */
  pagina?: number;
  incluirInativos?: boolean;
}

export interface PaginaDe<T> {
  itens: T[];
  total: number;
  pagina: number;
  tamanho: number;
}
