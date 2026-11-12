import { defineConfig } from '@playwright/test';
import { existsSync } from 'node:fs';

const chrome = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'
].some(existsSync);
const edge = existsSync('C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe');
const channel = chrome ? 'chrome' : edge ? 'msedge' : undefined;

export default defineConfig({
  testDir: 'tests/e2e',
  use: { baseURL: 'http://localhost:4173', channel },
  webServer: {
    command: 'npm run build && npm run preview -- --port 4173 --strictPort',
    port: 4173,
    reuseExistingServer: false,
    timeout: 180_000
  }
});
