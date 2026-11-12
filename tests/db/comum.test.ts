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
import { criarConvite, eventosDe, permissoesDe } from './fabricas/comum';

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

beforeAll(async () => {
  db = await criarBanco({ aplicarDuasVezes: true });
  A = await criarDonoComOficina(db, 'Oficina A');
  B = await criarDonoComOficina(db, 'Oficina B');
}, 60_000);

describe('extensões de busca', () => {
  it('pg_trgm e unaccent carregam e o wrapper é imutável', async () => {
    await comoAdmin(db);
    expect(await um(`select private.sem_acento('Ação Ônibus Çé') as v`)).toBe('Acao Onibus Ce');
    expect(await um(`select private.texto_busca('  João   DA Silva ') as v`)).toBe('joao da silva');
    const vol = await db.query<{ p: string; v: string }>(
      `select p.proname as p, p.provolatile as v from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'private' and p.proname in ('sem_acento', 'texto_busca', 'formatar_numero') order by 1`
    );
    expect(vol.rows.every((l) => l.v === 'i')).toBe(true);
    // índice trigram sobre o wrapper (exige IMMUTABLE)
    await db.exec(`
      create table public.busca_teste (id serial primary key, nome text);
      create index busca_teste_trgm on public.busca_teste using gin (private.texto_busca(nome) extensions.gin_trgm_ops);
      insert into public.busca_teste (nome) values ('José Antônio'), ('Maria'), ('Joséfa');
    `);
    const r = await db.query<{ nome: string }>(
      `select nome from public.busca_teste
       where private.texto_busca(nome) operator(extensions.%) private.texto_busca('jose antonio')
       order by extensions.similarity(private.texto_busca(nome), 'jose antonio') desc`
    );
    expect(r.rows[0].nome).toBe('José Antônio');
  });

  it('authenticated usa o wrapper (anon não)', async () => {
    await comoUsuario(db, A.userId);
    expect(await um(`select private.texto_busca('Ação') as v`)).toBe('acao');
    await comoAnon(db);
    expect(await erroDe(db.query(`select private.texto_busca('x')`))).toMatch(/permission denied/);
  });
});

describe('oficina_config', () => {
  it('criar_oficina cria a config com os padrões', async () => {
    await comoUsuario(db, A.userId);
    const r = await db.query<{ garantia_dias: number; validade_orcamento_dias: number; etiquetas: string[]; versao: number }>(
      'select garantia_dias, validade_orcamento_dias, etiquetas, versao from public.oficina_config'
    );
    expect(r.rows).toEqual([
      {
        garantia_dias: 90,
        validade_orcamento_dias: 10,
        etiquetas: ['Aguardando peça', 'Serviço de terceiro', 'Aguardando cliente'],
        versao: 1
      }
    ]);
  });

  it('garantia < 90 e etiquetas inválidas são recusadas', async () => {
    await comoUsuario(db, A.userId);
    expect(await erroDe(db.query('update public.oficina_config set garantia_dias = 89'))).toMatch(/check constraint/);
    expect(await erroDe(db.query(`update public.oficina_config set etiquetas = array[' x']`))).toMatch(/check constraint/);
    expect(await erroDe(db.query(`update public.oficina_config set telefone = '(11) 9999'`))).toMatch(/check constraint/);
  });

  it('dono edita; versao/atualizado_em sobem só quando algo muda; evento auditado', async () => {
    await comoUsuario(db, A.userId);
    const antes = await um<string>('select atualizado_em::text as v from public.oficina_config');
    const r = await db.query(`update public.oficina_config set garantia_dias = 180 where versao = 1`);
    expect(r.affectedRows).toBe(1);
    expect(await um('select versao as v from public.oficina_config')).toBe(2);
    expect(await um<string>('select atualizado_em::text as v from public.oficina_config')).not.toBe(antes);
    // concorrência otimista: versão antiga não atualiza nada
    const r2 = await db.query(`update public.oficina_config set garantia_dias = 200 where versao = 1`);
    expect(r2.affectedRows ?? 0).toBe(0);
    // update sem mudança real não sobe versão
    await db.query(`update public.oficina_config set garantia_dias = 180`);
    expect(await um('select versao as v from public.oficina_config')).toBe(2);
    expect(await erroDe(db.query('update public.oficina_config set versao = 99'))).toMatch(/permission denied/);

    const ev = await eventosDe(db, A.orgId, 'oficina_config');
    expect(ev.map((e) => e.acao)).toEqual(['criar', 'alterar']);
    expect(ev[1].dados).toEqual({ garantia_dias: { de: 90, para: 180 } });
    expect(ev[1].usuario_id).toBe(A.userId);
    expect(ev[1].entidade_id).toBe(A.orgId);
  });

  it('funcionário lê; só configuracoes/escrita edita; outra oficina e anon não acessam', async () => {
    const f = await criarFuncionario(db, A.orgId, {});
    await comoUsuario(db, f.userId);
    expect(await contar('select 1 from public.oficina_config')).toBe(1);
    const r = await db.query('update public.oficina_config set validade_orcamento_dias = 15');
    expect(r.affectedRows ?? 0).toBe(0);

    const fc = await criarFuncionario(db, A.orgId, { configuracoes: 'escrita' });
    await comoUsuario(db, fc.userId);
    const r2 = await db.query('update public.oficina_config set validade_orcamento_dias = 15');
    expect(r2.affectedRows).toBe(1);

    await comoUsuario(db, B.userId);
    expect(await contar('select 1 from public.oficina_config where org_id = $1', [A.orgId])).toBe(0);
    const r3 = await db.query('update public.oficina_config set garantia_dias = 365 where org_id = $1', [A.orgId]);
    expect(r3.affectedRows ?? 0).toBe(0);
    expect(
      await erroDe(db.query('insert into public.oficina_config (org_id) values ($1)', [A.orgId]))
    ).toMatch(/permission denied/);

    await comoAnon(db);
    expect(await erroDe(db.query('select * from public.oficina_config'))).toMatch(/permission denied/);
  });
});

