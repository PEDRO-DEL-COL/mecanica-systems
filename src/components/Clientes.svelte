<script lang="ts">
  import { clientesRepo, veiculosRepo } from '../db/repos';
  import type { Cliente } from '../db/repos/clientes';
  import type { Veiculo } from '../db/repos/veiculos';
  import VeiculoForm from './VeiculoForm.svelte';

  let { abrirId = null, aoMudar }: { abrirId?: number | null; aoMudar: () => void } = $props();

  let filtro = $state('');
  let incluirInativos = $state(false);
  let lista = $state<Cliente[]>([]);
  let carregando = $state(true);
  let erroLista = $state<string | null>(null);

  // null = nenhum painel; 'novo' = criando; Cliente = editando
  let editando = $state<Cliente | 'novo' | null>(null);
  let veiculos = $state<Veiculo[]>([]);
  let formVeiculo = $state<Veiculo | 'novo' | null>(null);

  let nome = $state('');
  let documento = $state('');
  let telefone = $state('');
  let email = $state('');
  let endereco = $state('');
  let erroForm = $state<string | null>(null);
  let msg = $state<string | null>(null);

  const msgErro = (e: unknown) => (e instanceof Error ? e.message : String(e));

  async function carregar() {
    try {
      lista = await clientesRepo.listar({ filtro, incluirInativos });
      erroLista = null;
    } catch (e) {
      erroLista = msgErro(e);
    } finally {
      carregando = false;
    }
  }

  async function carregarVeiculos() {
    veiculos = editando && editando !== 'novo' ? await veiculosRepo.listarPorCliente(editando.id) : [];
  }

  function preencher(c: Cliente | null) {
    nome = c?.nome ?? '';
    documento = c?.documento ?? '';
    telefone = c?.telefone ?? '';
    email = c?.email ?? '';
    endereco = c?.endereco ?? '';
    erroForm = null;
    formVeiculo = null;
  }

  async function abrir(c: Cliente) {
    editando = c;
    preencher(c);
    msg = null;
    await carregarVeiculos();
  }

  function novo() {
    editando = 'novo';
    preencher(null);
    veiculos = [];
    msg = null;
  }

  async function salvar(ev: SubmitEvent) {
    ev.preventDefault();
    erroForm = null;
    const dados = { nome, documento, telefone, email, endereco };
    try {
      if (editando === 'novo') {
        const id = await clientesRepo.criar(dados);
        editando = (await clientesRepo.buscarPorId(id))!;
        msg = 'Cliente criado. Agora você pode adicionar veículos.';
      } else if (editando) {
        await clientesRepo.atualizar(editando.id, dados);
        editando = (await clientesRepo.buscarPorId(editando.id))!;
        msg = 'Cliente atualizado.';
      }
      await carregar();
      aoMudar();
    } catch (e) {
      erroForm = msgErro(e);
    }
  }

  async function inativar() {
    if (!editando || editando === 'novo') return;
    if (!confirm(`Inativar o cliente "${editando.nome}"? Os dados são mantidos, mas ele some da lista.`)) return;
    try {
      await clientesRepo.inativar(editando.id);
      editando = null;
      await carregar();
      aoMudar();
    } catch (e) {
      erroForm = msgErro(e);
    }
  }

  async function reativar() {
    if (!editando || editando === 'novo') return;
    await clientesRepo.reativar(editando.id);
    editando = (await clientesRepo.buscarPorId(editando.id))!;
    await carregar();
    aoMudar();
  }

  async function veiculoSalvo() {
    formVeiculo = null;
    await carregarVeiculos();
  }

  $effect(() => {
    // Recarrega a lista quando o filtro/checkbox mudam.
    filtro;
    incluirInativos;
    carregar();
  });

  let ultimoAbrir: number | null = null;
  $effect(() => {
    const id = abrirId;
    if (id !== null && id !== ultimoAbrir) {
      ultimoAbrir = id;
      clientesRepo.buscarPorId(id).then((c) => c && abrir(c));
    }
  });
</script>

