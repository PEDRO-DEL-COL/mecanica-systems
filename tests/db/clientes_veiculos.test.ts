import { beforeAll, describe, expect, it } from 'vitest';
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
import { criarCliente, criarVeiculo, definirPermissoes, placaUnica } from './fabricas/clientes';

let db: PGlite;
let A: { userId: string; orgId: string; membroId: string };
let B: { userId: string; orgId: string; membroId: string };

async function um<T>(sql: string, params: unknown[] = []): Promise<T> {
  const r = await db.query<{ v: T }>(sql, params);
  return r.rows[0].v;
}
async function contar(sql: string, params: unknown[] = []): Promise<number> {
  return um<number>(`select count(*)::int as v from (${sql}) x`, params);
}
const INS_VEIC = `insert into public.veiculo (org_id, cliente_id, placa, marca, modelo) values ($1, $2, $3, 'a', 'b')`;

beforeAll(async () => {
  db = await criarBanco({ aplicarDuasVezes: true });
  A = await criarDonoComOficina(db, 'Oficina A');
  B = await criarDonoComOficina(db, 'Oficina B');
}, 60_000);

describe('isolamento entre oficinas', () => {
  it('B não vê, não altera e não cria nada na oficina A', async () => {
    const c = await criarCliente(db, A, { nome: 'Cliente da A' });
    const veic = await criarVeiculo(db, A, c);

    await comoUsuario(db, B.userId);
    expect(await contar('select 1 from public.cliente where id = $1', [c])).toBe(0);
    expect(await contar('select 1 from public.veiculo where id = $1', [veic.id])).toBe(0);

    const r1 = await db.query(`update public.cliente set nome = 'Invadido' where id = $1`, [c]);
    expect(r1.affectedRows ?? 0).toBe(0);
    const r2 = await db.query(`update public.veiculo set cor = 'x' where id = $1`, [veic.id]);
    expect(r2.affectedRows ?? 0).toBe(0);

    expect(
      await erroDe(db.query(`insert into public.cliente (org_id, nome) values ($1, 'x')`, [A.orgId]))
    ).toMatch(/row-level security/);
    // veículo da org B apontando para cliente da A: FK composta recusa
    expect(await erroDe(db.query(INS_VEIC, [B.orgId, c, placaUnica()]))).toMatch(/foreign key|violates/);
    expect(await erroDe(db.query(`update public.cliente set org_id = $1`, [B.orgId]))).toMatch(/permission denied/);
  });

  it('mesma placa pode existir em oficinas diferentes', async () => {
    const placa = placaUnica();
    const ca = await criarCliente(db, A);
    const cb = await criarCliente(db, B);
    await criarVeiculo(db, A, ca, { placa });
    await criarVeiculo(db, B, cb, { placa });
  });
});

describe('anon', () => {
  it('não acessa tabelas nem RPC', async () => {
    await comoAnon(db);
    for (const t of ['cliente', 'veiculo']) {
      expect(await erroDe(db.query(`select * from public.${t}`))).toMatch(/permission denied/);
      expect(await erroDe(db.query(`update public.${t} set ativo = false`))).toMatch(/permission denied/);
    }
    expect(
      await erroDe(db.query(`insert into public.cliente (org_id, nome) values ($1, 'x')`, [A.orgId]))
    ).toMatch(/permission denied/);
    expect(
      await erroDe(db.query(`select public.transferir_veiculo(gen_random_uuid(), gen_random_uuid())`))
    ).toMatch(/permission denied/);
    await comoAdmin(db);
    expect(
      await um<boolean>(
        `select has_function_privilege('anon', 'public.transferir_veiculo(uuid, uuid)', 'execute') as v`
      )
    ).toBe(false);
  });
});

