// Worker ES dono do banco SQLite (OPFS via opfs-sahpool).
// Regra: sem OPFS => erro explicito. NUNCA cair para banco em memoria.
import sqlite3InitModule, { type Database } from '@sqlite.org/sqlite-wasm';
import { MIGRACOES, VERSAO_ESQUEMA, aplicarMigracoes, lerUserVersion, BancoVersaoMaisNovaError } from './migrations';
import type { CodigoErro, Linha, Operacoes, Requisicao, Resposta, VersaoInfo } from './protocol';

const ARQUIVO = '/mecanica.sqlite';
const VFS = 'opfs-sahpool';

class ErroCodificado extends Error {
  constructor(
    public readonly codigo: CodigoErro,
    msg: string,
  ) {
    super(msg);
  }
}

const ctx = self as unknown as {
  postMessage(msg: Resposta): void;
  addEventListener(tipo: 'message', fn: (e: MessageEvent<Requisicao>) => void): void;
};

let sqliteVersao = '';

function temOpfs(): boolean {
  const g = globalThis as unknown as {
    navigator?: { storage?: { getDirectory?: unknown } };
    FileSystemFileHandle?: { prototype?: { createSyncAccessHandle?: unknown } };
  };
  return (
    typeof g.navigator?.storage?.getDirectory === 'function' &&
    typeof g.FileSystemFileHandle?.prototype?.createSyncAccessHandle === 'function'
  );
}

async function abrir(): Promise<Database> {
  if (!temOpfs()) {
    throw new ErroCodificado(
      'SEM_OPFS',
      'Este navegador não oferece OPFS (armazenamento local persistente). Use Chrome ou Edge atualizado no Windows.',
    );
  }
  const sqlite3 = await sqlite3InitModule();
  sqliteVersao = sqlite3.capi.sqlite3_libversion();
  let pool;
  try {
    pool = await sqlite3.installOpfsSAHPoolVfs({ name: VFS });
  } catch (e) {
    throw new ErroCodificado(
      'SEM_OPFS',
      `Falha ao iniciar o VFS ${VFS} (OPFS indisponível ou em uso por outra aba): ${msgDe(e)}`,
    );
  }
  const db = new pool.OpfsSAHPoolDb(ARQUIVO);
  try {
    db.exec('PRAGMA foreign_keys = ON');
    if (Number(db.selectValue('PRAGMA foreign_keys')) !== 1) {
      throw new Error('PRAGMA foreign_keys não ficou ativo');
    }
    aplicarMigracoes(db, MIGRACOES);
  } catch (e) {
    db.close();
    if (e instanceof BancoVersaoMaisNovaError) throw new ErroCodificado('VERSAO_MAIS_NOVA', e.message);
    throw e;
  }
  return db;
}

function msgDe(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

const dbPronto = abrir();
// Evita "unhandled rejection" antes da primeira requisicao; o erro e repassado em cada resposta.
dbPronto.catch(() => {});

type Handlers = { [K in keyof Operacoes]: (db: Database, req: Operacoes[K]['req']) => Operacoes[K]['resp'] };

const handlers: Handlers = {
  exec(db, { sql, bind }) {
    db.exec(sql, bind ? { bind } : undefined);
    return { alteradas: db.changes() };
  },
  query(db, { sql, bind }) {
    return db.exec(sql, { bind, rowMode: 'object', returnValue: 'resultRows' }) as Linha[];
  },
  versaoInfo(db): VersaoInfo {
    return {
      sqlite: sqliteVersao,
      vfs: VFS,
      arquivo: ARQUIVO,
      userVersion: lerUserVersion(db),
      versaoApp: VERSAO_ESQUEMA,
      tabelas: Number(
        db.selectValue("SELECT count(*) FROM sqlite_schema WHERE type = 'table' AND name NOT LIKE 'sqlite_%'"),
      ),
    };
  },
};

ctx.addEventListener('message', async (e) => {
  const msg = e.data;
  try {
    const db = await dbPronto;
    const fn = handlers[msg.op] as (db: Database, req: unknown) => unknown;
    if (!fn) throw new Error(`Operação desconhecida: ${String(msg.op)}`);
    ctx.postMessage({ id: msg.id, ok: true, resp: fn(db, msg.req) });
  } catch (err) {
    const codigo: CodigoErro = err instanceof ErroCodificado ? err.codigo : 'SQL';
    ctx.postMessage({ id: msg.id, ok: false, erro: msgDe(err), codigo });
  }
});
