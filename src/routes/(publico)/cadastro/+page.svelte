<script lang="ts">
  import '../../../styles/app.css';
  import { onMount, tick } from 'svelte';
  import { goto } from '$app/navigation';
  import * as v from 'valibot';
  import Campo from '../../../lib/ui/Campo.svelte';
  import Botao from '../../../lib/ui/Botao.svelte';
  import { cadastrar, obterSessao } from '../../../lib/repos/auth';
  import { cadastroSchema, MSG_CADASTRO_ENVIADO, SENHA_MIN } from '../../../lib/validacao/auth';
  import { errosPorCampo } from '../../../lib/validacao/comum';

  let nome = $state('');
  let email = $state('');
  let senha = $state('');
  let confirmacao = $state('');
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
    const res = v.safeParse(cadastroSchema, { nome, email, senha, confirmacao });
    if (!res.success) {
      erros = errosPorCampo(res.issues);
      await tick();
      formulario?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
      return;
    }
    erros = {};
    enviando = true;
    // Turnstile: obter o token do widget aqui e passar como 4º argumento de cadastrar().
    const r = await cadastrar(res.output.nome, res.output.email, res.output.senha);
    enviando = false;
    if (r.ok) {
      senha = '';
      confirmacao = '';
      enviado = true;
      await tick();
      aviso?.focus();
      return;
    }
    erroGeral = r.erro.mensagem;
  }
</script>

<svelte:head>
  <title>Criar conta | Mecanica Systems</title>
  <meta name="robots" content="noindex" />
</svelte:head>

<div class="auth">
  <h1>Criar conta</h1>
  {#if enviado}
    <div class="cartao aviso" role="status" tabindex="-1" bind:this={aviso} data-testid="auth-confirme-email">
      <h2>Confirme seu e-mail</h2>
      <p>{MSG_CADASTRO_ENVIADO}</p>
      <p><a href="/entrar">Ir para a tela de entrada</a></p>
    </div>
  {:else}
    <form class="cartao" bind:this={formulario} onsubmit={enviar} novalidate data-testid="auth-form-cadastro">
      {#if erroGeral}<p class="auth-erro" role="alert" data-testid="auth-erro-geral">{erroGeral}</p>{/if}
      <Campo label="Seu nome" autocomplete="name" bind:valor={nome} erro={erros.nome} testid="auth-nome" />
      <Campo label="E-mail" type="email" autocomplete="username" bind:valor={email} erro={erros.email} testid="auth-email" />
      <Campo
        label="Senha"
        type="password"
        autocomplete="new-password"
        ajuda={`Mínimo de ${SENHA_MIN} caracteres.`}
        bind:valor={senha}
        erro={erros.senha}
        testid="auth-senha"
      />
      <Campo
        label="Confirmar senha"
        type="password"
        autocomplete="new-password"
        bind:valor={confirmacao}
        erro={erros.confirmacao}
        testid="auth-confirmacao"
      />
      <Botao type="submit" variante="primario" carregando={enviando} testid="auth-enviar">Criar conta</Botao>
      <p class="auth-links">Já tem conta? <a href="/entrar">Entrar</a></p>
    </form>
  {/if}
</div>

<style>
  .auth { max-width: 26rem; margin: 0 auto; padding: var(--esp-6) var(--esp-4) 0; }
  .auth h1 { margin-bottom: var(--esp-4); }
  form { display: grid; gap: var(--esp-4); }
  .auth-erro { margin: 0; padding: var(--esp-2) var(--esp-3); border-radius: var(--raio-sm); color: var(--cor-erro); background: var(--cor-erro-bg); font-weight: 600; font-size: var(--txt-sm); }
  .auth-links { margin: 0; font-size: var(--txt-sm); }
</style>