describe('RLS ligada e sem DELETE', () => {
  it('RLS ativa nas duas tabelas e ninguém apaga', async () => {
    await comoAdmin(db);
    const r = await db.query<{ relname: string; relrowsecurity: boolean }>(
      `select relname, relrowsecurity from pg_class
       where relname in ('cliente', 'veiculo') and relnamespace = 'public'::regnamespace`
    );
    expect(r.rows.length).toBe(2);
    expect(r.rows.every((l) => l.relrowsecurity)).toBe(true);
    await comoUsuario(db, A.userId);
    expect(await erroDe(db.query('delete from public.cliente'))).toMatch(/permission denied/);
    expect(await erroDe(db.query('delete from public.veiculo'))).toMatch(/permission denied/);
  });

  it('índices btree começam por org_id (trigram é a exceção documentada)', async () => {
    await comoAdmin(db);
    const r = await db.query<{ indexname: string; indexdef: string }>(
      `select indexname, indexdef from pg_indexes
       where schemaname = 'public' and tablename in ('cliente', 'veiculo') and indexname not like '%_pkey'`
    );
    expect(r.rows.length).toBeGreaterThan(4);
    for (const i of r.rows) {
      if (/gin_trgm_ops/.test(i.indexdef)) continue;
      expect(i.indexdef, i.indexname).toMatch(/\(org_id[,)]/);
    }
  });
});

describe('matriz de permissões', () => {
  it('sem área: não lê nem escreve', async () => {
    await criarCliente(db, A);
    const f = await criarFuncionario(db, A.orgId, { catalogo: 'escrita' });
    await comoUsuario(db, f.userId);
    expect(await contar('select 1 from public.cliente')).toBe(0);
    expect(await contar('select 1 from public.veiculo')).toBe(0);
    expect(
      await erroDe(db.query(`insert into public.cliente (org_id, nome) values ($1, 'x')`, [A.orgId]))
    ).toMatch(/row-level security/);
  });

  it('clientes/leitura lê, mas não escreve; veículos continua fechado', async () => {
    const c = await criarCliente(db, A, { nome: 'Lido' });
    const f = await criarFuncionario(db, A.orgId, { clientes: 'leitura' });
    await comoUsuario(db, f.userId);
    expect(await contar('select 1 from public.cliente where id = $1', [c])).toBe(1);
    expect(await contar('select 1 from public.veiculo')).toBe(0);
    expect(
      await erroDe(db.query(`insert into public.cliente (org_id, nome) values ($1, 'x')`, [A.orgId]))
    ).toMatch(/row-level security/);
    const r = await db.query(`update public.cliente set nome = 'Y' where id = $1`, [c]);
    expect(r.affectedRows ?? 0).toBe(0);
  });

  it('clientes/escrita cria, edita e desativa; não toca em veículos', async () => {
    const f = await criarFuncionario(db, A.orgId, { clientes: 'escrita' });
    const id = await criarCliente(db, { userId: f.userId, orgId: A.orgId }, { nome: 'Do Func' });
    await comoUsuario(db, f.userId);
    expect((await db.query(`update public.cliente set nome = 'Editado' where id = $1`, [id])).affectedRows).toBe(1);
    expect((await db.query(`update public.cliente set ativo = false where id = $1`, [id])).affectedRows).toBe(1);
    expect(await contar('select 1 from public.veiculo')).toBe(0);
  });

  it('veiculos/leitura lê; veiculos/escrita grava; clientes segue separado', async () => {
    const c = await criarCliente(db, A);
    const v = await criarVeiculo(db, A, c);
    const fl = await criarFuncionario(db, A.orgId, { veiculos: 'leitura' });
    await comoUsuario(db, fl.userId);
    expect(await contar('select 1 from public.veiculo where id = $1', [v.id])).toBe(1);
    expect(await contar('select 1 from public.cliente')).toBe(0);
    expect(await erroDe(db.query(INS_VEIC, [A.orgId, c, placaUnica()]))).toMatch(/row-level security/);
    expect((await db.query(`update public.veiculo set cor = 'x' where id = $1`, [v.id])).affectedRows ?? 0).toBe(0);

    const fe = await criarFuncionario(db, A.orgId, { veiculos: 'escrita' });
    await comoUsuario(db, fe.userId);
    expect((await db.query(`update public.veiculo set cor = 'azul' where id = $1`, [v.id])).affectedRows).toBe(1);
  });

  it('dependência: ordens/leitura (via definir_permissoes) dá leitura de clientes e veículos, sem escrita', async () => {
    const c = await criarCliente(db, A, { nome: 'Dep' });
    const v = await criarVeiculo(db, A, c);
    const f = await criarFuncionario(db, A.orgId, {});
    await definirPermissoes(db, A, f.membroId, { ordens: 'leitura' });
    await comoUsuario(db, f.userId);
    expect(await contar('select 1 from public.cliente where id = $1', [c])).toBe(1);
    expect(await contar('select 1 from public.veiculo where id = $1', [v.id])).toBe(1);
    expect((await db.query(`update public.cliente set nome = 'x' where id = $1`, [c])).affectedRows ?? 0).toBe(0);
    expect((await db.query(`update public.veiculo set cor = 'x' where id = $1`, [v.id])).affectedRows ?? 0).toBe(0);
  });

  it('colunas protegidas: versao, busca, org_id e cliente_id não são editáveis', async () => {
    const c = await criarCliente(db, A);
    const v = await criarVeiculo(db, A, c);
    await comoUsuario(db, A.userId);
    expect(await erroDe(db.query(`update public.cliente set versao = 9 where id = $1`, [c]))).toMatch(/permission denied/);
    expect(await erroDe(db.query(`update public.cliente set busca = 'x' where id = $1`, [c]))).toMatch(/permission denied/);
    expect(await erroDe(db.query(`update public.veiculo set versao = 9 where id = $1`, [v.id]))).toMatch(/permission denied/);
    expect(
      await erroDe(db.query(`update public.veiculo set cliente_id = $2 where id = $1`, [v.id, c]))
    ).toMatch(/permission denied/);
  });
});

