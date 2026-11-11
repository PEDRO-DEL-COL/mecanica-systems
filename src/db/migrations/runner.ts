// Executor de migracoes baseado em PRAGMA user_version.
// Depende so de uma interface minima de exec para ser testavel em Node.

export interface Migracao {
  versao: number;
  sql: string;
}

/** Interface minima (compativel com sqlite3.oo1.DB). */
export interface ExecutorSql {
  exec(sql: string): unknown;
  selectValue(sql: string): unknown;
}

export class BancoVersaoMaisNovaError extends Error {
  constructor(
    public readonly versaoBanco: number,
    public readonly versaoApp: number,
  ) {
    super(
      `Banco de versão mais nova (${versaoBanco}) que a suportada pelo app (${versaoApp}). Atualize o aplicativo.`,
    );
    this.name = 'BancoVersaoMaisNovaError';
  }
}

export function lerUserVersion(db: ExecutorSql): number {
  return Number(db.selectValue('PRAGMA user_version') ?? 0);
}

function validarLista(migracoes: readonly Migracao[]): void {
  let anterior = 0;
  for (const m of migracoes) {
    if (!Number.isInteger(m.versao) || m.versao <= anterior) {
      throw new Error(`Lista de migrações inválida: versão ${m.versao} após ${anterior}`);
    }
    anterior = m.versao;
  }
}

/**
 * Aplica, em ordem, as migracoes com versao > user_version atual.
 * Cada uma roda em transacao propria e termina com PRAGMA user_version=versao.
 * Retorna a versao final do banco.
 */
export function aplicarMigracoes(db: ExecutorSql, migracoes: readonly Migracao[]): number {
  validarLista(migracoes);
  const ultima = migracoes.length ? migracoes[migracoes.length - 1].versao : 0;
  let atual = lerUserVersion(db);
  if (atual > ultima) throw new BancoVersaoMaisNovaError(atual, ultima);

  for (const m of migracoes) {
    if (m.versao <= atual) continue;
    db.exec('BEGIN IMMEDIATE');
    try {
      db.exec(m.sql);
      db.exec(`PRAGMA user_version = ${m.versao}`);
      db.exec('COMMIT');
    } catch (e) {
      try {
        db.exec('ROLLBACK');
      } catch {
        /* transacao ja encerrada */
      }
      throw new Error(`Falha na migração ${m.versao}: ${e instanceof Error ? e.message : String(e)}`, {
        cause: e,
      });
    }
    atual = m.versao;
  }
  return atual;
}
