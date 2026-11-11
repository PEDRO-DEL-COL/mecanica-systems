import type { Migracao } from './runner';
import sql001 from './001_inicial.sql?raw';

/** Lista ordenada de migracoes do app. Nunca editar uma migracao ja publicada: crie a proxima. */
export const MIGRACOES: readonly Migracao[] = [{ versao: 1, sql: sql001 }];

export const VERSAO_ESQUEMA = MIGRACOES[MIGRACOES.length - 1].versao;

export { aplicarMigracoes, lerUserVersion, BancoVersaoMaisNovaError } from './runner';
export type { Migracao, ExecutorSql } from './runner';
