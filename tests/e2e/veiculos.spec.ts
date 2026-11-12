import { test, expect, type Page, type Route } from '@playwright/test';
import { mockSupabase, type ConfigMock } from './apoio/supabase-mock';

/** PostgREST simulado só para veiculo/cliente/transferir_veiculo (o mock compartilhado cuida de auth/oficina). */

const ORG = '00000000-0000-4000-8000-0000000000b1';
const C1 = '11111111-1111-4111-8111-111111111111';
const C2 = '22222222-2222-4222-8222-222222222222';

interface V {
  id: string;
  org_id: string;
  cliente_id: string;
  placa: string;
  marca: string;
  modelo: string;
  ano: number | null;
  cor: string | null;
  chassi: string | null;
  km_atual: number;
  ativo: boolean;
  versao: number;
  criado_em: string;
  atualizado_em: string;
}

function veic(n: number, p: Partial<V> = {}): V {
  return {
    id: `aaaaaaaa-aaaa-4aaa-8aaa-${String(n).padStart(12, '0')}`,
    org_id: ORG,
    cliente_id: C1,
    placa: 'ABC1234',
    marca: 'VW',
    modelo: 'Gol',
    ano: 2015,
    cor: 'Prata',
    chassi: null,
    km_atual: 100000,
    ativo: true,
    versao: 1,
    criado_em: '2026-01-01T00:00:00Z',
    atualizado_em: '2026-01-01T00:00:00Z',
    ...p
  };
}

function cli(id: string, nome: string) {
  return {
    id,
    org_id: ORG,
    nome,
    documento: null,
    telefone: null,
    email: null,
    endereco: null,
    observacoes: null,
    ativo: true,
    versao: 1,
    criado_em: '2026-01-01T00:00:00Z',
    atualizado_em: '2026-01-01T00:00:00Z'
  };
}

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': 'GET, POST, PATCH, DELETE, OPTIONS',
  'access-control-expose-headers': '*'
};

function resp(route: Route, corpo: unknown, status = 200, extra: Record<string, string> = {}) {
  return route.fulfill({
    status,
    headers: { ...CORS, 'content-type': 'application/json', ...extra },
    body: JSON.stringify(corpo)
  });
}

function semAcento(s: string) {
  return s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}

interface Banco {
  veiculos: V[];
  clientes: ReturnType<typeof cli>[];
  posts: unknown[];
  patches: unknown[];
  rpcs: unknown[];
}

