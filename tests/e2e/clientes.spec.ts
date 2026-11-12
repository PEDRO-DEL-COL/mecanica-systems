import { test, expect, type Page, type Route } from '@playwright/test';
import { mockSupabase, type ConfigMock } from './apoio/supabase-mock';

/** Simula o PostgREST das tabelas cliente/veiculo/organizacao dentro deste spec. */

const ORG = '00000000-0000-4000-8000-0000000000b1';

interface Cli {
  id: string;
  org_id: string;
  nome: string;
  documento: string | null;
  telefone: string | null;
  email: string | null;
  endereco: string | null;
  observacoes: string | null;
  ativo: boolean;
  versao: number;
  criado_em: string;
  atualizado_em: string;
}

function cli(n: number, extra: Partial<Cli> = {}): Cli {
  return {
    id: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
    org_id: ORG,
    nome: `Cliente ${n}`,
    documento: null,
    telefone: null,
    email: null,
    endereco: null,
    observacoes: null,
    ativo: true,
    versao: 1,
    criado_em: '2026-01-01T00:00:00Z',
    atualizado_em: '2026-01-01T00:00:00Z',
    ...extra
  };
}

interface Banco {
  clientes: Cli[];
  veiculos: Record<string, unknown>[];
  /** Próximo PATCH responde como conflito de versão. */
  conflito: boolean;
  patches: Record<string, unknown>[];
  posts: Record<string, unknown>[];
  buscasLista: string[];
}

const sem = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

async function mockClientes(page: Page, banco: Banco) {
  const json = (route: Route, corpo: unknown, status = 200, headers: Record<string, string> = {}) =>
    route.fulfill({
      status,
      headers: {
        'access-control-allow-origin': '*',
        'access-control-expose-headers': '*',
        'content-type': 'application/json',
        ...headers
      },
      body: JSON.stringify(corpo)
    });
  const naoEncontrado = (route: Route) =>
    json(route, { code: 'PGRST116', message: 'The result contains 0 rows', details: null, hint: null }, 406);

  await page.route(
    (u) => /^\/rest\/v1\/(cliente|veiculo|organizacao)$/.test(u.pathname),
    async (route) => {
      const req = route.request();
      if (req.method() === 'OPTIONS') return route.fallback();
      const url = new URL(req.url());
      const tabela = url.pathname.split('/').pop();
      const unico = (req.headers()['accept'] ?? '').includes('vnd.pgrst.object');
      const p = url.searchParams;

      if (tabela === 'organizacao') return json(route, { id: ORG });
      if (tabela === 'veiculo') {
        const cid = p.get('cliente_id')?.replace('eq.', '');
        const lista = banco.veiculos.filter((v) => !cid || v.cliente_id === cid);
        return json(route, lista, 200, { 'content-range': `0-${Math.max(0, lista.length - 1)}/${lista.length}` });
      }

      const idFiltro = p.get('id')?.replace('eq.', '');
      if (req.method() === 'GET') {
        let linhas = banco.clientes;
        if (idFiltro) {
          const c = linhas.find((x) => x.id === idFiltro);
          return c ? json(route, c) : naoEncontrado(route);
        }
        if (p.get('ativo') === 'eq.true') linhas = linhas.filter((x) => x.ativo);
        const b = p.get('busca');
        if (b) {
          const termo = b.replace(/^ilike\./, '').replace(/[%*]/g, '').replace(/\\/g, '');
          banco.buscasLista.push(termo);
          linhas = linhas.filter((x) => sem(`${x.nome} ${x.telefone ?? ''}`).includes(termo));
        }
        linhas = [...linhas].sort((a, c) => a.nome.localeCompare(c.nome));
        const off = Number(p.get('offset') ?? 0);
        const lim = Number(p.get('limit') ?? 25);
        const fatia = linhas.slice(off, off + lim);
        return json(route, fatia, 200, {
          'content-range': `${fatia.length ? off : '*'}${fatia.length ? `-${off + fatia.length - 1}` : ''}/${linhas.length}`
        });
      }
      if (req.method() === 'POST') {
        const corpo = req.postDataJSON() as Record<string, unknown>;
        banco.posts.push(corpo);
        const novo = cli(banco.clientes.length + 100, corpo as Partial<Cli>);
        banco.clientes.push(novo);
        return json(route, novo, 201);
      }
      if (req.method() === 'PATCH') {
        const corpo = req.postDataJSON() as Record<string, unknown>;
        banco.patches.push({ ...corpo, __filtros: url.search });
        const c = banco.clientes.find((x) => x.id === idFiltro);
        const versao = Number(p.get('versao')?.replace('eq.', ''));
        if (banco.conflito || !c || c.versao !== versao) return naoEncontrado(route);
        Object.assign(c, corpo, { versao: c.versao + 1 });
        return json(route, c);
      }
      return route.fallback();
    }
  );
}

