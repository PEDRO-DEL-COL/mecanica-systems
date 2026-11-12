import { describe, expect, it } from 'vitest';
import * as v from 'valibot';
import {
  cadastroSchema,
  destinoSeguro,
  ehEmailJaCadastrado,
  loginSchema,
  novaSenhaSchema,
  recuperacaoSchema,
  traduzirErroAuth
} from '../src/lib/validacao/auth';
import { errosPorCampo } from '../src/lib/validacao/comum';
import { mapearErro } from '../src/lib/erros';

function erros(schema: v.GenericSchema<unknown, unknown>, dados: unknown) {
  const r = v.safeParse(schema, dados);
  return r.success ? {} : errosPorCampo(r.issues);
}

describe('validação de auth', () => {
  it('login normaliza e-mail e exige senha', () => {
    const r = v.safeParse(loginSchema, { email: '  A@B.com ', senha: 'x' });
    expect(r.success && (r.output as { email: string }).email).toBe('a@b.com');
    expect(erros(loginSchema, { email: 'ruim', senha: '' })).toEqual({
      email: 'E-mail inválido.',
      senha: 'Informe a senha.'
    });
  });

  it('cadastro exige nome, senha >= 8 e confirmação igual', () => {
    const ok = { nome: ' Ana ', email: 'ana@x.com', senha: '12345678', confirmacao: '12345678' };
    const r = v.safeParse(cadastroSchema, ok);
    expect(r.success && (r.output as { nome: string }).nome).toBe('Ana');
    expect(erros(cadastroSchema, { ...ok, senha: '1234567', confirmacao: '1234567' }).senha).toMatch(/pelo menos 8/);
    expect(erros(cadastroSchema, { ...ok, confirmacao: '87654321' })).toEqual({ confirmacao: 'As senhas não conferem.' });
    expect(erros(cadastroSchema, { ...ok, nome: ' ' }).nome).toBe('Informe seu nome.');
  });

  it('recuperação e nova senha', () => {
    expect(erros(recuperacaoSchema, { email: '' }).email).toBe('Informe o e-mail.');
    expect(erros(novaSenhaSchema, { senha: 'curta', confirmacao: 'curta' }).senha).toMatch(/pelo menos 8/);
    expect(erros(novaSenhaSchema, { senha: '12345678', confirmacao: '1234567x' }).confirmacao).toBe('As senhas não conferem.');
    expect(erros(novaSenhaSchema, { senha: '12345678', confirmacao: '12345678' })).toEqual({});
  });
});

describe('erros de auth', () => {
  it('traduz credenciais inválidas sem revelar se o e-mail existe', () => {
    const e = mapearErro(traduzirErroAuth({ code: 'invalid_credentials', message: 'Invalid login credentials' }));
    expect(e.mensagem).toBe('E-mail ou senha incorretos.');
    expect(mapearErro(traduzirErroAuth({ message: 'Invalid login credentials' })).mensagem).toBe(e.mensagem);
  });

  it('limite, link expirado, rede e desconhecido', () => {
    expect(mapearErro(traduzirErroAuth({ status: 429 })).mensagem).toMatch(/Muitas tentativas/);
    expect(mapearErro(traduzirErroAuth({ code: 'otp_expired' })).mensagem).toMatch(/expirado/);
    expect(mapearErro(traduzirErroAuth({ message: 'Failed to fetch' })).codigo).toBe('rede');
    expect(mapearErro(traduzirErroAuth({ message: 'segredo interno' })).mensagem).not.toMatch(/segredo/);
  });

  it('e-mail já cadastrado é detectado', () => {
    expect(ehEmailJaCadastrado({ code: 'user_already_exists' })).toBe(true);
    expect(ehEmailJaCadastrado({ message: 'User already registered' })).toBe(true);
    expect(ehEmailJaCadastrado({ code: 'weak_password' })).toBe(false);
  });

  it('destino pós-callback é restrito', () => {
    expect(destinoSeguro('/nova-senha')).toBe('/nova-senha');
    expect(destinoSeguro('https://evil.com')).toBe('/app');
    expect(destinoSeguro('//evil.com')).toBe('/app');
    expect(destinoSeguro(null)).toBe('/app');
  });
});
