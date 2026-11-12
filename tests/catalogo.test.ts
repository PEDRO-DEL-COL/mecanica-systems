import { beforeAll, beforeEach, afterEach, describe, expect, it } from 'vitest';
import sqlite3InitModule, { type Database, type Sqlite3Static } from '@sqlite.org/sqlite-wasm';
import { MIGRACOES, aplicarMigracoes } from '../src/db/migrations';
import type { Executor } from '../src/db/repos/tipos';
import { criarRepoCatalogo } from '../src/db/repos/catalogo';
import type { Linha, Parametros } from '../src/db/protocol';

let sqlite3: Sqlite3Static;
let db: Database;
let cat: ReturnType<typeof criarRepoCatalogo>;

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
  cat = criarRepoCatalogo(adaptar(db));
});
afterEach(() => db.close());

describe('catalogo', () => {
  it('cria, busca e atualiza peca e servico', async () => {
    const p = await cat.criar({
      tipo: 'peca', codigo: ' F-01 ', descricao: ' Filtro de óleo ', precoCusto: 1500, precoVenda: 3000,
      estoqueAtual: 5, estoqueMinimo: 2, localEstoque: 'Prateleira A',
    });
    expect(await cat.buscarPorId(p)).toMatchObject({
      tipo: 'peca', codigo: 'F-01', descricao: 'Filtro de óleo', precoCusto: 1500, precoVenda: 3000,
      estoqueAtual: 5, estoqueMinimo: 2, localEstoque: 'Prateleira A', ativo: true,
    });
    const s = await cat.criar({ tipo: 'servico', descricao: 'Troca de óleo', precoVenda: 8000, estoqueAtual: 9, estoqueMinimo: 3, localEstoque: 'X' });
    expect(await cat.buscarPorId(s)).toMatchObject({ codigo: null, precoCusto: 0, estoqueAtual: 0, estoqueMinimo: 0, localEstoque: null });
    await cat.atualizar(p, { tipo: 'peca', codigo: '', descricao: 'Filtro', precoVenda: 3500, estoqueAtual: 4 });
    expect(await cat.buscarPorId(p)).toMatchObject({ codigo: null, descricao: 'Filtro', precoVenda: 3500, estoqueAtual: 4, estoqueMinimo: 0 });
    expect(await cat.buscarPorId(999)).toBeNull();
    await expect(cat.atualizar(999, { tipo: 'servico', descricao: 'a', precoVenda: 1 })).rejects.toThrow(/não encontrado/);
  });

  it('valida descricao, preco de venda, tipo e centavos inteiros', async () => {
    await expect(cat.criar({ tipo: 'peca', descricao: ' ', precoVenda: 100 })).rejects.toThrow(/descrição/i);
    await expect(cat.criar({ tipo: 'peca', descricao: 'A', precoVenda: undefined as never })).rejects.toThrow(/preço de venda/i);
    await expect(cat.criar({ tipo: 'peca', descricao: 'A', precoVenda: -1 })).rejects.toThrow(/inválido/);
    await expect(cat.criar({ tipo: 'peca', descricao: 'A', precoVenda: 10.5 })).rejects.toThrow(/inválido/);
    await expect(cat.criar({ tipo: 'peca', descricao: 'A', precoVenda: 10, precoCusto: -5 })).rejects.toThrow(/inválido/);
    await expect(cat.criar({ tipo: 'peca', descricao: 'A', precoVenda: 10, estoqueAtual: -1 })).rejects.toThrow(/inválido/);
    await expect(cat.criar({ tipo: 'x' as never, descricao: 'A', precoVenda: 10 })).rejects.toThrow(/Tipo/);
    await expect(cat.criar({ tipo: 'servico', descricao: 'A', precoVenda: 0 })).resolves.toBeTypeOf('number');
  });

  it('codigo unico quando informado', async () => {
    const a = await cat.criar({ tipo: 'peca', codigo: 'ABC', descricao: 'A', precoVenda: 1 });
    await expect(cat.criar({ tipo: 'servico', codigo: 'abc', descricao: 'B', precoVenda: 1 })).rejects.toThrow('Código já cadastrado');
    await cat.criar({ tipo: 'peca', descricao: 'Sem código 1', precoVenda: 1 });
    await cat.criar({ tipo: 'peca', descricao: 'Sem código 2', precoVenda: 1 });
    const b = await cat.criar({ tipo: 'peca', codigo: 'DEF', descricao: 'B', precoVenda: 1 });
    await expect(cat.atualizar(b, { tipo: 'peca', codigo: 'ABC', descricao: 'B', precoVenda: 1 })).rejects.toThrow('Código já cadastrado');
    await cat.atualizar(a, { tipo: 'peca', codigo: 'ABC', descricao: 'A2', precoVenda: 1 });
  });

  it('lista com filtro texto, tipo e ativos', async () => {
    const a = await cat.criar({ tipo: 'peca', codigo: 'PAS-1', descricao: 'Pastilha de freio', precoVenda: 1 });
    await cat.criar({ tipo: 'servico', descricao: 'Alinhamento', precoVenda: 1 });
    await cat.criar({ tipo: 'servico', codigo: 'FRE', descricao: 'Revisão de freios', precoVenda: 1 });
    const d = async (o?: Parameters<typeof cat.listar>[0]) => (await cat.listar(o)).map((i) => i.descricao);
    expect(await d()).toEqual(['Alinhamento', 'Pastilha de freio', 'Revisão de freios']);
    expect(await d({ filtro: 'FREIO' })).toEqual(['Pastilha de freio', 'Revisão de freios']);
    expect(await d({ filtro: 'pas-' })).toEqual(['Pastilha de freio']);
    expect(await d({ filtro: 'fre', tipo: 'servico' })).toEqual(['Revisão de freios']);
    expect(await d({ tipo: 'peca' })).toEqual(['Pastilha de freio']);
    expect(await d({ filtro: 'nada' })).toEqual([]);
    await cat.inativar(a);
    expect((await cat.buscarPorId(a))?.ativo).toBe(false);
    expect(await d({ tipo: 'peca' })).toEqual([]);
    expect(await d({ tipo: 'peca', incluirInativos: true })).toEqual(['Pastilha de freio']);
    await cat.reativar(a);
    expect(await d({ tipo: 'peca' })).toEqual(['Pastilha de freio']);
  });

  it('listarEstoqueBaixo', async () => {
    const mk = (descricao: string, atual: number, min: number) =>
      cat.criar({ tipo: 'peca', descricao, precoVenda: 1, estoqueAtual: atual, estoqueMinimo: min });
    await mk('Baixo', 1, 2);
    await mk('Igual', 2, 2);
    await mk('Ok', 3, 2);
    await mk('SemMinimo', 0, 0);
    const inativo = await mk('Inativo', 0, 5);
    await cat.inativar(inativo);
    await cat.criar({ tipo: 'servico', descricao: 'Serv', precoVenda: 1 });
    expect((await cat.listarEstoqueBaixo()).map((i) => i.descricao)).toEqual(['Baixo', 'Igual']);
  });
});
