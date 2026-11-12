<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { obterSessao, trocarCodigo } from '../../../lib/repos/auth';
  import { destinoSeguro, MSG_LINK_EXPIRADO } from '../../../lib/validacao/auth';

  let erro = $state('');

  onMount(async () => {
    const url = new URL(window.location.href);
    const hash = new URLSearchParams(url.hash.replace(/^#/, ''));
    const param = (n: string) => url.searchParams.get(n) ?? hash.get(n);
    const destino = destinoSeguro(url.searchParams.get('next'));

    if (param('error') || param('error_code') || param('error_description')) {
      erro = MSG_LINK_EXPIRADO;
      return;
    }

    // O cliente (detectSessionInUrl) já troca o code ao inicializar; obterSessao aguarda isso.
    let r = await obterSessao();
    const codigo = url.searchParams.get('code');
    if (r.ok && !r.dados && codigo) r = await trocarCodigo(codigo);

    if (r.ok && r.dados) {
      await goto(destino, { replaceState: true });
      return;
    }
    erro = r.ok ? MSG_LINK_EXPIRADO : r.erro.mensagem;
  });
</script>

<svelte:head>
  <title>Entrando | Mecanica Systems</title>
  <meta name="robots" content="noindex" />
</svelte:head>

<main class="auth">
  {#if erro}
    <h1>Não foi possível continuar</h1>
    <div class="cartao" role="alert" data-testid="auth-callback-erro">
      <p>{erro}</p>
      <p><a href="/recuperar-senha">Pedir novo link</a> ou <a href="/entrar">voltar para a entrada</a>.</p>
    </div>
  {:else}
    <h1>Entrando...</h1>
    <p role="status" data-testid="auth-callback-carregando">Validando o link, aguarde.</p>
  {/if}
</main>

<style>
  .auth { max-width: 26rem; margin: 0 auto; padding: var(--esp-6) var(--esp-4) 0; }
  .auth h1 { margin-bottom: var(--esp-4); }
</style>