async function montar(page: Page, banco: Banco, cfg: ConfigMock = {}) {
  await mockSupabase(page, cfg);
  await page.route(
    (u) => /^\/rest\/v1\/(veiculo|cliente|organizacao)$|^\/rest\/v1\/rpc\/transferir_veiculo$/.test(u.pathname),
    async (route) => {
      const req = route.request();
      if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
      const url = new URL(req.url());
      const tabela = url.pathname.split('/').pop()!;
      const q = url.searchParams;
      const objeto = (req.headers()['accept'] ?? '').includes('vnd.pgrst.object');
      if (tabela === 'organizacao') return resp(route, { id: ORG });
      const naoEncontrado = () =>
        resp(route, { code: 'PGRST116', message: 'The result contains 0 rows', details: null, hint: null }, 406);

      if (tabela === 'transferir_veiculo') {
        const corpo = req.postDataJSON() as { p_veiculo_id: string; p_novo_cliente_id: string };
        banco.rpcs.push(corpo);
        const v = banco.veiculos.find((x) => x.id === corpo.p_veiculo_id);
        if (!v) return naoEncontrado();
        v.cliente_id = corpo.p_novo_cliente_id;
        v.versao++;
        return resp(route, v);
      }

      if (req.method() === 'POST' && tabela === 'veiculo') {
        const corpo = req.postDataJSON() as Partial<V>;
        banco.posts.push(corpo);
        if (banco.veiculos.some((x) => x.ativo && x.placa === corpo.placa)) {
          return resp(route, { code: '23505', message: 'duplicate key', details: null, hint: null }, 409);
        }
        const novo = veic(banco.veiculos.length + 1, corpo);
        banco.veiculos.push(novo);
        return resp(route, novo, 201);
      }

      if (req.method() === 'PATCH' && tabela === 'veiculo') {
        const corpo = req.postDataJSON() as Partial<V>;
        banco.patches.push(corpo);
        const id = q.get('id')?.replace('eq.', '');
        const versao = Number(q.get('versao')?.replace('eq.', ''));
        const v = banco.veiculos.find((x) => x.id === id && x.versao === versao);
        if (!v) return naoEncontrado();
        Object.assign(v, corpo, { versao: v.versao + 1 });
        return resp(route, v);
      }

      if (req.method() === 'GET') {
        const lista: Array<V | ReturnType<typeof cli>> = tabela === 'veiculo' ? banco.veiculos : banco.clientes;
        let itens = [...lista];
        const id = q.get('id');
        if (id) itens = itens.filter((x) => x.id === id.replace('eq.', ''));
        if (q.get('ativo') === 'eq.true') itens = itens.filter((x) => x.ativo);
        const cid = q.get('cliente_id');
        if (cid) itens = itens.filter((x) => (x as V).cliente_id === cid.replace('eq.', ''));
        const b = q.get('busca');
        if (b) {
          const termo = semAcento(b.replace(/^ilike\./, '').replace(/^%|%$/g, ''));
          itens = itens.filter((x) => {
            const campos =
              tabela === 'veiculo'
                ? `${(x as V).placa} ${(x as V).marca} ${(x as V).modelo}`
                : (x as ReturnType<typeof cli>).nome;
            return semAcento(campos).includes(termo);
          });
        }
        if (objeto) return itens[0] ? resp(route, itens[0]) : naoEncontrado();
        const total = itens.length;
        const off = Number(q.get('offset') ?? 0);
        const lim = Number(q.get('limit') ?? 1000);
        const pagina = itens.slice(off, off + lim);
        return resp(route, pagina, 200, {
          'content-range': `${total ? off : '*'}-${total ? off + pagina.length - 1 : '*'}/${total}`
        });
      }
      return route.fallback();
    }
  );
}

function novoBanco(veiculos: V[] = []): Banco {
  return {
    veiculos,
    clientes: [cli(C1, 'Ana Souza'), cli(C2, 'Bruno Lima')],
    posts: [],
    patches: [],
    rpcs: []
  };
}

