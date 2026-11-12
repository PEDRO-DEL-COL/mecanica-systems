/** Erros do app: mapeia falhas do Supabase/PostgREST e de rede para mensagens pt-BR. */

export type CodigoErro =
  | 'duplicado'
  | 'permissao'
  | 'invalido'
  | 'regra'
  | 'nao_encontrado'
  | 'conflito'
  | 'rede'
  | 'desconhecido';

export interface ErroApp {
  codigo: CodigoErro;
  mensagem: string;
}

export type Resultado<T> = { ok: true; dados: T } | { ok: false; erro: ErroApp };

export const MSG_CONFLITO = 'Alterado por outra pessoa. Recarregue.';
export const MSG_REDE = 'Sem conexão com o servidor. Verifique a internet e tente de novo.';
export const MSG_GENERICA = 'Não foi possível concluir. Tente de novo.';

export function erroConflito(): ErroApp {
  return { codigo: 'conflito', mensagem: MSG_CONFLITO };
}

export function ok<T>(dados: T): Resultado<T> {
  return { ok: true, dados };
}

export function falha<T = never>(erro: ErroApp): Resultado<T> {
  return { ok: false, erro };
}

interface ErroBruto {
  code?: unknown;
  message?: unknown;
  name?: unknown;
}

function ehRede(e: ErroBruto): boolean {
  const nome = String(e.name ?? '');
  const msg = String(e.message ?? '').toLowerCase();
  if (nome === 'AbortError' || nome === 'TimeoutError') return true;
  return /failed to fetch|networkerror|network request failed|load failed|timeout|timed out|etimedout|econnreset|enotfound/.test(
    msg
  );
}

/** Converte qualquer erro (PostgrestError, Error, string) em ErroApp. Nunca expõe texto cru do Postgres, exceto P0001. */
export function mapearErro(erro: unknown): ErroApp {
  if (erro === null || erro === undefined) return { codigo: 'desconhecido', mensagem: MSG_GENERICA };
  const e: ErroBruto = typeof erro === 'object' ? (erro as ErroBruto) : { message: String(erro) };
  const code = typeof e.code === 'string' ? e.code : '';
  switch (code) {
    case '23505':
      return { codigo: 'duplicado', mensagem: 'Já existe um registro com esses dados.' };
    case '42501':
      return { codigo: 'permissao', mensagem: 'Você não tem permissão para esta ação.' };
    case '23514':
      return { codigo: 'invalido', mensagem: 'Algum valor informado é inválido.' };
    case '23503':
      return { codigo: 'invalido', mensagem: 'Registro relacionado não encontrado ou em uso.' };
    case '23502':
      return { codigo: 'invalido', mensagem: 'Preencha todos os campos obrigatórios.' };
    case 'P0001': {
      const m = typeof e.message === 'string' ? e.message.trim() : '';
      return { codigo: 'regra', mensagem: m || MSG_GENERICA };
    }
    case 'PGRST116':
      return { codigo: 'nao_encontrado', mensagem: 'Registro não encontrado.' };
    default:
      break;
  }
  if (ehRede(e)) return { codigo: 'rede', mensagem: MSG_REDE };
  return { codigo: 'desconhecido', mensagem: MSG_GENERICA };
}
