<script lang="ts">
  import { untrack } from 'svelte';
  import { onMount } from 'svelte';
  import * as v from 'valibot';
  import Botao from '../ui/Botao.svelte';
  import Campo from '../ui/Campo.svelte';
  import Selecao from '../ui/Selecao.svelte';
  import { toast } from '../ui/toast.svelte';
  import SeletorPeca from './SeletorPeca.svelte';
  import { registrarEntrada } from '../repos/estoque';
  import { listarFornecedores } from '../repos/fornecedores';
  import { entradaSchema } from '../validacao/estoque';
  import { errosPorCampo } from '../validacao/comum';
  import { quantidadeComSinal, novoId } from './formato';

  interface Props {
    itemInicial?: string;
  }
  let { itemInicial = '' }: Props = $props();

  let itemId = $state(untrack(() => itemInicial));
  let quantidade = $state('');
  let custo = $state('');
  let fornecedorId = $state('');
  let nota = $state('');
  let erros = $state<Record<string, string>>({});
  let erroGeral = $state('');
  let enviando = $state(false);
  let chave = novoId();
  let fornecedores = $state<{ valor: string; rotulo: string }[]>([]);

  onMount(async () => {
    const r = await listarFornecedores({});
    if (r.ok) fornecedores = r.dados.itens.map((f) => ({ valor: f.id, rotulo: f.nome }));
  });

  async function enviar(e: SubmitEvent) {
    e.preventDefault();
    erroGeral = '';
    const r0 = v.safeParse(entradaSchema, {
      item_id: itemId,
      quantidade,
      custo_unitario_centavos: custo,
      fornecedor_id: fornecedorId,
      nota_fiscal: nota
    });
    if (!r0.success) {
      erros = errosPorCampo(r0.issues);
      return;
    }
    erros = {};
    enviando = true;
    const r = await registrarEntrada({ ...r0.output, idempotency_key: chave });
    enviando = false;
    if (!r.ok) {
      erroGeral = r.erro.mensagem;
      return;
    }
    chave = novoId();
    toast.sucesso(`Entrada registrada. Saldo atual: ${quantidadeComSinal(r.dados.saldo)}.`);
    quantidade = '';
    custo = '';
    nota = '';
    fornecedorId = '';
  }
</script>

<form onsubmit={enviar} novalidate class="form" data-testid="estoque-entrada-form">
  <SeletorPeca bind:valor={itemId} erro={erros.item_id} testid="estoque-entrada-peca" />
  <Campo label="Quantidade" bind:valor={quantidade} erro={erros.quantidade} inputmode="decimal" autocomplete="off" testid="estoque-entrada-quantidade" />
  <Campo
    label="Custo unitário (R$)"
    bind:valor={custo}
    erro={erros.custo_unitario_centavos}
    inputmode="decimal"
    autocomplete="off"
    testid="estoque-entrada-custo"
  />
  <Selecao label="Fornecedor (opcional)" placeholder="Sem fornecedor" opcoes={fornecedores} bind:valor={fornecedorId} erro={erros.fornecedor_id} testid="estoque-entrada-fornecedor" />
  <Campo label="Nota fiscal (opcional)" bind:valor={nota} erro={erros.nota_fiscal} maxlength={60} testid="estoque-entrada-nota" />
  {#if erroGeral}<p class="ui-erro" role="alert" data-testid="estoque-entrada-erro">{erroGeral}</p>{/if}
  <Botao type="submit" variante="primario" carregando={enviando} testid="estoque-entrada-salvar">Registrar entrada</Botao>
</form>

<style>
  .form { display: grid; gap: var(--esp-3); max-width: 32rem; }
</style>
