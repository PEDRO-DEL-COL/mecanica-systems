// Protocolo RPC tipado entre a thread principal (client.ts) e o worker SQLite (worker.ts).
import type { ResultadoValidacao } from './backup';

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
  /** Bytes do banco atual (exportFile do opfs-sahpool). */
  exportar: { req: Record<string, never>; resp: Uint8Array };
  /** Valida um backup numa copia temporaria em memoria; nao toca no banco atual. */
  validarBackup: { req: { bytes: Uint8Array }; resp: ResultadoValidacao };
  /** Revalida, fecha o banco, importDb no sahpool, reabre e roda migracoes. */
  importar: { req: { bytes: Uint8Array }; resp: VersaoInfo };
}

export type NomeOp = keyof Operacoes;

export type Requisicao = {
  [K in NomeOp]: { id: number; op: K; req: Operacoes[K]['req'] };
}[NomeOp];

export type Resposta =
  | { id: number; ok: true; resp: unknown }
  | { id: number; ok: false; erro: string; codigo?: CodigoErro };

export type CodigoErro = 'SEM_OPFS' | 'VERSAO_MAIS_NOVA' | 'INIT' | 'SQL' | 'BACKUP_INVALIDO' | 'IMPORTACAO';
