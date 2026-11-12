import { describe, expect, it } from 'vitest';
import { normalizarPlaca, placaValida, validarPlaca } from '../src/lib/puro/placa';
import { normalizarDocumento } from '../src/lib/puro/documento';

describe('placa', () => {
  it('normaliza', () => {
    expect(normalizarPlaca(' abc-1234 ')).toBe('ABC1234');
    expect(normalizarPlaca('abc 1d23')).toBe('ABC1D23');
  });
  it('aceita antiga e Mercosul', () => {
    expect(placaValida('ABC-1234')).toBe(true);
    expect(placaValida('abc1d23')).toBe(true);
  });
  it('rejeita invalidas', () => {
    for (const p of ['', 'AB1234', 'ABCD123', 'ABC12D3', '1234ABC', 'ABC12345']) expect(placaValida(p)).toBe(false);
    expect(() => validarPlaca('xx')).toThrow(/inválida/);
    expect(() => validarPlaca('')).toThrow(/Informe/);
    expect(validarPlaca('abc-1d23')).toBe('ABC1D23');
  });
});

describe('documento', () => {
  it('opcional e so digitos', () => {
    expect(normalizarDocumento('')).toBeNull();
    expect(normalizarDocumento(null)).toBeNull();
    expect(normalizarDocumento('123.456.789-01')).toBe('12345678901');
    expect(normalizarDocumento('12.345.678/0001-90')).toBe('12345678000190');
  });
  it('valida tamanho', () => {
    expect(() => normalizarDocumento('123')).toThrow();
    expect(() => normalizarDocumento('123456789012')).toThrow();
  });
});