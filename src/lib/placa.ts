// Placa de veiculo: formato antigo (ABC1234) e Mercosul (ABC1D23).

/** Maiusculas, sem hifen/espacos/qualquer caractere nao alfanumerico. */
export function normalizarPlaca(entrada: string): string {
  return entrada.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

const ANTIGA = /^[A-Z]{3}[0-9]{4}$/;
const MERCOSUL = /^[A-Z]{3}[0-9][A-Z][0-9]{2}$/;

export function placaValida(entrada: string): boolean {
  const p = normalizarPlaca(entrada);
  return ANTIGA.test(p) || MERCOSUL.test(p);
}

/** Retorna a placa normalizada ou lanca Error com mensagem amigavel. */
export function validarPlaca(entrada: string): string {
  const p = normalizarPlaca(entrada);
  if (!p) throw new Error('Informe a placa.');
  if (!ANTIGA.test(p) && !MERCOSUL.test(p)) {
    throw new Error('Placa inválida. Use ABC-1234 ou ABC1D23 (Mercosul).');
  }
  return p;
}