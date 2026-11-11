const NOME_LOCK = 'mecanica-db';

/** Adquire o lock exclusivo da aba. true = obteve; false = outra aba já possui. */
export function adquirirLockDeAba(): Promise<boolean> {
  if (typeof navigator === 'undefined' || !navigator.locks) {
    throw new Error('Web Locks API indisponível neste navegador.');
  }
  return new Promise<boolean>((resolve, reject) => {
    navigator.locks
      .request(NOME_LOCK, { ifAvailable: true }, (lock) => {
        resolve(lock !== null);
        // Mantém o lock enquanto a aba viver.
        return lock ? new Promise<never>(() => {}) : undefined;
      })
      .catch(reject);
  });
}
