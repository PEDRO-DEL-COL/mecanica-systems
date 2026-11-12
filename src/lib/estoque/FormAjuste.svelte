<script lang="ts">
  import { untrack } from 'svelte';
  import * as v from 'valibot';
  import Botao from '../ui/Botao.svelte';
  import Campo from '../ui/Campo.svelte';
  import { toast } from '../ui/toast.svelte';
  import SeletorPeca from './SeletorPeca.svelte';
  import { registrarAjuste } from '../repos/estoque';
  import { ajusteSchema } from '../validacao/estoque';
  import { errosPorCampo } from '../validacao/comum';
  import { quantidadeComSinal, novoId } from './formato';

  interface Props {
    itemInicial?: string;
  }
  let { itemInicial = '' }: Props = $props();

  let itemId = $state(untrack(() => itemInicial));
  let delta = $state('');
  let motivo = $state('');
  let erros = $state<Record<string, string>>({});
  let erroGeral = $state('');
  let enviando = $state(false);
  let chave = novoId();

  async function enviar(e: SubmitEvent) {
    e.preventDefault();
    erroGeral = '';
    const r0 = v.safeParse(ajusteSchema, { item_id: itemId, delta, motivo });
    if (!r0.success) {
      erros = errosPorCampo(r0.issues);
      return;
    }
    erros = {};
    enviando = true;
    const r = await registrarAjuste({ ...r0.output, idempotency_key: chave });
    enviando = false;
    if (!r.ok) {
      erroGeral = r.erro.mensagem;
      return;
    }
    chave = novoId();
    const saldo = quantidadeComSinal(r.dados.saldo);
    if (r.dados.negativo) toast.aviso(`Ajuste registrado, mas o saldo ficou negativo: ${saldo}.`);
    else toast.sucesso(`Ajuste registrado. Saldo atual: ${saldo}.`);
    delta = '';
    motivo = '';
  }
</script>

<form onsubmit={enviar} novalidate class="form" data-testid="estoque-ajuste-form">
  <SeletorPeca bind:valor={itemId} erro={erros.item_id} testid="estoque-ajuste-peca" />
  <Campo
    label="Quantidade do ajuste"
    bind:valor={delta}
    erro={erros.delta}
    inputmode="decimal"
    autocomplete="off"
    ajuda="Positiva para entrar, negativa para sair (ex.: -2)."
    testid="estoque-ajuste-delta"
  />
  <Campo label="Motivo (obrigatório)" multilinha bind:valor={motivo} erro={erros.motivo} testid="estoque-ajuste-motivo" />
  {#if erroGeral}<p class="ui-erro" role="alert" data-testid="estoque-ajuste-erro">{erroGeral}</p>{/if}
  <Botao type="submit" variante="primario" carregando={enviando} testid="estoque-ajuste-salvar">Registrar ajuste</Botao>
</form>

<style>
  .form { display: grid; gap: var(--esp-3); max-width: 32rem; }
</style>