describe('validações do banco', () => {
  it('recusa documento, telefone, e-mail e placa fora do padrão', async () => {
    const c = await criarCliente(db, A);
    await comoUsuario(db, A.userId);
    const ins = (col: string, val: string) =>
      erroDe(db.query(`insert into public.cliente (org_id, nome, ${col}) values ($1, 'x', $2)`, [A.orgId, val]));
    expect(await ins('documento', '123')).toMatch(/check constraint/);
    expect(await ins('telefone', '(11) 99999-0000')).toMatch(/check constraint/);
    expect(await ins('email', 'SemArroba')).toMatch(/check constraint/);
    const placa = (p: string) => erroDe(db.query(INS_VEIC, [A.orgId, c, p]));
    expect(await placa('abc-1234')).toMatch(/check constraint/);
    expect(await placa('abc1234')).toMatch(/check constraint/);
    expect(await placa('ABC123')).toMatch(/check constraint/);
    expect(await placa('ABC1D23')).toBeNull(); // Mercosul
    expect(await placa('XYZ9876')).toBeNull(); // antiga
  });
});

describe('placa única entre ativos', () => {
  it('duplicada ativa é recusada; após desativar pode reutilizar; reativar com conflito falha', async () => {
    const c = await criarCliente(db, A);
    const placa = placaUnica();
    const v1 = await criarVeiculo(db, A, c, { placa });
    await comoUsuario(db, A.userId);
    expect(await erroDe(db.query(INS_VEIC, [A.orgId, c, placa]))).toMatch(/duplicate key|unique/);

    await db.query(`update public.veiculo set ativo = false where id = $1`, [v1.id]);
    const v2 = await criarVeiculo(db, A, c, { placa });
    expect(v2.id).not.toBe(v1.id);

    await comoUsuario(db, A.userId);
    expect(await erroDe(db.query(`update public.veiculo set ativo = true where id = $1`, [v1.id]))).toMatch(
      /duplicate key|unique/
    );
    await db.query(`update public.veiculo set ativo = false where id = $1`, [v2.id]);
    expect((await db.query(`update public.veiculo set ativo = true where id = $1`, [v1.id])).affectedRows).toBe(1);
  });
});

