/** Fornecedores. Espelha public.fornecedor. */

export interface Fornecedor {
  id: string;
  org_id: string;
  nome: string;
  /** CPF/CNPJ só dígitos (11 ou 14). */
  documento: string | null;
  contato: string | null;
  /** Só dígitos com DDD. */
  telefone: string | null;
  email: string | null;
  observacao: string | null;
  ativo: boolean;
  versao: number;
  criado_em: string;
  atualizado_em: string;
}

export interface DadosFornecedor {
  nome: string;
  documento: string | null;
  contato: string | null;
  telefone: string | null;
  email: string | null;
  observacao: string | null;
}

export interface FiltroFornecedores {
  busca?: string;
  mostrarInativos?: boolean;
  pagina?: number;
}
