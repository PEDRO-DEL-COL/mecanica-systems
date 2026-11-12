import * as v from 'valibot';
import { emailSchema } from './comum';

export const SENHA_MIN = 8;
export const SENHA_MAX = 72; // limite do bcrypt usado pelo Supabase Auth

const senhaNova = v.pipe(
  v.string('Informe a senha.'),
  v.minLength(SENHA_MIN, `A senha deve ter pelo menos ${SENHA_MIN} caracteres.`),
  v.maxLength(SENHA_MAX, `A senha deve ter no máximo ${SENHA_MAX} caracteres.`)
);

export const loginSchema = v.object({
  email: emailSchema,
  senha: v.pipe(v.string('Informe a senha.'), v.nonEmpty('Informe a senha.'))
});

export interface DadosCadastro {
  nome: string;
  email: string;
  senha: string;
  confirmacao: string;
}
export interface DadosNovaSenha {
  senha: string;
  confirmacao: string;
}

export const cadastroSchema = v.pipe(
  v.object({
    nome: v.pipe(
      v.string('Informe seu nome.'),
      v.trim(),
      v.minLength(2, 'Informe seu nome.'),
      v.maxLength(120, 'Nome muito longo.')
    ),
    email: emailSchema,
    senha: senhaNova,
    confirmacao: v.pipe(v.string('Confirme a senha.'), v.nonEmpty('Confirme a senha.'))
  }),
  v.forward(
    v.check((i) => i.senha === i.confirmacao, 'As senhas não conferem.'),
    ['confirmacao']
  )
);

export const recuperacaoSchema = v.object({ email: emailSchema });

export const novaSenhaSchema = v.pipe(
  v.object({
    senha: senhaNova,
    confirmacao: v.pipe(v.string('Confirme a senha.'), v.nonEmpty('Confirme a senha.'))
  }),
  v.forward(
    v.check((i) => i.senha === i.confirmacao, 'As senhas não conferem.'),
    ['confirmacao']
  )
);

export type DadosLogin = v.InferOutput<typeof loginSchema>;

export const MSG_CADASTRO_ENVIADO =
  'Enviamos um link de confirmação para o seu e-mail. Abra a mensagem e clique no link para ativar a conta. Confira também a caixa de spam.';
export const MSG_RECUPERACAO_ENVIADA =
  'Se esse e-mail estiver cadastrado, enviaremos um link para redefinir a senha. Confira também a caixa de spam.';
export const MSG_LINK_EXPIRADO = 'Link inválido ou expirado. Peça um novo e tente de novo.';

interface ErroAuthBruto {
  code?: unknown;
  message?: unknown;
  status?: unknown;
}

const MSG_LIMITE = 'Muitas tentativas. Aguarde alguns minutos e tente de novo.';

const POR_CODIGO: Record<string, string> = {
  invalid_credentials: 'E-mail ou senha incorretos.',
  email_not_confirmed: 'Confirme seu e-mail antes de entrar. Procure o link na sua caixa de entrada.',
  weak_password: 'Senha fraca. Use pelo menos 8 caracteres, misturando letras e números.',
  same_password: 'A nova senha deve ser diferente da atual.',
  over_request_rate_limit: MSG_LIMITE,
  over_email_send_rate_limit: MSG_LIMITE,
  session_not_found: MSG_LINK_EXPIRADO,
  otp_expired: MSG_LINK_EXPIRADO,
  flow_state_not_found: MSG_LINK_EXPIRADO,
  flow_state_expired: MSG_LINK_EXPIRADO,
  bad_code_verifier: MSG_LINK_EXPIRADO,
  captcha_failed: 'Não foi possível validar a verificação de segurança. Tente de novo.'
};

/**
 * Traduz erro do Supabase Auth. Devolve `{ code: 'P0001', message }` (mensagem pt-BR segura, aceita por
 * mapearErro) quando conhecido; senão devolve o erro original (rede/desconhecido caem em mensagem genérica).
 * Nunca inclui e-mail, senha nem token.
 */
export function traduzirErroAuth(erro: unknown): unknown {
  if (erro === null || typeof erro !== 'object') return erro;
  const e = erro as ErroAuthBruto;
  const code = typeof e.code === 'string' ? e.code : '';
  const msg = typeof e.message === 'string' ? e.message.toLowerCase() : '';
  let texto = POR_CODIGO[code];
  if (!texto) {
    if (e.status === 429) texto = MSG_LIMITE;
    else if (/invalid login credentials/.test(msg)) texto = POR_CODIGO.invalid_credentials;
    else if (/email not confirmed/.test(msg)) texto = POR_CODIGO.email_not_confirmed;
    else if (/code verifier|flow state|otp.*expired|token.*expired/.test(msg)) texto = MSG_LINK_EXPIRADO;
  }
  return texto ? { code: 'P0001', message: texto } : erro;
}

/** Cadastro com e-mail já existente: tratado como sucesso para não revelar a existência da conta. */
export function ehEmailJaCadastrado(erro: unknown): boolean {
  if (erro === null || typeof erro !== 'object') return false;
  const e = erro as ErroAuthBruto;
  const code = typeof e.code === 'string' ? e.code : '';
  return code === 'user_already_exists' || code === 'email_exists' || /already registered/i.test(String(e.message ?? ''));
}

/** Aceita só destinos internos conhecidos após o callback (evita open redirect). */
export function destinoSeguro(next: string | null | undefined): string {
  return next === '/nova-senha' || next === '/app' ? next : '/app';
}
