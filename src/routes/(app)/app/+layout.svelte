<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import '../../../styles/app.css';
  import { supabase } from '../../../lib/supabase';
  import { ITENS_NAVEGACAO, itemDoCaminho } from '../../../lib/app/navegacao';
  import { oficina } from '../../../lib/estado/oficina.svelte';
  import { sessao } from '../../../lib/estado/sessao.svelte';
  import EstadoVazio from '../../../lib/ui/EstadoVazio.svelte';
  import Toasts from '../../../lib/ui/Toasts.svelte';

  let { children } = $props();

  let gavetaAberta = $state(false);
  let menuUsuario = $state(false);
  let saindo = $state(false);

  const itens = $derived(ITENS_NAVEGACAO.filter((i) => oficina.pode(i.area, 'leitura')));
  const itemAtual = $derived(itemDoCaminho(page.url.pathname));
  const semAcesso = $derived(itemAtual !== undefined && !oficina.pode(itemAtual.area, 'leitura'));

  // Fecha gaveta e menu ao navegar.
  $effect(() => {
    void page.url.pathname;
    gavetaAberta = false;
    menuUsuario = false;
  });

  async function sair() {
    saindo = true;
    await sessao.sair();
    await goto('/entrar');
  }

  function teclas(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      gavetaAberta = false;
      menuUsuario = false;
    }
  }

  onMount(() => {
    // Sessão encerrada em outra aba: volta ao login.
    const { data } = supabase.auth.onAuthStateChange((evento) => {
      if (evento === 'SIGNED_OUT' && !saindo) {
        sessao.limpar();
        void goto('/entrar');
      }
    });
    return () => data.subscription.unsubscribe();
  });
</script>

<svelte:window onkeydown={teclas} />

<div class="shell">
  <header class="topo">
    <button
      type="button"
      class="btn-menu"
      aria-label="Abrir menu"
      aria-expanded={gavetaAberta}
      aria-controls="lateral"
      onclick={() => (gavetaAberta = !gavetaAberta)}
    >
      <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16" /></svg>
    </button>
    <a class="marca" href="/app">Mecanica Systems</a>
    <span class="oficina" data-testid="oficina-nome">{oficina.nome}</span>
    <div class="usuario">
      <button
        type="button"
        class="btn-usuario"
        aria-haspopup="menu"
        aria-expanded={menuUsuario}
        aria-label="Menu do usuário"
        data-testid="menu-usuario"
        onclick={() => (menuUsuario = !menuUsuario)}
      >
        <span class="email">{sessao.usuario?.email}</span>
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
      </button>
      {#if menuUsuario}
        <div class="menu" role="menu">
          <button type="button" role="menuitem" disabled={saindo} onclick={sair}>Sair</button>
        </div>
      {/if}
    </div>
  </header>

  {#if gavetaAberta}
    <button type="button" class="fundo" aria-label="Fechar menu" tabindex="-1" onclick={() => (gavetaAberta = false)}></button>
  {/if}

  <aside id="lateral" class="lateral" class:aberta={gavetaAberta}>
    <nav aria-label="Principal">
      <ul>
        {#each itens as item (item.area)}
          <li>
            <a
              href={item.rota}
              aria-current={itemAtual?.area === item.area ? 'page' : undefined}
              class:ativo={itemAtual?.area === item.area}
            >
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">{@html item.icone}</svg>
              <span>{item.rotulo}</span>
            </a>
          </li>
        {/each}
      </ul>
    </nav>
  </aside>

  <main class="conteudo">
    {#if semAcesso && itemAtual}
      <EstadoVazio
        titulo="Você não tem acesso a esta área"
        texto="Peça ao dono da oficina para liberar a área {itemAtual.rotulo} no seu acesso."
        testid="sem-acesso"
      />
    {:else}
      {@render children()}
    {/if}
  </main>
</div>

<Toasts />

<style>
  .shell { min-height: 100dvh; display: grid; grid-template-columns: 15rem minmax(0, 1fr); grid-template-rows: auto 1fr; grid-template-areas: 'topo topo' 'lateral conteudo'; }
  .topo { grid-area: topo; display: flex; align-items: center; gap: var(--esp-3); padding: 0 var(--esp-4); min-height: 3.5rem; background: var(--cor-superficie); border-bottom: 1px solid var(--cor-borda); position: sticky; top: 0; z-index: 20; }
  .marca { font-weight: 700; color: var(--cor-primaria); text-decoration: none; white-space: nowrap; }
  .oficina { font-weight: 600; color: var(--cor-texto-suave); min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; padding-left: var(--esp-3); border-left: 1px solid var(--cor-borda); }
  .usuario { margin-left: auto; position: relative; min-width: 0; }
  .email { max-width: 14rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .menu { position: absolute; right: 0; top: calc(100% + 4px); min-width: 9rem; background: var(--cor-superficie); border: 1px solid var(--cor-borda); border-radius: var(--raio); box-shadow: var(--sombra-forte); padding: var(--esp-1); z-index: 30; }
  .menu button { width: 100%; justify-content: flex-start; border: 0; background: transparent; }
  .btn-menu { display: none; padding: 0; width: var(--alvo); }
  .lateral { grid-area: lateral; background: var(--cor-lateral); color: var(--cor-lateral-texto); padding: var(--esp-3); }
  .lateral ul { list-style: none; margin: 0; padding: 0; display: grid; gap: var(--esp-1); }
  .lateral a { display: flex; align-items: center; gap: var(--esp-3); min-height: var(--alvo); padding: 0 var(--esp-3); border-radius: var(--raio-sm); color: inherit; text-decoration: none; font-weight: 500; }
  .lateral a:hover { background: var(--cor-lateral-ativo); }
  .lateral a.ativo { background: var(--cor-lateral-ativo); color: #fff; font-weight: 650; }
  .conteudo { grid-area: conteudo; padding: var(--esp-5) var(--esp-4); min-width: 0; }
  .fundo { display: none; }

  @media (max-width: 899px) {
    .shell { grid-template-columns: minmax(0, 1fr); grid-template-areas: 'topo' 'conteudo'; }
    .btn-menu { display: inline-flex; }
    .email { display: none; }
    .oficina { flex: 1 1 auto; }
    .usuario { margin-left: 0; }
    .lateral { position: fixed; top: 0; bottom: 0; left: 0; width: min(17rem, 85vw); z-index: 50; padding-top: 4rem; transform: translateX(-100%); visibility: hidden; transition: transform 0.2s, visibility 0.2s; }
    .lateral.aberta { transform: none; visibility: visible; }
    .fundo { display: block; position: fixed; inset: 0; z-index: 40; min-height: 0; padding: 0; border: 0; border-radius: 0; background: rgb(10 20 25 / 0.55); }
    .fundo:hover:not(:disabled) { background: rgb(10 20 25 / 0.55); }
  }
  @media (prefers-reduced-motion: reduce) { .lateral { transition: none; } }
</style>
