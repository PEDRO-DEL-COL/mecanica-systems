import { describe, it, expect } from 'vitest';
import { calcularMargem, formatarPercentualDecimos } from '../src/lib/puro/margem';

describe('calcularMargem', () => {
  it('markup sobre o custo e margem sobre a venda', () => {
    // custo 80, venda 100: markup 25%, margem 20%
    expect(calcularMargem(10000, 8000)).toEqual({ markupDecimos: 250, margemDecimos: 200 });
  });
  it('custo zero: markup indefinido', () => {
    expect(calcularMargem(10000, 0)).toEqual({ markupDecimos: null, margemDecimos: 1000 });
  });
  it('venda zero: margem indefinida', () => {
    expect(calcularMargem(0, 5000)).toEqual({ markupDecimos: -1000, margemDecimos: null });
  });
  it('prejuízo dá percentuais negativos', () => {
    expect(calcularMargem(5000, 10000)).toEqual({ markupDecimos: -500, margemDecimos: -1000 });
  });
  it('arredonda em décimos sem float', () => {
    // 1/3 => 33,3%
    expect(calcularMargem(400, 300)).toEqual({ markupDecimos: 333, margemDecimos: 250 });
    expect(calcularMargem(200, 300).markupDecimos).toBe(-333);
  });
  it('entradas inválidas', () => {
    expect(calcularMargem(1.5, 100)).toEqual({ markupDecimos: null, margemDecimos: null });
    expect(calcularMargem(-1, 100)).toEqual({ markupDecimos: null, margemDecimos: null });
  });
});

describe('formatarPercentualDecimos', () => {
  it('formata pt-BR', () => {
    expect(formatarPercentualDecimos(250)).toBe('25,0%');
    expect(formatarPercentualDecimos(-5)).toBe('-0,5%');
    expect(formatarPercentualDecimos(12345)).toBe('1.234,5%');
    expect(formatarPercentualDecimos(null)).toBe('—');
  });
});