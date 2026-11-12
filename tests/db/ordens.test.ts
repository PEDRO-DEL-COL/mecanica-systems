// OS: numeração, RLS/isolamento, grants, imutabilidade, custo oculto,
// versão/validade, garantia e ajustes de permissão/FK da B5.
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
import { criarItem, entrada } from './fabricas/estoque';
import {
  aprovar,
  cenario,
  criarOs,
  gerarVersao,
  lerItem,
  lerOs,
  levarAte,
  rpc,
  salvarItem,
  transicao
} from './fabricas/ordens';

let db: PGlite;
let A: { userId: string; orgId: string; membroId: string };
let B: { userId: string; orgId: string; membroId: string };
let baseA: { clienteId: string; veiculoId: string };
let baseB: { clienteId: string; veiculoId: string };
let esc: string;
let lei: string;
let fin: string;
let sem: string;

async function um<T>(sql: string, params: unknown[] = []): Promise<T> {
  const r = await db.query<{ v: T }>(sql, params);
  return r.rows[0].v;
}

async function contar(sql: string, params: unknown[] = []): Promise<number> {
  return um<number>(`select count(*)::int as v from (${sql}) x`, params);
}

/** Competência AAAA/MM de agora em America/Sao_Paulo. */
function competenciaAgora(): string {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit' })
    .formatToParts(new Date());
  return `${p.find((x) => x.type === 'year')?.value}/${p.find((x) => x.type === 'month')?.value}`;
}

/** Data de hoje (SP) + n dias, 'YYYY-MM-DD'. */
async function hojeMais(n: number): Promise<string> {
  await comoAdmin(db);
  return um<string>(`select ((now() at time zone 'America/Sao_Paulo')::date + $1::int)::text as v`, [n]);
}

beforeAll(async () => {
  db = await criarBanco({ aplicarDuasVezes: true });
  A = await criarDonoComOficina(db, 'Oficina A');
  B = await criarDonoComOficina(db, 'Oficina B');
  baseA = await cenario(db, A);
  baseB = await cenario(db, B);
  esc = (await criarFuncionario(db, A.orgId, { ordens: 'escrita' })).userId;
  lei = (await criarFuncionario(db, A.orgId, { ordens: 'leitura' })).userId;
  fin = (await criarFuncionario(db, A.orgId, { ordens: 'leitura', financeiro: 'leitura' })).userId;
  sem = (await criarFuncionario(db, A.orgId, { clientes: 'escrita', veiculos: 'escrita', catalogo: 'escrita' })).userId;
}, 60_000);

describe('numeração', () => {
  it('formato NNNNNN.AAAA/MM, sequencial por oficina, sem duplicar', async () => {
    const comp = competenciaAgora();
    const a1 = await criarOs(db, A.userId, baseA);
    const a2 = await criarOs(db, esc, baseA);
    const b1 = await criarOs(db, B.userId, baseB);
    expect(a1.numero).toMatch(/^\d{6}\.\d{4}\/\d{2}$/);
    expect(a1.numero.endsWith(`.${comp}`)).toBe(true);
    expect(a2.numero_seq).toBe(a1.numero_seq + 1);
    expect(a2.numero).toBe(`${String(a2.numero_seq).padStart(6, '0')}.${comp}`);
    // outra oficina tem sequência própria
    expect(b1.numero).toBe(`000001.${comp}`);
    const seqs: number[] = [];
    for (let i = 0; i < 5; i++) seqs.push((await criarOs(db, esc, baseA)).numero_seq);
    expect(new Set(seqs).size).toBe(5);
    await comoAdmin(db);
    expect(
      await um<number>(
        `select count(*)::int as v from (select numero_seq from public.ordem_servico where org_id = $1
         group by numero_seq having count(*) > 1) d`,
        [A.orgId]
      )
    ).toBe(0);
  });

  it('rollback devolve o número (sem buraco); cancelada mantém o número', async () => {
    const antes = await criarOs(db, esc, baseA);
    await comoUsuario(db, esc);
    await db.exec('begin');
    await db.query('select public.os_criar_orcamento(p_cliente_id => $1, p_veiculo_id => $2, p_km_entrada => 1000)', [
      baseA.clienteId,
      baseA.veiculoId
    ]);
    await db.exec('rollback');
    const depois = await criarOs(db, esc, baseA);
    expect(depois.numero_seq).toBe(antes.numero_seq + 1);
    const c = await transicao(db, esc, 'os_cancelar', depois.id, { p_motivo: 'Desistiu' });
    expect(c.numero).toBe(depois.numero);
    expect((await criarOs(db, esc, baseA)).numero_seq).toBe(depois.numero_seq + 1);
  });

  it('idempotency_key: reenvio devolve a mesma OS', async () => {
    const chave = randomUUID();
    const o1 = await criarOs(db, esc, baseA, { p_idempotency_key: chave });
    const o2 = await criarOs(db, esc, baseA, { p_idempotency_key: chave });
    expect(o2.id).toBe(o1.id);
    expect(o2.numero_seq).toBe(o1.numero_seq);
  });
});

