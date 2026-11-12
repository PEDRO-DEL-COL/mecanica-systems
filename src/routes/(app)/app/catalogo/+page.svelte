<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import { listarItens, listarCustosItens } from '../../../../lib/repos/catalogo';
  import type { ItemCatalogo, ItemCusto, TipoItem } from '../../../../lib/tipos/catalogo';
  import { pode } from '../../../../lib/estado/oficina.svelte';
  import { formatarReais } from '../../../../lib/puro/dinheiro';
  import { calcularMargem, formatarPercentualDecimos } from '../../../../lib/puro/margem';
  import Busca from '../../../../lib/ui/Busca.svelte';
  import Carregando from '../../../../lib/ui/Carregando.svelte';
  import EstadoVazio from '../../../../lib/ui/EstadoVazio.svelte';
  import Etiqueta from '../../../../lib/ui/Etiqueta.svelte';
  import Paginacao from '../../../../lib/ui/Paginacao.svelte';

  const params = $derived(page.url.searchParams);
  const tipo = $derived<TipoItem>(params.get('tipo') === 'peca' ? 'peca' : 'servico');
  const q = $derived(params.get('q') ?? '');
  const inativos = $derived(params.get('inativos') === '1');
  const pagina = $derived(Math.max(1, Math.floor(Number(params.get('pagina'))) || 1));
  const escrita = $derived(pode('catalogo', 'escrita'));
  const verCusto = $derived(pode('financeiro', 'leitura'));

  let textoBusca = $state(page.url.searchParams.get('q') ?? '');
  let itens = $state<ItemCatalogo[]>([]);
  let custos = $state<Record<string, ItemCusto>>({});
  let total = $state<number | null>(null);
  let carregando = $state(true);
  let erro = $state('');

  function ir(mudar: Record<string, string | null>) {
    const sp = new URLSearchParams(page.url.search);
    for (const [k, val] of Object.entries(mudar)) {
      if (val === null || val === '') sp.delete(k);
      else sp.set(k, val);
    }
    const s = sp.toString();
    void goto(page.url.pathname + (s ? `?${s}` : ''), { reset: false });
  }

  $effect(() => {
    const filtro = { tipo, busca: q, mostrarInativos: inativos, pagina };
    const comCusto = verCusto;
    const ctl = new AbortController();
    carregando = true;
    erro = '';
    (async () => {
      const r = await listarItens(filtro, ctl.signal);
      if (ctl.signal.aborted) return;
      if (!r.ok) {
        erro = r.erro.mensagem;
        itens = [];
        carregando = false;
        return;
      }
      itens = r.dados.itens;
      total = r.dados.total;
      custos = {};
      // Custo só é pedido ao repo por quem tem financeiro/leitura.
      if (comCusto && itens.length > 0) {
        const c = await listarCustosItens(itens.map((i) => i.id));
        if (ctl.signal.aborted) return;
        if (c.ok) custos = Object.fromEntries(c.dados.map((x) => [x.item_id, x]));
      }
      carregando = false;
    })();
    return () => ctl.abort();
  });

  function margemDe(i: ItemCatalogo): string {
    const c = custos[i.id];
    if (!c) return '—';
    return formatarPercentualDecimos(calcularMargem(i.preco_venda_centavos, c.custo_medio_centavos).margemDecimos);
  }

  const filtrando = $derived(q.length > 0 || inativos);
  const novoHref = $derived(`/app/catalogo/novo?tipo=${tipo}`);
</script>

<svelte:head><title>Catálogo | Mecanica Systems</title></svelte:head>

