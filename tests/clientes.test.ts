import { beforeAll, beforeEach, afterEach, describe, expect, it } from 'vitest';
import sqlite3InitModule, { type Database, type Sqlite3Static } from '@sqlite.org/sqlite-wasm';
import { MIGRACOES, aplicarMigracoes } from '../src/db/migrations';
import type { Executor } from '../src/db/repos/tipos';
import { criarRepoClientes } from '../src/db/repos/clientes';
import { criarRepoVeiculos } from '../src/db/repos/veiculos';
import type { Linha, Parametros } from '../src/db/protocol';

let sqlite3: Sqlite3Static;
let db: Database;
let clientes: ReturnType<typeof criarRepoClientes>;
let veiculos: ReturnType<typeof criarRepoVeiculos>;

function adaptar(d: Database): Executor {
  return {
    async exec(sql, bind?: Parametros) {
      d.exec(sql, { bind: bind as never });
      return { alteradas: d.changes() };
    },
    async query<T extends Linha = Linha>(sql: string, bind?: Parametros) {
      return d.exec(sql, { bind: bind as never, rowMode: 'object', returnValue: 'resultRows' }) as T[];
    },
  };
}

beforeAll(async () => {
  sqlite3 = await sqlite3InitModule();
});
beforeEach(() => {
  db = new sqlite3.oo1.DB(':memory:', 'c');
  db.exec('PRAGMA foreign_keys = ON');
  aplicarMigracoes(db, MIGRACOES);
  const ex = adaptar(db);
  clientes = criarRepoClientes(ex);
  veiculos = criarRepoVeiculos(ex);
});
afterEach(() => db.close());

describe('clientes', () => {
  it('cria, busca e atualiza', async () => {
    const id = await clientes.criar({ nome: '  Ana Souza ', documento: '123.456.789-01', telefone: '(11) 99999-0000' });
    const c = await clientes.buscarPorId(id);
    expect(c).toMatchObject({ nome: 'Ana Souza', documento: '12345678901', ativo: true, email: null });
    await clientes.atualizar(id, { nome: 'Ana S.', documento: '' });
    expect(await clientes.buscarPorId(id)).toMatchObject({ nome: 'Ana S.', documento: null });
    expect(await clientes.buscarPorId(999)).toBeNull();
  });

  it('valida nome e documento (opcional; 11 ou 14 digitos)', async () => {
    await expect(clientes.criar({ nome: ' ' })).rejects.toThrow(/nome/i);
    await expect(clientes.criar({ nome: 'X', documento: '123' })).rejects.toThrow(/11|14/);
    await expect(clientes.criar({ nome: 'X', documento: '12.345.678/0001-90' })).resolves.toBeTypeOf('number');
    await expect(clientes.criar({ nome: 'Y' })).resolves.toBeTypeOf('number');
  });

  it('lista com filtro por nome, telefone, documento e placa', async () => {
    const a = await clientes.criar({ nome: 'Ana Souza', telefone: '(11) 98888-1111', documento: '12345678901' });
    const b = await clientes.criar({ nome: 'Bruno Lima', telefone: '21 97777-2222' });
    await veiculos.criar(b, { placa: 'xyz-1d23' });
    const nomes = async (f: string) => (await clientes.listar({ filtro: f })).map((c) => c.nome);
    expect(await nomes('')).toEqual(['Ana Souza', 'Bruno Lima']);
    expect(await nomes('ana')).toEqual(['Ana Souza']);
    expect(await nomes('988881111')).toEqual(['Ana Souza']);
    expect(await nomes('98888')).toEqual(['Ana Souza']);
    expect(await nomes('123.456')).toEqual(['Ana Souza']);
    expect(await nomes('xyz-1d')).toEqual(['Bruno Lima']);
    expect(await nomes('nada')).toEqual([]);
    expect(a).not.toBe(b);
  });

  it('inativa sem apagar e esconde da lista padrao', async () => {
    const id = await clientes.criar({ nome: 'Carlos' });
    await veiculos.criar(id, { placa: 'ABC1234' });
    await clientes.inativar(id);
    expect((await clientes.buscarPorId(id))?.ativo).toBe(false);
    expect(await clientes.listar()).toHaveLength(0);
    expect(await clientes.listar({ incluirInativos: true })).toHaveLength(1);
    expect(await veiculos.listarPorCliente(id)).toHaveLength(1);
    await clientes.reativar(id);
    expect(await clientes.listar()).toHaveLength(1);
  });
});

describe('veiculos', () => {
  it('normaliza placa, varios por cliente', async () => {
    const id = await clientes.criar({ nome: 'Ana' });
    const v1 = await veiculos.criar(id, { placa: 'abc-1234', marca: 'VW', modelo: 'Gol', ano: 2010, kmAtual: 120000 });
    await veiculos.criar(id, { placa: 'abc1d23' });
    expect(await veiculos.buscarPorId(v1)).toMatchObject({ placa: 'ABC1234', marca: 'VW', ano: 2010, kmAtual: 120000 });
    expect((await veiculos.listarPorCliente(id)).map((v) => v.placa)).toEqual(['ABC1234', 'ABC1D23']);
  });

  it('rejeita placa invalida e duplicada com mensagem amigavel', async () => {
    const a = await clientes.criar({ nome: 'Ana' });
    const b = await clientes.criar({ nome: 'Bia' });
    await veiculos.criar(a, { placa: 'ABC1D23' });
    await expect(veiculos.criar(b, { placa: 'abc-1d23' })).rejects.toThrow('Placa já cadastrada');
    await expect(veiculos.criar(b, { placa: '123' })).rejects.toThrow(/inválida/);
    const v = await veiculos.criar(b, { placa: 'DEF5678' });
    await expect(veiculos.atualizar(v, { placa: 'ABC1D23' })).rejects.toThrow('Placa já cadastrada');
    await veiculos.atualizar(v, { placa: 'def-5678', cor: 'Preto' });
    expect(await veiculos.buscarPorId(v)).toMatchObject({ placa: 'DEF5678', cor: 'Preto' });
  });

  it('busca por placa retorna veiculo + cliente', async () => {
    const a = await clientes.criar({ nome: 'Ana', telefone: '1199' });
    await veiculos.criar(a, { placa: 'ABC1D23', modelo: 'Onix' });
    const r = await veiculos.buscarPorPlaca(' abc-1d2 ');
    expect(r).toHaveLength(1);
    expect(r[0].veiculo).toMatchObject({ placa: 'ABC1D23', modelo: 'Onix' });
    expect(r[0].cliente).toMatchObject({ id: a, nome: 'Ana', telefone: '1199', ativo: true });
    expect(await veiculos.buscarPorPlaca('ZZZ')).toEqual([]);
    expect(await veiculos.buscarPorPlaca('--')).toEqual([]);
  });
});