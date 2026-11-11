import { test, expect } from '@playwright/test';
import { abrir, novoDir, removerDir, URL } from './helpers';

test('dados persistem apos fechar e reabrir o navegador', async () => {
  const dir = novoDir();
  try {
    let ctx = await abrir(dir);
    let page = await ctx.newPage();
    await page.goto(URL);
    await expect(page.getByTestId('contagem-clientes')).toHaveText('0');
    await page.getByTestId('btn-gravar-teste').click();
    await expect(page.getByTestId('contagem-clientes')).toHaveText('1');
    await ctx.close();

    ctx = await abrir(dir);
    page = await ctx.newPage();
    await page.goto(URL);
    await expect(page.getByTestId('contagem-clientes')).toHaveText('1');
    await ctx.close();
  } finally {
    removerDir(dir);
  }
});