describe('criação (novo -> orcamento)', () => {
  it('cliente e veículo obrigatórios e da mesma oficina; km menor exige justificativa; km do veículo sobe', async () => {
    expect(await erroDe(criarOs(db, esc, { clienteId: baseB.clienteId, veiculoId: baseA.veiculoId }))).toMatch(
      /Cliente não encontrado/
    );
    expect(await erroDe(criarOs(db, esc, { clienteId: baseA.clienteId, veiculoId: baseB.veiculoId }))).toMatch(
      /Veículo não encontrado/
    );
    const base2 = await cenario(db, A);
    const o = await criarOs(db, esc, base2, { p_km_entrada: 50000, p_relato_cliente: 'Barulho na suspensão' });
    expect(o.status).toBe('orcamento');
    await comoAdmin(db);
    expect(await um('select km_atual as v from public.veiculo where id = $1', [base2.veiculoId])).toBe(50000);
    expect(await erroDe(criarOs(db, esc, base2, { p_km_entrada: 40000 }))).toMatch(/justificativa/);
    const j = await criarOs(db, esc, base2, { p_km_entrada: 40000, p_km_justificativa: 'Hodômetro trocado' });
    expect(j.km_entrada).toBe(40000);
    expect(await um('select km_atual as v from public.veiculo where id = $1', [base2.veiculoId])).toBe(50000);
  });

  it('INSERT e UPDATE de status direto não têm GRANT; campos descritivos editáveis com escrita', async () => {
    const o = await criarOs(db, esc, baseA);
    await comoUsuario(db, A.userId);
    expect(await erroDe(db.query(`update public.ordem_servico set status = 'aprovado' where id = $1`, [o.id]))).toMatch(
      /permission denied/
    );
    expect(await erroDe(db.query(`update public.ordem_servico set total_centavos = 1 where id = $1`, [o.id]))).toMatch(
      /permission denied/
    );
    expect(
      await erroDe(
        db.query(
          `insert into public.ordem_servico (org_id, numero_seq, numero, cliente_id, veiculo_id, km_entrada)
           values ($1, 999, '000999.2026/11', $2, $3, 1)`,
          [A.orgId, baseA.clienteId, baseA.veiculoId]
        )
      )
    ).toMatch(/permission denied/);
    expect(await erroDe(db.query('delete from public.ordem_servico where id = $1', [o.id]))).toMatch(/permission denied/);
    await comoUsuario(db, esc);
    const r = await db.query(
      `update public.ordem_servico set diagnostico = 'Amortecedor vazando', etiquetas = '{"Aguardando peça"}'
       where id = $1 and versao = $2`,
      [o.id, o.versao]
    );
    expect(r.affectedRows).toBe(1);
    await comoUsuario(db, lei);
    const r2 = await db.query(`update public.ordem_servico set diagnostico = 'x' where id = $1`, [o.id]);
    expect(r2.affectedRows ?? 0).toBe(0);
    expect((await lerOs(db, o.id)).versao).toBe(o.versao + 1);
  });
});

