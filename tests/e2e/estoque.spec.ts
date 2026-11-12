import { test, expect, type Page, type Route } from '@playwright/test';
import { mockSupabase, type ConfigMock } from './apoio/supabase-mock';

/** Simula o PostgREST/RPC do estoque por cima do mock de auth compartilhado (rotas registradas depois têm prioridade). */

const ORG = '00000000-0000-4000-8000-0000000000b1';
const ID_OLEO = '10000000-0000-4000-8000-000000000001';
const ID_PASTILHA = '10000000-0000-4000-8000-000000000002';
const ID_VELA = '10000000-0000-4000-8000-000000000003';
const ID_FORN = '20000000-0000-4000-8000-000000000001';
const MOV_ENTRADA = '30000000-0000-4000-8000-000000000001';

interface Saldo {
  org_id: string;
  item_id: string;
  codigo: string | null;
  descricao: string;
  unidade: string;
  localizacao: string | null;
  estoque_minimo: string;
  ativo: boolean;
  saldo: string;
  negativo: boolean;
  abaixo_minimo: boolean;
}

function saldo(id: string, descricao: string, codigo: string, s: string, min: string): Saldo {
  const n = Number(s);
  return {
    org_id: ORG,
    item_id: id,
    codigo,
    descricao,
    unidade: 'un',
    localizacao: null,
    estoque_minimo: min,
    ativo: true,
    saldo: s,
    negativo: n < 0,
    abaixo_minimo: n < Number(min)
  };
}

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': 'GET, POST, PATCH, DELETE, OPTIONS',
  'access-control-expose-headers': '*'
};

function json(route: Route, corpo: unknown, status = 200, extra: Record<string, string> = {}) {
  return route.fulfill({
    status,
    headers: { ...CORS, 'content-type': 'application/json', ...extra },
    body: JSON.stringify(corpo)
  });
}

interface Estado {
  saldos: Saldo[];
  movimentos: Record<string, unknown>[];
  rpcs: { nome: string; corpo: Record<string, unknown> }[];
  /** Caminhos de custo consultados (devem ficar vazios sem financeiro). */
  consultasCusto: string[];
}

