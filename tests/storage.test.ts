import { afterEach, describe, expect, it, vi } from 'vitest';
import { verificarCompatibilidade } from '../src/lib/storage';

const chrome = 'Mozilla/5.0 Chrome/120.0 Safari/537.36';

function simular(nav: object) {
  vi.stubGlobal('navigator', nav);
  vi.stubGlobal('Worker', class {});
}

describe('verificarCompatibilidade', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('tudo presente => ok', () => {
    simular({ locks: {}, storage: { getDirectory: () => {} }, userAgent: chrome });
    const r = verificarCompatibilidade();
    expect(r.ok).toBe(true);
    expect(r.faltando).toEqual([]);
  });

  it('sem locks => faltando contém Web Locks', () => {
    simular({ storage: { getDirectory: () => {} }, userAgent: chrome });
    const r = verificarCompatibilidade();
    expect(r.ok).toBe(false);
    expect(r.faltando).toContain('Web Locks');
  });
});