describe('transferir_veiculo', () => {
  it('troca o cliente, valida e grava evento com antes/depois', async () => {
    const c1 = await criarCliente(db, A, { nome: 'Dono Antigo' });
    const c2 = await criarCliente(db, A, { nome: 'Dono Novo' });
    const v = await criarVeiculo(db, A, c1);

    await comoUsuario(db, A.userId);
    const r = await db.query<{ cliente_id: string; versao: number }>(
      `select cliente_id, versao from public.transferir_veiculo($1, $2)`,
      [v.id, c2]
    );
    expect(r.rows[0].cliente_id).toBe(c2);
    expect(r.rows[0].versao).toBe(2);
    expect(await um<string>(`select cliente_id as v from public.veiculo where id = $1`, [v.id])).toBe(c2);

    const ev = (await eventosDe(db, A.orgId, 'veiculo')).filter((e) => e.entidade_id === v.id);
    const t = ev.find((e) => e.acao === 'transferir');
    expect(t).toBeTruthy();
    expect(t!.dados).toEqual({ antes: { cliente_id: c1 }, depois: { cliente_id: c2 } });
    expect(t!.usuario_id).toBe(A.userId);
    const alterar = ev.find((e) => e.acao === 'alterar');
    expect(alterar!.dados).toMatchObject({ cliente_id: { de: c1, para: c2 } });
  });

  it('nega cliente de outra oficina, inativo, mesmo cliente e veículo de outra oficina', async () => {
    const c1 = await criarCliente(db, A);
    const cOutra = await criarCliente(db, B, { nome: 'De B' });
    const cInativo = await criarCliente(db, A);
    const v = await criarVeiculo(db, A, c1);
    const vB = await criarVeiculo(db, B, cOutra);
    await comoUsuario(db, A.userId);
    await db.query(`update public.cliente set ativo = false where id = $1`, [cInativo]);

    const antes = await eventosDe(db, A.orgId, 'veiculo');
    await comoUsuario(db, A.userId);
    const tr = (veic: string, cli: string) =>
      erroDe(db.query(`select public.transferir_veiculo($1, $2)`, [veic, cli]));
    expect(await tr(v.id, cOutra)).toMatch(/Cliente de destino não encontrado/);
    expect(await tr(v.id, cInativo)).toMatch(/Cliente de destino não encontrado/);
    expect(await tr(v.id, c1)).toMatch(/já pertence/);
    expect(await tr(vB.id, c1)).toMatch(/Veículo não encontrado/);
    expect(await um<string>(`select cliente_id as v from public.veiculo where id = $1`, [v.id])).toBe(c1);
    expect((await eventosDe(db, A.orgId, 'veiculo')).length).toBe(antes.length);
  });

  it('exige veiculos/escrita (leitura, outra área e dependência por ordens não bastam)', async () => {
    const c1 = await criarCliente(db, A);
    const c2 = await criarCliente(db, A);
    const v = await criarVeiculo(db, A, c1);
    const casos: Record<string, 'leitura' | 'escrita'>[] = [
      { veiculos: 'leitura' },
      { clientes: 'escrita' },
      { ordens: 'escrita' }
    ];
    for (const perms of casos) {
      const f = await criarFuncionario(db, A.orgId, {});
      await definirPermissoes(db, A, f.membroId, perms);
      await comoUsuario(db, f.userId);
      expect(await erroDe(db.query(`select public.transferir_veiculo($1, $2)`, [v.id, c2]))).toMatch(
        /Sem permissão/
      );
    }
    const fe = await criarFuncionario(db, A.orgId, { veiculos: 'escrita' });
    await comoUsuario(db, fe.userId);
    const r = await db.query(`select public.transferir_veiculo($1, $2)`, [v.id, c2]);
    expect(r.rows.length).toBe(1);
    await comoUsuario(db, B.userId);
    expect(await erroDe(db.query(`select public.transferir_veiculo($1, $2)`, [v.id, c1]))).toMatch(
      /Veículo não encontrado/
    );
  });
});

