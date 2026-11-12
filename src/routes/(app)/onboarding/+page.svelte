<script lang="ts">
  import { goto } from '$app/navigation';
  import * as v from 'valibot';
  import Botao from '../../../lib/ui/Botao.svelte';
  import Campo from '../../../lib/ui/Campo.svelte';
  import { documentoSchema, errosPorCampo } from '../../../lib/validacao/comum';
  import { carregarOficinaDoUsuario, criarOficina } from '../../../lib/repos/oficina';
  import { oficina } from '../../../lib/estado/oficina.svelte';
  import { sessao } from '../../../lib/estado/sessao.svelte';

  const esquema = v.object({
    nome: v.pipe(
      v.string(),
      v.trim(),
      v.minLength(1, 'Informe o nome da oficina.'),
      v.maxLength(200, 'O nome pode ter até 200 caracteres.')
    ),
    documento: documentoSchema
  });

  let nome = $state('');
  let documento = $state('');
  let erros = $state<Record<string, string>>({});
  let erroGeral = $state('');
  let enviando = $state(false);

  async function enviar(e: SubmitEvent) {
    e.preventDefault();
    erroGeral = '';
    const r = v.safeParse(esquema, { nome, documento });
    if (!r.success) {
      erros = errosPorCampo(r.issues);
      const primeiro = 'nome' in erros ? 'nome' : 'documento';
      (document.querySelector(`[data-testid="onb-${primeiro}"]`) as HTMLElement | null)?.focus();
      return;
    }
    erros = {};
    enviando = true;
    try {
      const c = await criarOficina(r.output.nome, r.output.documento);
      if (!c.ok) {
        erroGeral = c.erro.mensagem;
        return;
      }
      const u = sessao.usuario;
      const o = u ? await carregarOficinaDoUsuario(u.id) : null;
      if (!u || !o || !o.ok || !o.dados) {
        erroGeral = o && !o.ok ? o.erro.mensagem : 'Oficina criada, mas não foi possível carregá-la. Recarregue a página.';
        return;
      }
      oficina.definir(u.id, o.dados);
      await goto('/app');
    } finally {
      enviando = false;
    }
  }
</script>

<svelte:head><title>Cadastrar oficina | Mecanica Systems</title></svelte:head>

<form class="cartao onb" onsubmit={enviar} novalidate>
  <h1>Cadastre sua oficina</h1>
  <p>Falta só isso para começar. Você poderá alterar estes dados depois.</p>
  <Campo
    label="Nome da oficina"
    bind:valor={nome}
    erro={erros.nome}
    autocomplete="organization"
    required
    testid="onb-nome"
  />
  <Campo
    label="CPF ou CNPJ (opcional)"
    bind:valor={documento}
    erro={erros.documento}
    inputmode="numeric"
    autocomplete="off"
    testid="onb-documento"
  />
  {#if erroGeral}<p class="msg-erro" role="alert" data-testid="onb-erro">{erroGeral}</p>{/if}
  <div class="form-acoes">
    <Botao type="submit" variante="primario" carregando={enviando} testid="onb-enviar">Criar oficina</Botao>
  </div>
</form>

<style>
  .onb { width: min(28rem, 100%); display: grid; gap: var(--esp-3); }
  .msg-erro { color: var(--cor-erro); font-weight: 600; margin: 0; }
</style>
