<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import Botao from '../../../../lib/ui/Botao.svelte';
  import Busca from '../../../../lib/ui/Busca.svelte';
  import Carregando from '../../../../lib/ui/Carregando.svelte';
  import EstadoVazio from '../../../../lib/ui/EstadoVazio.svelte';
  import Etiqueta from '../../../../lib/ui/Etiqueta.svelte';
  import Paginacao from '../../../../lib/ui/Paginacao.svelte';
  import Tabela from '../../../../lib/ui/Tabela.svelte';
  import SubNav from '../../../../lib/estoque/SubNav.svelte';
  import { quantidadeComSinal } from '../../../../lib/estoque/formato';
  import { pode } from '../../../../lib/estado/oficina.svelte';
  import { listarSaldos } from '../../../../lib/repos/estoque';
  import type { SaldoEstoque } from '../../../../lib/tipos/estoque';

  type Filtro = 'todos' | 'abaixo' | 'negativos';

  const q = $derived(page.url.searchParams.get('q') ?? '');
  const filtro = $derived.by<Filtro>(() => {
    const f = page.url.searchParams.get('f');
    return f === 'abaixo' || f === 'negativos' ? f : 'todos';
  });
  const pagina = $derived(Math.max(1, Math.floor(Number(page.url.searchParams.get('p'))) || 1));

  let texto = $state(page.url.searchParams.get('q') ?? '');
  let itens = $state<SaldoEstoque[]>([]);
  let total = $state(0);
  let carregando = $state(true);
  let erro = $state('');

  $effect(() => {
    const ctrl = new AbortController();
    carregando = true;
    erro = '';
    void listarSaldos(
      { busca: q, somenteAbaixoMinimo: filtro === 'abaixo', somenteNegativos: filtro === 'negativos', pagina },
      ctrl.signal
    ).then((r) => {
      if (ctrl.signal.aborted) return;
      carregando = false;
      if (r.ok) {
        itens = r.dados.itens;
        total = r.dados.total ?? r.dados.itens.length;
      } else {
        itens = [];
        erro = r.erro.mensagem;
      }
    });
    return () => ctrl.abort();
  });

  function atualizar(mudancas: Record<string, string | null>) {
    const u = new URL(page.url.href);
    for (const [k, val] of Object.entries(mudancas)) {
      if (val) u.searchParams.set(k, val);
      else u.searchParams.delete(k);
    }
    void goto(u.pathname + u.search, { replaceState: true });
  }

  const colunas = [
    { chave: 'peca', rotulo: 'Peça' },
    { chave: 'saldo', rotulo: 'Saldo', alinhar: 'direita' as const },
    { chave: 'minimo', rotulo: 'Mínimo', alinhar: 'direita' as const },
    { chave: 'local', rotulo: 'Local' },
    { chave: 'acoes', rotulo: 'Histórico' }
  ];
  const filtrando = $derived(q !== '' || filtro !== 'todos');
</script>

<svelte:head><title>Estoque | Mecanica Systems</title></svelte:head>

<h1>Estoque</h1>
<SubNav />

<div class="barra">
  <div class="busca">
    <Busca
      bind:valor={texto}
      rotulo="Buscar peça"
      placeholder="Buscar por nome ou código…"
      onbuscar={(t) => atualizar({ q: t || null, p: null })}
      testid="estoque-busca"
    />
  </div>
  <div class="filtros" role="group" aria-label="Filtro de saldos">
    <Botao pequeno variante={filtro === 'todos' ? 'primario' : 'neutro'} aria-pressed={filtro === 'todos'} testid="estoque-filtro-todos" onclick={() => atualizar({ f: null, p: null })}>Todos</Botao>
    <Botao pequeno variante={filtro === 'abaixo' ? 'primario' : 'neutro'} aria-pressed={filtro === 'abaixo'} testid="estoque-filtro-abaixo" onclick={() => atualizar({ f: 'abaixo', p: null })}>Abaixo do mínimo</Botao>
    <Botao pequeno variante={filtro === 'negativos' ? 'primario' : 'neutro'} aria-pressed={filtro === 'negativos'} testid="estoque-filtro-negativos" onclick={() => atualizar({ f: 'negativos', p: null })}>Negativos</Botao>
  </div>
  {#if pode('estoque', 'escrita')}
    <div class="acoes">
      <a class="ui-botao ui-botao-primario" href="/app/estoque/entrada" data-testid="estoque-btn-entrada">Nova entrada</a>
      <a class="ui-botao ui-botao-secundario" href="/app/estoque/ajuste" data-testid="estoque-btn-ajuste">Ajuste</a>
    </div>
  {/if}
</div>

{#if carregando}
  <Carregando tipo="esqueleto" rotulo="Carregando saldos…" testid="estoque-carregando" />
{:else if erro}
  <p class="ui-erro" role="alert" data-testid="estoque-erro">{erro}</p>
{:else if itens.length === 0}
  <EstadoVazio
    titulo={filtrando ? 'Nenhuma peça encontrada' : 'Nenhuma peça com controle de estoque'}
    texto={filtrando
      ? 'Ajuste a busca ou o filtro.'
      : 'Cadastre peças no catálogo com controle de estoque e registre a primeira entrada.'}
    testid="estoque-vazio"
  >
    {#snippet acao()}
      {#if filtrando}
        <Botao testid="estoque-limpar" onclick={() => { texto = ''; atualizar({ q: null, f: null, p: null }); }}>Limpar filtros</Botao>
      {:else if pode('estoque', 'escrita')}
        <a class="ui-botao ui-botao-primario" href="/app/estoque/entrada" data-testid="estoque-vazio-entrada">Registrar entrada</a>
      {/if}
    {/snippet}
  </EstadoVazio>
{:else}
  <Tabela {colunas} linhas={itens} legenda="Saldos de estoque" altura="none" testid="estoque-tabela">
    {#snippet linha(s: SaldoEstoque)}
      <td>
        <strong>{s.descricao}</strong>
        {#if s.codigo}<br /><small>{s.codigo}</small>{/if}
      </td>
      <td class="ui-alinhar-direita" data-testid="estoque-saldo">
        {quantidadeComSinal(s.saldo)} {s.unidade}
        {#if s.negativo}
          <br /><Etiqueta tom="erro" testid="estoque-negativo">Saldo negativo</Etiqueta>
        {:else if s.abaixo_minimo}
          <br /><Etiqueta tom="aviso" testid="estoque-abaixo-minimo">Abaixo do mínimo</Etiqueta>
        {/if}
      </td>
      <td class="ui-alinhar-direita">{quantidadeComSinal(s.estoque_minimo)}</td>
      <td>{s.localizacao ?? ''}</td>
      <td><a href="/app/estoque/movimentos?item={s.item_id}" data-testid="estoque-historico">Ver movimentos</a></td>
    {/snippet}
  </Tabela>
  <Paginacao {pagina} {total} onmudar={(p) => atualizar({ p: p > 1 ? String(p) : null })} testid="estoque-paginacao" />
{/if}

<style>
  .barra { display: flex; flex-wrap: wrap; gap: var(--esp-3); align-items: center; margin-bottom: var(--esp-4); }
  .busca { flex: 1 1 16rem; min-width: 0; }
  .filtros, .acoes { display: flex; flex-wrap: wrap; gap: var(--esp-2); }
  a.ui-botao { text-decoration: none; display: inline-flex; align-items: center; }
</style>
