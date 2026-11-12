import { test, expect } from '@playwright/test';

test.describe('kit de UI (vitrine)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/ui-vitrine');
    await expect(page.getByTestId('ui-vitrine')).toBeVisible();
  });

  test('renderiza todos os componentes e e noindex', async ({ page }) => {
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex');
    for (const id of [
      'ui-botao',
      'vitrine-nome',
      'ui-campo-dinheiro',
      'ui-selecao',
      'ui-tabela',
      'ui-paginacao',
      'ui-busca',
      'ui-estado-vazio',
      'ui-carregando',
      'ui-etiqueta',
      'ui-toasts',
      'ui-dialogo'
    ]) {
      await expect(page.getByTestId(id).first(), id).toBeAttached();
    }
    await expect(page.getByTestId('ui-tabela-vazia-vazio')).toBeVisible();
  });

  test('dialogo abre, fecha com Esc e devolve o foco', async ({ page }) => {
    const abrir = page.getByTestId('vitrine-abrir-dialogo');
    await abrir.focus();
    await page.keyboard.press('Enter');
    const dialogo = page.getByRole('dialog', { name: 'Exemplo de diálogo' });
    await expect(dialogo).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dialogo).toBeHidden();
    await expect(abrir).toBeFocused();
  });

  test('confirmar com motivo obrigatorio', async ({ page }) => {
    await page.getByTestId('vitrine-abrir-motivo').click();
    await page.getByTestId('ui-confirmar-motivo-confirmar').click();
    await expect(page.getByTestId('ui-confirmar-motivo-motivo-erro')).toHaveText('Informe o motivo.');
    await page.getByTestId('ui-confirmar-motivo-motivo').fill('Cliente desistiu');
    await page.getByTestId('ui-confirmar-motivo-confirmar').click();
    await expect(page.getByTestId('vitrine-motivo')).toHaveText('Motivo: Cliente desistiu');
  });

  test('toast aparece e fecha', async ({ page }) => {
    await page.getByTestId('vitrine-toast').click();
    const t = page.getByTestId('ui-toast');
    await expect(t).toContainText('Salvo com sucesso.');
    await t.getByRole('button', { name: 'Fechar aviso' }).click();
    await expect(t).toHaveCount(0);
  });

  test('CampoDinheiro formata em reais e guarda centavos', async ({ page }) => {
    const campo = page.getByTestId('ui-campo-dinheiro');
    await campo.fill('1234,56');
    await campo.blur();
    await expect(campo).toHaveValue('R$ 1.234,56');
    await expect(page.getByTestId('vitrine-centavos')).toHaveText('Centavos: 123456');
  });

  test('busca com debounce e ordenacao da tabela', async ({ page }) => {
    await page.getByTestId('ui-busca').fill('Ana');
    await expect(page.getByTestId('vitrine-ultima-busca')).toHaveText('Última busca: Ana');
    await page.getByTestId('ui-tabela-ordenar-nome').click();
    await page.getByTestId('ui-tabela-ordenar-nome').click();
    await expect(page.getByTestId('ui-tabela-linha').first()).toContainText('Davi Prado');
  });
});
