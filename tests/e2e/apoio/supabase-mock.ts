import { existsSync, readFileSync } from 'node:fs';
import type { Page, Route } from '@playwright/test';

/** Mock do Supabase para E2E sem backend: intercepta auth e REST e simula sessão, oficina e permissões. */

export interface ConfigMock {
  /** Usuário logado? Padrão: true. */
  sessao?: boolean;
  email?: string;
  /** null = usuário sem oficina (vai a /onboarding). */
  oficina?: { nome: string; documento?: string | null } | null;
  papel?: 'dono' | 'funcionario';
  /** area -> nivel (só vale para funcionário). */
  permissoes?: Record<string, 'leitura' | 'escrita'>;
  /** Faz a RPC criar_oficina falhar com este erro do PostgREST. */
  erroCriarOficina?: { code: string; message: string };
}

export interface MockSupabase {
  /** Corpos das chamadas à RPC criar_oficina. */
  criarOficinaChamadas: unknown[];
}

const USER_ID = '00000000-0000-4000-8000-0000000000a1';
const ORG_ID = '00000000-0000-4000-8000-0000000000b1';
const MEMBRO_ID = '00000000-0000-4000-8000-0000000000c1';

function urlSupabase(): string {
  if (process.env.PUBLIC_SUPABASE_URL) return process.env.PUBLIC_SUPABASE_URL;
  for (const arq of ['.env.local', '.env', '.env.example']) {
    if (!existsSync(arq)) continue;
    const m = /^PUBLIC_SUPABASE_URL=(.+)$/m.exec(readFileSync(arq, 'utf8'));
    if (m) return m[1].trim().replace(/^["']|["']$/g, '');
  }
  throw new Error('PUBLIC_SUPABASE_URL não encontrada (.env.local).');
}

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': 'GET, POST, PATCH, DELETE, OPTIONS',
  'access-control-expose-headers': '*'
};

function json(route: Route, corpo: unknown, status = 200) {
  return route.fulfill({
    status,
    headers: { ...CORS, 'content-type': 'application/json' },
    body: JSON.stringify(corpo)
  });
}

export async function mockSupabase(page: Page, cfg: ConfigMock = {}): Promise<MockSupabase> {
  const base = urlSupabase().replace(/\/+$/, '');
  const ref = new URL(base).hostname.split('.')[0];
  const chave = `sb-${ref}-auth-token`;
  const email = cfg.email ?? 'ana@oficina.test';
  const papel = cfg.papel ?? 'dono';
  let oficina = cfg.oficina === undefined ? { nome: 'Oficina Teste', documento: null } : cfg.oficina;
  const estado: MockSupabase = { criarOficinaChamadas: [] };

  const usuario = {
    id: USER_ID,
    aud: 'authenticated',
    role: 'authenticated',
    email,
    app_metadata: {},
    user_metadata: {},
    created_at: '2026-01-01T00:00:00Z'
  };

  if (cfg.sessao !== false) {
    await page.addInitScript(
      ({ chave, usuario }) => {
        try {
          // Semeia uma vez: após "Sair", um reload não recria a sessão.
          if (localStorage.getItem('__mock_semeado')) return;
          localStorage.setItem('__mock_semeado', '1');
          localStorage.setItem(
            chave,
            JSON.stringify({
              access_token: 'mock.access.token',
              refresh_token: 'mock-refresh',
              token_type: 'bearer',
              expires_in: 86400,
              expires_at: Math.floor(Date.now() / 1000) + 86400,
              user: usuario
            })
          );
        } catch {
          /* sem storage */
        }
      },
      { chave, usuario }
    );
  }

  await page.route(
    (u) => u.href.startsWith(base + '/'),
    async (route) => {
      const req = route.request();
      if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
      const caminho = new URL(req.url()).pathname;

      if (caminho === '/auth/v1/logout') return route.fulfill({ status: 204, headers: CORS });
      if (caminho === '/auth/v1/user') return json(route, usuario);

      if (caminho === '/rest/v1/membro') {
        if (!oficina) return json(route, []);
        return json(route, [
          {
            id: MEMBRO_ID,
            org_id: ORG_ID,
            papel,
            organizacao: { id: ORG_ID, nome: oficina.nome, documento: oficina.documento ?? null }
          }
        ]);
      }
      if (caminho === '/rest/v1/membro_permissao') {
        return json(
          route,
          Object.entries(cfg.permissoes ?? {}).map(([area, nivel]) => ({ area, nivel }))
        );
      }
      if (caminho === '/rest/v1/rpc/criar_oficina') {
        const corpo = req.postDataJSON() as { p_nome: string; p_documento?: string | null };
        estado.criarOficinaChamadas.push(corpo);
        if (cfg.erroCriarOficina) {
          return json(route, { ...cfg.erroCriarOficina, details: null, hint: null }, 400);
        }
        oficina = { nome: corpo.p_nome, documento: corpo.p_documento ?? null };
        return json(route, ORG_ID);
      }
      return json(route, { code: 'PGRST205', message: 'Rota não simulada: ' + caminho }, 404);
    }
  );

  return estado;
}
