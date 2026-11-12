import { test, expect } from '@playwright/test';

const paginas: [string, boolean][] = [
  ['/', false],
  ['/precos', false],
  ['/termos', true],
  ['/privacidade', true]
];

for (const [rota, legal] of paginas) {
  test(`${rota} abre sem sessão`, async ({ page }) => {
    await page.goto(rota);
    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
    await expect(page).toHaveTitle(/Mecanica Systems/);
    if (legal) await expect(page.getByText('RASCUNHO — sujeito a revisão jurídica')).toBeVisible();
  });
}

test('menu leva às âncoras e links de conta existem', async ({ page }) => {
  await page.goto('/');
  const nav = page.getByRole('navigation', { name: 'Principal' });
  await nav.getByRole('link', { name: 'Recursos' }).click();
  await expect(page).toHaveURL(/#recursos$/);
  await nav.getByRole('link', { name: 'Como funciona' }).click();
  await expect(page).toHaveURL(/#como-funciona$/);
  await expect(page.getByRole('link', { name: 'Entrar' })).toHaveAttribute('href', '/entrar');
  await expect(page.getByRole('link', { name: 'Criar conta' }).first()).toHaveAttribute('href', '/cadastro');
});