describe('isolamento e permissões', () => {
  it('outra oficina, anon e funcionário sem ordens não veem nem chamam', async () => {
    const o = await levarAte(db, A, baseA, 'aprovado');
    const tabelas = ['ordem_servico', 'item_os', 'os_versao', 'os_aprovacao', 'item_os_custo'];
    await comoUsuario(db, B.userId);
    for (const t of tabelas) {
      expect(await contar(`select 1 from public.${t} where org_id = $1`, [A.orgId])).toBe(0);
    }
    expect(await erroDe(transicao(db, B.userId, 'os_iniciar_execucao', o.id))).toMatch(/não encontrada/);
    expect(await erroDe(salvarItem(db, B.userId, o.id))).toMatch(/não encontrada/);
    expect(await erroDe(criarOs(db, B.userId, baseA))).toMatch(/Cliente não encontrado/);

    await comoUsuario(db, sem);
    for (const t of tabelas) expect(await contar(`select 1 from public.${t}`)).toBe(0);
    expect(await erroDe(criarOs(db, sem, baseA))).toMatch(/permissão/);
    expect(await erroDe(transicao(db, sem, 'os_iniciar_execucao', o.id))).toMatch(/permissão/);

    await comoAnon(db);
    for (const t of tabelas) {
      expect(await erroDe(db.query(`select * from public.${t}`))).toMatch(/permission denied/);
    }
    expect(
      await erroDe(
        db.query('select public.os_criar_orcamento(p_cliente_id => $1, p_veiculo_id => $2, p_km_entrada => 1)', [
          baseA.clienteId,
          baseA.veiculoId
        ])
      )
    ).toMatch(/permission denied/);
    expect(await erroDe(db.query('select public.os_cancelar($1, 1, $2)', [o.id, 'xxx']))).toMatch(/permission denied/);
  });

  it('leitura vê OS, itens, versões, aprovações e timeline; não chama RPC de escrita', async () => {
    const o = await levarAte(db, A, baseA, 'aprovado');
    await comoUsuario(db, lei);
    expect(await contar('select 1 from public.ordem_servico where id = $1', [o.id])).toBe(1);
    expect(await contar('select 1 from public.item_os where os_id = $1', [o.id])).toBe(1);
    expect(await contar('select 1 from public.os_versao where os_id = $1', [o.id])).toBe(1);
    expect(await contar('select 1 from public.os_aprovacao where os_id = $1', [o.id])).toBe(1);
    expect(
      await contar(`select 1 from public.evento where entidade = 'ordem_servico' and entidade_id = $1`, [o.id])
    ).toBeGreaterThan(2);
    expect(await erroDe(criarOs(db, lei, baseA))).toMatch(/permissão/);
    expect(await erroDe(salvarItem(db, lei, o.id))).toMatch(/permissão/);
  });

  it("quem tem 'ordens' lê o catálogo (sem custo); sem ordens/catálogo/estoque não lê", async () => {
    const item = await criarItem(db, A.orgId, { tipo: 'servico', descricao: 'Alinhamento' });
    for (const u of [esc, lei]) {
      await comoUsuario(db, u);
      expect(await contar('select 1 from public.item_catalogo where id = $1', [item])).toBe(1);
      expect(await contar('select 1 from public.item_custo')).toBe(0);
    }
    const so = (await criarFuncionario(db, A.orgId, { equipe: 'leitura' })).userId;
    await comoUsuario(db, so);
    expect(await contar('select 1 from public.item_catalogo where id = $1', [item])).toBe(0);
    await comoUsuario(db, B.userId);
    expect(await contar('select 1 from public.item_catalogo where id = $1', [item])).toBe(0);
  });

  it('movimento_estoque.os_id tem FK composta para ordem_servico', async () => {
    const peca = await criarItem(db, A.orgId, { tipo: 'peca', descricao: 'Pastilha' });
    const oB = await criarOs(db, B.userId, baseB);
    await comoAdmin(db);
    expect(
      await erroDe(
        db.query(
          `insert into public.movimento_estoque (org_id, item_id, tipo, quantidade, os_id) values ($1, $2, 'saida_os', -1, $3)`,
          [A.orgId, peca, randomUUID()]
        )
      )
    ).toMatch(/movimento_estoque_os_fk/);
    // OS de outra oficina também viola (FK composta).
    expect(
      await erroDe(
        db.query(
          `insert into public.movimento_estoque (org_id, item_id, tipo, quantidade, os_id) values ($1, $2, 'saida_os', -1, $3)`,
          [A.orgId, peca, oB.id]
        )
      )
    ).toMatch(/movimento_estoque_os_fk/);
  });
});

