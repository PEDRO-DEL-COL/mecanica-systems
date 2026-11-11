export interface Compatibilidade {
  ok: boolean;
  faltando: string[];
  avisos: string[];
}

export function verificarCompatibilidade(): Compatibilidade {
  const faltando: string[] = [];
  const avisos: string[] = [];
  const nav = typeof navigator !== 'undefined' ? navigator : undefined;

  if (!nav || !nav.locks) faltando.push('Web Locks');
  if (!nav || typeof nav.storage?.getDirectory !== 'function') faltando.push('OPFS (armazenamento de arquivos)');
  if (typeof Worker === 'undefined') faltando.push('Web Workers');

  const ua = nav?.userAgent ?? '';
  if (/Safari\//.test(ua) && !/Chrome\/|Chromium\/|Edg\/|CriOS\/|FxiOS\//.test(ua)) {
    avisos.push('Safari detectado: suporte limitado. Use Chrome ou Edge no Windows.');
  }
  return { ok: faltando.length === 0, faltando, avisos };
}

export interface Persistencia {
  persistente: boolean;
  usadoBytes: number;
  quotaBytes: number;
}

export async function pedirPersistencia(): Promise<Persistencia> {
  const persistente = (await navigator.storage?.persist?.()) ?? false;
  const est = (await navigator.storage?.estimate?.()) ?? {};
  return { persistente, usadoBytes: est.usage ?? 0, quotaBytes: est.quota ?? 0 };
}
