/** Markup e margem em centavos inteiros (sem ponto flutuante). Resultado em décimos de ponto percentual (1/10 de %). */

export interface MargemItem {
  /** (venda - custo) / custo, em décimos de %; null se custo = 0. */
  markupDecimos: number | null;
  /** (venda - custo) / venda, em décimos de %; null se venda = 0. */
  margemDecimos: number | null;
}

function razaoDecimos(numerador: bigint, denominador: bigint): number {
  // numerador / denominador * 1000, arredondado (metade afasta do zero).
  const n = numerador * 1000n;
  const neg = n < 0n !== denominador < 0n;
  const an = n < 0n ? -n : n;
  const ad = denominador < 0n ? -denominador : denominador;
  const q = (an * 2n + ad) / (ad * 2n);
  return Number(neg ? -q : q);
}

function inteiro(n: number): boolean {
  return Number.isSafeInteger(n) && n >= 0;
}

export function calcularMargem(vendaCentavos: number, custoCentavos: number): MargemItem {
  if (!inteiro(vendaCentavos) || !inteiro(custoCentavos)) return { markupDecimos: null, margemDecimos: null };
  const venda = BigInt(vendaCentavos);
  const custo = BigInt(custoCentavos);
  const lucro = venda - custo;
  return {
    markupDecimos: custo === 0n ? null : razaoDecimos(lucro, custo),
    margemDecimos: venda === 0n ? null : razaoDecimos(lucro, venda)
  };
}

/** 250 -> '25,0%'; null -> '—'. */
export function formatarPercentualDecimos(decimos: number | null): string {
  if (decimos === null) return '—';
  const neg = decimos < 0;
  const a = Math.abs(decimos);
  const inteira = String(Math.floor(a / 10)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${neg ? '-' : ''}${inteira},${a % 10}%`;
}