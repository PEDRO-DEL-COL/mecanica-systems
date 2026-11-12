<script lang="ts">
  import { catalogoRepo } from '../db/repos';
  import type { ItemCatalogo, TipoItem } from '../db/repos/catalogo';
  import { formatarReais, parseReais } from '../lib/dinheiro';

  type Aba = 'servico' | 'peca' | 'baixo';
  const abas: { id: Aba; rotulo: string }[] = [
    { id: 'servico', rotulo: 'Serviços' },
    { id: 'peca', rotulo: 'Peças' },
    { id: 'baixo', rotulo: 'Estoque baixo' },
  ];

  let aba = $state<Aba>('servico');
  let filtro = $state('');
  let incluirInativos = $state(false);
  let lista = $state<ItemCatalogo[]>([]);
  let carregando = $state(true);
  let erroLista = $state<string | null>(null);

  let editando = $state<ItemCatalogo | 'novo' | null>(null);
  let codigo = $state('');
  let descricao = $state('');
  let custo = $state('');
  let venda = $state('');
  let estAtual = $state('0');
  let estMin = $state('0');
  let local = $state('');
  let erroForm = $state<string | null>(null);
  let msg = $state<string | null>(null);

  const msgErro = (e: unknown) => (e instanceof Error ? e.message : String(e));
  const tipoForm = $derived<TipoItem>(
    editando && editando !== 'novo' ? editando.tipo : aba === 'servico' ? 'servico' : 'peca',
  );
  const baixo = (i: ItemCatalogo) => i.tipo === 'peca' && i.estoqueMinimo > 0 && i.estoqueAtual <= i.estoqueMinimo;

  function tentar(texto: string): number | null {
    if (!texto.trim()) return null;
    try {
      return parseReais(texto);
    } catch {
      return null;
    }
  }
  const margem = $derived.by(() => {
    const v = tentar(venda);
    const c = tentar(custo);
    if (v === null || c === null) return null;
    return v - c;
  });
  const fmtMargem = (m: number) => (m < 0 ? `-${formatarReais(-m)}` : formatarReais(m));

  async function carregar() {
    try {
      if (aba === 'baixo') {
        const f = filtro.trim().toLowerCase();
        lista = (await catalogoRepo.listarEstoqueBaixo()).filter(
          (i) => !f || i.descricao.toLowerCase().includes(f) || (i.codigo ?? '').toLowerCase().includes(f),
        );
      } else {
        lista = await catalogoRepo.listar({ filtro, tipo: aba, incluirInativos });
      }
      erroLista = null;
    } catch (e) {
      erroLista = msgErro(e);
    } finally {
      carregando = false;
    }
  }

  function preencher(i: ItemCatalogo | null) {
    codigo = i?.codigo ?? '';
    descricao = i?.descricao ?? '';
    custo = i ? formatarReais(i.precoCusto) : '';
    venda = i ? formatarReais(i.precoVenda) : '';
    estAtual = String(i?.estoqueAtual ?? 0);
    estMin = String(i?.estoqueMinimo ?? 0);
    local = i?.localEstoque ?? '';
    erroForm = null;
    msg = null;
  }

  function abrir(i: ItemCatalogo) {
    editando = i;
    preencher(i);
  }
  function novo() {
    editando = 'novo';
    preencher(null);
  }
  function mudarAba(a: Aba) {
    aba = a;
    editando = null;
  }

  function numero(t: string, nome: string): number {
    const n = Number(String(t).replace(',', '.'));
    if (!String(t).trim() || !Number.isFinite(n) || n < 0) throw new Error(`${nome} inválido.`);
    return n;
  }

  async function salvar(ev: SubmitEvent) {
    ev.preventDefault();
    erroForm = null;
    msg = null;
    try {
      const peca = tipoForm === 'peca';
      const dados = {
        tipo: tipoForm,
        codigo: peca ? codigo : null,
        descricao,
        precoCusto: peca && custo.trim() ? parseReais(custo) : 0,
        precoVenda: parseReais(venda),
        estoqueAtual: peca ? numero(estAtual, 'Estoque atual') : 0,
        estoqueMinimo: peca ? numero(estMin, 'Estoque mínimo') : 0,
        localEstoque: peca ? local : null,
      };
      const eraNovo = editando === 'novo';
      let id: number;
      if (editando === 'novo') {
        id = await catalogoRepo.criar(dados);
      } else if (editando) {
        id = editando.id;
        await catalogoRepo.atualizar(id, dados);
      } else return;
      const salvo = (await catalogoRepo.buscarPorId(id))!;
      editando = salvo;
      preencher(salvo);
      msg = eraNovo ? 'Item criado.' : 'Item atualizado.';
      await carregar();
    } catch (e) {
      erroForm = msgErro(e);
    }
  }

  async function alternarAtivo() {
    if (!editando || editando === 'novo') return;
    const item = editando;
    try {
      if (item.ativo) {
        if (!confirm(`Inativar "${item.descricao}"? Os dados são mantidos, mas o item some da lista.`)) return;
        await catalogoRepo.inativar(item.id);
      } else {
        if (!confirm(`Reativar "${item.descricao}"?`)) return;
        await catalogoRepo.reativar(item.id);
      }
      const atual = (await catalogoRepo.buscarPorId(item.id))!;
      editando = atual.ativo || incluirInativos ? atual : null;
      if (editando) preencher(atual);
      await carregar();
    } catch (e) {
      erroForm = msgErro(e);
    }
  }

  $effect(() => {
    aba;
    filtro;
    incluirInativos;
    carregar();
  });
