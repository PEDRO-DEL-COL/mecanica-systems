import { defineConfig } from '@playwright/test';
import { existsSync } from 'node:fs';

const chrome = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'
].some(existsSync);
const edge = existsSync('C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe');
const channel = chrome ? 'chrome' : edge ? 'msedge' : undefined;

// Porta configurável (E2E_PORT) para vários agentes/execuções em paralelo não colidirem.
const porta = Number(process.env.E2E_PORT ?? 4173);

export default defineConfig({
  testDir: 'tests/e2e',
  use: { baseURL: `http://localhost:${porta}`, channel },
  webServer: {
    command: `npm run build && npm run preview -- --port ${porta} --strictPort`,
    port: porta,
    reuseExistingServer: false,
    timeout: 180_000
  }
});