describe('busca', () => {
  it('nome sem acento, telefone e placa; índices trigram existem', async () => {
    const c = await criarCliente(db, A, { nome: 'José da Conceição', telefone: '11987654321' });
    await criarCliente(db, A, { nome: 'Maria Souza', telefone: '1133334444' });
    const v = await criarVeiculo(db, A, c, { placa: 'QWE1R23', marca: 'Volkswagen', modelo: 'Gol' });

    await comoUsuario(db, A.userId);
    const nomes = async (termo: string) =>
      (await db.query<{ nome: string }>(`select nome from public.cliente where busca ilike $1`, [`%${termo}%`])).rows.map(
        (r) => r.nome
      );
    expect(await nomes('jose')).toContain('José da Conceição');
    expect(await nomes('conceicao')).toContain('José da Conceição');
    expect(await nomes('jose da conc')).toEqual(['José da Conceição']);
    expect(await nomes('98765')).toEqual(['José da Conceição']);
    expect(await nomes('33334444')).toEqual(['Maria Souza']);
    expect(await nomes('zzzz')).toEqual([]);

    const placas = async (termo: string) =>
      (await db.query<{ placa: string }>(`select placa from public.veiculo where busca ilike $1`, [`%${termo}%`])).rows.map(
        (r) => r.placa
      );
    expect(await placas('qwe1r23')).toEqual([v.placa]);
    expect(await placas('qwe1')).toEqual([v.placa]);
    expect(await placas('volks')).toContain(v.placa);

    await comoUsuario(db, B.userId);
    expect(await nomes('jose')).toEqual([]);

    await comoUsuario(db, A.userId);
    await db.query(`update public.cliente set nome = 'Zé Novo' where id = $1`, [c]);
    expect(await nomes('jose')).toEqual([]);
    expect(await nomes('ze novo')).toEqual(['Zé Novo']);

    await comoAdmin(db);
    const idx = await db.query<{ indexname: string }>(
      `select indexname from pg_indexes where indexname in ('cliente_busca_trgm_idx', 'veiculo_busca_trgm_idx')`
    );
    expect(idx.rows.length).toBe(2);
  });
});

describe('versão otimista e auditoria', () => {
  it('versao sobe só quando algo muda; versão antiga não atualiza', async () => {
    const id = await criarCliente(db, A, { nome: 'Versão' });
    await comoUsuario(db, A.userId);
    expect(await um(`select versao as v from public.cliente where id = $1`, [id])).toBe(1);
    const r1 = await db.query(`update public.cliente set nome = 'Versão 2' where id = $1 and versao = 1`, [id]);
    expect(r1.affectedRows).toBe(1);
    const r2 = await db.query(`update public.cliente set nome = 'Versão 3' where id = $1 and versao = 1`, [id]);
    expect(r2.affectedRows ?? 0).toBe(0);
    await db.query(`update public.cliente set nome = 'Versão 2' where id = $1`, [id]);
    expect(await um(`select versao as v from public.cliente where id = $1`, [id])).toBe(2);

    const v = await criarVeiculo(db, A, id);
    await comoUsuario(db, A.userId);
    expect(
      (await db.query(`update public.veiculo set km_atual = 100 where id = $1 and versao = 1`, [v.id])).affectedRows
    ).toBe(1);
    expect(
      (await db.query(`update public.veiculo set km_atual = 200 where id = $1 and versao = 1`, [v.id])).affectedRows ?? 0
    ).toBe(0);
  });

  it('auditoria não vaza PII; desativar/reativar viram ações próprias', async () => {
    const id = await criarCliente(db, A, {
      nome: 'Auditado',
      documento: '52998224725',
      telefone: '11912345678',
      email: 'pii@exemplo.com'
    });
    const v = await criarVeiculo(db, A, id, { chassi: '9BWZZZ377VT004251' });
    await comoUsuario(db, A.userId);
    await db.query(`update public.cliente set telefone = '11900000000', ativo = false where id = $1`, [id]);
    await db.query(`update public.cliente set ativo = true where id = $1`, [id]);
    await db.query(`update public.veiculo set chassi = '9BWZZZ377VT000000' where id = $1`, [v.id]);

    const evC = (await eventosDe(db, A.orgId, 'cliente')).filter((e) => e.entidade_id === id);
    expect(evC.map((e) => e.acao)).toEqual(['criar', 'desativar', 'reativar']);
    const evV = (await eventosDe(db, A.orgId, 'veiculo')).filter((e) => e.entidade_id === v.id);
    expect(JSON.stringify([...evC, ...evV])).not.toMatch(/52998224725|11912345678|11900000000|pii@exemplo|9BWZZZ377VT/);
    expect(evC[0].dados).toMatchObject({ nome: 'Auditado', org_id: A.orgId, ativo: true });
    expect(evC[0].usuario_id).toBe(A.userId);
  });
});