async function mockEstoque(page: Page, cfg: ConfigMock = {}, financeiro = true): Promise<Estado> {
  await mockSupabase(page, cfg);
  const e: Estado = {
    saldos: [
      saldo(ID_OLEO, 'Filtro de óleo', 'FO-01', '2.000', '5.000'),
      saldo(ID_PASTILHA, 'Pastilha de freio', 'PF-02', '-1.000', '0.000'),
      saldo(ID_VELA, 'Vela de ignição', 'VI-03', '10.000', '2.000')
    ],
    movimentos: [
      {
        id: MOV_ENTRADA,
        org_id: ORG,
        item_id: ID_OLEO,
        tipo: 'entrada',
        quantidade: '2.000',
        motivo: null,
        fornecedor_id: ID_FORN,
        os_id: null,
        nota_fiscal: 'NF-123',
        estorna_id: null,
        entrada_id: null,
        criado_por: null,
        criado_em: '2026-11-10T12:00:00Z'
      }
    ],
    rpcs: [],
    consultasCusto: []
  };

  await page.route(
    (u) => u.pathname.startsWith('/rest/v1/') && u.pathname !== '/rest/v1/membro' && u.pathname !== '/rest/v1/membro_permissao' && u.pathname !== '/rest/v1/rpc/criar_oficina',
    async (route) => {
      const req = route.request();
      if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
      const url = new URL(req.url());
      const p = url.pathname.replace('/rest/v1/', '');
      const sp = url.searchParams;
      const objeto = (req.headers()['accept'] ?? '').includes('pgrst.object');

      const lista = (linhas: unknown[]) => {
        if (objeto) {
          return linhas.length
            ? json(route, linhas[0])
            : json(route, { code: 'PGRST116', message: 'sem linhas', details: null, hint: null }, 406);
        }
        const fim = Math.max(0, linhas.length - 1);
        return json(route, linhas, 200, { 'content-range': linhas.length ? `0-${fim}/${linhas.length}` : '*/0' });
      };

      if (p === 'estoque_saldo') {
        let r = e.saldos;
        const item = sp.get('item_id');
        if (item) r = r.filter((s) => `eq.${s.item_id}` === item);
        if (sp.get('negativo') === 'eq.true') r = r.filter((s) => s.negativo);
        if (sp.get('abaixo_minimo') === 'eq.true') r = r.filter((s) => s.abaixo_minimo);
        const busca = sp.get('busca');
        if (busca) {
          const t = busca.replace(/^ilike\./, '').replaceAll('%', '');
          r = r.filter((s) => s.descricao.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().includes(t));
        }
        return lista(r);
      }
      if (p === 'movimento_estoque') {
        if (sp.get('select') === 'estorna_id') {
          return json(route, e.movimentos.filter((m) => m.estorna_id).map((m) => ({ estorna_id: m.estorna_id })));
        }
        const item = sp.get('item_id');
        const r = e.movimentos.filter((m) => !item || `eq.${m.item_id}` === item);
        return lista([...r].reverse());
      }
      if (p === 'movimento_estoque_custo') {
        e.consultasCusto.push(p);
        return json(route, financeiro ? [{ movimento_id: MOV_ENTRADA, org_id: ORG, custo_unitario_centavos: 1250, criado_em: '2026-11-10T12:00:00Z' }] : []);
      }
      if (p === 'item_custo') {
        e.consultasCusto.push(p);
        return lista(
          financeiro ? [{ item_id: ID_OLEO, org_id: ORG, custo_medio_centavos: 1250, ultimo_custo_centavos: 1250, atualizado_em: '2026-11-10T12:00:00Z' }] : []
        );
      }
      if (p === 'fornecedor') {
        return lista([
          { id: ID_FORN, org_id: ORG, nome: 'Auto Peças Brasil', documento: null, contato: null, telefone: null, email: null, observacao: null, ativo: true, versao: 1, criado_em: '2026-11-01T00:00:00Z', atualizado_em: '2026-11-01T00:00:00Z' }
        ]);
      }
      if (p.startsWith('rpc/')) {
        const nome = p.slice(4);
        const corpo = req.postDataJSON() as Record<string, unknown>;
        e.rpcs.push({ nome, corpo });
        const id = (corpo.p_item_id as string | undefined) ?? ID_OLEO;
        const s = e.saldos.find((x) => x.item_id === id) ?? e.saldos[0];
        const novoMov = '30000000-0000-4000-8000-0000000000ff';
        if (nome === 'registrar_entrada_estoque') {
          s.saldo = (Number(s.saldo) + Number(corpo.p_quantidade)).toFixed(3);
        } else if (nome === 'registrar_ajuste_estoque') {
          s.saldo = (Number(s.saldo) + Number(corpo.p_delta)).toFixed(3);
        } else if (nome === 'estornar_movimento') {
          s.saldo = (Number(s.saldo) - 2).toFixed(3);
          e.movimentos.push({ ...e.movimentos[0], id: novoMov, tipo: 'estorno', quantidade: '-2.000', estorna_id: corpo.p_movimento_id, motivo: corpo.p_motivo, nota_fiscal: null, criado_em: '2026-11-11T12:00:00Z' });
        }
        s.negativo = Number(s.saldo) < 0;
        s.abaixo_minimo = Number(s.saldo) < Number(s.estoque_minimo);
        return json(route, { movimento_id: novoMov, item_id: s.item_id, saldo: s.saldo, negativo: s.negativo });
      }
      return json(route, { code: 'PGRST205', message: 'Rota não simulada: ' + p }, 404);
    }
  );
  return e;
}

async function escolherPeca(page: Page, prefixo: string, busca: string, id: string) {
  await page.getByTestId(`${prefixo}-busca`).fill(busca);
  await expect(page.getByTestId(`${prefixo}-selecao`).locator(`option[value="${id}"]`)).toBeAttached();
  await page.getByTestId(`${prefixo}-selecao`).selectOption(id);
}

