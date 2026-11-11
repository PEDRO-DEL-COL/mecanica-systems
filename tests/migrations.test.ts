// Testes das migracoes com sqlite-wasm em memoria no Node (apenas em teste; o app usa OPFS).
import { beforeAll, beforeEach, afterEach, describe, expect, it } from 'vitest';
import sqlite3InitModule, { type Database, type Sqlite3Static } from '@sqlite.org/sqlite-wasm';
import { MIGRACOES, VERSAO_ESQUEMA, aplicarMigracoes, lerUserVersion } from '../src/db/migrations';

let sqlite3: Sqlite3Static;
let db: Database;

const contarTabelas = () =>
  Number(db.selectValue("SELECT count(*) FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%'"));

beforeAll(async () => {
  sqlite3 = await sqlite3InitModule();
});

beforeEach(() => {
  db = new sqlite3.oo1.DB(':memory:', 'c');
  db.exec('PRAGMA foreign_keys = ON');
});

afterEach(() => db.close());

function semearOS(db: Database) {
  db.exec("INSERT INTO cliente (id, nome) VALUES (1, 'Ana')");
  db.exec("INSERT INTO veiculo (id, cliente_id, placa) VALUES (1, 1, 'ABC1D23')");
}

describe('migrações', () => {
  it('aplica até user_version=1 com 9 tabelas', () => {
    expect(aplicarMigracoes(db, MIGRACOES)).toBe(1);
    expect(VERSAO_ESQUEMA).toBe(1);
    expect(lerUserVersion(db)).toBe(1);
    expect(contarTabelas()).toBe(9);
  });

  it('reexecutar é idempotente', () => {
    aplicarMigracoes(db, MIGRACOES);
    semearOS(db);
    expect(() => aplicarMigracoes(db, MIGRACOES)).not.toThrow();
    expect(lerUserVersion(db)).toBe(1);
    expect(contarTabelas()).toBe(9);
    expect(Number(db.selectValue('SELECT count(*) FROM cliente'))).toBe(1);
  });

  it('rejeita status de OS inválido', () => {
    aplicarMigracoes(db, MIGRACOES);
    semearOS(db);
    db.exec("INSERT INTO ordem_servico (numero, veiculo_id, status) VALUES (1, 1, 'aprovado')");
    expect(() =>
      db.exec("INSERT INTO ordem_servico (numero, veiculo_id, status) VALUES (2, 1, 'inexistente')"),
    ).toThrow(/CHECK/i);
  });

  it('rejeita FK quebrada (foreign_keys ON)', () => {
    aplicarMigracoes(db, MIGRACOES);
    expect(Number(db.selectValue('PRAGMA foreign_keys'))).toBe(1);
    expect(() => db.exec("INSERT INTO veiculo (cliente_id, placa) VALUES (999, 'XYZ9A99')")).toThrow(/FOREIGN KEY/i);
  });

  it('rejeita placa duplicada', () => {
    aplicarMigracoes(db, MIGRACOES);
    semearOS(db);
    expect(() => db.exec("INSERT INTO veiculo (cliente_id, placa) VALUES (1, 'ABC1D23')")).toThrow(/UNIQUE/i);
  });

  it('recusa banco de versão mais nova (99)', () => {
    db.exec('PRAGMA user_version = 99');
    expect(() => aplicarMigracoes(db, MIGRACOES)).toThrow(/banco de versão mais nova/i);
    expect(lerUserVersion(db)).toBe(99);
    expect(contarTabelas()).toBe(0);
  });

  it('migração com erro faz rollback e não avança user_version', () => {
    const quebradas = [...MIGRACOES, { versao: 2, sql: 'CREATE TABLE t2 (x); INSERT INTO nao_existe VALUES (1);' }];
    expect(() => aplicarMigracoes(db, quebradas)).toThrow(/migração 2/);
    expect(lerUserVersion(db)).toBe(1);
    expect(db.selectValue("SELECT count(*) FROM sqlite_schema WHERE name='t2'")).toBe(0);
  });
});