describe('contador e numeração', () => {
  it('sequência por oficina e tipo, sem duplicar em chamadas simultâneas', async () => {
    await comoAdmin(db);
    const chamadas = Array.from({ length: 50 }, () =>
      db.query<{ n: number }>(`select private.proximo_numero($1, 'os')::int as n`, [A.orgId])
    );
    const nums = (await Promise.all(chamadas)).map((r) => r.rows[0].n).sort((x, y) => x - y);
    expect(nums).toEqual(Array.from({ length: 50 }, (_, i) => i + 1));
    // outra oficina e outro tipo têm sequência própria
    expect(await um(`select private.proximo_numero($1, 'os')::int as v`, [B.orgId])).toBe(1);
    expect(await um(`select private.proximo_numero($1, 'recibo')::int as v`, [A.orgId])).toBe(1);
    expect(await um(`select ultimo::int as v from public.contador where org_id = $1 and chave = 'os'`, [A.orgId])).toBe(50);
  });

  it('rollback devolve o número (sem buraco)', async () => {
    await comoAdmin(db);
    await db.exec('begin');
    expect(await um(`select private.proximo_numero($1, 'os')::int as v`, [B.orgId])).toBe(2);
    await db.exec('rollback');
    expect(await um(`select private.proximo_numero($1, 'os')::int as v`, [B.orgId])).toBe(2);
  });

  it('nenhuma role da API chama proximo_numero nem lê contador', async () => {
    await comoUsuario(db, A.userId);
    expect(await erroDe(db.query(`select private.proximo_numero($1, 'os')`, [A.orgId]))).toMatch(/permission denied/);
    expect(await erroDe(db.query('select * from public.contador'))).toMatch(/permission denied/);
    await comoAnon(db);
    expect(await erroDe(db.query('select * from public.contador'))).toMatch(/permission denied/);
  });

  it('formata NNNNNN.AAAA/MM na competência de São Paulo', async () => {
    await comoUsuario(db, A.userId);
    const f = (seq: number, em: string) => um<string>('select private.formatar_numero($1, $2) as v', [seq, em]);
    expect(await f(1, '2026-11-12T15:00:00Z')).toBe('000001.2026/11');
    expect(await f(999999, '2026-11-12T15:00:00Z')).toBe('999999.2026/11');
    expect(await f(1234567, '2027-01-05T15:00:00Z')).toBe('1234567.2027/01');
    // 01/12 01:00 UTC ainda é 30/11 em São Paulo
    expect(await f(42, '2026-12-01T01:00:00Z')).toBe('000042.2026/11');
  });
});

