import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

// Host do Supabase vem do .env.local (mesmo valor embutido no build).
const urlSupabase = /PUBLIC_SUPABASE_URL=(\S+)/.exec(readFileSync('.env.local', 'utf8'))?.[1] ?? '';
const host = new URL(urlSupabase).hostname;
const chave = `sb-${host.split('.')[0]}-auth-token`;

const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
const agora = () => Math.floor(Date.now() / 1000);

function sessaoFalsa() {
  const exp = agora() + 3600;
  const jwt = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: 'u1', role: 'authenticated', exp })}.assinatura`;
  return {
    access_token: jwt,
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: exp,
    refresh_token: 'refresh-falso',
    user: { id: 'u1', aud: 'authenticated', role: 'authenticated', email: 'ana@x.com', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' }
  };
}

interface Chamada {
  caminho: string;
  corpo: unknown;
}

/** Intercepta toda a rede do Supabase; `resposta` decide o retorno por caminho. */
async function simular(
  page: Page,
  resposta: (c: Chamada) => { status: number; corpo: unknown } = () => ({ status: 200, corpo: {} })
) {
  const chamadas: Chamada[] = [];
  await page.route(`https://${host}/**`, async (route) => {
    const req = route.request();
    const u = new URL(req.url());
    let corpo: unknown = null;
    try {
      corpo = req.postDataJSON();
    } catch {
      corpo = null;
    }
    const c = { caminho: u.pathname + u.search, corpo };
    chamadas.push(c);
    const r = resposta(c);
    await route.fulfill({
      status: r.status,
      contentType: 'application/json',
      headers: { 'access-control-allow-origin': '*' },
      body: JSON.stringify(r.corpo)
    });
  });
  return chamadas;
}

/** Navega e espera a hidratação (clicar antes dela faria um submit nativo e recarregaria a página). */
async function abrir(page: Page, rota: string) {
  await page.goto(rota);
  await page.waitForLoadState('networkidle');
}

test.describe('entrar', () => {
  test('validações aparecem com aria-describedby e foco no primeiro erro', async ({ page }) => {
    await simular(page);
    await abrir(page, '/entrar');
    await page.getByTestId('auth-enviar').click();
    const email = page.getByTestId('auth-email');
    await expect(email).toBeFocused();
    await expect(email).toHaveAttribute('aria-invalid', 'true');
    await expect(page.getByTestId('auth-email-erro')).toHaveText('Informe o e-mail.');
    await expect(page.getByTestId('auth-senha-erro')).toHaveText('Informe a senha.');
    const id = await page.getByTestId('auth-email-erro').getAttribute('id');
    await expect(email).toHaveAttribute('aria-describedby', id!);
    await page.getByRole('link', { name: 'Criar conta' }).last().click();
    await expect(page).toHaveURL(/\/cadastro$/);
  });

  test('credenciais erradas mostram mensagem genérica', async ({ page }) => {
    await simular(page, () => ({
      status: 400,
      corpo: { code: 'invalid_credentials', error_code: 'invalid_credentials', msg: 'Invalid login credentials' }
    }));
    await abrir(page, '/entrar');
    await page.getByTestId('auth-email').fill('quem@x.com');
    await page.getByTestId('auth-senha').fill('qualquer');
    await page.getByTestId('auth-enviar').click();
    await expect(page.getByTestId('auth-erro-geral')).toHaveText('E-mail ou senha incorretos.');
    await expect(page.getByTestId('auth-enviar')).toBeEnabled();
  });

  test('falha de rede mostra mensagem de conexão', async ({ page }) => {
    await page.route(`https://${host}/**`, (r) => r.abort('failed'));
    await abrir(page, '/entrar');
    await page.getByTestId('auth-email').fill('quem@x.com');
    await page.getByTestId('auth-senha').fill('qualquer');
    await page.getByTestId('auth-enviar').click();
    await expect(page.getByTestId('auth-erro-geral')).toContainText('Sem conexão');
  });

  test('login válido redireciona para /app e envia uma só chamada (sem duplo envio)', async ({ page }) => {
    const chamadas = await simular(page, (c) =>
      c.caminho.includes('grant_type=password') ? { status: 200, corpo: sessaoFalsa() } : { status: 200, corpo: [] }
    );
    await abrir(page, '/entrar');
    await page.getByTestId('auth-email').fill('Ana@X.com');
    await page.getByTestId('auth-senha').fill('senha-boa-123');
    const botao = page.getByTestId('auth-enviar');
    await botao.dblclick();
    await expect(page).toHaveURL(/\/(app|onboarding)/);
    const logins = chamadas.filter((c) => c.caminho.includes('grant_type=password'));
    expect(logins).toHaveLength(1);
    expect((logins[0].corpo as { email: string }).email).toBe('ana@x.com');
  });

  test('usuário já logado é redirecionado para /app', async ({ page }) => {
    await simular(page, () => ({ status: 200, corpo: [] }));
    await page.addInitScript(([k, s]) => localStorage.setItem(k, s), [chave, JSON.stringify(sessaoFalsa())]);
    await abrir(page, '/entrar');
    await expect(page).toHaveURL(/\/(app|onboarding)/);
  });
});