async function preparar(page: Page, banco: Partial<Banco> = {}, cfg: ConfigMock = {}) {
  const b: Banco = {
    clientes: [],
    veiculos: [],
    conflito: false,
    patches: [],
    posts: [],
    buscasLista: [],
    ...banco
  };
  await mockSupabase(page, cfg);
  await mockClientes(page, b);
  return b;
}

test.describe('clientes', () => {
  test('lista vazia mostra CTA que leva ao formulário', async ({ page }) => {
    await preparar(page);
    await page.goto('/app/clientes');
    await expect(page.getByTestId('clientes-vazio')).toContainText('Nenhum cliente cadastrado');
    await page.getByTestId('clientes-vazio-novo').click();
    await expect(page).toHaveURL(/\/app\/clientes\/novo$/);
  });

  test('cria cliente e abre a ficha', async ({ page }) => {
    const b = await preparar(page);
    await page.goto('/app/clientes/novo');
    await page.getByTestId('cliente-nome').fill('  Maria Souza ');
    await page.getByTestId('cliente-telefone').fill('(11) 91234-5678');
    await page.getByTestId('cliente-email').fill('maria@exemplo.com');
    await page.getByTestId('cliente-salvar').click();
    await expect(page.getByTestId('cliente-titulo')).toHaveText('Maria Souza');
    expect(b.posts).toHaveLength(1);
    expect(b.posts[0]).toMatchObject({ nome: 'Maria Souza', telefone: '11912345678', org_id: ORG });
    await expect(page.getByTestId('cliente-sem-veiculos')).toBeVisible();
  });

  test('validação mostra erros por campo acessíveis', async ({ page }) => {
    const b = await preparar(page);
    await page.goto('/app/clientes/novo');
    await page.getByTestId('cliente-salvar').click();
    await expect(page.getByTestId('cliente-nome-erro')).toHaveText('Informe o nome.');
    await expect(page.getByTestId('cliente-nome')).toHaveAttribute('aria-invalid', 'true');
    await page.getByTestId('cliente-nome').fill('Fulano');
    await page.getByTestId('cliente-email').fill('invalido');
    await page.getByTestId('cliente-telefone').fill('123');
    await page.getByTestId('cliente-salvar').click();
    await expect(page.getByTestId('cliente-email-erro')).toHaveText('E-mail inválido.');
    await expect(page.getByTestId('cliente-telefone-erro')).toContainText('Telefone inválido');
    expect(b.posts).toHaveLength(0);
  });

  test('busca atualiza a URL e filtra; mostra inativos sob demanda', async ({ page }) => {
    await preparar(page, {
      clientes: [
        cli(1, { nome: 'Ana Lima', telefone: '11999990001' }),
        cli(2, { nome: 'José Pereira' }),
        cli(3, { nome: 'Antiga Oficina', ativo: false })
      ]
    });
    await page.goto('/app/clientes');
    await expect(page.getByTestId('clientes-linha')).toHaveCount(2);
    await page.getByTestId('clientes-busca').fill('jose');
    await expect(page).toHaveURL(/[?&]q=jose/);
    await expect(page.getByTestId('clientes-linha')).toHaveCount(1);
    await expect(page.getByTestId('clientes-linha')).toContainText('José Pereira');
    await page.getByTestId('clientes-busca').fill('zzzz');
    await expect(page.getByTestId('clientes-vazio')).toContainText('Nenhum cliente encontrado');
    await page.getByTestId('clientes-limpar').click();
    await page.getByTestId('clientes-inativos').check();
    await expect(page).toHaveURL(/inativos=1/);
    await expect(page.getByTestId('clientes-linha')).toHaveCount(3);
  });

  test('edita cliente enviando a versão atual', async ({ page }) => {
    const b = await preparar(page, { clientes: [cli(1, { nome: 'Ana Lima' })] });
    await page.goto('/app/clientes');
    await page.getByTestId('clientes-linha-link').click();
    await page.getByTestId('cliente-editar').click();
    await page.getByTestId('cliente-nome').fill('Ana Lima Souza');
    await page.getByTestId('cliente-salvar').click();
    await expect(page.getByTestId('cliente-titulo')).toHaveText('Ana Lima Souza');
    expect(b.patches[0]).toMatchObject({ nome: 'Ana Lima Souza' });
    expect(String(b.patches[0].__filtros)).toContain('versao=eq.1');
    await expect(page.getByTestId('cliente-editar')).toBeVisible();
  });

  test('desativa com confirmação e reativa', async ({ page }) => {
    const b = await preparar(page, { clientes: [cli(1)] });
    await page.goto(`/app/clientes/${b.clientes[0].id}`);
    await page.getByTestId('cliente-desativar').click();
    await page.getByTestId('cliente-confirmar-cancelar').click();
    expect(b.patches).toHaveLength(0);
    await page.getByTestId('cliente-desativar').click();
    await page.getByTestId('cliente-confirmar-confirmar').click();
    await expect(page.getByTestId('cliente-situacao')).toHaveText('Inativo');
    expect(b.patches[0]).toMatchObject({ ativo: false });
    await page.getByTestId('cliente-reativar').click();
    await page.getByTestId('cliente-confirmar-confirmar').click();
    await expect(page.getByTestId('cliente-situacao')).toHaveText('Ativo');
  });

  test('conflito de versão avisa e permite recarregar', async ({ page }) => {
    const b = await preparar(page, { clientes: [cli(1, { nome: 'Ana' })] });
    await page.goto(`/app/clientes/${b.clientes[0].id}`);
    await page.getByTestId('cliente-editar').click();
    await page.getByTestId('cliente-nome').fill('Ana Nova');
    b.conflito = true;
    await page.getByTestId('cliente-salvar').click();
    await expect(page.getByTestId('cliente-erro')).toHaveText('Alterado por outra pessoa. Recarregue.');
    b.conflito = false;
    b.clientes[0].nome = 'Ana Outra Pessoa';
    b.clientes[0].versao = 2;
    await page.getByTestId('cliente-recarregar').click();
    await expect(page.getByTestId('cliente-titulo')).toHaveText('Ana Outra Pessoa');
  });

  test('ficha lista os veículos do cliente com links', async ({ page }) => {
    const c = cli(1);
    await preparar(page, {
      clientes: [c],
      veiculos: [
        { id: 'v1', cliente_id: c.id, placa: 'ABC1D23', marca: 'Fiat', modelo: 'Uno', ano: 2012, ativo: true }
      ]
    });
    await page.goto(`/app/clientes/${c.id}`);
    await expect(page.getByTestId('cliente-veiculo')).toContainText('ABC1D23');
    await expect(page.getByTestId('cliente-veiculo').getByRole('link')).toHaveAttribute('href', '/app/veiculos/v1');
    await expect(page.getByTestId('cliente-add-veiculo')).toHaveAttribute('href', `/app/veiculos/novo?cliente=${c.id}`);
  });

  test('funcionário só com leitura não vê botões de escrita', async ({ page }) => {
    const c = cli(1, { nome: 'Ana Lima' });
    await preparar(page, { clientes: [c] }, { papel: 'funcionario', permissoes: { clientes: 'leitura' } });
    await page.goto('/app/clientes');
    await expect(page.getByTestId('clientes-linha')).toHaveCount(1);
    await expect(page.getByTestId('clientes-btn-novo')).toHaveCount(0);
    await page.getByTestId('clientes-linha-link').click();
    await expect(page.getByTestId('cliente-titulo')).toHaveText('Ana Lima');
    await expect(page.getByTestId('cliente-editar')).toHaveCount(0);
    await expect(page.getByTestId('cliente-desativar')).toHaveCount(0);
    await expect(page.getByTestId('cliente-add-veiculo')).toHaveCount(0);
    await page.goto('/app/clientes/novo');
    await expect(page.getByTestId('clientes-sem-escrita')).toBeVisible();
  });

  test('funcionário com escrita vê os botões', async ({ page }) => {
    await preparar(page, { clientes: [cli(1)] }, { papel: 'funcionario', permissoes: { clientes: 'escrita' } });
    await page.goto('/app/clientes');
    await expect(page.getByTestId('clientes-btn-novo')).toBeVisible();
  });

  test('375 px: sem rolagem horizontal da página', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 700 });
    await preparar(page, { clientes: [cli(1, { nome: 'Nome Bem Comprido Da Silva Pereira', email: 'email.muito.comprido@exemplo.com.br' })] });
    await page.goto('/app/clientes');
    await expect(page.getByTestId('clientes-linha')).toHaveCount(1);
    const larg = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
    expect(larg).toBe(true);
  });
});
