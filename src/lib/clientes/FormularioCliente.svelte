<script lang="ts">
  import * as v from 'valibot';
  import Campo from '../ui/Campo.svelte';
  import Botao from '../ui/Botao.svelte';
  import { clienteSchema } from '../validacao/clientes';
  import { errosPorCampo } from '../validacao/comum';
  import { formatarTelefone } from '../puro/formatos';
  import type { Resultado } from '../erros';
  import type { Cliente, ClienteEntrada } from '../tipos/clientes';

  interface Props {
    inicial?: Cliente;
    onsalvar: (entrada: ClienteEntrada) => Promise<Resultado<Cliente>>;
    onsalvo: (cliente: Cliente) => void;
    oncancelar: () => void;
    /** Se informado, em conflito de versão o formulário oferece "Recarregar". */
    onrecarregar?: () => void;
  }
  let { inicial, onsalvar, onsalvo, oncancelar, onrecarregar }: Props = $props();

  // Valores iniciais lidos uma vez (o formulário é remontado ao recarregar).
  const ini = (() => inicial)();
  let nome = $state(ini?.nome ?? '');
  let documento = $state(ini?.documento ?? '');
  let telefone = $state(ini?.telefone ? formatarTelefone(ini.telefone) : '');
  let email = $state(ini?.email ?? '');
  let endereco = $state(ini?.endereco ?? '');
  let observacoes = $state(ini?.observacoes ?? '');

  let erros = $state<Record<string, string>>({});
  let erroGeral = $state('');
  let conflito = $state(false);
  let salvando = $state(false);

  async function enviar(e: SubmitEvent) {
    e.preventDefault();
    erroGeral = '';
    conflito = false;
    const bruto = {
      nome,
      documento: documento.trim() || null,
      telefone: telefone.trim() || null,
      email: email.trim() || null,
      endereco: endereco.trim() || null,
      observacoes: observacoes.trim() || null
    };
    const r = v.safeParse(clienteSchema, bruto);
    if (!r.success) {
      erros = errosPorCampo(r.issues);
      return;
    }
    erros = {};
    salvando = true;
    const res = await onsalvar(r.output);
    salvando = false;
    if (res.ok) {
      onsalvo(res.dados);
      return;
    }
    erroGeral = res.erro.mensagem;
    if (res.erro.codigo === 'conflito') {
      conflito = true;
    }
  }
</script>

<form class="form-cliente" onsubmit={enviar} novalidate data-testid="cliente-form">
  <Campo label="Nome *" bind:valor={nome} erro={erros.nome} autocomplete="name" testid="cliente-nome" />
  <div class="duas">
    <Campo
      label="CPF/CNPJ"
      bind:valor={documento}
      erro={erros.documento}
      inputmode="numeric"
      ajuda="Opcional. Só números ou com pontuação."
      testid="cliente-documento"
    />
    <Campo
      label="Telefone"
      bind:valor={telefone}
      erro={erros.telefone}
      type="tel"
      autocomplete="tel"
      ajuda="Opcional. DDD + número."
      testid="cliente-telefone"
    />
  </div>
  <Campo label="E-mail" bind:valor={email} erro={erros.email} type="email" autocomplete="email" testid="cliente-email" />
  <Campo label="Endereço" bind:valor={endereco} erro={erros.endereco} testid="cliente-endereco" />
  <Campo label="Observações" bind:valor={observacoes} erro={erros.observacoes} multilinha testid="cliente-observacoes" />

  {#if erroGeral}
    <p class="ui-erro" role="alert" data-testid="cliente-erro">{erroGeral}</p>
  {/if}
  <div class="acoes">
    <Botao variante="primario" type="submit" carregando={salvando} testid="cliente-salvar">Salvar</Botao>
    <Botao testid="cliente-cancelar" onclick={oncancelar} disabled={salvando}>
      Cancelar
    </Botao>
    {#if conflito && onrecarregar}
      <Botao testid="cliente-recarregar" onclick={onrecarregar}>Recarregar</Botao>
    {/if}
  </div>
</form>

<style>
  .form-cliente { display: grid; gap: var(--esp-3); max-width: 40rem; }
  .duas { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--esp-3); }
  .acoes { display: flex; flex-wrap: wrap; gap: var(--esp-2); }
  @media (max-width: 599px) { .duas { grid-template-columns: minmax(0, 1fr); } }
</style>
