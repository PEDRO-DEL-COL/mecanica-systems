<script lang="ts">
  import Busca from '../ui/Busca.svelte';
  import Botao from '../ui/Botao.svelte';
  import { listarClientes } from '../repos/clientes';
  import type { Cliente } from '../tipos/clientes';

  interface Props {
    cliente?: Cliente | null;
    erro?: string;
    /** Cliente que não pode ser escolhido (ex.: dono atual numa transferência). */
    excluirId?: string;
    label?: string;
    testid?: string;
  }
  let {
    cliente = $bindable(null),
    erro,
    excluirId,
    label = 'Cliente (dono)',
    testid = 'veiculos-cliente'
  }: Props = $props();

  let texto = $state('');
  let resultados = $state<Cliente[]>([]);
  let carregando = $state(false);
  let falhou = $state('');
  let buscou = $state(false);
  let seq = 0;

  async function buscar(t: string) {
    const meu = ++seq;
    if (t.length < 2) {
      resultados = [];
      buscou = false;
      return;
    }
    carregando = true;
    falhou = '';
    const r = await listarClientes({ busca: t });
    if (meu !== seq) return;
    carregando = false;
    buscou = true;
    if (r.ok) resultados = r.dados.itens.filter((c) => c.id !== excluirId);
    else {
      resultados = [];
      falhou = r.erro.mensagem;
    }
  }

  function escolher(c: Cliente) {
    cliente = c;
    resultados = [];
    texto = '';
    buscou = false;
  }
</script>

<div class="seletor" data-testid={testid}>
  <span class="seletor-label">{label}</span>
  {#if cliente}
    <div class="seletor-escolhido">
      <strong data-testid="{testid}-nome">{cliente.nome}</strong>
      <Botao pequeno testid="{testid}-trocar" onclick={() => (cliente = null)}>Trocar</Botao>
    </div>
  {:else}
    <Busca
      bind:valor={texto}
      rotulo="Buscar cliente por nome ou telefone"
      placeholder="Buscar cliente por nome ou telefone…"
      onbuscar={buscar}
      testid="{testid}-busca"
    />
    {#if carregando}<small class="ui-ajuda">Buscando…</small>{/if}
    {#if falhou}<small class="ui-erro" role="alert">{falhou}</small>{/if}
    {#if resultados.length}
      <ul class="seletor-lista" data-testid="{testid}-resultados">
        {#each resultados as c (c.id)}
          <li>
            <button type="button" data-testid="{testid}-opcao" onclick={() => escolher(c)}>
              {c.nome}{c.telefone ? ` · ${c.telefone}` : ''}
            </button>
          </li>
        {/each}
      </ul>
    {:else if buscou && !carregando && !falhou}
      <small class="ui-ajuda" data-testid="{testid}-sem-resultado">Nenhum cliente encontrado.</small>
    {/if}
  {/if}
  {#if erro}<small class="ui-erro" role="alert" data-testid="{testid}-erro">{erro}</small>{/if}
</div>

<style>
  .seletor {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }
  .seletor-label {
    font-weight: 600;
  }
  .seletor-escolhido {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    flex-wrap: wrap;
  }
  .seletor-lista {
    list-style: none;
    margin: 0;
    padding: 0;
    border: 1px solid #8884;
    border-radius: 0.4rem;
    max-height: 12rem;
    overflow-y: auto;
  }
  .seletor-lista button {
    width: 100%;
    text-align: left;
    padding: 0.6rem 0.75rem;
    background: transparent;
    border: 0;
    color: inherit;
    font: inherit;
    cursor: pointer;
  }
  .seletor-lista button:hover,
  .seletor-lista button:focus-visible {
    background: #8882;
  }
</style>