describe('evento (auditoria append-only)', () => {
  it('trigger genérico omite colunas com PII e marca desativação', async () => {
    await comoAdmin(db);
    await db.exec(`
      create table public.aud_teste (
        id uuid primary key default gen_random_uuid(),
        org_id uuid not null references public.organizacao (id),
        nome text, documento text,
        ativo boolean not null default true,
        versao integer not null default 1,
        criado_em timestamptz not null default now(),
        atualizado_em timestamptz not null default now()
      );
      create trigger aud_teste_versao before insert or update on public.aud_teste
        for each row execute function private.trg_versao();
      create trigger aud_teste_auditoria after insert or update or delete on public.aud_teste
        for each row execute function private.trg_auditar('documento');
    `);
    const id = await um<string>(
      `insert into public.aud_teste (org_id, nome, documento, versao) values ($1, 'Ana', '123', 7) returning id as v`,
      [B.orgId]
    );
    expect(await um(`select versao as v from public.aud_teste where id = $1`, [id])).toBe(1);
    await db.query(`update public.aud_teste set nome = 'Ana B', documento = '456' where id = $1`, [id]);
    await db.query(`update public.aud_teste set ativo = false where id = $1`, [id]);
    expect(await um(`select versao as v from public.aud_teste where id = $1`, [id])).toBe(3);

    const ev = await eventosDe(db, B.orgId, 'aud_teste');
    expect(ev.map((e) => e.acao)).toEqual(['criar', 'alterar', 'desativar']);
    expect(ev[0].entidade_id).toBe(id);
    expect(ev[0].dados).toEqual({ id, org_id: B.orgId, nome: 'Ana', ativo: true });
    expect(ev[1].dados).toEqual({ nome: { de: 'Ana', para: 'Ana B' }, documento: { omitido: true } });
    expect(JSON.stringify(ev)).not.toMatch(/123|456/);
  });

  it('ninguém altera nem apaga eventos (nem o postgres)', async () => {
    await comoUsuario(db, A.userId);
    expect(await erroDe(db.query(`update public.evento set acao = 'x'`))).toMatch(/permission denied/);
    expect(await erroDe(db.query('delete from public.evento'))).toMatch(/permission denied/);
    expect(
      await erroDe(db.query(`insert into public.evento (org_id, entidade, acao) values ($1, 'x', 'y')`, [A.orgId]))
    ).toMatch(/permission denied/);
    await comoAdmin(db);
    expect(await erroDe(db.query(`update public.evento set acao = 'x'`))).toMatch(/somente de inclusão/);
    expect(await erroDe(db.query('delete from public.evento'))).toMatch(/somente de inclusão/);
    expect(await erroDe(db.query('truncate public.evento'))).toMatch(/somente de inclusão/);
  });

  it('leitura: dono vê tudo; ordens vê só timeline de OS; outros nada', async () => {
    await comoAdmin(db);
    await db.query(
      `select private.registrar_evento($1, 'ordem_servico', gen_random_uuid(), 'transicionar', '{"para":"aprovado"}')`,
      [A.orgId]
    );
    await comoUsuario(db, A.userId);
    const totalDono = await contar('select 1 from public.evento');
    expect(totalDono).toBeGreaterThan(1);
    expect(await contar('select 1 from public.evento where org_id = $1', [B.orgId])).toBe(0);

    const fo = await criarFuncionario(db, A.orgId, { ordens: 'leitura' });
    await comoUsuario(db, fo.userId);
    const r = await db.query<{ entidade: string }>('select distinct entidade from public.evento');
    expect(r.rows).toEqual([{ entidade: 'ordem_servico' }]);

    const fx = await criarFuncionario(db, A.orgId, { equipe: 'escrita', configuracoes: 'escrita' });
    await comoUsuario(db, fx.userId);
    expect(await contar('select 1 from public.evento')).toBe(0);

    await comoAnon(db);
    expect(await erroDe(db.query('select * from public.evento'))).toMatch(/permission denied/);
  });
});

describe("áreas de permissão (inclui 'caixa')", () => {
  it("aceita 'caixa' e recusa área desconhecida", async () => {
    const f = await criarFuncionario(db, A.orgId, { caixa: 'escrita' });
    await comoUsuario(db, f.userId);
    expect(await um(`select private.pode('caixa', 'escrita') as v`)).toBe(true);
    expect(await um(`select private.pode('caixa', 'leitura') as v`)).toBe(true);
    expect(await um(`select private.pode('financeiro', 'leitura') as v`)).toBe(false);
    await comoAdmin(db);
    expect(
      await erroDe(
        db.query(`insert into public.membro_permissao (org_id, membro_id, area, nivel) values ($1, $2, 'xyz', 'leitura')`, [
          A.orgId,
          f.membroId
        ])
      )
    ).toMatch(/check constraint/);
    const lista = await um<string[]>('select private.areas() as v');
    expect(lista).toEqual([
      'clientes', 'veiculos', 'catalogo', 'estoque', 'ordens', 'caixa', 'financeiro', 'equipe', 'configuracoes'
    ]);
  });

  it('dependências: fecho transitivo, sem rebaixar escrita', async () => {
    await comoAdmin(db);
    const exp = (p: object) => um<Record<string, string>>('select private.expandir_permissoes($1) as v', [JSON.stringify(p)]);
    expect(await exp({ caixa: 'escrita' })).toEqual({
      caixa: 'escrita', ordens: 'leitura', clientes: 'leitura', veiculos: 'leitura'
    });
    expect(await exp({ financeiro: 'leitura' })).toEqual({
      financeiro: 'leitura', ordens: 'leitura', caixa: 'leitura', clientes: 'leitura', veiculos: 'leitura'
    });
    expect(await exp({ ordens: 'escrita', clientes: 'escrita' })).toEqual({
      ordens: 'escrita', clientes: 'escrita', veiculos: 'leitura'
    });
    expect(await exp({ estoque: 'escrita' })).toEqual({ estoque: 'escrita', catalogo: 'leitura' });
    expect(await exp({ equipe: 'leitura' })).toEqual({ equipe: 'leitura' });
  });
});

