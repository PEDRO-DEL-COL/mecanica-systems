import { formatarQuantidade } from '../puro/formatos';
import type { TipoMovimento } from '../tipos/estoque';

/** Quantidade decimal com sinal ('-1.500' -> '-1,5'), sem float. */
export function quantidadeComSinal(valor: string | null | undefined): string {
  const t = String(valor ?? '').trim();
  if (t.startsWith('-')) return `-${formatarQuantidade(t.slice(1))}`;
  return formatarQuantidade(t.replace(/^\+/, ''));
}

export const ROTULO_TIPO: Record<TipoMovimento, string> = {
  entrada: 'Entrada',
  saida_os: 'Saída para OS',
  estorno: 'Estorno',
  ajuste: 'Ajuste',
  devolucao: 'Devolução'
};

export function novoId(): string {
  return crypto.randomUUID();
}
