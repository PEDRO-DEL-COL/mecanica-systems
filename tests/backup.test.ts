// Validacao de backup no Node com sqlite-wasm em memoria (o app valida no worker do mesmo jeito).
import { beforeAll, describe, expect, it } from 'vitest';
import sqlite3InitModule, { type Sqlite3Static } from '@sqlite.org/sqlite-wasm';
import { MIGRACOES, VERSAO_ESQUEMA, aplicarMigracoes } from '../src/db/migrations';
import {
  criarAbridorEmMemoria,
  nomeArquivoBackup,
  temCabecalhoSqlite,
  validarBackup,
  type AbrirCopia,
} from '../src/db/backup';

let sqlite3: Sqlite3Static;
let abrir: AbrirCopia;

beforeAll(async () => {
  sqlite3 = await sqlite3InitModule();
  abrir = criarAbridorEmMemoria(sqlite3);
});

/** Gera os bytes de um banco migrado, com user_version opcionalmente forcado. */
function gerarBanco(userVersion?: number): Uint8Array {
  const db = new sqlite3.oo1.DB(':memory:', 'c');
  try {
    aplicarMigracoes(db, MIGRACOES);
    db.exec("INSERT INTO cliente (nome) VALUES ('Ana')");
    if (userVersion !== undefined) db.exec(`PRAGMA user_version = ${userVersion}`);
    return sqlite3.capi.sqlite3_js_db_export(db);
  } finally {
    db.close();
  }
}

describe('validarBackup', () => {
  it('aceita backup válido', () => {
    const bytes = gerarBanco();
    const antes = bytes.slice();
    const r = validarBackup(bytes, VERSAO_ESQUEMA, abrir);
    expect(r).toEqual({ ok: true, userVersion: VERSAO_ESQUEMA });
    expect(bytes).toEqual(antes); // nao altera os bytes recebidos
  });

  it('a cópia validada contém os dados do backup', () => {
    const copia = abrir(gerarBanco());
    try {
      expect(Number(copia.selectValue('SELECT count(*) FROM cliente'))).toBe(1);
    } finally {
      copia.close();
    }
  });

  it('rejeita cabeçalho inválido sem abrir cópia', () => {
    const lixo = new TextEncoder().encode('isto nao e um banco'.padEnd(1024, '.'));
    let abriu = false;
    const r = validarBackup(lixo, VERSAO_ESQUEMA, (b) => {
      abriu = true;
      return abrir(b);
    });
    expect(temCabecalhoSqlite(lixo)).toBe(false);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toMatch(/cabeçalho/i);
    expect(abriu).toBe(false);
  });

  it('rejeita arquivo vazio/truncado', () => {
    expect(validarBackup(new Uint8Array(0), VERSAO_ESQUEMA, abrir).ok).toBe(false);
    const truncado = gerarBanco().slice(0, 700);
    const r = validarBackup(truncado, VERSAO_ESQUEMA, abrir);
    expect(r.ok).toBe(false);
  });

  it('rejeita user_version maior que a do app', () => {
    const r = validarBackup(gerarBanco(VERSAO_ESQUEMA + 1), VERSAO_ESQUEMA, abrir);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toMatch(/versão mais nova/i);
  });

  it('rejeita quando integrity_check falha', () => {
    const fechou: boolean[] = [];
    const falso: AbrirCopia = () => ({
      exec: () => undefined,
      selectValue: (sql: string) => (/integrity_check/.test(sql) ? '*** in database main *** Page 2: btreeInitPage() returns error code 11' : 1),
      close: () => fechou.push(true),
    });
    const r = validarBackup(gerarBanco(), VERSAO_ESQUEMA, falso);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toMatch(/corrompido/i);
    expect(fechou).toEqual([true]); // copia temporaria sempre fechada
  });

  it('rejeita arquivo real corrompido (páginas sobrescritas)', () => {
    const bytes = gerarBanco();
    const pagina = (bytes[16] << 8) | bytes[17] || 65536;
    // Corrompe o conteudo apos a 1a pagina mantendo o cabecalho.
    bytes.fill(0xff, pagina, bytes.byteLength);
    const r = validarBackup(bytes, VERSAO_ESQUEMA, abrir);
    expect(r.ok).toBe(false);
  });
});

describe('nomeArquivoBackup', () => {
  it('usa mecanica-AAAA-MM-DD.sqlite', () => {
    expect(nomeArquivoBackup(new Date(2026, 0, 5))).toBe('mecanica-2026-01-05.sqlite');
    expect(nomeArquivoBackup(new Date(2026, 10, 11), '-antes')).toBe('mecanica-2026-11-11-antes.sqlite');
  });
});
