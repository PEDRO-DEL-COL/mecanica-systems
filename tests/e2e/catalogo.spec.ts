import { test, expect, type Page } from '@playwright/test';
import { mockSupabase, type ConfigMock } from './apoio/supabase-mock';

/** Simula o PostgREST do catálogo com page.route (registrado depois do mock compartilhado, que fica como fallback). */

const ORG = '00000000-0000-4000-8000-0000000000b1';
const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': 'GET, POST, PATCH, DELETE, OPTIONS',
  'access-control-expose-headers': '*'
};

interface Item {
  id: string;
  org_id: string;
  tipo: 'servico' | 'peca';
  codigo: string | null;
  codigo_fabricante: string | null;
  descricao: string;
  unidade: string;
  preco_venda_centavos: number;
  controla_estoque: boolean;
  estoque_minimo: string;
  localizacao: string | null;
  ativo: boolean;
  versao: number;
  criado_em: string;
  atualizado_em: string;
}

function item(parcial: Partial<Item> & { id: string; descricao: string }): Item {
  return {
    org_id: ORG,
    tipo: 'servico',
    codigo: null,
    codigo_fabricante: null,
    unidade: 'un',
    preco_venda_centavos: 10000,
    controla_estoque: false,
    estoque_minimo: '0.000',
    localizacao: null,
    ativo: true,
    versao: 1,
    criado_em: '2026-11-01T10:00:00Z',
    atualizado_em: '2026-11-01T10:00:00Z',
    ...parcial
  };
}

const TROCA = item({ id: '00000000-0000-4000-8000-000000000101', descricao: 'Troca de óleo', preco_venda_centavos: 10000 });
const FILTRO = item({
  id: '00000000-0000-4000-8000-000000000201',
  tipo: 'peca',
  codigo: 'FO-1',
  descricao: 'Filtro de óleo',
  controla_estoque: true,
  estoque_minimo: '5.000',
  preco_venda_centavos: 5000
});

interface Estado {
  itens: Item[];
  custos: Record<string, number>;
  saldos: Record<string, string>;
  /** Caminhos (com query) das requisições feitas por tabela. */
  pedidos: { custo: string[]; saldo: string[]; itens: string[] };
  posts: unknown[];
  patches: unknown[];
}