describe('itens', () => {
  it('total = round(qtd * preço) - desconto; totais da OS por tipo', async () => {
    const o = await criarOs(db, esc, baseA);
    const s = await salvarItem(db, esc, o.id, { p_quantidade: '1.5', p_preco_unitario_centavos: 3333, p_desconto_centavos: 100 });
    expect(s.total_centavos).toBe(Math.round(1.5 * 3333) - 100); // 5000 - 100
    await salvarItem(db, esc, o.id, { p_tipo: 'terceiro', p_descricao: 'Retífica', p_preco_unitario_centavos: 20000 });
    const p = await salvarItem(db, esc, o.id, { p_tipo: 'peca', p_descricao: 'Filtro', p_quantidade: '2', p_preco_unitario_centavos: 2550 });
    expect(p.condicao).toBe('nova_original');
    const os = await lerOs(db, o.id);
    expect(os.total_servicos_centavos).toBe(4900);
    expect(os.total_pecas_centavos).toBe(5100);
    expect(os.total_centavos).toBe(4900 + 20000 + 5100);
    expect(os.total_aprovado_centavos).toBe(0);
    // desconto maior que o item
    expect(await erroDe(salvarItem(db, esc, o.id, { p_preco_unitario_centavos: 100, p_desconto_centavos: 101 }))).toMatch(
      /Desconto inválido/
    );
    // quantidade com 4 casas
    expect(await erroDe(salvarItem(db, esc, o.id, { p_quantidade: '1.0001' }))).toMatch(/Quantidade inválida/);
    // edição e remoção de pendente
    const e = await salvarItem(db, esc, o.id, { p_item_id: s.id, p_preco_unitario_centavos: 1000, p_quantidade: '1', p_desconto_centavos: 0 });
    expect(e.total_centavos).toBe(1000);
    expect(await erroDe(salvarItem(db, esc, o.id, { p_item_id: s.id, p_item_versao: 1 }))).toMatch(/Recarregue/);
    await rpc(db, esc, 'os_remover_item', { p_item_id: p.id });
    expect((await lerOs(db, o.id)).total_pecas_centavos).toBe(0);
    // item do catálogo: tipo, descrição e preço padrão
    const cat = await criarItem(db, A.orgId, { tipo: 'servico', descricao: 'Balanceamento', precoVenda: 8000 });
    const c = await salvarItem(db, esc, o.id, {
      p_tipo: null, p_descricao: null, p_preco_unitario_centavos: null, p_item_catalogo_id: cat
    });
    expect(c).toMatchObject({ tipo: 'servico', preco_unitario_centavos: 8000, total_centavos: 8000 });
    // catálogo de outra oficina
    const catB = await criarItem(db, B.orgId, { tipo: 'servico' });
    expect(await erroDe(salvarItem(db, esc, o.id, { p_item_catalogo_id: catB }))).toMatch(/catálogo não encontrado/);
    // sem GRANT de escrita direta em item_os
    await comoUsuario(db, esc);
    expect(await erroDe(db.query('update public.item_os set preco_unitario_centavos = 1 where id = $1', [c.id]))).toMatch(
      /permission denied/
    );
    expect(await erroDe(db.query('delete from public.item_os where id = $1', [c.id]))).toMatch(/permission denied/);
  });

  it('item aprovado é imutável (RPC, trigger para todos, inclusive admin)', async () => {
    const o = await levarAte(db, A, baseA, 'aprovado');
    await comoAdmin(db);
    const itemId = await um<string>('select id as v from public.item_os where os_id = $1', [o.id]);
    expect(await erroDe(salvarItem(db, A.userId, o.id, { p_item_id: itemId, p_preco_unitario_centavos: 1 }))).toMatch(
      /Itens só podem ser alterados/
    );
    expect(await erroDe(rpc(db, A.userId, 'os_remover_item', { p_item_id: itemId }))).toMatch(/aprovado não pode/);
    await comoAdmin(db);
    for (const sql of [
      'update public.item_os set preco_unitario_centavos = 1 where id = $1',
      'update public.item_os set quantidade = 5 where id = $1',
      `update public.item_os set descricao = 'Outro' where id = $1`,
      'update public.item_os set ativo = false where id = $1',
      `update public.item_os set situacao = 'pendente' where id = $1`
    ]) {
      expect(await erroDe(db.query(sql, [itemId]))).toMatch(/aprovado não pode ser alterado/);
    }
    expect(await erroDe(db.query('delete from public.item_os where id = $1', [itemId]))).toMatch(/não pode ser apagado/);
    // mesmo com aditivo aberto, item aprovado não muda
    await transicao(db, A.userId, 'os_criar_aditivo', o.id);
    expect(await erroDe(salvarItem(db, A.userId, o.id, { p_item_id: itemId, p_preco_unitario_centavos: 1 }))).toMatch(
      /aprovado não pode/
    );
    expect((await lerItem(db, itemId)).preco_unitario_centavos).toBe(10000);
  });
});

