<script lang="ts">
  import '../../../styles/app.css';
  import { onMount, tick } from 'svelte';
  import { goto } from '$app/navigation';
  import * as v from 'valibot';
  import Campo from '../../../lib/ui/Campo.svelte';
  import Botao from '../../../lib/ui/Botao.svelte';
  import { obterSessao, redefinirSenha } from '../../../lib/repos/auth';
  import { novaSenhaSchema, MSG_LINK_EXPIRADO, SENHA_MIN } from '../../../lib/validacao/auth';
  import { errosPorCampo } from '../../../lib/validacao/comum';

  let senha = $state('');
  let confirmacao = $state('');
  let erros = $state<Record<string, string>>({});
  let erroGeral = $state('');
  let enviando = $state(false);
  let carregando = $state(true);
  let temSessao = $state(false);
  let formulario = $state<HTMLFormElement>();

  // Esta tela só funciona com a sessão de recuperação criada em /auth/callback.
  onMount(async () => {
    const r = await obterSessao();
    temSessao = r.ok && r.dados !== null;
    carregando = false;
  });

  async function enviar(ev: SubmitEvent) {
    ev.preventDefault();
    if (enviando) return;
    erroGeral = '';
    const res = v.safeParse(novaSenhaSchema, { senha, confirmacao });
    if (!res.success) {
      erros = errosPorCampo(res.issues);
      await tick();
      formulario?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
      return;
    }
    erros = {};
    enviando = true;
    const r = await redefinirSenha(res.output.senha);
    if (r.ok) {
      await goto('/app');
      return;
    }
    erroGeral = r.erro.mensagem;
    enviando = false;
  }
</script>

<svelte:head>
  <title>Nova senha | Mecanica Systems</title>
  <meta name="robots" content="noindex" />
</svelte:head>

<div class="auth">
  <h1>Nova senha</h1>
  {#if carregando}
    <p role="status">Verificando o link...</p>
  {:else if !temSessao}
    <div class="cartao" role="alert" data-testid="auth-link-invalido">
      <p>{MSG_LINK_EXPIRADO}</p>
      <p><a href="/recuperar-senha">Pedir novo link</a></p>
    </div>
  {:else}
    <form class="cartao" bind:this={formulario} onsubmit={enviar} novalidate data-testid="auth-form-nova-senha">
      {#if erroGeral}<p class="auth-erro" role="alert" data-testid="auth-erro-geral">{erroGeral}</p>{/if}
      <Campo
        label="Nova senha"
        type="password"
        autocomplete="new-password"
        ajuda={`Mínimo de ${SENHA_MIN} caracteres.`}
        bind:valor={senha}
        erro={erros.senha}
        testid="auth-senha"
      />
      <Campo
        label="Confirmar nova senha"
        type="password"
        autocomplete="new-password"
        bind:valor={confirmacao}
        erro={erros.confirmacao}
        testid="auth-confirmacao"
      />
      <Botao type="submit" variante="primario" carregando={enviando} testid="auth-enviar">Salvar nova senha</Botao>
    </form>
  {/if}
</div>

<style>
  .auth { max-width: 26rem; margin: 0 auto; padding: var(--esp-6) var(--esp-4) 0; }
  .auth h1 { margin-bottom: var(--esp-4); }
  form { display: grid; gap: var(--esp-4); }
  .auth-erro { margin: 0; padding: var(--esp-2) var(--esp-3); border-radius: var(--raio-sm); color: var(--cor-erro); background: var(--cor-erro-bg); font-weight: 600; font-size: var(--txt-sm); }
</style>
