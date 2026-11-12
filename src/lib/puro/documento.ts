// CPF/CNPJ opcional: so valida o tamanho (11 ou 14 digitos); guarda apenas digitos.

export function somenteDigitos(s: string): string {
  return s.replace(/\D/g, '');
}

/** Retorna null se vazio; os digitos se tiver 11 ou 14; senao lanca Error amigavel. */
export function normalizarDocumento(entrada: string | null | undefined): string | null {
  const d = somenteDigitos(entrada ?? '');
  if (!d) return null;
  if (d.length !== 11 && d.length !== 14) {
    throw new Error('Documento deve ter 11 dígitos (CPF) ou 14 dígitos (CNPJ).');
  }
  return d;
}