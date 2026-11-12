import { beforeAll, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import {
  comoAdmin,
  comoAnon,
  comoUsuario,
  criarBanco,
  criarDonoComOficina,
  criarFuncionario,
  criarUsuario,
  erroDe
} from './helpers';

// Tabela de exemplo de uma ÁREA de negócio ('clientes'), seguindo o padrão de
// policy que as próximas migrations (cliente, veiculo, ...) devem usar.
const TABELA_EXEMPLO = `
create table public.cliente_teste (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizacao (id),
  nome text not null,
  ativo boolean not null default true
);
create index on public.cliente_teste (org_id);
alter table public.cliente_teste enable row level security;
revoke all on public.cliente_teste from public, anon, authenticated;
grant select, insert (org_id, nome), update (nome, ativo) on public.cliente_teste to authenticated;
create policy sel on public.cliente_teste for select to authenticated
  using (org_id = (select private.org_do_usuario()) and (select private.pode('clientes', 'leitura')));
create policy ins on public.cliente_teste for insert to authenticated
  with check (org_id = (select private.org_do_usuario()) and (select private.pode('clientes', 'escrita')));
create policy upd on public.cliente_teste for update to authenticated
  using (org_id = (select private.org_do_usuario()) and (select private.pode('clientes', 'escrita')))
  with check (org_id = (select private.org_do_usuario()) and (select private.pode('clientes', 'escrita')));
`;

let db: PGlite;
let A: { userId: string; orgId: string; membroId: string };
let B: { userId: string; orgId: string; membroId: string };

async function contar(sql: string, params: unknown[] = []): Promise<number> {
  const r = await db.query<{ n: number }>(`select count(*)::int as n from (${sql}) x`, params);
  return r.rows[0].n;
}

beforeAll(async () => {
  // Aplica as migrations duas vezes: prova a idempotência.
  db = await criarBanco({ aplicarDuasVezes: true });
  await db.exec(TABELA_EXEMPLO);
  A = await criarDonoComOficina(db, 'Oficina A');
  B = await criarDonoComOficina(db, 'Oficina B');
  await comoAdmin(db);
  await db.query(`insert into public.cliente_teste (org_id, nome) values ($1, 'Cliente A'), ($2, 'Cliente B')`, [
    A.orgId,
    B.orgId
  ]);
}, 60_000);

describe('criar_oficina', () => {
  it('cria organizacao + membro dono + perfil', async () => {
    await comoAdmin(db);
    const r = await db.query<{ papel: string; nome: string }>(
      `select m.papel, o.nome from public.membro m join public.organizacao o on o.id = m.org_id where m.user_id = $1`,
      [A.userId]
    );
    expect(r.rows).toEqual([{ papel: 'dono', nome: 'Oficina A' }]);
    expect(await contar('select 1 from public.perfil where user_id = $1', [A.userId])).toBe(1);
  });

  it('falha na 2ª chamada do mesmo usuário', async () => {
    await comoUsuario(db, A.userId);
    expect(await erroDe(db.query(`select public.criar_oficina('Outra')`))).toMatch(/já faz parte/);
  });

  it('falha sem e-mail confirmado (e funciona com a flag de DEV)', async () => {
    const u = await criarUsuario(db, { confirmado: false });
    await comoUsuario(db, u);
    expect(await erroDe(db.query(`select public.criar_oficina('Sem email')`))).toMatch(/Confirme seu e-mail/);
    expect(await contar('select 1 from public.membro')).toBe(0);

    await comoAdmin(db);
    await db.exec(`update private.configuracao set valor = 'false' where chave = 'exigir_email_confirmado'`);
    await comoUsuario(db, u);
    expect(await erroDe(db.query(`select public.criar_oficina('Dev')`))).toBeNull();
    await comoAdmin(db);
    await db.exec(`update private.configuracao set valor = 'true' where chave = 'exigir_email_confirmado'`);
  });

  it('anon não executa criar_oficina', async () => {
    await comoAnon(db);
    expect(await erroDe(db.query(`select public.criar_oficina('Anon')`))).toMatch(/permission denied/);
  });

  it('rejeita nome vazio', async () => {
    const u = await criarUsuario(db);
    await comoUsuario(db, u);
    expect(await erroDe(db.query(`select public.criar_oficina('   ')`))).toMatch(/inválido/);
  });
});

describe('isolamento entre oficinas', () => {
  it('usuário B não lê dados da org A', async () => {
    await comoUsuario(db, B.userId);
    expect(await contar('select 1 from public.organizacao where id = $1', [A.orgId])).toBe(0);
    expect(await contar('select 1 from public.membro where org_id = $1', [A.orgId])).toBe(0);
    expect(await contar('select 1 from public.perfil where user_id = $1', [A.userId])).toBe(0);
    expect(await contar('select 1 from public.cliente_teste where org_id = $1', [A.orgId])).toBe(0);
    expect(await contar('select 1 from public.organizacao')).toBe(1);
  });

  it('usuário B não escreve na org A', async () => {
    await comoUsuario(db, B.userId);
    const upd = await db.query(`update public.organizacao set nome = 'hack' where id = $1`, [A.orgId]);
    expect(upd.affectedRows ?? 0).toBe(0);
    expect(
      await erroDe(db.query(`insert into public.cliente_teste (org_id, nome) values ($1, 'x')`, [A.orgId]))
    ).toMatch(/row-level security/);
    const upd2 = await db.query(`update public.cliente_teste set nome = 'hack' where org_id = $1`, [A.orgId]);
    expect(upd2.affectedRows ?? 0).toBe(0);
    expect(
      await erroDe(
        db.query(`insert into public.convite (org_id, email, token_hash) values ($1, 'x@y.com', repeat('a', 64))`, [
          A.orgId
        ])
      )
    ).toMatch(/row-level security/);
    await comoAdmin(db);
    expect(await contar(`select 1 from public.organizacao where nome = 'hack'`)).toBe(0);
    expect(await contar(`select 1 from public.cliente_teste where nome = 'hack'`)).toBe(0);
  });

  it('anon não lê nada', async () => {
    await comoAnon(db);
    for (const t of ['organizacao', 'perfil', 'membro', 'membro_permissao', 'convite', 'cliente_teste']) {
      expect(await erroDe(db.query(`select * from public.${t}`)), t).toMatch(/permission denied/);
    }
    expect(await erroDe(db.query(`select private.org_do_usuario()`))).toMatch(/permission denied/);
    expect(await erroDe(db.query(`select * from private.configuracao`))).toMatch(/permission denied/);
  });

  it('authenticated não lê a configuração interna', async () => {
    await comoUsuario(db, A.userId);
    expect(await erroDe(db.query(`select * from private.configuracao`))).toMatch(/permission denied/);
  });
});

describe('permissões por área', () => {
  it('dono acessa tudo', async () => {
    await comoUsuario(db, A.userId);
    expect(await contar('select 1 from public.cliente_teste')).toBe(1);
    expect(await erroDe(db.query(`insert into public.cliente_teste (org_id, nome) values ($1, 'Novo')`, [A.orgId]))).toBeNull();
    const r = await db.query(`update public.organizacao set nome = 'Oficina A2' where id = $1`, [A.orgId]);
    expect(r.affectedRows).toBe(1);
    expect(await erroDe(db.query(`select * from public.convite`))).toBeNull();
  });

  it('funcionário sem permissão não acessa a área', async () => {
    const f = await criarFuncionario(db, A.orgId, {});
    await comoUsuario(db, f.userId);
    expect(await contar('select 1 from public.cliente_teste')).toBe(0);
    expect(
      await erroDe(db.query(`insert into public.cliente_teste (org_id, nome) values ($1, 'x')`, [A.orgId]))
    ).toMatch(/row-level security/);
    // vê a própria org e o próprio vínculo, mas não a equipe
    expect(await contar('select 1 from public.organizacao')).toBe(1);
    expect(await contar('select 1 from public.membro')).toBe(1);
  });

  it("funcionário com 'leitura' lê mas não escreve", async () => {
    const f = await criarFuncionario(db, A.orgId, { clientes: 'leitura' });
    await comoUsuario(db, f.userId);
    expect(await contar('select 1 from public.cliente_teste')).toBeGreaterThan(0);
    expect(
      await erroDe(db.query(`insert into public.cliente_teste (org_id, nome) values ($1, 'x')`, [A.orgId]))
    ).toMatch(/row-level security/);
    const r = await db.query(`update public.cliente_teste set nome = 'mudou'`);
    expect(r.affectedRows ?? 0).toBe(0);
    // nenhuma outra área
    const o = await db.query(`update public.organizacao set nome = 'x' where id = $1`, [A.orgId]);
    expect(o.affectedRows ?? 0).toBe(0);
  });

  it("funcionário com 'escrita' escreve", async () => {
    const f = await criarFuncionario(db, A.orgId, { clientes: 'escrita', configuracoes: 'escrita' });
    await comoUsuario(db, f.userId);
    expect(await erroDe(db.query(`insert into public.cliente_teste (org_id, nome) values ($1, 'Do func')`, [A.orgId]))).toBeNull();
    const r = await db.query(`update public.cliente_teste set nome = 'Editado' where nome = 'Do func'`);
    expect(r.affectedRows).toBe(1);
    const o = await db.query(`update public.organizacao set nome = 'Oficina A3' where id = $1`, [A.orgId]);
    expect(o.affectedRows).toBe(1);
    // mas não as colunas de assinatura
    expect(
      await erroDe(db.query(`update public.organizacao set assinatura_status = 'ativa' where id = $1`, [A.orgId]))
    ).toMatch(/permission denied/);
  });

  it('funcionário desativado perde todo acesso', async () => {
    const f = await criarFuncionario(db, A.orgId, { clientes: 'escrita' });
    await comoUsuario(db, A.userId);
    const r = await db.query(`update public.membro set ativo = false where id = $1`, [f.membroId]);
    expect(r.affectedRows).toBe(1);
    await comoUsuario(db, f.userId);
    expect(await contar('select 1 from public.cliente_teste')).toBe(0);
    expect(await contar('select 1 from public.organizacao')).toBe(0);
  });
});

describe('escalada de privilégio', () => {
  it('funcionário não se auto-promove', async () => {
    const f = await criarFuncionario(db, A.orgId, { equipe: 'escrita' });
    await comoUsuario(db, f.userId);
    expect(await erroDe(db.query(`update public.membro set papel = 'dono' where id = $1`, [f.membroId]))).toMatch(
      /permission denied/
    );
    const r = await db.query(`update public.membro set ativo = false where id = $1`, [A.membroId]);
    expect(r.affectedRows ?? 0).toBe(0);
  });

  it('funcionário não edita membro_permissao (nem com equipe/escrita)', async () => {
    const f = await criarFuncionario(db, A.orgId, { equipe: 'escrita', clientes: 'leitura' });
    await comoUsuario(db, f.userId);
    // vê as próprias permissões
    expect(await contar('select 1 from public.membro_permissao where membro_id = $1', [f.membroId])).toBe(2);
    expect(
      await erroDe(
        db.query(`insert into public.membro_permissao (org_id, membro_id, area, nivel) values ($1, $2, 'financeiro', 'escrita')`, [
          A.orgId,
          f.membroId
        ])
      )
    ).toMatch(/row-level security/);
    const u = await db.query(`update public.membro_permissao set nivel = 'escrita' where membro_id = $1`, [f.membroId]);
    expect(u.affectedRows ?? 0).toBe(0);
    const d = await db.query(`delete from public.membro_permissao where membro_id = $1`, [f.membroId]);
    expect(d.affectedRows ?? 0).toBe(0);
    // nem cria convite com permissões para outro e-mail dele
    expect(
      await erroDe(
        db.query(
          `insert into public.convite (org_id, email, token_hash, permissoes) values ($1, 'eu2@x.com', repeat('b', 64), '{"financeiro":"escrita"}')`,
          [A.orgId]
        )
      )
    ).toMatch(/row-level security/);
  });

  it('dono gerencia permissões só de funcionários da própria org', async () => {
    const f = await criarFuncionario(db, A.orgId, {});
    const fb = await criarFuncionario(db, B.orgId, {});
    await comoUsuario(db, A.userId);
    expect(
      await erroDe(
        db.query(`insert into public.membro_permissao (org_id, membro_id, area, nivel) values ($1, $2, 'estoque', 'leitura')`, [
          A.orgId,
          f.membroId
        ])
      )
    ).toBeNull();
    // não para o dono (ele já pode tudo)
    expect(
      await erroDe(
        db.query(`insert into public.membro_permissao (org_id, membro_id, area, nivel) values ($1, $2, 'estoque', 'leitura')`, [
          A.orgId,
          A.membroId
        ])
      )
    ).toMatch(/row-level security/);
    // não para membro de outra org (RLS ou FK composta)
    expect(
      await erroDe(
        db.query(`insert into public.membro_permissao (org_id, membro_id, area, nivel) values ($1, $2, 'estoque', 'leitura')`, [
          A.orgId,
          fb.membroId
        ])
      )
    ).not.toBeNull();
  });

  it('usuário não vira membro por insert direto', async () => {
    const u = await criarUsuario(db);
    await comoUsuario(db, u);
    expect(
      await erroDe(
        db.query(`insert into public.membro (org_id, user_id, papel) values ($1, $2, 'dono')`, [A.orgId, u])
      )
    ).toMatch(/permission denied/);
    await comoUsuario(db, A.userId);
    expect(
      await erroDe(
        db.query(`insert into public.membro (org_id, user_id, papel) values ($1, $2, 'funcionario')`, [A.orgId, u])
      )
    ).toMatch(/permission denied/);
  });

  it('ninguém apaga dados (sem DELETE em organizacao/membro/convite)', async () => {
    await comoUsuario(db, A.userId);
    for (const t of ['organizacao', 'membro', 'convite', 'perfil']) {
      expect(await erroDe(db.query(`delete from public.${t}`)), t).toMatch(/permission denied/);
    }
  });

  it('convite: dono cria; permissoes inválidas são rejeitadas', async () => {
    await comoUsuario(db, A.userId);
    expect(
      await erroDe(
        db.query(
          `insert into public.convite (org_id, email, token_hash, permissoes) values ($1, 'novo@x.com', repeat('c', 64), '{"clientes":"leitura"}')`,
          [A.orgId]
        )
      )
    ).toBeNull();
    expect(
      await erroDe(
        db.query(
          `insert into public.convite (org_id, email, token_hash, permissoes) values ($1, 'outro@x.com', repeat('d', 64), '{"clientes":"admin"}')`,
          [A.orgId]
        )
      )
    ).toMatch(/check constraint/);
    expect(
      await erroDe(db.query(`update public.convite set aceito_em = now() where org_id = $1`, [A.orgId]))
    ).toMatch(/permission denied/);
  });
});
