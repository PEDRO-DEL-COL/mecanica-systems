// Cliente RPC (thread principal) para o worker SQLite. Cada chamada vira uma Promise.
import type { CodigoErro, Linha, NomeOp, Operacoes, Parametros, Requisicao, Resposta, VersaoInfo } from './protocol';

export class ErroBanco extends Error {
  constructor(
    msg: string,
    public readonly codigo?: CodigoErro,
  ) {
    super(msg);
    this.name = 'ErroBanco';
  }
}

type Pendente = { resolve: (v: unknown) => void; reject: (e: Error) => void };

let worker: Worker | null = null;
let proximoId = 1;
const pendentes = new Map<number, Pendente>();

function falharTodos(erro: Error): void {
  for (const p of pendentes.values()) p.reject(erro);
  pendentes.clear();
}

function obterWorker(): Worker {
  if (worker) return worker;
  const w = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module', name: 'sqlite' });
  w.addEventListener('message', (e: MessageEvent<Resposta>) => {
    const r = e.data;
    const p = pendentes.get(r.id);
    if (!p) return;
    pendentes.delete(r.id);
    if (r.ok) p.resolve(r.resp);
    else p.reject(new ErroBanco(r.erro, r.codigo));
  });
  w.addEventListener('error', (e) => {
    // Erro nao tratado no worker (ex.: falha ao carregar o modulo/wasm): nunca silencioso.
    falhaFatal = new ErroBanco(`Falha no worker do banco: ${e.message || 'erro desconhecido'}`, 'INIT');
    falharTodos(falhaFatal);
  });
  w.addEventListener('messageerror', () => {
    falharTodos(new ErroBanco('Mensagem do worker do banco não pôde ser lida.', 'INIT'));
  });
  worker = w;
  return w;
}

let falhaFatal: ErroBanco | null = null;

function chamar<K extends NomeOp>(
  op: K,
  req: Operacoes[K]['req'],
  transfer: Transferable[] = [],
): Promise<Operacoes[K]['resp']> {
  if (falhaFatal) return Promise.reject(falhaFatal);
  const w = obterWorker();
  const id = proximoId++;
  return new Promise((resolve, reject) => {
    pendentes.set(id, { resolve: resolve as (v: unknown) => void, reject });
    w.postMessage({ id, op, req } as Requisicao, transfer);
  });
}

export const db = {
  exec: (sql: string, bind?: Parametros) => chamar('exec', { sql, bind }),
  query: <T extends Linha = Linha>(sql: string, bind?: Parametros) => chamar('query', { sql, bind }) as Promise<T[]>,
  versaoInfo: (): Promise<VersaoInfo> => chamar('versaoInfo', {}),
  /** Bytes do banco atual (export do opfs-sahpool). */
  exportar: () => chamar('exportar', {}),
  /** Valida em copia temporaria; nao altera o banco. `bytes` e copiado (nao transferido). */
  validarBackup: (bytes: Uint8Array) => chamar('validarBackup', { bytes }),
  /** Substitui o banco pelo backup (o worker revalida antes). `bytes` e transferido. */
  importar: (bytes: Uint8Array) => chamar('importar', { bytes }, [bytes.buffer as ArrayBuffer]),
};
