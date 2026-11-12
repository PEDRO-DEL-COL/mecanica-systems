<script lang="ts">
  import * as v from 'valibot';
  import Dialogo from '../ui/Dialogo.svelte';
  import Botao from '../ui/Botao.svelte';
  import Campo from '../ui/Campo.svelte';
  import { toast } from '../ui/toast.svelte';
  import { criarFornecedor, atualizarFornecedor } from '../repos/fornecedores';
  import { fornecedorSchema } from '../validacao/fornecedores';
  import { errosPorCampo } from '../validacao/comum';
  import { formatarTelefone } from '../puro/formatos';
  import type { Fornecedor } from '../tipos/fornecedores';
  import { novoId } from './formato';

  interface Props {
    aberto?: boolean;
    /** null = novo. */
    fornecedor: Fornecedor | null;
    onsalvo: () => void;
  }
  let { aberto = $bindable(false), fornecedor, onsalvo }: Props = $props();

  let nome = $state('');
  let documento = $state('');
  let contato = $state('');
  let telefone = $state('');
  let email = $state('');
  let observacao = $state('');
  let erros = $state<Record<string, string>>({});
  let erroGeral = $state('');
  let salvando = $state(false);

  $effect(() => {
    if (aberto) {
      nome = fornecedor?.nome ?? '';
      documento = fornecedor?.documento ?? '';
      contato = fornecedor?.contato ?? '';
      telefone = fornecedor?.telefone ? formatarTelefone(fornecedor.telefone) : '';
      email = fornecedor?.email ?? '';
      observacao = fornecedor?.observacao ?? '';
      erros = {};
      erroGeral = '';
    }
  });

  async function salvar(e: SubmitEvent) {
    e.preventDefault();
    erroGeral = '';
    const r0 = v.safeParse(fornecedorSchema, { nome, documento, contato, telefone, email, observacao });
    if (!r0.success) {
      erros = errosPorCampo(r0.issues);
      return;
    }
    erros = {};
    salvando = true;
    const r = fornecedor
      ? await atualizarFornecedor(fornecedor.id, fornecedor.versao, r0.output)
      : await criarFornecedor(r0.output, novoId());
    salvando = false;
    if (!r.ok) {
      erroGeral = r.erro.mensagem;
      return;
    }
    toast.sucesso(fornecedor ? 'Fornecedor atualizado.' : 'Fornecedor cadastrado.');
    aberto = false;
    onsalvo();
  }
</script>

<Dialogo bind:aberto titulo={fornecedor ? 'Editar fornecedor' : 'Novo fornecedor'} testid="estoque-fornecedor-dialogo">
  <form id="form-fornecedor" onsubmit={salvar} novalidate class="form">
    <Campo label="Nome" bind:valor={nome} erro={erros.nome} maxlength={200} testid="estoque-fornecedor-nome" />
    <Campo label="CPF/CNPJ (opcional)" bind:valor={documento} erro={erros.documento} inputmode="numeric" testid="estoque-fornecedor-documento" />
    <Campo label="Contato (opcional)" bind:valor={contato} erro={erros.contato} testid="estoque-fornecedor-contato" />
    <Campo label="Telefone (opcional)" bind:valor={telefone} erro={erros.telefone} inputmode="tel" testid="estoque-fornecedor-telefone" />
    <Campo label="E-mail (opcional)" bind:valor={email} erro={erros.email} type="email" testid="estoque-fornecedor-email" />
    <Campo label="Observação (opcional)" multilinha bind:valor={observacao} erro={erros.observacao} testid="estoque-fornecedor-observacao" />
    {#if erroGeral}<p class="ui-erro" role="alert" data-testid="estoque-fornecedor-erro">{erroGeral}</p>{/if}
  </form>
  {#snippet rodape()}
    <Botao testid="estoque-fornecedor-cancelar" onclick={() => (aberto = false)}>Cancelar</Botao>
    <Botao type="submit" form="form-fornecedor" variante="primario" carregando={salvando} testid="estoque-fornecedor-salvar">Salvar</Botao>
  {/snippet}
</Dialogo>

<style>
  .form { display: grid; gap: var(--esp-3); }
</style>
