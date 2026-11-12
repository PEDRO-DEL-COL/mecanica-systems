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
  <section class="cartao stack">
    <div class="row">
      <input
        class="busca-cli"
        type="search"
        data-testid="filtro-clientes"
        aria-label="Filtrar clientes"
        placeholder="Nome, telefone ou placa"
        bind:value={filtro}
      />
      <button type="button" class="btn-primario" data-testid="btn-novo-cliente" onclick={novo}>Novo cliente</button>
    </div>
    <label class="inline">
      <input type="checkbox" bind:checked={incluirInativos} data-testid="chk-inativos" /> Mostrar inativos
    </label>
    {#if erroLista}<p class="alerta alerta-erro" role="alert">{erroLista}</p>{/if}
    {#if carregando}
      <p class="muted">Carregando…</p>
    {:else if lista.length === 0}
      <div class="vazio" data-testid="clientes-vazio">
        <strong>{filtro.trim() ? 'Nenhum cliente encontrado' : 'Nenhum cliente ainda'}</strong>
        {filtro.trim() ? 'Tente outro termo de busca.' : 'Clique em "Novo cliente" para cadastrar o primeiro.'}
      </div>
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
              {#if c.telefone}<span class="muted">{c.telefone}</span>{/if}
              {#if !c.ativo}<span class="badge badge-inativo">inativo</span>{/if}
            </button>
          </li>
        {/each}
      </ul>
    {/if}
  </section>

  <section class="cartao stack">
    {#if editando}
      <h2>
        {editando === 'novo' ? 'Novo cliente' : 'Editar cliente'}
        {#if editando !== 'novo'}
          <span class="badge" class:badge-ativo={editando.ativo} class:badge-inativo={!editando.ativo}>{editando.ativo ? 'ativo' : 'inativo'}</span>
        {/if}
      </h2>
      <form class="stack" onsubmit={salvar} data-testid="form-cliente">
        <div class="form-grid">
          <label class="full">Nome * <input data-testid="cliente-nome" bind:value={nome} required /></label>
          <label>CPF/CNPJ (opcional) <input data-testid="cliente-documento" bind:value={documento} /></label>
          <label>Telefone <input data-testid="cliente-telefone" bind:value={telefone} /></label>
          <label class="full">E-mail <input data-testid="cliente-email" type="email" bind:value={email} /></label>
          <label class="full">Endereço <input data-testid="cliente-endereco" bind:value={endereco} /></label>
        </div>
        {#if erroForm}<p class="alerta alerta-erro" role="alert" data-testid="erro-cliente">{erroForm}</p>{/if}
        {#if msg}<p class="alerta alerta-sucesso" role="status" data-testid="msg-cliente">{msg}</p>{/if}
        <div class="form-acoes">
          <button type="submit" data-testid="btn-salvar-cliente">Salvar cliente</button>
          {#if editando !== 'novo'}
            {#if editando.ativo}
              <button type="button" class="btn-perigo" data-testid="btn-inativar-cliente" onclick={inativar}>Inativar</button>
            {:else}
              <button type="button" class="btn-secundario" data-testid="btn-reativar-cliente" onclick={reativar}>Reativar</button>
            {/if}
          {/if}
        </div>
      </form>

      {#if editando !== 'novo'}
        <h3>Veículos</h3>
        {#if veiculos.length === 0}
          <div class="vazio" data-testid="veiculos-vazio"><strong>Nenhum veículo cadastrado</strong>Adicione o primeiro veículo deste cliente.</div>
        {:else}
          <ul class="lista" data-testid="lista-veiculos">
            {#each veiculos as v (v.id)}
              <li class="veiculo" data-testid="veiculo-item">
                <span>
                  <strong class="mono" data-testid="veiculo-item-placa">{v.placa}</strong>
                  {[v.marca, v.modelo, v.ano, v.cor].filter(Boolean).join(' ')}
                  {#if v.kmAtual !== null}<span class="muted">— {v.kmAtual} km</span>{/if}
                </span>
                <button type="button" class="btn-pequeno" onclick={() => (formVeiculo = v)}>Editar</button>
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
          <div><button type="button" class="btn-secundario" data-testid="btn-add-veiculo" onclick={() => (formVeiculo = 'novo')}>
            + Adicionar veículo
          </button></div>
        {/if}
      {/if}
    {:else}
      <div class="vazio"><strong>Nenhum cliente selecionado</strong>Selecione um cliente na lista ou clique em "Novo cliente".</div>
    {/if}
  </section>
</div>

<style>
  .duas-colunas { display: grid; grid-template-columns: minmax(18rem, 1fr) minmax(24rem, 1.4fr); gap: var(--esp-4); align-items: start; }
  .busca-cli { flex: 1; min-width: 12rem; width: auto !important; }
  .lista { list-style: none; padding: 0; margin: 0; display: grid; gap: var(--esp-2); }
  .item { display: flex; align-items: center; justify-content: flex-start; gap: var(--esp-3); width: 100%; min-height: 2.75rem; text-align: left; font-weight: 400; font-size: var(--txt-md); }
  .item.ativo { background: var(--cor-primaria-suave); border-color: var(--cor-primaria); }
  .veiculo { display: flex; justify-content: space-between; align-items: center; gap: var(--esp-3); padding: var(--esp-2) var(--esp-3); border: 1px solid var(--cor-borda); border-radius: var(--raio-sm); font-size: var(--txt-sm); }
  @media (max-width: 900px) { .duas-colunas { grid-template-columns: 1fr; } }
</style>