describe('versão e aprovação', () => {
  it('versão: hash SHA-256 do snapshot, validade = hoje + 10 (config), append-only', async () => {
    const o = await criarOs(db, esc, baseA);
    await salvarItem(db, esc, o.id);
    const v = await gerarVersao(db, esc, o.id);
    expect(v.numero).toBe(1);
    expect(v.tipo).toBe('orcamento');
    expect(v.validade_ate).toBe(await hojeMais(10));
    expect(v.total_centavos).toBe(10000);
    await comoAdmin(db);
    expect(
      await um(`select encode(sha256(convert_to(snapshot::text, 'UTF8')), 'hex') = hash as v from public.os_versao where id = $1`, [v.id])
    ).toBe(true);
    expect((await lerOs(db, o.id)).validade_ate).toBe(v.validade_ate);
    expect(await erroDe(db.query('update public.os_versao set total_centavos = 1 where id = $1', [v.id]))).toMatch(
      /somente de inclusão/
    );
    expect(await erroDe(db.query('delete from public.os_versao where id = $1', [v.id]))).toMatch(/somente de inclusão/);
    // config da oficina muda a validade
    await db.query('update public.oficina_config set validade_orcamento_dias = 15 where org_id = $1', [A.orgId]);
    const v2 = await gerarVersao(db, esc, o.id);
    expect(v2.numero).toBe(2);
    expect(v2.validade_ate).toBe(await hojeMais(15));
    await db.query('update public.oficina_config set validade_orcamento_dias = 10 where org_id = $1', [A.orgId]);
    // sem item não gera
    const vazia = await criarOs(db, esc, baseA);
    expect(await erroDe(gerarVersao(db, esc, vazia.id))).toMatch(/ao menos um item/);
  });

  it('aprovação append-only, com prova, congela total; versão antiga/alterada/vencida recusada', async () => {
    const o = await criarOs(db, esc, baseA);
    const i1 = await salvarItem(db, esc, o.id);
    const v1 = await gerarVersao(db, esc, o.id);
    // item mudou depois da versão
    await salvarItem(db, esc, o.id, { p_item_id: i1.id, p_preco_unitario_centavos: 12000 });
    expect(await erroDe(aprovar(db, esc, o.id, v1.id))).toMatch(/itens mudaram/);
    const v2 = await gerarVersao(db, esc, o.id);
    expect(await erroDe(aprovar(db, esc, o.id, v1.id))).toMatch(/não é a versão vigente/);
    // sem prova / sem nome
    expect(await erroDe(aprovar(db, esc, o.id, v2.id, { p_prova: '' }))).toMatch(/prova/);
    expect(await erroDe(aprovar(db, esc, o.id, v2.id, { p_aprovador_nome: ' ' }))).toMatch(/nome de quem aprovou/);
    // vencida
    await comoAdmin(db);
    await db.exec(`alter table public.os_versao disable trigger os_versao_append_only`);
    await db.query(`update public.os_versao set validade_ate = (now() at time zone 'America/Sao_Paulo')::date - 1 where id = $1`, [v2.id]);
    await db.exec(`alter table public.os_versao enable trigger os_versao_append_only`);
    expect(await erroDe(aprovar(db, esc, o.id, v2.id))).toMatch(/venceu/);
    const v3 = await gerarVersao(db, esc, o.id);
    const ap = await aprovar(db, esc, o.id, v3.id);
    expect(ap.status).toBe('aprovado');
    expect(ap.total_aprovado_centavos).toBe(12000);
    await comoAdmin(db);
    const a = await db.query<{ total_aprovado_centavos: number; registrado_por: string; canal: string; id: string }>(
      'select id, total_aprovado_centavos::int as total_aprovado_centavos, registrado_por, canal from public.os_aprovacao where os_id = $1',
      [o.id]
    );
    expect(a.rows).toHaveLength(1);
    expect(a.rows[0]).toMatchObject({ total_aprovado_centavos: 12000, registrado_por: esc, canal: 'whatsapp' });
    expect(await erroDe(db.query('update public.os_aprovacao set total_aprovado_centavos = 1 where id = $1', [a.rows[0].id]))).toMatch(
      /somente de inclusão/
    );
    // segunda decisão na mesma versão
    expect(await erroDe(aprovar(db, esc, o.id, v3.id))).toMatch(/Itens só podem ser alterados|já tem decisão/);
  });

  it('parcial: itens não aprovados ficam recusados; peça não original exige autorização (art. 21)', async () => {
    const o = await criarOs(db, esc, baseA);
    const s = await salvarItem(db, esc, o.id);
    const p = await salvarItem(db, esc, o.id, {
      p_tipo: 'peca', p_descricao: 'Alternador usado', p_preco_unitario_centavos: 30000, p_condicao: 'usada'
    });
    const v = await gerarVersao(db, esc, o.id);
    expect(await erroDe(aprovar(db, esc, o.id, v.id))).toMatch(/autorização expressa/);
    expect(await erroDe(aprovar(db, esc, o.id, v.id, { p_decisao: 'parcial', p_itens_aprovados: [] }))).toMatch(
      /ao menos um item/
    );
    expect(
      await erroDe(aprovar(db, esc, o.id, v.id, { p_decisao: 'parcial', p_itens_aprovados: [randomUUID()] }))
    ).toMatch(/não pertence/);
    const r = await aprovar(db, esc, o.id, v.id, { p_decisao: 'parcial', p_itens_aprovados: [s.id] });
    expect(r.status).toBe('aprovado');
    expect(r.total_aprovado_centavos).toBe(10000);
    expect(r.total_centavos).toBe(10000);
    expect((await lerItem(db, s.id)).situacao).toBe('aprovado');
    expect((await lerItem(db, p.id)).situacao).toBe('recusado');
    // com autorização, peça usada pode ser aprovada
    const o2 = await criarOs(db, esc, baseA);
    const p2 = await salvarItem(db, esc, o2.id, {
      p_tipo: 'peca', p_descricao: 'Alternador usado', p_preco_unitario_centavos: 30000, p_condicao: 'usada'
    });
    const v2 = await gerarVersao(db, esc, o2.id);
    await aprovar(db, esc, o2.id, v2.id, { p_autorizacao_condicao: true });
    const it = await lerItem(db, p2.id);
    expect(it.situacao).toBe('aprovado');
    expect((it as unknown as { autorizacao_condicao: boolean }).autorizacao_condicao).toBe(true);
  });
});