test.describe('saldos', () => {
  test('sinaliza abaixo do mínimo e saldo negativo e filtra pela URL', async ({ page }) => {
    await mockEstoque(page);
    await page.goto('/app/estoque');
    await expect(page.getByTestId('estoque-tabela-linha')).toHaveCount(3);
    await expect(page.getByTestId('estoque-abaixo-minimo')).toHaveCount(1);
    await expect(page.getByTestId('estoque-negativo')).toHaveCount(1);
    await expect(page.getByTestId('estoque-negativo')).toHaveText('Saldo negativo');
    // quantidade como string decimal formatada pt-BR
    await expect(page.getByTestId('estoque-saldo').first()).toContainText('2 un');

    await page.getByTestId('estoque-filtro-negativos').click();
    await expect(page).toHaveURL(/f=negativos/);
    await expect(page.getByTestId('estoque-tabela-linha')).toHaveCount(1);
    await expect(page.getByTestId('estoque-tabela-linha')).toContainText('Pastilha de freio');

    await page.getByTestId('estoque-filtro-abaixo').click();
    await expect(page).toHaveURL(/f=abaixo/);
    await expect(page.getByTestId('estoque-tabela-linha')).toHaveCount(2);
  });

  test('vazio com CTA e sem escrita não mostra botões de entrada', async ({ page }) => {
    const e = await mockEstoque(page, { papel: 'funcionario', permissoes: { estoque: 'leitura' } });
    e.saldos = [];
    await page.goto('/app/estoque');
    await expect(page.getByTestId('estoque-vazio')).toBeVisible();
    await expect(page.getByTestId('estoque-btn-entrada')).toHaveCount(0);
    await expect(page.getByTestId('estoque-aba-entrada')).toHaveCount(0);
  });

  test('vazio do dono oferece CTA de entrada', async ({ page }) => {
    const e = await mockEstoque(page);
    e.saldos = [];
    await page.goto('/app/estoque');
    await expect(page.getByTestId('estoque-vazio-entrada')).toBeVisible();
  });
});

test.describe('entrada e ajuste', () => {
  test('registra entrada com fornecedor e custo unitário', async ({ page }) => {
    const e = await mockEstoque(page);
    await page.goto('/app/estoque/entrada');
    await escolherPeca(page, 'estoque-entrada-peca', 'filtro', ID_OLEO);
    await page.getByTestId('estoque-entrada-quantidade').fill('3,5');
    await page.getByTestId('estoque-entrada-custo').fill('12,50');
    await expect(page.getByTestId('estoque-entrada-fornecedor').locator(`option[value="${ID_FORN}"]`)).toBeAttached();
    await page.getByTestId('estoque-entrada-fornecedor').selectOption(ID_FORN);
    await page.getByTestId('estoque-entrada-nota').fill('NF-9');
    await page.getByTestId('estoque-entrada-salvar').click();
    await expect(page.getByText('Entrada registrada. Saldo atual: 5,5.')).toBeVisible();
    expect(e.rpcs).toHaveLength(1);
    expect(e.rpcs[0].nome).toBe('registrar_entrada_estoque');
    expect(e.rpcs[0].corpo).toMatchObject({
      p_item_id: ID_OLEO,
      p_quantidade: '3.5',
      p_custo_unitario_centavos: 1250,
      p_fornecedor_id: ID_FORN,
      p_nota_fiscal: 'NF-9'
    });
  });

  test('funcionário só com estoque/escrita registra entrada com custo', async ({ page }) => {
    const e = await mockEstoque(page, { papel: 'funcionario', permissoes: { estoque: 'escrita' } }, false);
    await page.goto(`/app/estoque/entrada?item=${ID_OLEO}`);
    await expect(page.getByTestId('estoque-entrada-custo')).toBeVisible();
    await page.getByTestId('estoque-entrada-quantidade').fill('1');
    await page.getByTestId('estoque-entrada-custo').fill('10');
    await page.getByTestId('estoque-entrada-salvar').click();
    await expect(page.getByText(/Entrada registrada/)).toBeVisible();
    expect(e.rpcs[0].corpo).toMatchObject({ p_item_id: ID_OLEO, p_custo_unitario_centavos: 1000 });
  });

  test('ajuste sem motivo é recusado; com motivo é registrado', async ({ page }) => {
    const e = await mockEstoque(page);
    await page.goto('/app/estoque/ajuste');
    await escolherPeca(page, 'estoque-ajuste-peca', 'pastilha', ID_PASTILHA);
    await page.getByTestId('estoque-ajuste-delta').fill('-2');
    await page.getByTestId('estoque-ajuste-salvar').click();
    await expect(page.getByTestId('estoque-ajuste-motivo-erro')).toHaveText('Informe o motivo.');
    expect(e.rpcs).toHaveLength(0);

    await page.getByTestId('estoque-ajuste-motivo').fill('Contagem física');
    await page.getByTestId('estoque-ajuste-salvar').click();
    await expect(page.getByText(/o saldo ficou negativo: -3/)).toBeVisible();
    expect(e.rpcs).toHaveLength(1);
    expect(e.rpcs[0].corpo).toMatchObject({ p_item_id: ID_PASTILHA, p_delta: '-2', p_motivo: 'Contagem física' });
  });
});

