import { error, redirect } from '@sveltejs/kit';
import { supabase } from '../../lib/supabase';
import { sessao } from '../../lib/estado/sessao.svelte';
import { oficina } from '../../lib/estado/oficina.svelte';
import { carregarOficinaDoUsuario } from '../../lib/repos/oficina';
import type { LayoutLoad } from './$types';

export const ssr = false;
export const prerender = false;

const ROTA_PROTEGIDA = /^\/(app|onboarding)(\/|$)/;

/** Guarda: sem sessão => /entrar; sem oficina => /onboarding. Sessão e oficina ficam em cache de estado. */
export const load: LayoutLoad = async ({ url }) => {
  const match = ROTA_PROTEGIDA.exec(url.pathname);
  // Outras rotas do grupo (ex.: login) não passam pela guarda.
  if (!match) return {};
  const noOnboarding = match[1] === 'onboarding';

  const { data } = await supabase.auth.getSession();
  const s = data.session;
  if (!s) {
    sessao.limpar();
    redirect(307, '/entrar');
  }
  sessao.definir({ id: s.user.id, email: s.user.email ?? '' });

  if (oficina.dados === null || oficina.userId !== s.user.id) {
    const r = await carregarOficinaDoUsuario(s.user.id);
    if (!r.ok) error(503, r.erro.mensagem);
    if (r.dados) oficina.definir(s.user.id, r.dados);
    else oficina.limpar();
  }

  if (oficina.dados === null && !noOnboarding) redirect(307, '/onboarding');
  if (oficina.dados !== null && noOnboarding) redirect(307, '/app');

  return { usuario: sessao.usuario, oficina: oficina.dados };
};
