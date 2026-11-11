// Worker ES dono do banco SQLite (OPFS via opfs-sahpool).
// Regra: sem OPFS => erro explicito. NUNCA cair para banco em memoria.
import sqlite3InitModule, { type Database, type SAHPoolUtil, type Sqlite3Static } from '@sqlite.org/sqlite-wasm';
import { MIGRACOES, VERSAO_ESQUEMA, aplicarMigracoes, lerUserVersion, BancoVersaoMaisNovaError } from './migrations';
import { criarAbridorEmMemoria, validarBackup } from './backup';
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
  postMessage(msg: Resposta, transfer?: Transferable[]): void;
  addEventListener(tipo: 'message', fn: (e: MessageEvent<Requisicao>) => void): void;
};

interface Estado {
  sqlite3: Sqlite3Static;
  pool: SAHPoolUtil;
  db: Database | null;
}

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

/** Abre o arquivo do pool, ativa FKs e aplica migracoes. Fecha o handle se falhar. */
function abrirDb(pool: SAHPoolUtil): Database {
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

async function iniciar(): Promise<Estado> {
  if (!temOpfs()) {
    throw new ErroCodificado(
      'SEM_OPFS',
      'Este navegador não oferece OPFS (armazenamento local persistente). Use Chrome ou Edge atualizado no Windows.',
    );
  }
  const sqlite3 = await sqlite3InitModule();
  let pool: SAHPoolUtil;
  try {
    pool = await sqlite3.installOpfsSAHPoolVfs({ name: VFS });
  } catch (e) {
    throw new ErroCodificado(
      'SEM_OPFS',
      `Falha ao iniciar o VFS ${VFS} (OPFS indisponível ou em uso por outra aba): ${msgDe(e)}`,
    );
  }
  return { sqlite3, pool, db: abrirDb(pool) };
}

function msgDe(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

const pronto = iniciar();
// Evita "unhandled rejection" antes da primeira requisicao; o erro e repassado em cada resposta.
pronto.catch(() => {});

function dbAberto(e: Estado): Database {
  if (!e.db) throw new ErroCodificado('IMPORTACAO', 'Banco fechado após falha de importação. Recarregue a página.');
  return e.db;
}

function infoDe(e: Estado): VersaoInfo {
  const db = dbAberto(e);
  return {
    sqlite: e.sqlite3.capi.sqlite3_libversion(),
    vfs: VFS,
    arquivo: ARQUIVO,
    userVersion: lerUserVersion(db),
    versaoApp: VERSAO_ESQUEMA,
    tabelas: Number(
      db.selectValue("SELECT count(*) FROM sqlite_schema WHERE type = 'table' AND name NOT LIKE 'sqlite_%'"),
    ),
  };
}

function validar(e: Estado, bytes: Uint8Array) {
  return validarBackup(bytes, VERSAO_ESQUEMA, criarAbridorEmMemoria(e.sqlite3));
}

type Handlers = {
  [K in keyof Operacoes]: (e: Estado, req: Operacoes[K]['req']) => Operacoes[K]['resp'] | Promise<Operacoes[K]['resp']>;
};

const handlers: Handlers = {
  exec(e, { sql, bind }) {
    const db = dbAberto(e);
    db.exec(sql, bind ? { bind } : undefined);
    return { alteradas: db.changes() };
  },
  query(e, { sql, bind }) {
    return dbAberto(e).exec(sql, { bind, rowMode: 'object', returnValue: 'resultRows' }) as Linha[];
  },
  versaoInfo: infoDe,
  exportar(e) {
    dbAberto(e); // garante banco aberto e sem falha previa
    return e.pool.exportFile(ARQUIVO);
  },
  validarBackup(e, { bytes }) {
    return validar(e, bytes);
  },
  async importar(e, { bytes }) {
    // 1) Validacao em copia temporaria: arquivo invalido nunca chega ao banco atual.
    const v = validar(e, bytes);
    if (!v.ok) throw new ErroCodificado('BACKUP_INVALIDO', v.motivo);
    // 2) Copia em memoria do banco atual para restaurar se algo falhar no meio.
    const db = dbAberto(e);
    const anterior = e.pool.exportFile(ARQUIVO);
    db.close();
    e.db = null;
    try {
      await e.pool.importDb(ARQUIVO, bytes);
      e.db = abrirDb(e.pool);
    } catch (err) {
      try {
        await e.pool.importDb(ARQUIVO, anterior);
        e.db = abrirDb(e.pool);
      } catch (err2) {
        throw new ErroCodificado(
          'IMPORTACAO',
          `Falha ao importar (${msgDe(err)}) e ao restaurar o banco anterior (${msgDe(err2)}). ` +
            'Use o backup baixado automaticamente antes da importação.',
        );
      }
      throw new ErroCodificado('IMPORTACAO', `Falha ao importar; banco anterior restaurado. Detalhe: ${msgDe(err)}`);
    }
    return infoDe(e);
  },
};

// Fila: operacoes rodam uma por vez (importar fecha/reabre o banco de forma assincrona).
let fila: Promise<void> = Promise.resolve();

async function processar(msg: Requisicao): Promise<void> {
  try {
    const estado = await pronto;
    const fn = handlers[msg.op] as (e: Estado, req: unknown) => unknown;
    if (!fn) throw new Error(`Operação desconhecida: ${String(msg.op)}`);
    const resp = await fn(estado, msg.req);
    const transfer = resp instanceof Uint8Array ? [resp.buffer as ArrayBuffer] : [];
    ctx.postMessage({ id: msg.id, ok: true, resp }, transfer);
  } catch (err) {
    const codigo: CodigoErro = err instanceof ErroCodificado ? err.codigo : 'SQL';
    ctx.postMessage({ id: msg.id, ok: false, erro: msgDe(err), codigo });
  }
}

ctx.addEventListener('message', (e) => {
  const msg = e.data;
  fila = fila.then(() => processar(msg));
});