<div class="catalogo-topo">
  <h1>Catálogo</h1>
  {#if escrita}
    <a class="btn btn-primario" href={novoHref} data-testid="catalogo-btn-novo">
      {tipo === 'peca' ? 'Nova peça' : 'Novo serviço'}
    </a>
  {/if}
</div>

<div class="catalogo-abas" role="tablist" aria-label="Tipo de item">
  <button type="button" role="tab" aria-selected={tipo === 'servico'} data-testid="catalogo-aba-servicos" onclick={() => ir({ tipo: null, pagina: null })}>Serviços</button>
  <button type="button" role="tab" aria-selected={tipo === 'peca'} data-testid="catalogo-aba-pecas" onclick={() => ir({ tipo: 'peca', pagina: null })}>Peças</button>
</div>

<div class="catalogo-filtros">
  <Busca
    bind:valor={textoBusca}
    placeholder="Buscar por descrição ou código"
    rotulo="Buscar no catálogo"
    onbuscar={(t) => ir({ q: t, pagina: null })}
    testid="catalogo-busca"
  />
  <label class="inline">
    <input type="checkbox" checked={inativos} onchange={(e) => ir({ inativos: e.currentTarget.checked ? '1' : null, pagina: null })} data-testid="catalogo-inativos" />
    Mostrar inativos
  </label>
</div>

{#if erro}
  <p class="alerta alerta-erro" role="alert" data-testid="catalogo-erro">{erro}</p>
{:else if carregando}
  <Carregando tipo="esqueleto" linhas={4} />
{:else if itens.length === 0}
  <EstadoVazio
    titulo={filtrando ? 'Nenhum item encontrado' : tipo === 'peca' ? 'Nenhuma peça cadastrada' : 'Nenhum serviço cadastrado'}
    texto={filtrando ? 'Ajuste a busca ou os filtros.' : 'Cadastre o primeiro item para usá-lo nas ordens de serviço.'}
    testid="catalogo-vazio"
  >
    {#snippet acao()}
      {#if escrita && !filtrando}
        <a class="btn btn-primario" href={novoHref} data-testid="catalogo-vazio-cta">{tipo === 'peca' ? 'Cadastrar peça' : 'Cadastrar serviço'}</a>
      {/if}
    {/snippet}
  </EstadoVazio>
{:else}
  <div class="tabela-wrap" data-testid="catalogo-lista">
    <table>
      <thead>
        <tr>
          {#if tipo === 'peca'}<th scope="col">Código</th>{/if}
          <th scope="col">Descrição</th>
          <th scope="col">Un.</th>
          <th scope="col">Venda</th>
          {#if verCusto}<th scope="col">Custo médio</th><th scope="col">Margem</th>{/if}
          <th scope="col">Situação</th>
        </tr>
      </thead>
      <tbody>
        {#each itens as i (i.id)}
          <tr data-testid="catalogo-linha">
            {#if tipo === 'peca'}<td>{i.codigo ?? '—'}</td>{/if}
            <td><a href="/app/catalogo/{i.id}" data-testid="catalogo-link-item">{i.descricao}</a></td>
            <td>{i.unidade}</td>
            <td>{formatarReais(i.preco_venda_centavos)}</td>
            {#if verCusto}
              <td data-testid="catalogo-linha-custo">{custos[i.id] ? formatarReais(custos[i.id].custo_medio_centavos) : '—'}</td>
              <td data-testid="catalogo-linha-margem">{margemDe(i)}</td>
            {/if}
            <td>{#if i.ativo}<Etiqueta tom="sucesso" testid="catalogo-etiqueta-ativo">Ativo</Etiqueta>{:else}<Etiqueta testid="catalogo-etiqueta-inativo">Inativo</Etiqueta>{/if}</td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
  {#if total !== null}
    <Paginacao {pagina} {total} onmudar={(p) => ir({ pagina: p <= 1 ? null : String(p) })} testid="catalogo-paginacao" />
  {/if}
{/if}

<style>
  .catalogo-topo { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: var(--esp-3); margin-bottom: var(--esp-3); }
  .catalogo-topo h1 { margin: 0; }
  .catalogo-abas { display: flex; gap: var(--esp-2); margin-bottom: var(--esp-3); }
  .catalogo-abas button[aria-selected='true'] { background: var(--cor-primaria-suave); color: var(--cor-primaria); border-color: var(--cor-primaria); }
  .catalogo-filtros { display: flex; flex-wrap: wrap; align-items: center; gap: var(--esp-3); margin-bottom: var(--esp-3); }
  .catalogo-filtros :global(.ui-busca) { flex: 1 1 14rem; }
  .tabela-wrap { margin-bottom: var(--esp-3); }
</style>
