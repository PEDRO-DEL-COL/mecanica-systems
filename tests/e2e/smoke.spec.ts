import { test, expect } from '@playwright/test';

test('landing abre', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Mecanica Systems' })).toBeVisible();
});

test('/app abre (fallback SPA)', async ({ page }) => {
  await page.goto('/app');
  await expect(page.getByRole('heading', { name: 'App' })).toBeVisible();
});
