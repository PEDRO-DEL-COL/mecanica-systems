import { describe, expect, it } from 'vitest';
import { AREAS, pode, type Area } from '../src/lib/puro/permissoes';

describe('pode', () => {
  it('dono pode tudo, mesmo sem linhas', () => {
    for (const a of AREAS) {
      expect(pode('dono', {}, a, 'leitura')).toBe(true);
      expect(pode('dono', {}, a, 'escrita')).toBe(true);
    }
  });
  it('funcionário sem linha não tem acesso', () => {
    expect(pode('funcionario', {}, 'clientes', 'leitura')).toBe(false);
  });
  it('leitura permite só leitura', () => {
    const p = { clientes: 'leitura' } as const;
    expect(pode('funcionario', p, 'clientes', 'leitura')).toBe(true);
    expect(pode('funcionario', p, 'clientes', 'escrita')).toBe(false);
    expect(pode('funcionario', p, 'veiculos', 'leitura')).toBe(false);
  });
  it('escrita implica leitura', () => {
    const p = { caixa: 'escrita' } as const;
    expect(pode('funcionario', p, 'caixa', 'leitura')).toBe(true);
    expect(pode('funcionario', p, 'caixa', 'escrita')).toBe(true);
  });
  it('nível padrão é leitura', () => {
    expect(pode('funcionario', { equipe: 'leitura' }, 'equipe')).toBe(true);
  });
  it('sem papel ou área desconhecida nega', () => {
    expect(pode(null, { clientes: 'escrita' }, 'clientes')).toBe(false);
    expect(pode('funcionario', { clientes: 'escrita' }, 'inexistente' as Area)).toBe(false);
    expect(pode('funcionario', {}, 'toString' as Area)).toBe(false);
  });
});
