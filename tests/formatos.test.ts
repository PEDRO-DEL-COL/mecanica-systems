import { describe, expect, it } from 'vitest';
import {
  formatarData,
  formatarDataHora,
  formatarDinheiro,
  formatarQuantidade,
  formatarTelefone,
  normalizarQuantidade,
  normalizarTelefone
} from '../src/lib/puro/formatos';

describe('formatos', () => {
  it('data/hora em Sao Paulo', () => {
    expect(formatarDataHora('2026-11-12T02:30:00Z')).toBe('11/11/2026 23:30');
    expect(formatarData('2026-11-12T02:30:00Z')).toBe('11/11/2026');
    expect(formatarData('2026-11-12')).toBe('12/11/2026');
    expect(formatarData('lixo')).toBe('');
    expect(formatarData(null)).toBe('');
  });
  it('telefone', () => {
    expect(formatarTelefone('11987654321')).toBe('(11) 98765-4321');
    expect(formatarTelefone('+55 (11) 3333-4444')).toBe('(11) 3333-4444');
    expect(normalizarTelefone('(11) 98765-4321')).toBe('11987654321');
  });
  it('quantidade como string', () => {
    expect(formatarQuantidade('1.500')).toBe('1,5');
    expect(formatarQuantidade('2000.000')).toBe('2.000');
    expect(formatarQuantidade('abc')).toBe('');
    expect(normalizarQuantidade('1,5')).toBe('1.5');
    expect(normalizarQuantidade('0,125')).toBe('0.125');
    expect(normalizarQuantidade('1,2345')).toBeNull();
  });
  it('dinheiro', () => {
    expect(formatarDinheiro(123456)).toBe('R$ 1.234,56');
  });
});
