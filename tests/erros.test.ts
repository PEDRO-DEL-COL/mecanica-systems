import { describe, expect, it } from 'vitest';
import { mapearErro, MSG_CONFLITO } from '../src/lib/erros';
import { executar, intervalo } from '../src/lib/repos/base';

describe('mapearErro', () => {
  it('codigos do Postgres', () => {
    expect(mapearErro({ code: '23505', message: 'dup' }).codigo).toBe('duplicado');
    expect(mapearErro({ code: '42501', message: 'x' }).codigo).toBe('permissao');
    expect(mapearErro({ code: '23514', message: 'x' }).codigo).toBe('invalido');
    expect(mapearErro({ code: 'PGRST116', message: 'x' }).codigo).toBe('nao_encontrado');
  });
  it('P0001 mostra a mensagem da RPC; outros nao vazam texto cru', () => {
    expect(mapearErro({ code: 'P0001', message: 'Estoque insuficiente.' }).mensagem).toBe('Estoque insuficiente.');
    expect(mapearErro({ code: 'XX000', message: 'relation "x" secreta' }).mensagem).not.toContain('secreta');
  });
  it('rede e timeout', () => {
    expect(mapearErro(new TypeError('Failed to fetch')).codigo).toBe('rede');
    expect(mapearErro({ name: 'AbortError', message: 'aborted' }).codigo).toBe('rede');
    expect(mapearErro(new Error('request timed out')).codigo).toBe('rede');
  });
  it('desconhecido e nulo', () => {
    expect(mapearErro(null).codigo).toBe('desconhecido');
    expect(mapearErro('algo').codigo).toBe('desconhecido');
  });
});

describe('executar', () => {
  it('sucesso', async () => {
    const r = await executar(async () => ({ data: 5, error: null }));
    expect(r).toEqual({ ok: true, dados: 5 });
  });
  it('erro do supabase', async () => {
    const r = await executar(async () => ({ data: null, error: { code: '23505', message: 'x' } }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.erro.codigo).toBe('duplicado');
  });
  it('lancamento vira rede sem propagar', async () => {
    const r = await executar<number>(async () => {
      throw new TypeError('Failed to fetch');
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.erro.codigo).toBe('rede');
  });
  it('conflito de versao', async () => {
    const r = await executar(async () => ({ data: null, error: { code: 'PGRST116', message: 'x' } }), {
      conflitoVersao: true
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.erro.codigo).toBe('conflito');
      expect(r.erro.mensagem).toBe(MSG_CONFLITO);
      expect(r.erro.mensagem).toBe('Alterado por outra pessoa. Recarregue.');
    }
  });
});

describe('intervalo', () => {
  it('paginas de 25', () => {
    expect(intervalo(1)).toEqual({ from: 0, to: 24 });
    expect(intervalo(2)).toEqual({ from: 25, to: 49 });
    expect(intervalo(3, 10)).toEqual({ from: 20, to: 29 });
    expect(intervalo(0)).toEqual({ from: 0, to: 24 });
  });
});
