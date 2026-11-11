import { test, expect } from '@playwright/test';
import { abrir, novoDir, removerDir, URL } from './helpers';

test('clientes e veiculos: criar, buscar por placa, duplicada e persistencia', async () => {
  const dir = novoDir();
  try {
    let ctx = await abrir(dir);
    let page = await ctx.newPage();
    page.on('dialog', (d) => d.accept());
    await page.goto(URL);
    await expect(page.getByTestId('contagem-clientes')).toHaveText('0');

    await page.getByTestId('aba-clientes').click();
    await page.getByTestId('btn-novo-cliente').click();
    await page.getByTestId('cliente-nome').fill('Maria da Silva');
    await page.getByTestId('cliente-telefone').fill('(11) 98888-7777');
    await page.getByTestId('btn-salvar-cliente').click();
    await expect(page.getByTestId('msg-cliente')).toBeVisible();

    await page.getByTestId('btn-add-veiculo').click();
    await page.getByTestId('veiculo-placa').fill('abc-1d23');
    await page.getByTestId('veiculo-modelo').fill('Onix');
    await page.getByTestId('btn-salvar-veiculo').click();
    await expect(page.getByTestId('veiculo-item-placa')).toHaveText('ABC1D23');

    // Busca global (minuscula, com hifen) mostra veiculo + dono.
    await page.getByTestId('busca-placa').fill('abc-1d2');
    await expect(page.getByTestId('resultado-placa-placa')).toHaveText('ABC1D23');
    await expect(page.getByTestId('resultado-placa-dono')).toHaveText('Maria da Silva');

    // Placa duplicada (outro cliente).
    await page.getByTestId('btn-novo-cliente').click();
    await page.getByTestId('cliente-nome').fill('Joao Pereira');
    await page.getByTestId('btn-salvar-cliente').click();
    await expect(page.getByTestId('btn-add-veiculo')).toBeVisible();
    await page.getByTestId('btn-add-veiculo').click();
    await page.getByTestId('veiculo-placa').fill('ABC1D23');
    await page.getByTestId('btn-salvar-veiculo').click();
    await expect(page.getByTestId('erro-veiculo')).toHaveText('Placa já cadastrada');
    await ctx.close();

    // Reabre o navegador: dados persistem.
    ctx = await abrir(dir);
    page = await ctx.newPage();
    await page.goto(URL);
    await expect(page.getByTestId('contagem-clientes')).toHaveText('2');
    await page.getByTestId('busca-placa').fill('ABC-1D23');
    await expect(page.getByTestId('resultado-placa-dono')).toHaveText('Maria da Silva');
    await page.getByTestId('aba-veiculos').click();
    await expect(page.getByTestId('tabela-veiculos')).toContainText('ABC1D23');
    await ctx.close();
  } finally {
    removerDir(dir);
  }
});