</script>

<div class="stack">
  <div class="segmentado" role="tablist" aria-label="Catálogo">
    {#each abas as a (a.id)}
      <button
        type="button"
        role="tab"
        aria-selected={aba === a.id}
        class:sel={aba === a.id}
        data-testid={`cat-aba-${a.id}`}
        onclick={() => mudarAba(a.id)}>{a.rotulo}</button
      >
    {/each}
  </div>

  <div class="duas-colunas">
    <section class="cartao stack">
      <div class="row">
        <input
          class="busca-cat"
          type="search"
          data-testid="cat-filtro"
          aria-label="Buscar no catálogo"
          placeholder="Descrição ou código"
          bind:value={filtro}
        />
        {#if aba !== 'baixo'}
          <button type="button" class="btn-primario" data-testid="cat-btn-novo" onclick={novo}>
            {aba === 'servico' ? 'Novo serviço' : 'Nova peça'}
          </button>
        {/if}
      </div>
      {#if aba !== 'baixo'}
        <label class="inline"><input type="checkbox" bind:checked={incluirInativos} data-testid="cat-chk-inativos" /> Mostrar inativos</label>
      {/if}
      {#if erroLista}<p class="alerta alerta-erro" role="alert">{erroLista}</p>{/if}
      {#if carregando}
        <p class="muted">Carregando…</p>
      {:else if lista.length === 0}
        <div class="vazio" data-testid="cat-vazio">
          {#if filtro.trim()}
            <strong>Nada encontrado</strong>Tente outro termo de busca.
          {:else if aba === 'baixo'}
            <strong>Nenhuma peça com estoque baixo</strong>Peças com estoque no mínimo ou abaixo aparecem aqui.
          {:else if aba === 'servico'}
            <strong>Nenhum serviço cadastrado</strong>Clique em "Novo serviço" para cadastrar o primeiro.
          {:else}
            <strong>Nenhuma peça cadastrada</strong>Clique em "Nova peça" para cadastrar a primeira.
          {/if}
        </div>
      {:else}
        <ul class="lista" data-testid="cat-lista">
          {#each lista as i (i.id)}
            <li>
              <button
                type="button"
                class="item"
                class:ativo={editando !== 'novo' && editando?.id === i.id}
                data-testid="cat-item"
                onclick={() => abrir(i)}
              >
                <span class="desc">
                  <strong data-testid="cat-item-desc">{i.descricao}</strong>
                  {#if i.codigo}<span class="muted mono">{i.codigo}</span>{/if}
                </span>
                <span class="direita">
                  {#if i.tipo === 'peca'}<span class="muted" data-testid="cat-item-estoque">Estoque: {i.estoqueAtual}</span>{/if}
                  <span data-testid="cat-item-preco">{formatarReais(i.precoVenda)}</span>
                  {#if baixo(i)}<span class="badge badge-baixo" data-testid="cat-badge-baixo">estoque baixo</span>{/if}
                  {#if !i.ativo}<span class="badge badge-inativo">inativo</span>{/if}
                </span>
              </button>
            </li>
          {/each}
        </ul>
      {/if}
    </section>

    <section class="cartao stack">
      {#if editando}
        <h2>
          {editando === 'novo' ? (tipoForm === 'peca' ? 'Nova peça' : 'Novo serviço') : tipoForm === 'peca' ? 'Editar peça' : 'Editar serviço'}
          {#if editando !== 'novo'}
            <span class="badge" class:badge-ativo={editando.ativo} class:badge-inativo={!editando.ativo}>{editando.ativo ? 'ativo' : 'inativo'}</span>
          {/if}
        </h2>
        <form class="stack" onsubmit={salvar} data-testid="cat-form">
          <div class="form-grid">
            {#if tipoForm === 'peca'}
              <label>Código <input data-testid="cat-codigo" bind:value={codigo} /></label>
              <label>Local (prateleira/gaveta) <input data-testid="cat-local" bind:value={local} /></label>
            {/if}
            <label class="full">Descrição * <input data-testid="cat-descricao" bind:value={descricao} required /></label>
            {#if tipoForm === 'peca'}
              <label>Custo (R$) <input data-testid="cat-custo" inputmode="decimal" placeholder="0,00" bind:value={custo} /></label>
            {/if}
            <label>Preço de venda (R$) * <input data-testid="cat-venda" inputmode="decimal" placeholder="0,00" bind:value={venda} required /></label>
            {#if tipoForm === 'peca'}
              <label>Estoque atual <input data-testid="cat-estoque-atual" type="number" min="0" step="any" bind:value={estAtual} /></label>
              <label>Estoque mínimo <input data-testid="cat-estoque-minimo" type="number" min="0" step="any" bind:value={estMin} /></label>
            {/if}
          </div>
          {#if tipoForm === 'peca' && margem !== null}
            <p class="muted margem" data-testid="cat-margem">Margem: <strong class:neg={margem < 0}>{fmtMargem(margem)}</strong></p>
          {/if}
          {#if erroForm}<p class="alerta alerta-erro" role="alert" data-testid="cat-erro">{erroForm}</p>{/if}
          {#if msg}<p class="alerta alerta-sucesso" role="status" data-testid="cat-msg">{msg}</p>{/if}
          <div class="form-acoes">
            <button type="submit" data-testid="cat-btn-salvar">Salvar</button>
            {#if editando !== 'novo'}
              {#if editando.ativo}
                <button type="button" class="btn-perigo" data-testid="cat-btn-inativar" onclick={alternarAtivo}>Inativar</button>
              {:else}
                <button type="button" class="btn-secundario" data-testid="cat-btn-reativar" onclick={alternarAtivo}>Reativar</button>
              {/if}
            {/if}
          </div>
        </form>
      {:else}
        <div class="vazio"><strong>Nenhum item selecionado</strong>Selecione um item na lista{aba === 'baixo' ? '' : ' ou crie um novo'}.</div>
      {/if}
    </section>
  </div>
</div>

<style>
  .segmentado { display: inline-flex; justify-self: start; padding: 3px; gap: 3px; background: var(--cor-superficie-2); border: 1px solid var(--cor-borda); border-radius: var(--raio); }
  .segmentado button { border: none; background: transparent; min-height: 2.25rem; }
  .segmentado button.sel { background: var(--cor-primaria); color: #fff; }
  .duas-colunas { display: grid; grid-template-columns: minmax(18rem, 1.2fr) minmax(22rem, 1fr); gap: var(--esp-4); align-items: start; }
  .busca-cat { flex: 1; min-width: 10rem; width: auto !important; }
  .lista { list-style: none; padding: 0; margin: 0; display: grid; gap: var(--esp-2); }
  .item { display: flex; align-items: center; justify-content: space-between; gap: var(--esp-3); width: 100%; min-height: 2.75rem; text-align: left; font-weight: 400; font-size: var(--txt-md); }
  .item.ativo { background: var(--cor-primaria-suave); border-color: var(--cor-primaria); }
  .desc { display: grid; min-width: 0; }
  .desc strong { overflow-wrap: anywhere; }
  .direita { display: flex; align-items: center; gap: var(--esp-2); flex-wrap: wrap; justify-content: flex-end; font-size: var(--txt-sm); }
  .badge-baixo { background: var(--cor-erro-bg); color: var(--cor-erro); border: 1px solid var(--cor-erro); }
  .margem { margin: 0; }
  .neg { color: var(--cor-erro); }
  @media (max-width: 900px) { .duas-colunas { grid-template-columns: 1fr; } }
</style>
