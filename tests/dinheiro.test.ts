import { describe, expect, it } from 'vitest';
import { formatarReais, parseReais } from '../src/lib/dinheiro';

describe('dinheiro', () => {
  it('parseReais', () => {
    expect(parseReais('1.234,56')).toBe(123456);
    expect(parseReais('R$ 10')).toBe(1000);
    expect(parseReais('12,5')).toBe(1250);
    expect(parseReais('0,07')).toBe(7);
    expect(parseReais('1.234')).toBe(123400);
    expect(parseReais('19.90')).toBe(1990);
    expect(parseReais('0,29')).toBe(29);
  });
  it('rejeita negativos e invalidos', () => {
    for (const t of ['', 'abc', '-5', '-1,00', '1,234', '1,2,3', '12.34.56', '1.23,4,5', 'R$']) {
      expect(() => parseReais(t), t).toThrow();
    }
  });
  it('formatarReais', () => {
    expect(formatarReais(123456)).toBe('R$ 1.234,56');
    expect(formatarReais(0)).toBe('R$ 0,00');
    expect(formatarReais(5)).toBe('R$ 0,05');
    expect(formatarReais(100000000)).toBe('R$ 1.000.000,00');
    expect(() => formatarReais(-1)).toThrow();
    expect(() => formatarReais(1.5)).toThrow();
  });
  it('ida e volta', () => {
    for (const c of [0, 1, 99, 100, 123456, 99999999]) expect(parseReais(formatarReais(c))).toBe(c);
  });
});
