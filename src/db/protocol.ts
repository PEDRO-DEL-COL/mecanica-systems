// Protocolo RPC tipado entre a thread principal (client.ts) e o worker SQLite (worker.ts).

export type ValorSql = string | number | bigint | null | Uint8Array;
export type Parametros = readonly ValorSql[] | Record<string, ValorSql>;
export type Linha = Record<string, ValorSql>;

export interface VersaoInfo {
  sqlite: string;
  vfs: string;
  arquivo: string;
  userVersion: number;
  versaoApp: number;
  tabelas: number;
}

/** Mapa operacao -> { req: parametros, resp: resultado }. */
export interface Operacoes {
  exec: { req: { sql: string; bind?: Parametros }; resp: { alteradas: number } };
  query: { req: { sql: string; bind?: Parametros }; resp: Linha[] };
  versaoInfo: { req: Record<string, never>; resp: VersaoInfo };
}

export type NomeOp = keyof Operacoes;

export type Requisicao = {
  [K in NomeOp]: { id: number; op: K; req: Operacoes[K]['req'] };
}[NomeOp];

export type Resposta =
  | { id: number; ok: true; resp: unknown }
  | { id: number; ok: false; erro: string; codigo?: CodigoErro };

export type CodigoErro = 'SEM_OPFS' | 'VERSAO_MAIS_NOVA' | 'INIT' | 'SQL';
