<script lang="ts">
  import '../../../styles/app.css';
  import { onMount, tick } from 'svelte';
  import { goto } from '$app/navigation';
  import * as v from 'valibot';
  import Campo from '../../../lib/ui/Campo.svelte';
  import Botao from '../../../lib/ui/Botao.svelte';
  import { obterSessao, solicitarRecuperacao } from '../../../lib/repos/auth';
  import { recuperacaoSchema, MSG_RECUPERACAO_ENVIADA } from '../../../lib/validacao/auth';
  import { errosPorCampo } from '../../../lib/validacao/comum';

  let email = $state('');
  let erros = $state<Record<string, string>>({});
  let erroGeral = $state('');
  let enviando = $state(false);
  let enviado = $state(false);
  let formulario = $state<HTMLFormElement>();
  let aviso = $state<HTMLElement>();

  onMount(async () => {
    const r = await obterSessao();
    if (r.ok && r.dados) await goto('/app', { replaceState: true });
  });

  async function enviar(ev: SubmitEvent) {
    ev.preventDefault();
    if (enviando) return;
    erroGeral = '';
    const res = v.safeParse(recuperacaoSchema, { email });
    if (!res.success) {
      erros = errosPorCampo(res.issues);
      await tick();
      formulario?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
      return;
    }
    erros = {};
    enviando = true;
    // Turnstile: obter o token do widget aqui e passar como 2º argumento de solicitarRecuperacao().
    const r = await solicitarRecuperacao(res.output.email);
    enviando = false;
    // Só falhas de rede/limite aparecem; o resto responde igual, sem revelar se o e-mail existe.
    if (r.ok || (r.erro.codigo !== 'rede' && r.erro.codigo !== 'regra')) {
      enviado = true;
      await tick();
      aviso?.focus();
      return;
    }
    erroGeral = r.erro.mensagem;
  }
</script>

<svelte:head>
  <title>Recuperar senha | Mecanica Systems</title>
  <meta name="robots" content="noindex" />
</svelte:head>

<div class="auth">
  <h1>Recuperar senha</h1>
  {#if enviado}
    <div class="cartao" role="status" tabindex="-1" bind:this={aviso} data-testid="auth-recuperacao-enviada">
      <p>{MSG_RECUPERACAO_ENVIADA}</p>
      <p><a href="/entrar">Voltar para a entrada</a></p>
    </div>
  {:else}
    <form class="cartao" bind:this={formulario} onsubmit={enviar} novalidate data-testid="auth-form-recuperar">
      <p class="auth-texto">Informe o e-mail da sua conta para receber o link de redefinição.</p>
      {#if erroGeral}<p class="auth-erro" role="alert" data-testid="auth-erro-geral">{erroGeral}</p>{/if}
      <Campo label="E-mail" type="email" autocomplete="username" bind:valor={email} erro={erros.email} testid="auth-email" />
      <Botao type="submit" variante="primario" carregando={enviando} testid="auth-enviar">Enviar link</Botao>
      <p class="auth-links"><a href="/entrar">Voltar para a entrada</a></p>
    </form>
  {/if}
</div>

<style>
  .auth { max-width: 26rem; margin: 0 auto; padding: var(--esp-6) var(--esp-4) 0; }
  .auth h1 { margin-bottom: var(--esp-4); }
  form { display: grid; gap: var(--esp-4); }
  .auth-texto { margin: 0; color: var(--cor-texto-suave); font-size: var(--txt-sm); }
  .auth-erro { margin: 0; padding: var(--esp-2) var(--esp-3); border-radius: var(--raio-sm); color: var(--cor-erro); background: var(--cor-erro-bg); font-weight: 600; font-size: var(--txt-sm); }
  .auth-links { margin: 0; font-size: var(--txt-sm); }
</style>
