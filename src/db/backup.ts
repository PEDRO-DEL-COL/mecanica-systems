// Backup: validacao de arquivo .sqlite ANTES de tocar no banco atual.
// A logica de validacao e pura (recebe um "abridor" de copia) para ser testavel no Node.
import type { Database, Sqlite3Static } from '@sqlite.org/sqlite-wasm';
import type { ExecutorSql } from './migrations/runner';

/** 'SQLite format 3\0' */
export const CABECALHO_SQLITE = new Uint8Array([
  0x53, 0x51, 0x4c, 0x69, 0x74, 0x65, 0x20, 0x66, 0x6f, 0x72, 0x6d, 0x61, 0x74, 0x20, 0x33, 0x00,
]);

export interface CopiaValidacao extends ExecutorSql {
  close(): void;
}

/** Abre uma copia temporaria (nunca o banco real) dos bytes recebidos. */
export type AbrirCopia = (bytes: Uint8Array) => CopiaValidacao;

export type ResultadoValidacao =
  | { ok: true; userVersion: number }
  | { ok: false; motivo: string };

export function temCabecalhoSqlite(bytes: Uint8Array): boolean {
  if (bytes.byteLength < CABECALHO_SQLITE.length) return false;
  return CABECALHO_SQLITE.every((b, i) => bytes[i] === b);
}

/**
 * Valida um backup: cabecalho, tamanho, integrity_check = ok e user_version <= versaoApp.
 * Nao altera `bytes` nem o banco atual.
 */
export function validarBackup(bytes: Uint8Array, versaoApp: number, abrirCopia: AbrirCopia): ResultadoValidacao {
  if (!temCabecalhoSqlite(bytes)) {
    return { ok: false, motivo: 'Arquivo não é um banco SQLite (cabeçalho inválido).' };
  }
  if (bytes.byteLength < 512 || bytes.byteLength % 512 !== 0) {
    return { ok: false, motivo: `Tamanho de arquivo inválido para SQLite (${bytes.byteLength} bytes).` };
  }
  let copia: CopiaValidacao | undefined;
  try {
    copia = abrirCopia(bytes);
    const integridade = String(copia.selectValue('PRAGMA integrity_check') ?? '');
    if (integridade.toLowerCase() !== 'ok') {
      return { ok: false, motivo: `Arquivo corrompido (integrity_check: ${integridade || 'sem resposta'}).` };
    }
    const userVersion = Number(copia.selectValue('PRAGMA user_version') ?? 0);
    if (!Number.isInteger(userVersion) || userVersion > versaoApp) {
      return {
        ok: false,
        motivo: `Backup de versão mais nova (${userVersion}) que a suportada pelo app (${versaoApp}). Atualize o aplicativo.`,
      };
    }
    return { ok: true, userVersion };
  } catch (e) {
    return { ok: false, motivo: `Não foi possível abrir o arquivo: ${e instanceof Error ? e.message : String(e)}` };
  } finally {
    try {
      copia?.close();
    } catch {
      /* copia temporaria */
    }
  }
}

/** Abre os bytes como banco em memoria (sqlite3_deserialize). Copia; o original nao e tocado. */
export function criarAbridorEmMemoria(sqlite3: Sqlite3Static): AbrirCopia {
  return (bytes) => {
    const copia = new Uint8Array(bytes); // copia defensiva
    // memdb nao suporta WAL: forca cabecalho de "rollback journal" na copia (o sahpool faz o mesmo ao importar).
    if (copia.byteLength >= 20) {
      copia[18] = 1;
      copia[19] = 1;
    }
    const db: Database = new sqlite3.oo1.DB(':memory:', 'c');
    try {
      const p = sqlite3.wasm.allocFromTypedArray(copia);
      const { capi } = sqlite3;
      const rc = capi.sqlite3_deserialize(
        db.pointer!,
        'main',
        p,
        copia.byteLength,
        copia.byteLength,
        capi.SQLITE_DESERIALIZE_FREEONCLOSE | capi.SQLITE_DESERIALIZE_RESIZEABLE,
      );
      if (rc !== 0) throw new Error(`sqlite3_deserialize falhou (rc=${rc})`);
      return db;
    } catch (e) {
      db.close();
      throw e;
    }
  };
}

/** 'mecanica-AAAA-MM-DD.sqlite' (data local). */
export function nomeArquivoBackup(data: Date = new Date(), sufixo = ''): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `mecanica-${data.getFullYear()}-${p(data.getMonth() + 1)}-${p(data.getDate())}${sufixo}.sqlite`;
}

/** Dispara o download dos bytes no navegador (thread principal). */
export function baixarArquivo(bytes: Uint8Array, nome: string): void {
  const blob = new Blob([bytes as Uint8Array<ArrayBuffer>], { type: 'application/vnd.sqlite3' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