test.describe('movimentos', () => {
  test('estorno exige motivo e cria o movimento inverso', async ({ page }) => {
    const e = await mockEstoque(page);
    await page.goto(`/app/estoque/movimentos?item=${ID_OLEO}`);
    await expect(page.getByTestId('estoque-mov-tabela-linha')).toHaveCount(1);
    await expect(page.getByTestId('estoque-mov-qtd')).toHaveText('2');
    await page.getByTestId('estoque-btn-estornar').click();

    await page.getByTestId('estoque-estorno-confirmar').click();
    await expect(page.getByText('Informe o motivo.').first()).toBeVisible();
    expect(e.rpcs).toHaveLength(0);

    await page.getByTestId('estoque-estorno-motivo').fill('Lançada em duplicidade');
    await page.getByTestId('estoque-estorno-confirmar').click();
    await expect(page.getByText(/Movimento estornado/)).toBeVisible();
    expect(e.rpcs[0]).toEqual({
      nome: 'estornar_movimento',
      corpo: { p_movimento_id: MOV_ENTRADA, p_motivo: 'Lançada em duplicidade' }
    });
    // o histórico passa a mostrar o movimento inverso e o original como estornado
    await expect(page.getByTestId('estoque-mov-tabela-linha')).toHaveCount(2);
    await expect(page.getByTestId('estoque-mov-estornado')).toHaveCount(1);
    await expect(page.getByTestId('estoque-btn-estornar')).toHaveCount(0);
  });

  test('dono com financeiro vê custos', async ({ page }) => {
    await mockEstoque(page);
    await page.goto(`/app/estoque/movimentos?item=${ID_OLEO}`);
    await expect(page.getByTestId('estoque-mov-custo')).toContainText('R$ 12,50');
    await expect(page.getByTestId('estoque-mov-custo-medio')).toContainText('R$ 12,50');
  });

  test('sem financeiro o custo fica oculto e nem é consultado', async ({ page }) => {
    const e = await mockEstoque(page, { papel: 'funcionario', permissoes: { estoque: 'escrita' } }, false);
    await page.goto(`/app/estoque/movimentos?item=${ID_OLEO}`);
    await expect(page.getByTestId('estoque-mov-tabela-linha')).toHaveCount(1);
    await expect(page.getByTestId('estoque-mov-custo')).toHaveCount(0);
    await expect(page.getByTestId('estoque-mov-custo-medio')).toHaveCount(0);
    await expect(page.getByRole('columnheader', { name: /Custo/ })).toHaveCount(0);
    expect(e.consultasCusto).toEqual([]);
  });
});

test.describe('celular 375 px', () => {
  test.use({ viewport: { width: 375, height: 700 } });

  test('saldos sem rolagem horizontal da página', async ({ page }) => {
    await mockEstoque(page);
    await page.goto('/app/estoque');
    await expect(page.getByTestId('estoque-tabela-linha')).toHaveCount(3);
    const transborda = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    expect(transborda).toBe(false);
  });
});
