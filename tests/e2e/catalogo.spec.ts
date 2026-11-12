import { test, expect } from '@playwright/test';
import { abrir, novoDir, removerDir, URL } from './helpers';

test('catalogo: servico, peca, codigo duplicado, estoque baixo, inativar e persistencia', async () => {
  const dir = novoDir();
  try {
    let ctx = await abrir(dir);
    let page = await ctx.newPage();
    page.on('dialog', (d) => d.accept());
    await page.goto(URL);
    await page.getByTestId('aba-catalogo').click();
    await expect(page.getByTestId('cat-vazio')).toBeVisible();

    // Servico
    await page.getByTestId('cat-btn-novo').click();
    await page.getByTestId('cat-descricao').fill('Troca de óleo');
    await page.getByTestId('cat-venda').fill('150');
    await page.getByTestId('cat-btn-salvar').click();
    await expect(page.getByTestId('cat-msg')).toBeVisible();
    await expect(page.getByTestId('cat-item-preco')).toHaveText('R$ 150,00');

    // Peca com valor formatado e margem
    await page.getByTestId('cat-aba-peca').click();
    await page.getByTestId('cat-btn-novo').click();
    await page.getByTestId('cat-codigo').fill('FO-100');
    await page.getByTestId('cat-descricao').fill('Filtro de óleo');
    await page.getByTestId('cat-custo').fill('1000');
    await page.getByTestId('cat-venda').fill('1.234,56');
    await page.getByTestId('cat-estoque-atual').fill('10');
    await page.getByTestId('cat-estoque-minimo').fill('3');
    await expect(page.getByTestId('cat-margem')).toContainText('R$ 234,56');
    await page.getByTestId('cat-btn-salvar').click();
    await expect(page.getByTestId('cat-msg')).toBeVisible();
    await expect(page.getByTestId('cat-item-preco')).toHaveText('R$ 1.234,56');
    await expect(page.getByTestId('cat-badge-baixo')).toHaveCount(0);

    // Codigo duplicado
    await page.getByTestId('cat-btn-novo').click();
    await page.getByTestId('cat-codigo').fill('fo-100');
    await page.getByTestId('cat-descricao').fill('Outro filtro');
    await page.getByTestId('cat-venda').fill('10');
    await page.getByTestId('cat-btn-salvar').click();
    await expect(page.getByTestId('cat-erro')).toHaveText('Código já cadastrado');

    // Peca abaixo do minimo
    await page.getByTestId('cat-codigo').fill('PA-200');
    await page.getByTestId('cat-descricao').fill('Pastilha de freio');
    await page.getByTestId('cat-estoque-atual').fill('2');
    await page.getByTestId('cat-estoque-minimo').fill('4');
    await page.getByTestId('cat-btn-salvar').click();
    await expect(page.getByTestId('cat-msg')).toBeVisible();
    await expect(page.getByTestId('cat-badge-baixo')).toHaveCount(1);
    await page.getByTestId('cat-aba-baixo').click();
    await expect(page.getByTestId('cat-item')).toHaveCount(1);
    await expect(page.getByTestId('cat-item-desc')).toHaveText('Pastilha de freio');

    // Inativar some da lista
    await page.getByTestId('cat-aba-peca').click();
    await page.getByTestId('cat-item').filter({ hasText: 'Pastilha' }).click();
    await page.getByTestId('cat-btn-inativar').click();
    await expect(page.getByTestId('cat-item')).toHaveCount(1);
    await expect(page.getByTestId('cat-item-desc')).toHaveText('Filtro de óleo');
    await ctx.close();

    // Reabre: persiste
    ctx = await abrir(dir);
    page = await ctx.newPage();
    await page.goto(URL);
    await page.getByTestId('aba-catalogo').click();
    await expect(page.getByTestId('cat-item-preco')).toHaveText('R$ 150,00');
    await page.getByTestId('cat-aba-peca').click();
    await expect(page.getByTestId('cat-item')).toHaveCount(1);
    await expect(page.getByTestId('cat-item-preco')).toHaveText('R$ 1.234,56');
    await page.getByTestId('cat-chk-inativos').check();
    await expect(page.getByTestId('cat-item')).toHaveCount(2);
    await ctx.close();
  } finally {
    removerDir(dir);
  }
});
