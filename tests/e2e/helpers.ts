import { chromium, type BrowserContext } from '@playwright/test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { canal } from '../../playwright.config';

export const URL = 'http://localhost:4173/';

export function novoDir(): string {
  return mkdtempSync(join(tmpdir(), 'mecanica-e2e-'));
}
export function removerDir(d: string) {
  try { rmSync(d, { recursive: true, force: true }); } catch {}
}
export function abrir(userDataDir: string): Promise<BrowserContext> {
  return chromium.launchPersistentContext(userDataDir, { channel: canal, acceptDownloads: true });
}
