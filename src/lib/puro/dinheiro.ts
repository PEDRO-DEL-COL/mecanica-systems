/** Dinheiro em centavos inteiros <-> texto BRL. Sem ponto flutuante nas contas. */

/** Converte '1.234,56', '12,5', 'R$ 10', '1234.56' em centavos. Lanca Error se invalido ou negativo. */
export function parseReais(texto: string): number {
  const t = String(texto ?? '').replace(/R\$/gi, '').replace(/\s/g, '');
  if (!t) throw new Error('Informe o valor.');
  if (t.startsWith('-')) throw new Error('Valor não pode ser negativo.');
  let inteiro: string;
  let frac = '';
  if (t.includes(',')) {
    const partes = t.split(',');
    if (partes.length !== 2) throw new Error('Valor inválido.');
    inteiro = partes[0];
    frac = partes[1];
    if (inteiro.includes('.') && !/^\d{1,3}(\.\d{3})+$/.test(inteiro)) throw new Error('Valor inválido.');
    inteiro = inteiro.replace(/\./g, '');
  } else if (/^\d{1,3}(\.\d{3})+$/.test(t)) {
    inteiro = t.replace(/\./g, '');
  } else if (/^\d+\.\d{1,2}$/.test(t)) {
    [inteiro, frac] = t.split('.');
  } else {
    inteiro = t;
  }
  if (!/^\d+$/.test(inteiro) || !/^\d{0,2}$/.test(frac)) throw new Error('Valor inválido.');
  const centavos = Number(inteiro) * 100 + Number(frac.padEnd(2, '0') || '0');
  if (!Number.isSafeInteger(centavos)) throw new Error('Valor inválido.');
  return centavos;
}

/** 123456 -> 'R$ 1.234,56'. Lanca Error se nao for inteiro >= 0. */
export function formatarReais(centavos: number): string {
  if (!Number.isSafeInteger(centavos) || centavos < 0) throw new Error('Valor inválido.');
  const reais = Math.floor(centavos / 100);
  const cents = centavos % 100;
  const milhar = String(reais).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `R$ ${milhar},${String(cents).padStart(2, '0')}`;
}
