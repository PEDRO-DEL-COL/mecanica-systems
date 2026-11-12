import { describe, expect, it } from 'vitest';
import * as v from 'valibot';
import {
  centavosSchema,
  dinheiroSchema,
  documentoSchema,
  emailSchema,
  errosPorCampo,
  placaSchema,
  quantidadeSchema,
  telefoneOpcionalSchema,
  telefoneSchema
} from '../src/lib/validacao/comum';

const msg = (s: v.GenericSchema, x: unknown) => {
  const r = v.safeParse(s, x);
  return r.success ? null : r.issues[0].message;
};

describe('validacao comum', () => {
  it('placa', () => {
    expect(v.parse(placaSchema, 'abc-1d23')).toBe('ABC1D23');
    expect(msg(placaSchema, '123')).toContain('Placa inválida');
    expect(msg(placaSchema, '')).toBe('Informe a placa.');
  });
  it('documento opcional', () => {
    expect(v.parse(documentoSchema, '')).toBeNull();
    expect(v.parse(documentoSchema, undefined)).toBeNull();
    expect(v.parse(documentoSchema, '123.456.789-09')).toBe('12345678909');
    expect(msg(documentoSchema, '123')).toContain('11 dígitos');
  });
  it('telefone', () => {
    expect(v.parse(telefoneSchema, '(11) 98765-4321')).toBe('11987654321');
    expect(msg(telefoneSchema, '9876')).toContain('Telefone inválido');
    expect(v.parse(telefoneOpcionalSchema, '')).toBeNull();
    expect(v.parse(telefoneOpcionalSchema, '1133334444')).toBe('1133334444');
    expect(msg(telefoneOpcionalSchema, '12')).toContain('Telefone inválido');
  });
  it('email', () => {
    expect(v.parse(emailSchema, '  Joao@Ex.COM ')).toBe('joao@ex.com');
    expect(msg(emailSchema, 'x')).toBe('E-mail inválido.');
  });
  it('dinheiro', () => {
    expect(v.parse(dinheiroSchema, 'R$ 1.234,56')).toBe(123456);
    expect(msg(dinheiroSchema, '-1')).toBe('Valor não pode ser negativo.');
    expect(v.parse(centavosSchema, 100)).toBe(100);
    expect(msg(centavosSchema, 1.5)).toBe('Valor inválido.');
    expect(msg(centavosSchema, -1)).toBe('Valor não pode ser negativo.');
  });
  it('quantidade', () => {
    expect(v.parse(quantidadeSchema, '1,5')).toBe('1.5');
    expect(msg(quantidadeSchema, '0')).toContain('Quantidade inválida');
  });
  it('errosPorCampo', () => {
    const r = v.safeParse(v.object({ email: emailSchema }), { email: 'x' });
    expect(r.success).toBe(false);
    if (!r.success) expect(errosPorCampo(r.issues)).toEqual({ email: 'E-mail inválido.' });
  });
});
