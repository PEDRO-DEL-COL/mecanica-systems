/** Formatadores de exibição. Dinheiro via dinheiro.ts (centavos inteiros); quantidade como string decimal. */
import { formatarReais } from './dinheiro';

export const FUSO = 'America/Sao_Paulo';

function paraData(v: string | number | Date): Date | null {
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** '25/12/2026' em America/Sao_Paulo. Valor inválido => ''. */
export function formatarData(v: string | number | Date | null | undefined): string {
  if (v === null || v === undefined || v === '') return '';
  // Data pura (YYYY-MM-DD) não sofre conversão de fuso.
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) {
    const [a, m, d] = v.split('-');
    return `${d}/${m}/${a}`;
  }
  const d = paraData(v);
  if (!d) return '';
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: FUSO,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  }).format(d);
}

/** '25/12/2026 14:30' em America/Sao_Paulo. */
export function formatarDataHora(v: string | number | Date | null | undefined): string {
  if (v === null || v === undefined || v === '') return '';
  const d = paraData(v);
  if (!d) return '';
  const partes = new Intl.DateTimeFormat('pt-BR', {
    timeZone: FUSO,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(d);
  const g = (t: string) => partes.find((p) => p.type === t)?.value ?? '';
  return `${g('day')}/${g('month')}/${g('year')} ${g('hour')}:${g('minute')}`;
}

/** Só dígitos; remove prefixo 55 se sobrar 12-13 dígitos. */
export function normalizarTelefone(entrada: string | null | undefined): string {
  let d = String(entrada ?? '').replace(/\D/g, '');
  if ((d.length === 12 || d.length === 13) && d.startsWith('55')) d = d.slice(2);
  return d;
}

/** '11987654321' -> '(11) 98765-4321'; '1133334444' -> '(11) 3333-4444'. Outros: devolve como veio. */
export function formatarTelefone(entrada: string | null | undefined): string {
  const d = normalizarTelefone(entrada);
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return String(entrada ?? '');
}

/**
 * Quantidade decimal (string do banco, ponto decimal) para exibição: '1500.000' -> '1.500', '1.500' -> '1,5'.
 * Sem Number/float. Inválido => ''.
 */
export function formatarQuantidade(valor: string | null | undefined): string {
  const t = String(valor ?? '').trim();
  if (!/^\d+(\.\d+)?$/.test(t)) return '';
  const [i, f = ''] = t.split('.');
  const fr = f.replace(/0+$/, '');
  const inteiro = i.replace(/^0+(?=\d)/, '').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return fr ? `${inteiro},${fr}` : inteiro;
}

/** Texto digitado (',' ou '.') -> string decimal canônica com ponto e até 3 casas, para enviar ao banco. Inválido => null. */
export function normalizarQuantidade(valor: string | null | undefined): string | null {
  const t = String(valor ?? '').trim().replace(',', '.');
  if (!/^\d+(\.\d{1,3})?$/.test(t)) return null;
  const [i, f = ''] = t.split('.');
  const inteiro = i.replace(/^0+(?=\d)/, '');
  const fr = f.replace(/0+$/, '');
  return fr ? `${inteiro}.${fr}` : inteiro;
}

/** Centavos inteiros -> 'R$ 1.234,56'. */
export function formatarDinheiro(centavos: number): string {
  return formatarReais(centavos);
}