async function mockCatalogo(
  page: Page,
  cfg: ConfigMock,
  inicial: { itens?: Item[]; custos?: Record<string, number>; saldos?: Record<string, string> } = {}
): Promise<Estado> {
  await mockSupabase(page, cfg);
  const est: Estado = {
    itens: inicial.itens ?? [],
    custos: inicial.custos ?? {},
    saldos: inicial.saldos ?? {},
    pedidos: { custo: [], saldo: [], itens: [] },
    posts: [],
    patches: []
  };
  const json = (route: import('@playwright/test').Route, corpo: unknown, status = 200, extra: Record<string, string> = {}) =>
    route.fulfill({ status, headers: { ...CORS, 'content-type': 'application/json', ...extra }, body: JSON.stringify(corpo) });

  await page.route(/\/rest\/v1\/(item_catalogo|item_custo|estoque_saldo)(\?|$)/, async (route) => {
    const req = route.request();
    if (req.method() === 'OPTIONS') return route.fallback();
    const url = new URL(req.url());
    const tabela = url.pathname.split('/').pop();
    const sp = url.searchParams;
    const unico = (req.headers()['accept'] ?? '').includes('vnd.pgrst.object');
    const eq = (k: string) => sp.get(k)?.replace(/^eq\./, '');

    if (tabela === 'item_custo') {
      est.pedidos.custo.push(url.search);
      const ids = (sp.get('item_id') ?? '').replace(/^(eq\.|in\.\(|\))/g, '').replace(/\)$/, '').split(',');
      return json(
        route,
        ids.filter((i) => i in est.custos).map((i) => ({
          item_id: i,
          org_id: ORG,
          custo_medio_centavos: est.custos[i],
          ultimo_custo_centavos: est.custos[i],
          atualizado_em: '2026-11-02T10:00:00Z'
        }))
      );
    }

    if (tabela === 'estoque_saldo') {
      est.pedidos.saldo.push(url.search);
      const id = eq('item_id') ?? '';
      const it = est.itens.find((x) => x.id === id);
      if (!it || !(id in est.saldos)) return json(route, []);
      const saldo = est.saldos[id];
      return json(route, [
        {
          org_id: ORG,
          item_id: id,
          codigo: it.codigo,
          descricao: it.descricao,
          unidade: it.unidade,
          localizacao: it.localizacao,
          estoque_minimo: it.estoque_minimo,
          ativo: it.ativo,
          saldo,
          negativo: Number(saldo) < 0,
          abaixo_minimo: Number(saldo) < Number(it.estoque_minimo)
        }
      ]);
    }

    // item_catalogo
    if (req.method() === 'GET') {
      est.pedidos.itens.push(url.search);
      const id = eq('id');
      if (id) {
        const it = est.itens.find((x) => x.id === id);
        if (!it) return json(route, { code: 'PGRST116', message: 'sem linhas', details: null, hint: null }, 406);
        return json(route, unico ? it : [it]);
      }
      let lista = est.itens.filter((x) => (eq('tipo') ? x.tipo === eq('tipo') : true));
      if (eq('ativo') === 'true') lista = lista.filter((x) => x.ativo);
      const busca = (sp.get('busca') ?? '').replace(/^ilike\./, '').replace(/%/g, '');
      if (busca) {
        lista = lista.filter((x) =>
          `${x.descricao} ${x.codigo ?? ''}`.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().includes(busca)
        );
      }
      return json(route, lista, 200, { 'content-range': lista.length ? `0-${lista.length - 1}/${lista.length}` : '*/0' });
    }
    if (req.method() === 'POST') {
      const corpo = req.postDataJSON() as Partial<Item>;
      est.posts.push(corpo);
      if (corpo.codigo && est.itens.some((x) => x.codigo === corpo.codigo)) {
        return json(route, { code: '23505', message: 'duplicate key', details: null, hint: null }, 409);
      }
      const novo = item({ ...(corpo as Item), id: corpo.id ?? crypto.randomUUID(), descricao: corpo.descricao ?? '' });
      est.itens.push(novo);
      return json(route, novo, 201);
    }
    if (req.method() === 'PATCH') {
      const corpo = req.postDataJSON() as Partial<Item>;
      est.patches.push(corpo);
      const it = est.itens.find((x) => x.id === eq('id') && String(x.versao) === eq('versao'));
      if (!it) return json(route, { code: 'PGRST116', message: 'sem linhas', details: null, hint: null }, 406);
      Object.assign(it, corpo, { versao: it.versao + 1 });
      return json(route, it);
    }
    return route.fallback();
  });
  return est;
}

const DONO: ConfigMock = { papel: 'dono' };
const SO_CATALOGO: ConfigMock = { papel: 'funcionario', permissoes: { catalogo: 'escrita' } };

test.describe('lista', () => {
  test('vazio mostra CTA e leva ao cadastro', async ({ page }) => {
    await mockCatalogo(page, DONO);
    await page.goto('/app/catalogo');
    await expect(page.getByTestId('catalogo-vazio')).toContainText('Nenhum serviço cadastrado');
    await page.getByTestId('catalogo-vazio-cta').click();
    await expect(page).toHaveURL(/\/app\/catalogo\/novo\?tipo=servico$/);
  });

  test('abas, busca sem acento e mostrar inativos ficam na URL', async ({ page }) => {
    await mockCatalogo(page, DONO, {
      itens: [TROCA, FILTRO, item({ ...TROCA, id: '00000000-0000-4000-8000-000000000102', descricao: 'Alinhamento', ativo: false })]
    });
    await page.goto('/app/catalogo');
    await expect(page.getByTestId('catalogo-linha')).toHaveCount(1);
    await page.getByTestId('catalogo-inativos').check();
    await expect(page).toHaveURL(/inativos=1/);
    await expect(page.getByTestId('catalogo-linha')).toHaveCount(2);
    await expect(page.getByTestId('catalogo-etiqueta-inativo')).toBeVisible();

    await page.getByTestId('catalogo-busca').fill('oleo');
    await expect(page).toHaveURL(/q=oleo/);
    await expect(page.getByTestId('catalogo-linha')).toHaveCount(1);
    await expect(page.getByTestId('catalogo-linha')).toContainText('Troca de óleo');

    await page.getByTestId('catalogo-aba-pecas').click();
    await expect(page).toHaveURL(/tipo=peca/);
    await expect(page.getByTestId('catalogo-linha')).toContainText('Filtro de óleo');
  });
});