<div class="duas-colunas">
  <section>
    <h2>Clientes</h2>
    <div class="barra">
      <input
        type="search"
        data-testid="filtro-clientes"
        placeholder="Nome, telefone, documento ou placa"
        bind:value={filtro}
      />
      <button type="button" data-testid="btn-novo-cliente" onclick={novo}>Novo cliente</button>
    </div>
    <label class="inline">
      <input type="checkbox" bind:checked={incluirInativos} data-testid="chk-inativos" /> Mostrar inativos
    </label>
    {#if erroLista}<p class="erro" role="alert">{erroLista}</p>{/if}
    {#if carregando}
      <p>Carregando…</p>
    {:else if lista.length === 0}
      <p data-testid="clientes-vazio">Nenhum cliente encontrado.</p>
    {:else}
      <ul class="lista" data-testid="lista-clientes">
        {#each lista as c (c.id)}
          <li>
            <button
              type="button"
              class="item"
              class:ativo={editando !== 'novo' && editando?.id === c.id}
              data-testid="cliente-item"
              onclick={() => abrir(c)}
            >
              <strong>{c.nome}</strong>
              {#if c.telefone}<span>{c.telefone}</span>{/if}
              {#if !c.ativo}<em>(inativo)</em>{/if}
            </button>
          </li>
        {/each}
      </ul>
    {/if}
  </section>

  <section>
    {#if editando}
      <h2>{editando === 'novo' ? 'Novo cliente' : 'Editar cliente'}</h2>
      <form onsubmit={salvar} data-testid="form-cliente" class="form">
        <label>Nome * <input data-testid="cliente-nome" bind:value={nome} required /></label>
        <label>CPF/CNPJ (opcional) <input data-testid="cliente-documento" bind:value={documento} /></label>
        <label>Telefone <input data-testid="cliente-telefone" bind:value={telefone} /></label>
        <label>E-mail <input data-testid="cliente-email" type="email" bind:value={email} /></label>
        <label>Endereço <input data-testid="cliente-endereco" bind:value={endereco} /></label>
        {#if erroForm}<p class="erro" role="alert" data-testid="erro-cliente">{erroForm}</p>{/if}
        {#if msg}<p role="status" data-testid="msg-cliente">{msg}</p>{/if}
        <div>
          <button type="submit" data-testid="btn-salvar-cliente">Salvar cliente</button>
          {#if editando !== 'novo'}
            {#if editando.ativo}
              <button type="button" data-testid="btn-inativar-cliente" onclick={inativar}>Inativar</button>
            {:else}
              <button type="button" data-testid="btn-reativar-cliente" onclick={reativar}>Reativar</button>
            {/if}
          {/if}
        </div>
      </form>

      {#if editando !== 'novo'}
        <h3>Veículos</h3>
        {#if veiculos.length === 0}
          <p data-testid="veiculos-vazio">Nenhum veículo cadastrado.</p>
        {:else}
          <ul class="lista" data-testid="lista-veiculos">
            {#each veiculos as v (v.id)}
              <li data-testid="veiculo-item">
                <strong data-testid="veiculo-item-placa">{v.placa}</strong>
                {[v.marca, v.modelo, v.ano, v.cor].filter(Boolean).join(' ')}
                {#if v.kmAtual !== null}— {v.kmAtual} km{/if}
                <button type="button" onclick={() => (formVeiculo = v)}>Editar</button>
              </li>
            {/each}
          </ul>
        {/if}
        {#if formVeiculo}
          {#key formVeiculo === 'novo' ? 'novo' : formVeiculo.id}
            <VeiculoForm
              clienteId={editando.id}
              veiculo={formVeiculo === 'novo' ? null : formVeiculo}
              aoSalvar={veiculoSalvo}
              aoCancelar={() => (formVeiculo = null)}
            />
          {/key}
        {:else}
          <button type="button" data-testid="btn-add-veiculo" onclick={() => (formVeiculo = 'novo')}>
            Adicionar veículo
          </button>
        {/if}
      {/if}
    {:else}
      <p>Selecione um cliente na lista ou clique em "Novo cliente".</p>
    {/if}
  </section>
</div>

<style>
  .duas-colunas { display: grid; grid-template-columns: minmax(18rem, 1fr) minmax(22rem, 1.3fr); gap: 2rem; align-items: start; }
  .barra { display: flex; gap: 0.5rem; margin-bottom: 0.5rem; }
  .barra input { flex: 1; padding: 0.4rem; font-size: 1rem; }
  .inline { display: block; margin-bottom: 0.5rem; }
  .lista { list-style: none; padding: 0; margin: 0; }
  .lista li { padding: 0.3rem 0; border-bottom: 1px solid #e5e7eb; }
  .item { display: flex; gap: 0.75rem; width: 100%; text-align: left; padding: 0.5rem; cursor: pointer; background: #fff; border: 1px solid #e5e7eb; border-radius: 4px; font-size: 1rem; }
  .item.ativo { background: #dbeafe; border-color: #3b82f6; }
  .form { display: grid; gap: 0.5rem; max-width: 28rem; }
  label { display: grid; gap: 0.15rem; font-weight: 600; }
  .form input { padding: 0.35rem; font-size: 1rem; font-weight: 400; }
  .erro { color: #b91c1c; margin: 0; }
  button { margin-right: 0.5rem; }
</style>