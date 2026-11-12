import { erroConflito, mapearErro, ok, falha, type Resultado } from '../erros';

interface RespostaSupabase<T> {
  data: T | null;
  error: unknown;
}

export interface OpcoesExecutar {
  /** Se true, PGRST116 (nenhuma linha) é tratado como conflito de versão. */
  conflitoVersao?: boolean;
}

/** Envolve uma chamada supabase e devolve Resultado, sem lançar. */
export async function executar<T>(
  chamada: () => PromiseLike<RespostaSupabase<T>>,
  opcoes: OpcoesExecutar = {}
): Promise<Resultado<T>> {
  try {
    const { data, error } = await chamada();
    if (error) {
      const code = (error as { code?: unknown }).code;
      if (opcoes.conflitoVersao && code === 'PGRST116') return falha(erroConflito());
      return falha(mapearErro(error));
    }
    return ok(data as T);
  } catch (e) {
    return falha(mapearErro(e));
  }
}

export const TAMANHO_PAGINA = 25;

/** Página 1-based -> intervalo 0-based inclusivo para .range(from, to). */
export function intervalo(pagina: number, tamanho: number = TAMANHO_PAGINA): { from: number; to: number } {
  const p = Number.isFinite(pagina) && pagina >= 1 ? Math.floor(pagina) : 1;
  const t = Number.isFinite(tamanho) && tamanho >= 1 ? Math.floor(tamanho) : TAMANHO_PAGINA;
  const from = (p - 1) * t;
  return { from, to: from + t - 1 };
}