test.describe('custo e margem', () => {
  test('dono vê custo, markup e margem rotulados (lista e detalhe)', async ({ page }) => {
    await mockCatalogo(page, DONO, { itens: [TROCA], custos: { [TROCA.id]: 8000 } });
    await page.goto('/app/catalogo');
    await expect(page.getByTestId('catalogo-linha-custo')).toHaveText('R$ 80,00');
    await expect(page.getByTestId('catalogo-linha-margem')).toHaveText('20,0%');
    await page.getByTestId('catalogo-link-item').click();
    await expect(page.getByTestId('catalogo-custo-medio')).toHaveText('R$ 80,00');
    await expect(page.getByTestId('catalogo-markup')).toHaveText('25,0%');
    await expect(page.getByTestId('catalogo-margem')).toHaveText('20,0%');
    await expect(page.getByText('Markup (sobre o custo)')).toBeVisible();
    await expect(page.getByText('Margem (sobre a venda)')).toBeVisible();
    // recalcula ao editar o preço de venda
    await page.getByTestId('catalogo-preco').fill('160');
    await page.getByTestId('catalogo-preco').blur();
    await expect(page.getByTestId('catalogo-markup')).toHaveText('100,0%');
    await expect(page.getByTestId('catalogo-margem')).toHaveText('50,0%');
  });

  test('sem financeiro: nada de custo na tela nem pedido ao servidor', async ({ page }) => {
    const est = await mockCatalogo(page, SO_CATALOGO, { itens: [TROCA], custos: { [TROCA.id]: 8000 } });
    await page.goto('/app/catalogo');
    await expect(page.getByTestId('catalogo-linha')).toHaveCount(1);
    await expect(page.getByText('Custo médio')).toHaveCount(0);
    await expect(page.getByTestId('catalogo-linha-custo')).toHaveCount(0);
    await page.getByTestId('catalogo-link-item').click();
    await expect(page.getByTestId('catalogo-form')).toBeVisible();
    await expect(page.getByTestId('catalogo-custo')).toHaveCount(0);
    await expect(page.getByText(/markup|margem/i)).toHaveCount(0);
    expect(est.pedidos.custo).toEqual([]);
  });

  test('funcionário com financeiro/leitura vê custo', async ({ page }) => {
    const est = await mockCatalogo(
      page,
      { papel: 'funcionario', permissoes: { catalogo: 'leitura', financeiro: 'leitura' } },
      { itens: [TROCA], custos: { [TROCA.id]: 8000 } }
    );
    await page.goto(`/app/catalogo/${TROCA.id}`);
    await expect(page.getByTestId('catalogo-margem')).toHaveText('20,0%');
    expect(est.pedidos.custo.length).toBeGreaterThan(0);
    // só leitura: sem salvar nem desativar
    await expect(page.getByTestId('catalogo-btn-salvar')).toHaveCount(0);
    await expect(page.getByTestId('catalogo-btn-ativo')).toHaveCount(0);
  });
});

test.describe('formulário', () => {
  test('valida descrição e preço em pt-BR', async ({ page }) => {
    const est = await mockCatalogo(page, DONO);
    await page.goto('/app/catalogo/novo?tipo=servico');
    await page.getByTestId('catalogo-btn-salvar').click();
    await expect(page.getByText('Informe a descrição.')).toBeVisible();
    await expect(page.getByText('Informe o valor.')).toBeVisible();
    expect(est.posts).toEqual([]);
  });

  test('cria serviço e volta à lista', async ({ page }) => {
    const est = await mockCatalogo(page, DONO);
    await page.goto('/app/catalogo/novo?tipo=servico');
    await page.getByTestId('catalogo-descricao').fill('Alinhamento');
    await page.getByTestId('catalogo-preco').fill('120,50');
    await page.getByTestId('catalogo-btn-salvar').click();
    await expect(page).toHaveURL(/\/app\/catalogo\?tipo=servico$/);
    await expect(page.getByTestId('catalogo-linha')).toContainText('Alinhamento');
    expect(est.posts).toHaveLength(1);
    expect(est.posts[0]).toMatchObject({ tipo: 'servico', descricao: 'Alinhamento', preco_venda_centavos: 12050, controla_estoque: false });
  });

  test('código de peça duplicado mostra "Código já cadastrado"', async ({ page }) => {
    await mockCatalogo(page, DONO, { itens: [FILTRO] });
    await page.goto('/app/catalogo/novo?tipo=peca');
    await page.getByTestId('catalogo-codigo').fill('FO-1');
    await page.getByTestId('catalogo-descricao').fill('Filtro de ar');
    await page.getByTestId('catalogo-preco').fill('45');
    await page.getByTestId('catalogo-btn-salvar').click();
    await expect(page.getByText('Código já cadastrado')).toBeVisible();
    await expect(page).toHaveURL(/\/catalogo\/novo/);
  });

  test('sem escrita não há botão Novo', async ({ page }) => {
    await mockCatalogo(page, { papel: 'funcionario', permissoes: { catalogo: 'leitura' } }, { itens: [TROCA] });
    await page.goto('/app/catalogo');
    await expect(page.getByTestId('catalogo-linha')).toHaveCount(1);
    await expect(page.getByTestId('catalogo-btn-novo')).toHaveCount(0);
  });
});