describe('custo oculto', () => {
  it('item_os_custo só com financeiro; escrita digita custo mas não lê; baixa grava custo médio', async () => {
    const peca = await criarItem(db, A.orgId, { tipo: 'peca', descricao: 'Correia', precoVenda: 9000 });
    await entrada(db, A.userId, peca, '10', 4000);
    const o = await criarOs(db, esc, baseA);
    const t = await salvarItem(db, esc, o.id, {
      p_tipo: 'terceiro', p_descricao: 'Torno', p_preco_unitario_centavos: 15000, p_custo_unitario_centavos: 9000
    });
    const p = await salvarItem(db, esc, o.id, { p_tipo: 'peca', p_item_catalogo_id: peca, p_descricao: null, p_preco_unitario_centavos: null });
    // resposta da RPC não traz custo
    expect(Object.keys(t)).not.toContain('custo_unitario_centavos');
    const v = await gerarVersao(db, esc, o.id);
    await aprovar(db, esc, o.id, v.id);
    await transicao(db, esc, 'os_iniciar_execucao', o.id);
    for (const u of [esc, lei]) {
      await comoUsuario(db, u);
      expect(await contar('select 1 from public.item_os_custo')).toBe(0);
    }
    await comoUsuario(db, fin);
    const custos = await db.query<{ item_os_id: string; c: number }>(
      'select item_os_id, custo_unitario_centavos::int as c from public.item_os_custo where item_os_id = any($1::uuid[])',
      [`{${t.id},${p.id}}`]
    );
    expect(Object.fromEntries(custos.rows.map((r) => [r.item_os_id, r.c]))).toEqual({ [t.id]: 9000, [p.id]: 4000 });
    await comoUsuario(db, A.userId);
    expect(await contar('select 1 from public.item_os_custo where item_os_id = $1', [p.id])).toBe(1);
    await comoUsuario(db, B.userId);
    expect(await contar('select 1 from public.item_os_custo')).toBe(0);
  });
});