describe('definir_permissoes', () => {
  it('dono define; dependências aplicadas; substitui as anteriores; evento gravado', async () => {
    const f = await criarFuncionario(db, A.orgId, { configuracoes: 'escrita' });
    await comoUsuario(db, A.userId);
    const r = await um<Record<string, string>>('select public.definir_permissoes($1, $2) as v', [
      f.membroId,
      JSON.stringify({ caixa: 'escrita', estoque: 'leitura' })
    ]);
    const esperado = {
      caixa: 'escrita', catalogo: 'leitura', clientes: 'leitura', estoque: 'leitura', ordens: 'leitura', veiculos: 'leitura'
    };
    expect(r).toEqual(esperado);
    expect(await permissoesDe(db, f.membroId)).toEqual(esperado);
    const ev = (await eventosDe(db, A.orgId, 'membro')).filter((e) => e.entidade_id === f.membroId);
    expect(ev).toHaveLength(1);
    expect(ev[0].dados).toEqual({ antes: { configuracoes: 'escrita' }, depois: esperado });

    await comoUsuario(db, f.userId);
    expect(await um(`select private.pode('caixa', 'escrita') as v`)).toBe(true);
    expect(await um(`select private.pode('configuracoes', 'leitura') as v`)).toBe(false);

    // vazio = sem acesso
    await comoUsuario(db, A.userId);
    await db.query(`select public.definir_permissoes($1, '{}')`, [f.membroId]);
    expect(await permissoesDe(db, f.membroId)).toEqual({});
  });

  it('funcionário não chama (nem com equipe/escrita)', async () => {
    const f = await criarFuncionario(db, A.orgId, { equipe: 'escrita' });
    await comoUsuario(db, f.userId);
    expect(
      await erroDe(db.query(`select public.definir_permissoes($1, '{"financeiro":"escrita"}')`, [f.membroId]))
    ).toMatch(/Só o dono/);
    expect(await permissoesDe(db, f.membroId)).toEqual({ equipe: 'escrita' });
  });

  it('recusa membro de outra oficina, o próprio dono, área inválida, anon', async () => {
    const fb = await criarFuncionario(db, B.orgId, {});
    const fa = await criarFuncionario(db, A.orgId, {});
    await comoUsuario(db, A.userId);
    expect(await erroDe(db.query(`select public.definir_permissoes($1, '{}')`, [fb.membroId]))).toMatch(/não encontrado/);
    expect(await erroDe(db.query(`select public.definir_permissoes($1, '{}')`, [A.membroId]))).toMatch(/acesso total/);
    expect(
      await erroDe(db.query(`select public.definir_permissoes($1, '{"xyz":"leitura"}')`, [fa.membroId]))
    ).toMatch(/inválidas/);
    expect(
      await erroDe(db.query(`select public.definir_permissoes($1, '{"caixa":"admin"}')`, [fa.membroId]))
    ).toMatch(/inválidas/);
    expect(await erroDe(db.query(`select public.definir_permissoes($1, '[]')`, [fa.membroId]))).toMatch(/inválidas/);
    await comoAnon(db);
    expect(await erroDe(db.query(`select public.definir_permissoes($1, '{}')`, [fa.membroId]))).toMatch(
      /permission denied/
    );
  });
});

