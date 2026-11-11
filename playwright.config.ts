import { defineConfig } from '@playwright/test';
import { existsSync } from 'node:fs';

// Usa Chrome ou Edge instalados (Windows) se existirem; senao o Chromium do Playwright.
const chrome = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
].some(existsSync);
const edge = existsSync('C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe');
export const canal: 'chrome' | 'msedge' | undefined = chrome ? 'chrome' : edge ? 'msedge' : undefined;

export default defineConfig({
  testDir: './tests/e2e',
  workers: 1,
  timeout: 60_000,
  reporter: 'list',
  use: { baseURL: 'http://localhost:4173' },
  webServer: {
    command: 'npm run build && npm run preview -- --port 4173 --strictPort',
    port: 4173,
    reuseExistingServer: true,
    timeout: 180_000,
  },
  projects: [{ name: 'chromium', use: { channel: canal } }],
});