describe('garantia', () => {
  it('entrega grava garantia >= 90 dias (config); OS de garantia aponta a origem', async () => {
    const e = await levarAte(db, A, baseA, 'entregue');
    expect(e.garantia_ate).toBe(await hojeMais(90));
    await comoAdmin(db);
    await db.query('update public.oficina_config set garantia_dias = 120 where org_id = $1', [A.orgId]);
    const e2 = await levarAte(db, A, baseA, 'entregue');
    expect(e2.garantia_ate).toBe(await hojeMais(120));
    await db.query('update public.oficina_config set garantia_dias = 90 where org_id = $1', [A.orgId]);
    // config < 90 recusada pelo banco
    expect(
      await erroDe(db.query('update public.oficina_config set garantia_dias = 30 where org_id = $1', [A.orgId]))
    ).toMatch(/check constraint/);
    // garantia_ate < entrega + 90 recusada pelo CHECK
    expect(
      await erroDe(db.query(`update public.ordem_servico set garantia_ate = garantia_ate - 1 where id = $1`, [e.id]))
    ).toMatch(/ordem_servico_garantia/);

    const g = await criarOs(db, esc, baseA, { p_tipo: 'garantia', p_os_origem_id: e.id });
    expect(g).toMatchObject({ tipo: 'garantia', os_origem_id: e.id, status: 'orcamento' });
    expect(g.numero_seq).toBeGreaterThan(e.numero_seq);
    expect(await erroDe(criarOs(db, esc, baseA, { p_tipo: 'garantia' }))).toMatch(/OS de origem/);
    const naoEntregue = await levarAte(db, A, baseA, 'concluido');
    expect(
      await erroDe(criarOs(db, esc, baseA, { p_tipo: 'garantia', p_os_origem_id: naoEntregue.id }))
    ).toMatch(/só para OS entregue/);
    const r = await criarOs(db, esc, baseA, { p_tipo: 'retrabalho', p_os_origem_id: naoEntregue.id });
    expect(r.os_origem_id).toBe(naoEntregue.id);
    const outroVeiculo = await cenario(db, A);
    expect(
      await erroDe(criarOs(db, esc, outroVeiculo, { p_tipo: 'garantia', p_os_origem_id: e.id }))
    ).toMatch(/outro veículo/);
    const eB = await levarAte(db, B, baseB, 'entregue');
    expect(
      await erroDe(criarOs(db, esc, baseA, { p_tipo: 'garantia', p_os_origem_id: eB.id }))
    ).toMatch(/origem não encontrada/);
    // fora do prazo: só o dono
    await comoAdmin(db);
    await db.query(
      `update public.ordem_servico set data_entrega = now() - interval '200 days', garantia_ate = current_date - 100
       where id = $1`,
      [e.id]
    );
    expect(
      await erroDe(criarOs(db, esc, baseA, { p_tipo: 'garantia', p_os_origem_id: e.id }))
    ).toMatch(/Garantia vencida/);
    const gd = await criarOs(db, A.userId, baseA, { p_tipo: 'garantia', p_os_origem_id: e.id });
    expect(gd.os_origem_id).toBe(e.id);
  });
});

describe('auditoria', () => {
  it('transições e aprovação geram eventos da OS', async () => {
    const o = await levarAte(db, A, baseA, 'entregue');
    const ev = (await eventosDe(db, A.orgId, 'ordem_servico')).filter((e) => e.entidade_id === o.id);
    const trans = ev.filter((e) => e.acao === 'transicionar').map((e) => e.dados.para);
    expect(trans).toEqual(['orcamento', 'aprovado', 'em_execucao', 'concluido', 'entregue']);
    expect(ev.some((e) => e.acao === 'registrar_aprovacao')).toBe(true);
    expect(ev.some((e) => e.acao === 'gerar_versao')).toBe(true);
    expect(ev.some((e) => e.acao === 'incluir_item')).toBe(true);
  });
});