describe('aceitar_convite', () => {
  it('cria membro, perfil e permissões com dependências; uso único', async () => {
    const email = 'caixa@teste.dev';
    const c = await criarConvite(db, A, { email, permissoes: { caixa: 'escrita' } });
    const u = await criarUsuario(db, { email, nome: 'Bia do Caixa' });
    await comoUsuario(db, u);
    expect(await um('select public.aceitar_convite($1) as v', [c.token])).toBe(A.orgId);

    await comoAdmin(db);
    const m = await db.query<{ id: string; papel: string; org_id: string }>(
      'select id, papel, org_id from public.membro where user_id = $1',
      [u]
    );
    expect(m.rows).toHaveLength(1);
    expect(m.rows[0]).toMatchObject({ papel: 'funcionario', org_id: A.orgId });
    expect(await permissoesDe(db, m.rows[0].id)).toEqual({
      caixa: 'escrita', clientes: 'leitura', ordens: 'leitura', veiculos: 'leitura'
    });
    expect(await um('select nome as v from public.perfil where user_id = $1', [u])).toBe('Bia do Caixa');
    expect(await um('select aceito_por as v from public.convite where id = $1', [c.id])).toBe(u);
    const ev = await eventosDe(db, A.orgId, 'convite');
    expect(ev.at(-1)).toMatchObject({ entidade_id: c.id, acao: 'aceitar', usuario_id: u });

    // segundo uso (mesmo usuário ou outro com o mesmo e-mail)
    await comoUsuario(db, u);
    expect(await erroDe(db.query('select public.aceitar_convite($1)', [c.token]))).toMatch(/já foi usado/);
  });

  it('recusa expirado, cancelado, e-mail diferente, e-mail não confirmado e token inválido', async () => {
    const exp = await criarConvite(db, A, { email: 'exp@teste.dev', expiraEm: new Date(Date.now() - 1000) });
    const uExp = await criarUsuario(db, { email: 'exp@teste.dev' });
    await comoUsuario(db, uExp);
    expect(await erroDe(db.query('select public.aceitar_convite($1)', [exp.token]))).toMatch(/expirou/);

    const can = await criarConvite(db, A, { email: 'can@teste.dev' });
    await comoUsuario(db, A.userId);
    await db.query('update public.convite set ativo = false where id = $1', [can.id]);
    const uCan = await criarUsuario(db, { email: 'can@teste.dev' });
    await comoUsuario(db, uCan);
    expect(await erroDe(db.query('select public.aceitar_convite($1)', [can.token]))).toMatch(/cancelado/);

    const out = await criarConvite(db, A, { email: 'certo@teste.dev', permissoes: { financeiro: 'escrita' } });
    const intruso = await criarUsuario(db, { email: 'intruso@teste.dev' });
    await comoUsuario(db, intruso);
    expect(await erroDe(db.query('select public.aceitar_convite($1)', [out.token]))).toMatch(/outro e-mail/);

    const naoConf = await criarUsuario(db, { email: 'certo@teste.dev', confirmado: false });
    await comoUsuario(db, naoConf);
    expect(await erroDe(db.query('select public.aceitar_convite($1)', [out.token]))).toMatch(/Confirme seu e-mail/);

    expect(await erroDe(db.query('select public.aceitar_convite($1)', ['x'.repeat(43)]))).toMatch(/inválido/);
    expect(await erroDe(db.query('select public.aceitar_convite($1)', ['curto']))).toMatch(/inválido/);

    await comoAdmin(db);
    expect(await contar('select 1 from public.membro where user_id = any($1)', [[uExp, uCan, intruso, naoConf]])).toBe(0);
    expect(await um('select aceito_em is null as v from public.convite where id = $1', [out.id])).toBe(true);
  });

  it('recusa quem já é de outra oficina; anon não executa', async () => {
    const c = await criarConvite(db, A, { email: 'dono-b@teste.dev' });
    const outroDono = await criarUsuario(db, { email: 'dono-b@teste.dev' });
    await comoUsuario(db, outroDono);
    await db.query(`select public.criar_oficina('Oficina C')`);
    expect(await erroDe(db.query('select public.aceitar_convite($1)', [c.token]))).toMatch(/já faz parte/);

    await comoAnon(db);
    expect(await erroDe(db.query('select public.aceitar_convite($1)', [c.token]))).toMatch(/permission denied/);
  });

  it("convite com área 'caixa' passa no CHECK; área desconhecida não", async () => {
    await comoUsuario(db, A.userId);
    expect(
      await erroDe(
        db.query(
          `insert into public.convite (org_id, email, token_hash, permissoes) values ($1, 'cx2@teste.dev', repeat('e', 64), '{"caixa":"leitura"}')`,
          [A.orgId]
        )
      )
    ).toBeNull();
    expect(
      await erroDe(
        db.query(
          `insert into public.convite (org_id, email, token_hash, permissoes) values ($1, 'cx3@teste.dev', repeat('f', 64), '{"cofre":"leitura"}')`,
          [A.orgId]
        )
      )
    ).toMatch(/check constraint/);
  });
});
