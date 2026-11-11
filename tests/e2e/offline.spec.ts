import { test, expect } from '@playwright/test';
import { abrir, novoDir, removerDir, URL } from './helpers';

test('app carrega offline apos service worker ativo', async () => {
  const dir = novoDir();
  try {
    const ctx = await abrir(dir);
    const page = await ctx.newPage();
    await page.goto(URL);
    await expect(page.getByRole('heading', { name: 'Mecanica Systems' })).toBeVisible();
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
    });
    // Garante que o SW controla a pagina (autoUpdate pode recarregar na primeira ativacao).
    await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller), { timeout: 20_000 }).toBe(true);
    await ctx.setOffline(true);
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Mecanica Systems' })).toBeVisible();
    await ctx.close();
  } finally {
    removerDir(dir);
  }
});
