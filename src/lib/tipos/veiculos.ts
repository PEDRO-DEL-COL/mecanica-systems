// Espelha public.veiculo (snake_case, como no banco). A coluna `busca` é gerada
// pelo banco e não faz parte do tipo.

export interface Veiculo {
  id: string;
  org_id: string;
  cliente_id: string;
  /** Normalizada: maiúscula, sem hífen. */
  placa: string;
  marca: string;
  modelo: string;
  ano: number | null;
  cor: string | null;
  chassi: string | null;
  km_atual: number;
  ativo: boolean;
  versao: number;
  criado_em: string;
  atualizado_em: string;
}

/** Campos editáveis (cliente_id só muda por transferir). */
export interface VeiculoEdicao {
  placa: string;
  marca: string;
  modelo: string;
  ano: number | null;
  cor: string | null;
  chassi: string | null;
  km_atual: number;
}

export interface VeiculoEntrada extends VeiculoEdicao {
  cliente_id: string;
}

export interface ListaVeiculosParametros {
  /** Placa, marca ou modelo; menos de 2 caracteres = sem filtro. */
  busca?: string;
  /** Restringe a um cliente (ficha do cliente). */
  clienteId?: string;
  pagina?: number;
  incluirInativos?: boolean;
}
