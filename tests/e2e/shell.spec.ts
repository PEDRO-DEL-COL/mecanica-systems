import { test, expect } from '@playwright/test';
import { mockSupabase } from './apoio/supabase-mock';

const TODOS = [
  'Clientes',
  'Veículos',
  'Catálogo',
  'Estoque',
  'Ordens de serviço',
  'Caixa',
  'Financeiro',
  'Equipe',
  'Configurações'
];

test.describe('guarda', () => {
  test('sem sessão vai a /entrar', async ({ page }) => {
    await mockSupabase(page, { sessao: false });
    await page.goto('/app/clientes');
    await expect(page).toHaveURL(/\/entrar$/);
  });

  test('sem oficina vai a /onboarding', async ({ page }) => {
    await mockSupabase(page, { oficina: null });
    await page.goto('/app');
    await expect(page).toHaveURL(/\/onboarding$/);
    await expect(page.getByRole('heading', { name: 'Cadastre sua oficina' })).toBeVisible();
  });

  test('com oficina, /onboarding volta ao app', async ({ page }) => {
    await mockSupabase(page);
    await page.goto('/onboarding');
    await expect(page).toHaveURL(/\/app$/);
  });
});

test.describe('onboarding', () => {
  test('cria a oficina e entra no app', async ({ page }) => {
    const mock = await mockSupabase(page, { oficina: null });
    await page.goto('/onboarding');
    await page.getByTestId('onb-nome').fill('Auto Mecânica Silva');
    await page.getByTestId('onb-documento').fill('123.456.789-09');
    await page.getByRole('button', { name: 'Criar oficina' }).click();
    await expect(page).toHaveURL(/\/app$/);
    await expect(page.getByTestId('oficina-nome')).toHaveText('Auto Mecânica Silva');
    expect(mock.criarOficinaChamadas).toEqual([{ p_nome: 'Auto Mecânica Silva', p_documento: '12345678909' }]);
  });

  test('valida nome e documento em pt-BR', async ({ page }) => {
    await mockSupabase(page, { oficina: null });
    await page.goto('/onboarding');
    await page.getByRole('button', { name: 'Criar oficina' }).click();
    await expect(page.getByText('Informe o nome da oficina.')).toBeVisible();
    await page.getByTestId('onb-nome').fill('Oficina X');
    await page.getByTestId('onb-documento').fill('123');
    await page.getByRole('button', { name: 'Criar oficina' }).click();
    await expect(page.getByText(/11 dígitos \(CPF\)/)).toBeVisible();
  });

  test('erro do servidor aparece em pt-BR', async ({ page }) => {
    await mockSupabase(page, {
      oficina: null,
      erroCriarOficina: { code: '42501', message: 'Confirme seu e-mail antes de cadastrar a oficina.' }
    });
    await page.goto('/onboarding');
    await page.getByTestId('onb-nome').fill('Oficina X');
    await page.getByRole('button', { name: 'Criar oficina' }).click();
    await expect(page.getByTestId('onb-erro')).toHaveText('Confirme seu e-mail antes de cadastrar a oficina.');
    await expect(page).toHaveURL(/\/onboarding$/);
  });
});

test.describe('shell e permissões', () => {
  test('dono vê todas as áreas e o nome da oficina', async ({ page }) => {
    await mockSupabase(page, { papel: 'dono' });
    await page.goto('/app');
    await expect(page.getByTestId('oficina-nome')).toHaveText('Oficina Teste');
    const links = page.getByRole('navigation', { name: 'Principal' }).getByRole('link');
    await expect(links).toHaveText(TODOS);
    await page.goto('/app/financeiro');
    await expect(page.getByRole('heading', { name: 'Financeiro' })).toBeVisible();
    await expect(page.getByText('Em construção')).toBeVisible();
  });

  test('caixa tem rota própria', async ({ page }) => {
    await mockSupabase(page, { papel: 'funcionario', permissoes: { caixa: 'escrita' } });
    await page.goto('/app/caixa');
    await expect(page.getByRole('heading', { name: 'Caixa' })).toBeVisible();
  });

  test('funcionário só com clientes/leitura vê só Clientes; outra área mostra sem acesso', async ({ page }) => {
    await mockSupabase(page, { papel: 'funcionario', permissoes: { clientes: 'leitura' } });
    await page.goto('/app/clientes');
    const links = page.getByRole('navigation', { name: 'Principal' }).getByRole('link');
    await expect(links).toHaveText(['Clientes']);
    await expect(page.getByRole('heading', { name: 'Clientes' })).toBeVisible();

    await page.goto('/app/ordens');
    await expect(page.getByText('Você não tem acesso a esta área')).toBeVisible();
    await expect(page.getByText('Em construção')).toHaveCount(0);
    // continua dentro do shell
    await expect(page.getByTestId('oficina-nome')).toBeVisible();
  });

  test('Sair encerra a sessão e vai a /entrar', async ({ page }) => {
    await mockSupabase(page);
    await page.goto('/app');
    await page.getByTestId('menu-usuario').click();
    await page.getByRole('menuitem', { name: 'Sair' }).click();
    await expect(page).toHaveURL(/\/entrar$/);
  });
});

test.describe('celular 375 px', () => {
  test.use({ viewport: { width: 375, height: 700 } });

  test('gaveta abre, navega e fecha', async ({ page }) => {
    await mockSupabase(page, { papel: 'funcionario', permissoes: { clientes: 'leitura', veiculos: 'escrita' } });
    await page.goto('/app');
    const nav = page.getByRole('navigation', { name: 'Principal' });
    await expect(nav).toBeHidden();

    await page.getByRole('button', { name: 'Abrir menu' }).click();
    await expect(nav.getByRole('link', { name: 'Clientes' })).toBeVisible();
    await expect(nav.getByRole('link', { name: 'Veículos' })).toBeVisible();

    await nav.getByRole('link', { name: 'Veículos' }).click();
    await expect(page).toHaveURL(/\/app\/veiculos$/);
    await expect(page.getByRole('heading', { name: 'Veículos' })).toBeVisible();
    await expect(nav).toBeHidden();

    // sem rolagem horizontal
    const transborda = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    expect(transborda).toBe(false);
  });

  test('Escape fecha a gaveta', async ({ page }) => {
    await mockSupabase(page);
    await page.goto('/app');
    await page.getByRole('button', { name: 'Abrir menu' }).click();
    const nav = page.getByRole('navigation', { name: 'Principal' });
    await expect(nav).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(nav).toBeHidden();
  });
});
