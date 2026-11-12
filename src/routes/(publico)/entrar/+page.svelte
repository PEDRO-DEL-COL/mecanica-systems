<script lang="ts">
  import '../../../styles/app.css';
  import { onMount, tick } from 'svelte';
  import { goto } from '$app/navigation';
  import * as v from 'valibot';
  import Campo from '../../../lib/ui/Campo.svelte';
  import Botao from '../../../lib/ui/Botao.svelte';
  import { entrar, obterSessao } from '../../../lib/repos/auth';
  import { loginSchema } from '../../../lib/validacao/auth';
  import { errosPorCampo } from '../../../lib/validacao/comum';

  let email = $state('');
  let senha = $state('');
  let erros = $state<Record<string, string>>({});
  let erroGeral = $state('');
  let enviando = $state(false);
  let formulario: HTMLFormElement;

  onMount(async () => {
    const r = await obterSessao();
    if (r.ok && r.dados) await goto('/app', { replaceState: true });
  });

  async function enviar(ev: SubmitEvent) {
    ev.preventDefault();
    if (enviando) return;
    erroGeral = '';
    const res = v.safeParse(loginSchema, { email, senha });
    if (!res.success) {
      erros = errosPorCampo(res.issues);
      await tick();
      formulario.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
      return;
    }
    erros = {};
    enviando = true;
    // Turnstile: obter o token do widget aqui e passar como 3º argumento de entrar().
    const r = await entrar(res.output.email, res.output.senha);
    if (r.ok) {
      await goto('/app');
      return;
    }
    erroGeral = r.erro.mensagem;
    enviando = false;
  }
</script>

<svelte:head>
  <title>Entrar | Mecanica Systems</title>
  <meta name="robots" content="noindex" />
</svelte:head>

<div class="auth">
  <h1>Entrar</h1>
  <form class="cartao" bind:this={formulario} onsubmit={enviar} novalidate data-testid="auth-form-entrar">
    {#if erroGeral}<p class="auth-erro" role="alert" data-testid="auth-erro-geral">{erroGeral}</p>{/if}
    <Campo label="E-mail" type="email" autocomplete="username" bind:valor={email} erro={erros.email} testid="auth-email" />
    <Campo label="Senha" type="password" autocomplete="current-password" bind:valor={senha} erro={erros.senha} testid="auth-senha" />
    <Botao type="submit" variante="primario" carregando={enviando} testid="auth-enviar">Entrar</Botao>
    <p class="auth-links">
      <a href="/recuperar-senha">Esqueci minha senha</a>
      <span>Ainda não tem conta? <a href="/cadastro">Criar conta</a></span>
    </p>
  </form>
</div>

<style>
  .auth { max-width: 26rem; margin: 0 auto; padding: var(--esp-6) var(--esp-4) 0; }
  .auth h1 { margin-bottom: var(--esp-4); }
  form { display: grid; gap: var(--esp-4); }
  .auth-erro { margin: 0; padding: var(--esp-2) var(--esp-3); border-radius: var(--raio-sm); color: var(--cor-erro); background: var(--cor-erro-bg); font-weight: 600; font-size: var(--txt-sm); }
  .auth-links { display: grid; gap: var(--esp-2); margin: 0; font-size: var(--txt-sm); }
</style>
