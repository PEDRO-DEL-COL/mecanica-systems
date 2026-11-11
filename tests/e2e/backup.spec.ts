import { test, expect } from '@playwright/test';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { abrir, novoDir, removerDir, URL } from './helpers';

test('exportar, importar e rejeitar arquivo invalido', async () => {
  const dir = novoDir();
  try {
    const ctx = await abrir(dir);
    const page = await ctx.newPage();
    page.on('dialog', (d) => d.accept());
    await page.goto(URL);
    const cont = page.getByTestId('contagem-clientes');
    await expect(cont).toHaveText('0');

    await page.getByTestId('btn-gravar-teste').click();
    await expect(cont).toHaveText('1');

    const [dl] = await Promise.all([page.waitForEvent('download'), page.getByTestId('btn-exportar').click()]);
    const backup = join(dir, 'backup.sqlite');
    await dl.saveAs(backup);
    await expect(page.getByTestId('msg-backup')).toContainText('Backup exportado');

    await page.getByTestId('btn-gravar-teste').click();
    await expect(cont).toHaveText('2');

    // Importar: o app baixa um backup automatico antes de substituir.
    const [auto] = await Promise.all([
      page.waitForEvent('download'),
      page.getByTestId('input-importar').setInputFiles(backup),
    ]);
    await auto.saveAs(join(dir, 'auto.sqlite'));
    await expect(page.getByTestId('msg-backup')).toContainText('importado com sucesso');
    await expect(cont).toHaveText('1');

    // Arquivo invalido.
    const ruim = join(dir, 'invalido.sqlite');
    writeFileSync(ruim, 'isto nao e um banco sqlite');
    await page.getByTestId('input-importar').setInputFiles(ruim);
    await expect(page.getByTestId('erro-backup')).toBeVisible();
    await expect(cont).toHaveText('1');
    await ctx.close();
  } finally {
    removerDir(dir);
  }
});