test.describe('detalhe', () => {
  test('desativa com confirmação e reativa', async ({ page }) => {
    const est = await mockCatalogo(page, DONO, { itens: [{ ...TROCA }] });
    await page.goto(`/app/catalogo/${TROCA.id}`);
    await page.getByTestId('catalogo-btn-ativo').click();
    await page.getByTestId('catalogo-confirmar-ativo-confirmar').click();
    await expect(page.getByTestId('catalogo-etiqueta-inativo')).toBeVisible();
    expect(est.patches).toEqual([{ ativo: false }]);
    await expect(page.getByTestId('catalogo-btn-ativo')).toHaveText('Reativar');
    await page.getByTestId('catalogo-btn-ativo').click();
    await page.getByTestId('catalogo-confirmar-ativo-confirmar').click();
    await expect(page.getByTestId('catalogo-etiqueta-ativo')).toBeVisible();
  });

  test('conflito de versão avisa para recarregar', async ({ page }) => {
    const est = await mockCatalogo(page, DONO, { itens: [{ ...TROCA }] });
    await page.goto(`/app/catalogo/${TROCA.id}`);
    await expect(page.getByTestId('catalogo-form')).toBeVisible();
    est.itens[0].versao = 5; // outra pessoa alterou
    await page.getByTestId('catalogo-descricao').fill('Troca de óleo e filtro');
    await page.getByTestId('catalogo-btn-salvar').click();
    await expect(page.getByTestId('catalogo-conflito')).toContainText('Alterado por outra pessoa. Recarregue.');
  });

  test('peça mostra saldo e etiqueta abaixo do mínimo com estoque/leitura', async ({ page }) => {
    await mockCatalogo(
      page,
      { papel: 'funcionario', permissoes: { catalogo: 'escrita', estoque: 'leitura' } },
      { itens: [FILTRO], saldos: { [FILTRO.id]: '2.000' } }
    );
    await page.goto(`/app/catalogo/${FILTRO.id}`);
    await expect(page.getByTestId('catalogo-saldo')).toContainText('Saldo: 2');
    await expect(page.getByTestId('catalogo-abaixo-minimo')).toHaveText('Abaixo do mínimo');
  });

  test('sem estoque/leitura o saldo não é pedido', async ({ page }) => {
    const est = await mockCatalogo(page, SO_CATALOGO, { itens: [FILTRO], saldos: { [FILTRO.id]: '2.000' } });
    await page.goto(`/app/catalogo/${FILTRO.id}`);
    await expect(page.getByTestId('catalogo-form')).toBeVisible();
    await expect(page.getByTestId('catalogo-saldo')).toHaveCount(0);
    expect(est.pedidos.saldo).toEqual([]);
  });
});

test.describe('celular 375 px', () => {
  test.use({ viewport: { width: 375, height: 700 } });

  test('lista e formulário sem rolagem horizontal', async ({ page }) => {
    await mockCatalogo(page, DONO, { itens: [FILTRO], custos: { [FILTRO.id]: 3000 } });
    await page.goto('/app/catalogo?tipo=peca');
    await expect(page.getByTestId('catalogo-linha')).toHaveCount(1);
    const larg = () => page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    expect(await larg()).toBe(false);
    await page.goto(`/app/catalogo/${FILTRO.id}`);
    await expect(page.getByTestId('catalogo-margem')).toBeVisible();
    expect(await larg()).toBe(false);
  });
});
