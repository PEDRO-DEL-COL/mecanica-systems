import type { Session } from '@supabase/supabase-js';
import { supabase } from '../supabase';
import { ok, type Resultado } from '../erros';
import { executar } from './base';
import { ehEmailJaCadastrado, traduzirErroAuth } from '../validacao/auth';

/*
 * Ponto de extensão Turnstile (CAPTCHA): quando ativado no Supabase, obter o token no widget da tela e
 * passá-lo em `captchaToken` (já repassado como options.captchaToken). Não implementado nesta fase.
 *
 * Regras: nunca logar senha/token; erros passam por traduzirErroAuth (mensagens genéricas).
 */

function traduzir(r: { data: unknown; error: unknown }): { data: unknown; error: unknown } {
  return r.error ? { data: null, error: traduzirErroAuth(r.error) } : r;
}

function semDados(r: Resultado<unknown>): Resultado<void> {
  return r.ok ? ok(undefined) : r;
}

export async function entrar(email: string, senha: string, captchaToken?: string): Promise<Resultado<void>> {
  const r = await executar(async () =>
    traduzir(await supabase.auth.signInWithPassword({ email, password: senha, options: { captchaToken } }))
  );
  return semDados(r);
}

/** E-mail já cadastrado é tratado como sucesso (não revela existência da conta). */
export async function cadastrar(
  nome: string,
  email: string,
  senha: string,
  captchaToken?: string
): Promise<Resultado<void>> {
  const r = await executar(async () => {
    const res = await supabase.auth.signUp({
      email,
      password: senha,
      options: {
        data: { nome },
        emailRedirectTo: `${window.location.origin}/auth/callback`,
        captchaToken
      }
    });
    if (res.error && ehEmailJaCadastrado(res.error)) return { data: null, error: null };
    return traduzir(res);
  });
  return semDados(r);
}

export async function sair(): Promise<Resultado<void>> {
  const r = await executar(async () => {
    const { error } = await supabase.auth.signOut();
    return { data: null, error };
  });
  return semDados(r);
}

export async function solicitarRecuperacao(email: string, captchaToken?: string): Promise<Resultado<void>> {
  const r = await executar(async () =>
    traduzir(
      await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth/callback?next=/nova-senha`,
        captchaToken
      })
    )
  );
  return semDados(r);
}

export async function redefinirSenha(senha: string): Promise<Resultado<void>> {
  const r = await executar(async () => traduzir(await supabase.auth.updateUser({ password: senha })));
  return semDados(r);
}

/** Aguarda a inicialização do cliente (inclui a troca automática do code PKCE da URL). */
export async function obterSessao(): Promise<Resultado<Session | null>> {
  return executar<Session | null>(async () => {
    const { data, error } = await supabase.auth.getSession();
    return { data: data.session, error };
  });
}

/** Troca manual do code PKCE (fallback quando a detecção automática não gerou sessão). */
export async function trocarCodigo(codigo: string): Promise<Resultado<Session | null>> {
  return executar<Session | null>(async () => {
    const res = await supabase.auth.exchangeCodeForSession(codigo);
    return traduzir({ data: res.data.session, error: res.error }) as { data: Session | null; error: unknown };
  });
}
