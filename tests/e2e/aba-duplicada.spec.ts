import { test, expect } from '@playwright/test';
import { abrir, novoDir, removerDir, URL } from './helpers';

test('segunda aba mostra aviso e nao cria banco', async () => {
  const dir = novoDir();
  try {
    const ctx = await abrir(dir);
    const p1 = await ctx.newPage();
    await p1.goto(URL);
    await expect(p1.getByTestId('contagem-clientes')).toBeVisible();
    const p2 = await ctx.newPage();
    await p2.goto(URL);
    await expect(p2.getByText('Sistema já aberto em outra aba')).toBeVisible();
    await expect(p2.getByTestId('erro-banco')).toHaveCount(0);
    await ctx.close();
  } finally {
    removerDir(dir);
  }
});