test.describe('lista', () => {
  test('vazio com CTA leva ao cadastro', async ({ page }) => {
    await montar(page, novoBanco());
    await page.goto('/app/veiculos');
    await expect(page.getByTestId('veiculos-vazio')).toContainText('Nenhum veículo cadastrado');
    await page.getByTestId('veiculos-vazio-novo').click();
    await expect(page).toHaveURL(/\/app\/veiculos\/novo$/);
  });

  test('busca por placa em qualquer formato, estado na URL e inativos', async ({ page }) => {
    await montar(
      page,
      novoBanco([
        veic(1, { placa: 'ABC1234', modelo: 'Gol' }),
        veic(2, { placa: 'ABC1D23', modelo: 'Onix', marca: 'Chevrolet', cliente_id: C2 }),
        veic(3, { placa: 'XYZ9876', modelo: 'Uno', marca: 'Fiat', ativo: false })
      ])
    );
    await page.goto('/app/veiculos');
    const linhas = page.getByTestId('veiculos-tabela-linha');
    await expect(linhas).toHaveCount(2);
    await expect(linhas.first()).toContainText('ABC-1234');
    await expect(linhas.first()).toContainText('Ana Souza');

    await page.getByTestId('veiculos-busca').fill('abc-1234');
    await expect(page).toHaveURL(/q=abc-1234/);
    await expect(linhas).toHaveCount(1);
    await expect(linhas.first()).toContainText('Gol');

    await page.getByTestId('veiculos-busca').fill('abc1d23');
    await expect(linhas).toHaveCount(1);
    await expect(linhas.first()).toContainText('Onix');
    await expect(linhas.first()).toContainText('Bruno Lima');

    await page.getByTestId('veiculos-busca').fill('xyz');
    await expect(page.getByTestId('veiculos-vazio')).toContainText('Nenhum veículo encontrado');

    await page.getByTestId('veiculos-inativos').check();
    await expect(page).toHaveURL(/inativos=1/);
    await expect(linhas).toHaveCount(1);
    await expect(linhas.first()).toContainText('Inativo');
  });

  test('paginação de 25 e estado na URL', async ({ page }) => {
    const muitos = Array.from({ length: 30 }, (_, i) =>
      veic(i + 1, { placa: `AAA${String(1000 + i)}`, modelo: `M${i}` })
    );
    await montar(page, novoBanco(muitos));
    await page.goto('/app/veiculos');
    await expect(page.getByTestId('veiculos-tabela-linha')).toHaveCount(25);
    await page.getByTestId('veiculos-paginacao-proxima').click();
    await expect(page).toHaveURL(/pagina=2/);
    await expect(page.getByTestId('veiculos-tabela-linha')).toHaveCount(5);
  });

  test('funcionário só com leitura não vê botão de novo', async ({ page }) => {
    await montar(page, novoBanco([veic(1)]), { papel: 'funcionario', permissoes: { veiculos: 'leitura' } });
    await page.goto('/app/veiculos');
    await expect(page.getByTestId('veiculos-tabela-linha')).toHaveCount(1);
    await expect(page.getByTestId('veiculos-btn-novo')).toHaveCount(0);
    await page.getByTestId('veiculos-link').click();
    await expect(page.getByTestId('veiculos-ficha-placa')).toBeVisible();
    await expect(page.getByTestId('veiculos-btn-editar')).toHaveCount(0);
    await expect(page.getByTestId('veiculos-btn-desativar')).toHaveCount(0);
    await expect(page.getByTestId('veiculos-btn-transferir')).toHaveCount(0);
  });
});

test.describe('cadastro', () => {
  test('valida, escolhe cliente, recusa placa duplicada e salva', async ({ page }) => {
    const banco = novoBanco([veic(1, { placa: 'ABC1234' })]);
    await montar(page, banco);
    await page.goto('/app/veiculos/novo');

    await page.getByTestId('veiculos-btn-salvar').click();
    await expect(page.getByTestId('veiculos-cliente-erro')).toHaveText('Selecione o cliente.');
    await expect(page.getByTestId('veiculos-placa-erro')).toBeVisible();

    await page.getByTestId('veiculos-cliente-busca').fill('bru');
    await page.getByTestId('veiculos-cliente-opcao').filter({ hasText: 'Bruno Lima' }).click();
    await expect(page.getByTestId('veiculos-cliente-nome')).toHaveText('Bruno Lima');

    await page.getByTestId('veiculos-placa').fill('abc12');
    await page.getByTestId('veiculos-marca').fill('Fiat');
    await page.getByTestId('veiculos-modelo').fill('Uno');
    await page.getByTestId('veiculos-btn-salvar').click();
    await expect(page.getByTestId('veiculos-placa-erro')).toContainText('Placa inválida');

    await page.getByTestId('veiculos-placa').fill('abc-1234');
    await page.getByTestId('veiculos-btn-salvar').click();
    await expect(page.getByTestId('veiculos-placa-erro')).toHaveText('Placa já cadastrada');

    await page.getByTestId('veiculos-placa').fill('qwe4r56');
    await page.getByTestId('veiculos-ano').fill('2020');
    await page.getByTestId('veiculos-km').fill('12000');
    await page.getByTestId('veiculos-btn-salvar').click();
    await expect(page.getByTestId('veiculos-ficha-placa')).toHaveText('QWE4R56');
    expect(banco.posts.at(-1)).toMatchObject({ placa: 'QWE4R56', cliente_id: C2, ano: 2020, km_atual: 12000 });
  });

  test('?cliente=ID pré-seleciona o dono', async ({ page }) => {
    await montar(page, novoBanco());
    await page.goto(`/app/veiculos/novo?cliente=${C2}`);
    await expect(page.getByTestId('veiculos-cliente-nome')).toHaveText('Bruno Lima');
  });
});

