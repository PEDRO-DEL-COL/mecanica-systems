import { beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { PGlite } from '@electric-sql/pglite';
import {
  comoAdmin,
  comoAnon,
  comoUsuario,
  criarBanco,
  criarDonoComOficina,
  criarFuncionario,
  erroDe
} from './helpers';
import { eventosDe } from './fabricas/comum';
import {
  ajuste,
  criarFornecedor,
  criarItem,
  custoDe,
  devolucao,
  entrada,
  estornar,
  somaMovimentos
} from './fabricas/estoque';

let db: PGlite;
let A: { userId: string; orgId: string; membroId: string };
let B: { userId: string; orgId: string; membroId: string };
/** funcionários da oficina A */
let estEscrita: string;
let estLeitura: string;
let catLeitura: string;
let catEscrita: string;
let finLeitura: string;
let semArea: string;

async function um<T>(sql: string, params: unknown[] = []): Promise<T> {
  const r = await db.query<{ v: T }>(sql, params);
  return r.rows[0].v;
}

async function contar(sql: string, params: unknown[] = []): Promise<number> {
  return um<number>(`select count(*)::int as v from (${sql}) x`, params);
}

async function saldoView(itemId: string): Promise<{ saldo: string; negativo: boolean; abaixo_minimo: boolean }> {
  const r = await db.query<{ saldo: string; negativo: boolean; abaixo_minimo: boolean }>(
    'select saldo::text as saldo, negativo, abaixo_minimo from public.estoque_saldo where item_id = $1',
    [itemId]
  );
  return r.rows[0];
}

beforeAll(async () => {
  db = await criarBanco({ aplicarDuasVezes: true });
  A = await criarDonoComOficina(db, 'Oficina A');
  B = await criarDonoComOficina(db, 'Oficina B');
  estEscrita = (await criarFuncionario(db, A.orgId, { estoque: 'escrita' })).userId;
  estLeitura = (await criarFuncionario(db, A.orgId, { estoque: 'leitura' })).userId;
  catLeitura = (await criarFuncionario(db, A.orgId, { catalogo: 'leitura' })).userId;
  catEscrita = (await criarFuncionario(db, A.orgId, { catalogo: 'escrita' })).userId;
  finLeitura = (await criarFuncionario(db, A.orgId, { financeiro: 'leitura' })).userId;
  semArea = (await criarFuncionario(db, A.orgId, { clientes: 'escrita' })).userId;
}, 60_000);

describe('catálogo', () => {
  it('catalogo/escrita cria e edita preço com versão otimista; auditado', async () => {
    await comoUsuario(db, catEscrita);
    const id = await um<string>(
      `insert into public.item_catalogo (tipo, codigo, descricao, preco_venda_centavos, controla_estoque)
       values ('peca', 'FLT-01', 'Filtro de óleo', 3500, true) returning id as v`
    );
    expect(await um('select org_id as v from public.item_catalogo where id = $1', [id])).toBe(A.orgId);
    const r = await db.query('update public.item_catalogo set preco_venda_centavos = 3900 where id = $1 and versao = 1', [id]);
    expect(r.affectedRows).toBe(1);
    const r2 = await db.query('update public.item_catalogo set preco_venda_centavos = 1 where id = $1 and versao = 1', [id]);
    expect(r2.affectedRows ?? 0).toBe(0);
    expect(await erroDe(db.query('update public.item_catalogo set versao = 9 where id = $1', [id]))).toMatch(
      /permission denied/
    );
    expect(
      await erroDe(db.query(`update public.item_catalogo set preco_venda_centavos = -1 where id = $1`, [id]))
    ).toMatch(/check constraint/);
    const ev = (await eventosDe(db, A.orgId, 'item_catalogo')).filter((e) => e.entidade_id === id);
    expect(ev.map((e) => e.acao)).toEqual(['criar', 'alterar']);
    expect(ev[1].dados).toEqual({ preco_venda_centavos: { de: 3500, para: 3900 } });
  });

  it('leitura: catalogo e estoque leem; não editam; sem área, outra oficina e anon não veem', async () => {
    const id = await criarItem(db, A.orgId, { descricao: 'Vela de ignição' });
    for (const u of [catLeitura, estLeitura, estEscrita, finLeitura]) {
      await comoUsuario(db, u);
      const visto = await contar('select 1 from public.item_catalogo where id = $1', [id]);
      expect(visto).toBe(u === finLeitura ? 0 : 1);
    }
    for (const u of [catLeitura, estEscrita]) {
      await comoUsuario(db, u);
      const r = await db.query('update public.item_catalogo set preco_venda_centavos = 1 where id = $1', [id]);
      expect(r.affectedRows ?? 0).toBe(0);
      expect(
        await erroDe(db.query(`insert into public.item_catalogo (tipo, descricao) values ('servico', 'X')`))
      ).toMatch(/row-level security/);
    }
    await comoUsuario(db, semArea);
    expect(await contar('select 1 from public.item_catalogo')).toBe(0);
    await comoUsuario(db, B.userId);
    expect(await contar('select 1 from public.item_catalogo where org_id = $1', [A.orgId])).toBe(0);
    const r = await db.query('update public.item_catalogo set descricao = $2 where id = $1', [id, 'hack']);
    expect(r.affectedRows ?? 0).toBe(0);
    expect(
      await erroDe(
        db.query(`insert into public.item_catalogo (org_id, tipo, descricao) values ($1, 'servico', 'X')`, [A.orgId])
      )
    ).toMatch(/row-level security/);
    await comoAnon(db);
    for (const t of ['item_catalogo', 'item_custo', 'fornecedor', 'movimento_estoque', 'movimento_estoque_custo', 'estoque_saldo']) {
      expect(await erroDe(db.query(`select * from public.${t}`))).toMatch(/permission denied/);
    }
  });

  it('código único por oficina entre ativos (sem diferenciar maiúsculas)', async () => {
    const id1 = await criarItem(db, A.orgId, { codigo: 'PAS-100' });
    expect(await erroDe(criarItem(db, A.orgId, { codigo: 'pas-100' }))).toMatch(/duplicate key|unique/);
    // outra oficina pode usar o mesmo código; vários itens sem código
    expect(await erroDe(criarItem(db, B.orgId, { codigo: 'PAS-100' }))).toBeNull();
    expect(await erroDe(criarItem(db, A.orgId, { codigo: null }))).toBeNull();
    expect(await erroDe(criarItem(db, A.orgId, { codigo: null }))).toBeNull();
    // desativado libera o código; reativar o antigo colide
    await comoUsuario(db, catEscrita);
    await db.query('update public.item_catalogo set ativo = false where id = $1', [id1]);
    const id2 = await criarItem(db, A.orgId, { codigo: 'PAS-100' });
    expect(id2).not.toBe(id1);
    await comoUsuario(db, catEscrita);
    expect(await erroDe(db.query('update public.item_catalogo set ativo = true where id = $1', [id1]))).toMatch(
      /duplicate key|unique/
    );
  });

  it('serviço não controla estoque; busca sem acento', async () => {
    expect(await erroDe(criarItem(db, A.orgId, { tipo: 'servico', controlaEstoque: true }))).toMatch(/check constraint/);
    await criarItem(db, A.orgId, { tipo: 'servico', descricao: 'Alinhamento e Balanceamento Ação Rápida' });
    await comoUsuario(db, catLeitura);
    const r = await db.query<{ descricao: string }>(
      `select descricao from public.item_catalogo where busca ilike '%acao rap%'`
    );
    expect(r.rows.map((l) => l.descricao)).toEqual(['Alinhamento e Balanceamento Ação Rápida']);
  });
});

describe('fornecedor', () => {
  it('estoque/escrita cria e edita; estoque/leitura e financeiro leem; outros não', async () => {
    await comoUsuario(db, estEscrita);
    const id = await um<string>(
      `insert into public.fornecedor (nome, documento, telefone) values ('Auto Peças Zé', '12345678000199', '1133334444') returning id as v`
    );
    const r = await db.query('update public.fornecedor set contato = $2 where id = $1 and versao = 1', [id, 'João']);
    expect(r.affectedRows).toBe(1);
    expect(await erroDe(db.query(`insert into public.fornecedor (nome, documento) values ('Dup', '12345678000199')`))).toMatch(
      /duplicate key|unique/
    );
    for (const u of [estLeitura, finLeitura]) {
      await comoUsuario(db, u);
      expect(await contar('select 1 from public.fornecedor where id = $1', [id])).toBe(1);
    }
    await comoUsuario(db, estLeitura);
    expect(await erroDe(db.query(`insert into public.fornecedor (nome) values ('X')`))).toMatch(/row-level security/);
    for (const u of [catEscrita, semArea, B.userId]) {
      await comoUsuario(db, u);
      expect(await contar('select 1 from public.fornecedor where id = $1', [id])).toBe(0);
    }
    const ev = (await eventosDe(db, A.orgId, 'fornecedor')).filter((e) => e.entidade_id === id);
    expect(JSON.stringify(ev)).not.toMatch(/12345678000199|1133334444/);
  });
});

describe('movimento_estoque (append-only)', () => {
  it('ninguém faz UPDATE/DELETE/INSERT direto (nem o dono); nem o postgres altera', async () => {
    const item = await criarItem(db, A.orgId);
    const m = await entrada(db, A.userId, item, '3', 1000);
    for (const u of [A.userId, estEscrita]) {
      await comoUsuario(db, u);
      expect(await erroDe(db.query('update public.movimento_estoque set quantidade = 99 where id = $1', [m.movimento_id]))).toMatch(
        /permission denied/
      );
      expect(await erroDe(db.query('delete from public.movimento_estoque where id = $1', [m.movimento_id]))).toMatch(
        /permission denied/
      );
      expect(
        await erroDe(
          db.query(`insert into public.movimento_estoque (org_id, item_id, tipo, quantidade) values ($1, $2, 'entrada', 1)`, [
            A.orgId,
            item
          ])
        )
      ).toMatch(/permission denied/);
      expect(await erroDe(db.query('update public.item_custo set custo_medio_centavos = 1'))).toMatch(/permission denied/);
    }
    await comoAdmin(db);
    expect(await erroDe(db.query('update public.movimento_estoque set quantidade = 99 where id = $1', [m.movimento_id]))).toMatch(
      /somente de inclusão/
    );
    expect(await erroDe(db.query('delete from public.movimento_estoque where id = $1', [m.movimento_id]))).toMatch(
      /somente de inclusão/
    );
    expect(await erroDe(db.query('truncate public.movimento_estoque cascade'))).toMatch(/somente de inclusão/);
    expect(await erroDe(db.query('delete from public.movimento_estoque_custo'))).toMatch(/somente de inclusão/);
    expect(await somaMovimentos(db, item)).toBe('3.000');
    const ev = (await eventosDe(db, A.orgId, 'movimento_estoque')).filter((e) => e.entidade_id === m.movimento_id);
    expect(ev).toHaveLength(1);
    expect(ev[0]).toMatchObject({ acao: 'criar', usuario_id: A.userId });
  });

  it('saldo = soma dos movimentos; negativo permitido e sinalizado; abaixo do mínimo', async () => {
    const item = await criarItem(db, A.orgId, { estoqueMinimo: '2' });
    const e1 = await entrada(db, estEscrita, item, '10.5', 1000);
    expect(e1).toMatchObject({ saldo: '10.500', negativo: false });
    await ajuste(db, estEscrita, item, '-0.25', 'Perda no inventário');
    await entrada(db, estEscrita, item, '1', 1000);
    const a = await ajuste(db, estEscrita, item, '-15', 'Contagem física');
    expect(a).toMatchObject({ saldo: '-3.750', negativo: true });
    expect(await somaMovimentos(db, item)).toBe('-3.750');
    await comoUsuario(db, estLeitura);
    expect(await saldoView(item)).toEqual({ saldo: '-3.750', negativo: true, abaixo_minimo: true });
    await estornar(db, estEscrita, a.movimento_id, 'Contagem errada');
    expect(await somaMovimentos(db, item)).toBe('11.250');
    await comoUsuario(db, estLeitura);
    expect(await saldoView(item)).toEqual({ saldo: '11.250', negativo: false, abaixo_minimo: false });
    // em todos os itens da oficina (visão do dono): saldo da view = soma dos movimentos
    await comoUsuario(db, A.userId);
    expect(await contar('select 1 from public.estoque_saldo')).toBeGreaterThan(1);
    const div = await contar(
      `select 1 from public.estoque_saldo s
       where s.saldo <> (select coalesce(sum(m.quantidade), 0) from public.movimento_estoque m where m.item_id = s.item_id)`
    );
    expect(div).toBe(0);
    // quem só lê catálogo não vê saldo (nem movimentos); outra oficina idem
    for (const u of [catLeitura, catEscrita, finLeitura, B.userId]) {
      await comoUsuario(db, u);
      expect(await contar('select 1 from public.estoque_saldo where item_id = $1', [item])).toBe(0);
      expect(await contar('select 1 from public.movimento_estoque where item_id = $1', [item])).toBe(0);
    }
  });

  it('ajuste exige motivo; quantidade inválida recusada; leitura não movimenta', async () => {
    const item = await criarItem(db, A.orgId);
    for (const motivo of [null, '', '   ', 'ab']) {
      expect(await erroDe(ajuste(db, estEscrita, item, '1', motivo))).toMatch(/motivo do ajuste/);
    }
    expect(await erroDe(ajuste(db, estEscrita, item, '0', 'Inventário'))).toMatch(/inválida/);
    expect(await erroDe(ajuste(db, estEscrita, item, '0.0001', 'Inventário'))).toMatch(/inválida/);
    expect(await erroDe(entrada(db, estEscrita, item, '-1', 100))).toMatch(/inválida/);
    expect(await erroDe(entrada(db, estEscrita, item, '1', -1))).toMatch(/custo/);
    // CHECK no banco também barra ajuste sem motivo (mesmo como postgres)
    await comoAdmin(db);
    expect(
      await erroDe(
        db.query(`insert into public.movimento_estoque (org_id, item_id, tipo, quantidade) values ($1, $2, 'ajuste', 1)`, [
          A.orgId,
          item
        ])
      )
    ).toMatch(/check constraint/);
    for (const u of [estLeitura, catEscrita, finLeitura, semArea]) {
      expect(await erroDe(ajuste(db, u, item, '1', 'Inventário'))).toMatch(/permissão/);
      expect(await erroDe(entrada(db, u, item, '1', 100))).toMatch(/permissão/);
    }
    expect(await somaMovimentos(db, item)).toBe('0.000');
  });

  it('serviço, item sem controle, inativo e de outra oficina não movimentam', async () => {
    const serv = await criarItem(db, A.orgId, { tipo: 'servico' });
    const semCtrl = await criarItem(db, A.orgId, { controlaEstoque: false });
    const inativo = await criarItem(db, A.orgId);
    await comoAdmin(db);
    await db.query('update public.item_catalogo set ativo = false where id = $1', [inativo]);
    const deB = await criarItem(db, B.orgId);
    expect(await erroDe(entrada(db, estEscrita, serv, '1', 1))).toMatch(/não controla estoque/);
    expect(await erroDe(entrada(db, estEscrita, semCtrl, '1', 1))).toMatch(/não controla estoque/);
    expect(await erroDe(entrada(db, estEscrita, inativo, '1', 1))).toMatch(/inativo/);
    expect(await erroDe(entrada(db, A.userId, deB, '1', 1))).toMatch(/não encontrado/);
    const fornB = await criarFornecedor(db, B.orgId);
    const item = await criarItem(db, A.orgId);
    expect(await erroDe(entrada(db, estEscrita, item, '1', 1, { fornecedorId: fornB }))).toMatch(/Fornecedor/);
    const mB = await entrada(db, B.userId, deB, '1', 1);
    expect(await erroDe(estornar(db, A.userId, mB.movimento_id, 'Tentativa'))).toMatch(/não encontrado/);
    // item com movimento não muda de tipo nem desliga controle
    await entrada(db, estEscrita, item, '1', 1);
    await comoUsuario(db, catEscrita);
    expect(await erroDe(db.query(`update public.item_catalogo set controla_estoque = false where id = $1`, [item]))).toMatch(
      /movimentos de estoque/
    );
  });

  it('anon não executa as RPCs', async () => {
    const item = await criarItem(db, A.orgId);
    await comoAnon(db);
    for (const sql of [
      `select public.registrar_entrada_estoque($1, 1, 1)`,
      `select public.registrar_ajuste_estoque($1, 1, 'Inventário')`,
      `select public.estornar_movimento($1, 'Motivo')`,
      `select public.registrar_devolucao_estoque($1, 1)`,
      `select public.definir_custo_item($1, 1)`
    ]) {
      expect(await erroDe(db.query(sql, [item]))).toMatch(/permission denied/);
    }
  });

  it('idempotency_key não duplica a entrada', async () => {
    const item = await criarItem(db, A.orgId);
    const chave = randomUUID();
    const m1 = await entrada(db, estEscrita, item, '2', 500, { chave });
    const m2 = await entrada(db, estEscrita, item, '2', 500, { chave });
    expect(m2.movimento_id).toBe(m1.movimento_id);
    expect(await somaMovimentos(db, item)).toBe('2.000');
  });
});

describe('custo médio e custo oculto', () => {
  it('entradas sucessivas, devolução e estorno recalculam o custo médio', async () => {
    const forn = await criarFornecedor(db, A.orgId);
    const item = await criarItem(db, A.orgId);
    const e1 = await entrada(db, estEscrita, item, '10', 1000, { fornecedorId: forn });
    expect(await custoDe(db, item)).toEqual({ medio: 1000, ultimo: 1000 });
    const e2 = await entrada(db, estEscrita, item, '5', 1300);
    expect(await custoDe(db, item)).toEqual({ medio: 1100, ultimo: 1300 }); // (10*1000+5*1300)/15
    await entrada(db, estEscrita, item, '2.5', 999);
    expect(await custoDe(db, item)).toEqual({ medio: 1086, ultimo: 999 }); // 18997,5/17,5 = 1085,57
    // ajuste não mexe no custo médio
    await ajuste(db, estEscrita, item, '1', 'Achado no inventário');
    await ajuste(db, estEscrita, item, '-1', 'Recontagem');
    expect((await custoDe(db, item))?.medio).toBe(1086);
    // devolução de 5 da 2ª entrada sai pelo custo dela: (17,5*1086 - 5*1300)/12,5 = 1000,4
    const d = await devolucao(db, estEscrita, e2.movimento_id, '5');
    expect(d.saldo).toBe('12.500');
    expect(await custoDe(db, item)).toEqual({ medio: 1000, ultimo: 999 });
    expect(await erroDe(devolucao(db, estEscrita, e2.movimento_id, '0.001'))).toMatch(/maior que a disponível/);
    // entrada com devolução não pode ser estornada antes de estornar a devolução
    expect(await erroDe(estornar(db, estEscrita, e2.movimento_id, 'Lançada errado'))).toMatch(/devoluções/);
    await estornar(db, estEscrita, d.movimento_id, 'Fornecedor recusou'); // volta 5 a 1300
    expect((await custoDe(db, item))?.medio).toBe(1086); // (12,5*1000+5*1300)/17,5 = 1085,71
    // devolução da 1ª entrada guarda o fornecedor da entrada
    const d1 = await devolucao(db, estEscrita, e1.movimento_id, '1');
    await comoAdmin(db);
    expect(await um('select fornecedor_id as v from public.movimento_estoque where id = $1', [d1.movimento_id])).toBe(forn);
    expect(await um('select custo_unitario_centavos::int as v from public.movimento_estoque_custo where movimento_id = $1', [d1.movimento_id])).toBe(1000);
  });

  it('estorno de entrada desfaz o custo médio e o último custo; saldo <= 0 reinicia o médio', async () => {
    const item = await criarItem(db, A.orgId);
    await entrada(db, estEscrita, item, '4', 1000);
    const e2 = await entrada(db, estEscrita, item, '4', 2000);
    expect(await custoDe(db, item)).toEqual({ medio: 1500, ultimo: 2000 });
    await estornar(db, estEscrita, e2.movimento_id, 'Nota lançada em dobro');
    expect(await custoDe(db, item)).toEqual({ medio: 1000, ultimo: 1000 });
    await ajuste(db, estEscrita, item, '-6', 'Saída sem OS');
    await entrada(db, estEscrita, item, '1', 3000);
    expect(await custoDe(db, item)).toEqual({ medio: 3000, ultimo: 3000 });
  });

  it('estoque/escrita grava custo mas não lê; só financeiro e dono leem', async () => {
    const item = await criarItem(db, A.orgId);
    const m = await entrada(db, estEscrita, item, '2', 4321);
    expect(Object.keys(m).sort()).toEqual(['item_id', 'movimento_id', 'negativo', 'saldo']);
    expect(JSON.stringify(m)).not.toMatch(/4321/);
    for (const u of [estEscrita, estLeitura, catEscrita, semArea, B.userId]) {
      await comoUsuario(db, u);
      expect(await contar('select 1 from public.item_custo where item_id = $1', [item])).toBe(0);
      expect(await contar('select 1 from public.movimento_estoque_custo where movimento_id = $1', [m.movimento_id])).toBe(0);
    }
    for (const u of [finLeitura, A.userId]) {
      await comoUsuario(db, u);
      expect(await um('select custo_medio_centavos::int as v from public.item_custo where item_id = $1', [item])).toBe(4321);
      expect(
        await um('select custo_unitario_centavos::int as v from public.movimento_estoque_custo where movimento_id = $1', [
          m.movimento_id
        ])
      ).toBe(4321);
    }
  });

  it('definir_custo_item: só financeiro/escrita (ou dono)', async () => {
    const item = await criarItem(db, A.orgId, { tipo: 'servico' });
    const finEscrita = (await criarFuncionario(db, A.orgId, { financeiro: 'escrita' })).userId;
    for (const u of [finLeitura, estEscrita, catEscrita]) {
      await comoUsuario(db, u);
      expect(await erroDe(db.query('select public.definir_custo_item($1, 500)', [item]))).toMatch(/permissão/);
    }
    await comoUsuario(db, finEscrita);
    await db.query('select public.definir_custo_item($1, 500)', [item]);
    expect(await custoDe(db, item)).toEqual({ medio: 500, ultimo: null });
    await comoUsuario(db, B.userId);
    expect(await erroDe(db.query('select public.definir_custo_item($1, 1)', [item]))).toMatch(/não encontrado/);
  });
});

describe('estorno', () => {
  it('cria movimento inverso, não duplica e não estorna estorno nem saída de OS', async () => {
    const item = await criarItem(db, A.orgId);
    const e = await entrada(db, estEscrita, item, '7.125', 100);
    expect(await erroDe(estornar(db, estEscrita, e.movimento_id, ''))).toMatch(/motivo do estorno/);
    const est = await estornar(db, estEscrita, e.movimento_id, 'Lançamento errado');
    expect(est.saldo).toBe('0.000');
    await comoAdmin(db);
    const r = await db.query<{ tipo: string; quantidade: string; estorna_id: string; motivo: string }>(
      'select tipo, quantidade::text, estorna_id, motivo from public.movimento_estoque where id = $1',
      [est.movimento_id]
    );
    expect(r.rows[0]).toEqual({ tipo: 'estorno', quantidade: '-7.125', estorna_id: e.movimento_id, motivo: 'Lançamento errado' });
    expect(await erroDe(estornar(db, estEscrita, e.movimento_id, 'De novo'))).toMatch(/já foi estornado/);
    expect(await erroDe(estornar(db, A.userId, est.movimento_id, 'Estorno do estorno'))).toMatch(/estornar um estorno/);
    expect(await erroDe(estornar(db, estLeitura, e.movimento_id, 'Sem permissão'))).toMatch(/permissão/);
    // índice único segura estorno duplicado mesmo fora da RPC
    await comoAdmin(db);
    expect(
      await erroDe(
        db.query(
          `insert into public.movimento_estoque (org_id, item_id, tipo, quantidade, motivo, estorna_id)
           values ($1, $2, 'estorno', -7.125, 'Duplicado', $3)`,
          [A.orgId, item, e.movimento_id]
        )
      )
    ).toMatch(/duplicate key|unique/);
    // saída de OS (criada pela RPC da OS no futuro) não é estornada aqui
    const s = await um<string>(
      `insert into public.movimento_estoque (org_id, item_id, tipo, quantidade, os_id)
       values ($1, $2, 'saida_os', -1, null) returning id as v`,
      [A.orgId, item]
    );
    expect(await erroDe(estornar(db, estEscrita, s, 'Cancelamento'))).toMatch(/própria OS/);
    expect(await somaMovimentos(db, item)).toBe('-1.000');
  });
});
