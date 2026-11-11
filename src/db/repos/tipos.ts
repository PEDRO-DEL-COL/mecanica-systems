import type { Linha, Parametros } from '../protocol';

/** Interface minima aceita pelos repositorios (db do client, ou adaptador de teste). */
export interface Executor {
  exec(sql: string, bind?: Parametros): Promise<{ alteradas: number }>;
  query<T extends Linha = Linha>(sql: string, bind?: Parametros): Promise<T[]>;
}

export class ErroValidacao extends Error {
  constructor(msg: string) {
    super(msg);
    this.name = 'ErroValidacao';
  }
}