test.describe('ficha', () => {
  test('mostra dono, histórico reservado; edita com aviso de km menor (sem bloquear)', async ({ page }) => {
    const banco = novoBanco([veic(1)]);
    await montar(page, banco);
    await page.goto(`/app/veiculos/${banco.veiculos[0].id}`);
    await expect(page.getByTestId('veiculos-ficha-placa')).toHaveText('ABC-1234');
    await expect(page.getByTestId('veiculos-ficha-dono')).toHaveAttribute('href', `/app/clientes/${C1}`);
    await expect(page.getByTestId('veiculos-historico')).toContainText('Histórico em breve');

    await page.getByTestId('veiculos-btn-editar').click();
    await expect(page.getByTestId('veiculos-km-aviso')).toHaveCount(0);
    await page.getByTestId('veiculos-km').fill('90000');
    await expect(page.getByTestId('veiculos-km-aviso')).toContainText('menor que a atual');
    await page.getByTestId('veiculos-btn-salvar').click();
    await expect(page.getByTestId('veiculos-ficha-km')).toContainText('90.000');
    expect(banco.patches.at(-1)).toMatchObject({ km_atual: 90000 });
  });

  test('transfere para outro cliente com confirmação e motivo', async ({ page }) => {
    const banco = novoBanco([veic(1)]);
    await montar(page, banco);
    await page.goto(`/app/veiculos/${banco.veiculos[0].id}`);
    await page.getByTestId('veiculos-btn-transferir').click();
    // o dono atual não aparece como opção
    await page.getByTestId('veiculos-novo-dono-busca').fill('ana');
    await expect(page.getByTestId('veiculos-novo-dono-sem-resultado')).toBeVisible();
    await page.getByTestId('veiculos-novo-dono-busca').fill('bru');
    await page.getByTestId('veiculos-novo-dono-opcao').click();
    await page.getByTestId('veiculos-transferir-continuar').click();
    await expect(page.getByTestId('veiculos-confirmar-transferir')).toContainText('Bruno Lima');
    await page.getByTestId('veiculos-confirmar-transferir-motivo').fill('Venda do carro');
    await page.getByTestId('veiculos-confirmar-transferir-confirmar').click();
    await expect(page.getByTestId('veiculos-ficha-dono')).toHaveText('Bruno Lima');
    expect(banco.rpcs).toEqual([{ p_veiculo_id: banco.veiculos[0].id, p_novo_cliente_id: C2 }]);
  });

  test('desativa e reativa com confirmação', async ({ page }) => {
    const banco = novoBanco([veic(1), veic(2, { placa: 'ABC1234', ativo: false })]);
    await montar(page, banco);
    await page.goto(`/app/veiculos/${banco.veiculos[0].id}`);
    await page.getByTestId('veiculos-btn-desativar').click();
    await page.getByTestId('veiculos-confirmar-ativo-confirmar').click();
    await expect(page.getByTestId('veiculos-ficha-situacao')).toHaveText('Inativo');
    expect(banco.patches.at(-1)).toEqual({ ativo: false });
    await page.getByTestId('veiculos-btn-reativar').click();
    await page.getByTestId('veiculos-confirmar-ativo-confirmar').click();
    await expect(page.getByTestId('veiculos-ficha-situacao')).toHaveText('Ativo');
  });

  test('veículo inexistente mostra aviso amigável', async ({ page }) => {
    await montar(page, novoBanco());
    await page.goto('/app/veiculos/aaaaaaaa-aaaa-4aaa-8aaa-999999999999');
    await expect(page.getByTestId('veiculos-ficha-erro')).toContainText('Veículo não encontrado');
  });
});

test.describe('celular 375 px', () => {
  test.use({ viewport: { width: 375, height: 700 } });

  test('lista e formulário sem rolagem horizontal', async ({ page }) => {
    await montar(page, novoBanco([veic(1, { modelo: 'Modelo com nome bem comprido para testar' })]));
    for (const rota of ['/app/veiculos', '/app/veiculos/novo']) {
      await page.goto(rota);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      const transborda = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
      expect(transborda).toBe(false);
    }
  });
});