test.describe('cadastro', () => {
  test('valida senha curta e confirmação diferente', async ({ page }) => {
    await simular(page);
    await abrir(page, '/cadastro');
    await page.getByTestId('auth-nome').fill('Ana');
    await page.getByTestId('auth-email').fill('ana@x.com');
    await page.getByTestId('auth-senha').fill('1234567');
    await page.getByTestId('auth-confirmacao').fill('outra');
    await page.getByTestId('auth-enviar').click();
    await expect(page.getByTestId('auth-senha')).toBeFocused();
    await expect(page.getByTestId('auth-senha-erro')).toContainText('pelo menos 8 caracteres');
    await page.getByTestId('auth-senha').fill('12345678');
    await page.getByTestId('auth-enviar').click();
    await expect(page.getByTestId('auth-confirmacao-erro')).toHaveText('As senhas não conferem.');
    await page.getByRole('link', { name: 'Entrar' }).last().click();
    await expect(page).toHaveURL(/\/entrar$/);
  });

  test('cadastro válido envia nome e mostra aviso de confirmar e-mail', async ({ page }) => {
    const chamadas = await simular(page, (c) =>
      c.caminho.includes('/signup')
        ? { status: 200, corpo: { id: 'u2', aud: 'authenticated', email: 'ana@x.com', identities: [{}], user_metadata: {} } }
        : { status: 200, corpo: [] }
    );
    await abrir(page, '/cadastro');
    await page.getByTestId('auth-nome').fill('Ana Souza');
    await page.getByTestId('auth-email').fill('ana@x.com');
    await page.getByTestId('auth-senha').fill('12345678');
    await page.getByTestId('auth-confirmacao').fill('12345678');
    await page.getByTestId('auth-enviar').click();
    await expect(page.getByTestId('auth-confirme-email')).toContainText('Confirme seu e-mail');
    const s = chamadas.find((c) => c.caminho.includes('/signup'));
    expect((s?.corpo as { data: { nome: string } }).data.nome).toBe('Ana Souza');
  });

  test('e-mail já cadastrado mostra o mesmo aviso (não revela existência)', async ({ page }) => {
    await simular(page, () => ({
      status: 422,
      corpo: { code: 'user_already_exists', error_code: 'user_already_exists', msg: 'User already registered' }
    }));
    await abrir(page, '/cadastro');
    await page.getByTestId('auth-nome').fill('Ana');
    await page.getByTestId('auth-email').fill('ana@x.com');
    await page.getByTestId('auth-senha').fill('12345678');
    await page.getByTestId('auth-confirmacao').fill('12345678');
    await page.getByTestId('auth-enviar').click();
    await expect(page.getByTestId('auth-confirme-email')).toBeVisible();
  });
});

test.describe('recuperar senha e nova senha', () => {
  test('resposta é a mesma, exista ou não o e-mail', async ({ page }) => {
    await simular(page, () => ({ status: 200, corpo: {} }));
    await abrir(page, '/recuperar-senha');
    await page.getByTestId('auth-enviar').click();
    await expect(page.getByTestId('auth-email-erro')).toBeVisible();
    await page.getByTestId('auth-email').fill('naoexiste@x.com');
    await page.getByTestId('auth-enviar').click();
    await expect(page.getByTestId('auth-recuperacao-enviada')).toContainText('Se esse e-mail estiver cadastrado');
  });

  test('nova-senha sem sessão mostra link inválido', async ({ page }) => {
    await simular(page);
    await abrir(page, '/nova-senha');
    await expect(page.getByTestId('auth-link-invalido')).toContainText('Link inválido ou expirado');
    await expect(page.getByRole('link', { name: 'Pedir novo link' })).toHaveAttribute('href', '/recuperar-senha');
  });

  test('nova-senha com sessão valida e redefine', async ({ page }) => {
    const chamadas = await simular(page, (c) =>
      c.caminho.startsWith('/auth/v1/user') ? { status: 200, corpo: sessaoFalsa().user } : { status: 200, corpo: [] }
    );
    await page.addInitScript(([k, s]) => localStorage.setItem(k, s), [chave, JSON.stringify(sessaoFalsa())]);
    await abrir(page, '/nova-senha');
    await page.getByTestId('auth-senha').fill('curta');
    await page.getByTestId('auth-confirmacao').fill('curta');
    await page.getByTestId('auth-enviar').click();
    await expect(page.getByTestId('auth-senha-erro')).toContainText('pelo menos 8');
    await page.getByTestId('auth-senha').fill('nova-senha-123');
    await page.getByTestId('auth-confirmacao').fill('nova-senha-123');
    await page.getByTestId('auth-enviar').click();
    await expect(page).toHaveURL(/\/(app|onboarding)/);
    expect(chamadas.some((c) => c.caminho.startsWith('/auth/v1/user') && (c.corpo as { password?: string })?.password === 'nova-senha-123')).toBe(true);
  });
});

test.describe('callback', () => {
  test('link com erro/expirado mostra mensagem e opções', async ({ page }) => {
    await simular(page);
    await page.goto('/auth/callback#error=access_denied&error_code=otp_expired&error_description=expired');
    await expect(page.getByTestId('auth-callback-erro')).toContainText('Link inválido ou expirado');
    await expect(page.getByRole('link', { name: 'Pedir novo link' })).toBeVisible();
  });

  test('sem code nem sessão mostra erro', async ({ page }) => {
    await simular(page);
    await page.goto('/auth/callback');
    await expect(page.getByTestId('auth-callback-erro')).toBeVisible();
  });

  test('code válido vira sessão e segue para o next permitido', async ({ page }) => {
    await simular(page, (c) =>
      c.caminho.includes('grant_type=pkce') ? { status: 200, corpo: sessaoFalsa() } : { status: 200, corpo: [] }
    );
    await page.addInitScript(([k]) => localStorage.setItem(`${k}-code-verifier`, JSON.stringify("verificador-falso-0123456789")), [chave]);
    await page.goto('/auth/callback?code=abc123&next=/nova-senha');
    await expect(page).toHaveURL(/\/nova-senha$/);
    await expect(page.getByTestId('auth-form-nova-senha')).toBeVisible();
  });
});
