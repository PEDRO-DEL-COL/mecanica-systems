<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import { listarClientes } from '../../../../lib/repos/clientes';
  import { pode } from '../../../../lib/estado/oficina.svelte';
  import { formatarTelefone } from '../../../../lib/puro/formatos';
  import type { Cliente } from '../../../../lib/tipos/clientes';
  import Busca from '../../../../lib/ui/Busca.svelte';
  import Tabela from '../../../../lib/ui/Tabela.svelte';
  import Paginacao from '../../../../lib/ui/Paginacao.svelte';
  import Carregando from '../../../../lib/ui/Carregando.svelte';
  import EstadoVazio from '../../../../lib/ui/EstadoVazio.svelte';
  import Etiqueta from '../../../../lib/ui/Etiqueta.svelte';
  import Botao from '../../../../lib/ui/Botao.svelte';

  const q = $derived(page.url.searchParams.get('q') ?? '');
  const pagina = $derived(Math.max(1, Math.floor(Number(page.url.searchParams.get('pagina'))) || 1));
  const inativos = $derived(page.url.searchParams.get('inativos') === '1');
  const escrita = $derived(pode('clientes', 'escrita'));

  let termo = $state(page.url.searchParams.get('q') ?? '');
  let itens = $state<Cliente[]>([]);
  let total = $state(0);
  let carregando = $state(true);
  let erro = $state('');
  let tentativa = $state(0);

  function navegar(p: { q?: string; pagina?: number; inativos?: boolean }) {
    const s = new URLSearchParams();
    const nq = p.q ?? q;
    const np = p.pagina ?? pagina;
    const ni = p.inativos ?? inativos;
    if (nq) s.set('q', nq);
    if (np > 1) s.set('pagina', String(np));
    if (ni) s.set('inativos', '1');
    const qs = s.toString();
    void goto(page.url.pathname + (qs ? `?${qs}` : ''), { replace: true, reset: false });
  }

  $effect(() => {
    const parametros = { busca: q, pagina, incluirInativos: inativos };
    void tentativa;
    const ctl = new AbortController();
    carregando = true;
    erro = '';
    listarClientes(parametros).then((r) => {
      if (ctl.signal.aborted) return; // resposta de uma busca anterior
      carregando = false;
      if (r.ok) {
        itens = r.dados.itens;
        total = r.dados.total;
      } else {
        erro = r.erro.mensagem;
      }
    });
    return () => ctl.abort();
  });

  const colunas = [
    { chave: 'nome', rotulo: 'Nome' },
    { chave: 'telefone', rotulo: 'Telefone' },
    { chave: 'email', rotulo: 'E-mail' },
    { chave: 'situacao', rotulo: 'Situação' }
  ];
</script>

<svelte:head><title>Clientes | Mecanica Systems</title></svelte:head>

<div class="cabecalho">
  <h1>Clientes</h1>
  {#if escrita}
    <a class="ui-botao ui-botao-primario" href="/app/clientes/novo" data-testid="clientes-btn-novo">Novo cliente</a>
  {/if}
</div>

<div class="filtros">
  <Busca
    bind:valor={termo}
    placeholder="Buscar por nome ou telefone"
    rotulo="Buscar clientes"
    onbuscar={(t) => navegar({ q: t, pagina: 1 })}
    testid="clientes-busca"
  />
  <label class="inativos">
    <input
      type="checkbox"
      checked={inativos}
      onchange={(e) => navegar({ inativos: e.currentTarget.checked, pagina: 1 })}
      data-testid="clientes-inativos"
    />
    Mostrar inativos
  </label>
</div>

{#if carregando}
  <Carregando tipo="esqueleto" linhas={5} rotulo="Carregando clientes…" testid="clientes-carregando" />
{:else if erro}
  <div role="alert" class="erro-lista" data-testid="clientes-erro">
    <p class="ui-erro">{erro}</p>
    <Botao testid="clientes-tentar-de-novo" onclick={() => tentativa++}>Tentar de novo</Botao>
  </div>
{:else if itens.length === 0}
  {#if q || inativos}
    <EstadoVazio
      titulo="Nenhum cliente encontrado"
      texto="Tente outro nome ou telefone."
      testid="clientes-vazio"
    >
      {#snippet acao()}
        <Botao
          testid="clientes-limpar"
          onclick={() => {
            termo = '';
            navegar({ q: '', pagina: 1, inativos: false });
          }}>Limpar filtros</Botao
        >
      {/snippet}
    </EstadoVazio>
  {:else}
    <EstadoVazio
      titulo="Nenhum cliente cadastrado"
      texto={escrita ? 'Cadastre o primeiro cliente para abrir ordens de serviço.' : 'Ainda não há clientes cadastrados.'}
      testid="clientes-vazio"
    >
      {#snippet acao()}
        {#if escrita}
          <a class="ui-botao ui-botao-primario" href="/app/clientes/novo" data-testid="clientes-vazio-novo">Cadastrar cliente</a>
        {/if}
      {/snippet}
    </EstadoVazio>
  {/if}
{:else}
  <Tabela {colunas} linhas={itens} altura="none" legenda="Lista de clientes" testid="clientes">
    {#snippet linha(c: Cliente)}
      <td>
        <a href="/app/clientes/{c.id}" data-testid="clientes-linha-link">{c.nome}</a>
      </td>
      <td>{formatarTelefone(c.telefone)}</td>
      <td>{c.email ?? ''}</td>
      <td>
        {#if c.ativo}<Etiqueta tom="sucesso">Ativo</Etiqueta>{:else}<Etiqueta tom="neutro">Inativo</Etiqueta>{/if}
      </td>
    {/snippet}
  </Tabela>
  <Paginacao {pagina} {total} onmudar={(p) => navegar({ pagina: p })} testid="clientes-paginacao" />
{/if}

<style>
  .cabecalho { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: var(--esp-3); margin-bottom: var(--esp-4); }
  .cabecalho h1 { margin: 0; }
  .filtros { display: flex; flex-wrap: wrap; align-items: center; gap: var(--esp-4); margin-bottom: var(--esp-4); }
  .filtros :global(.ui-busca) { flex: 1 1 16rem; min-width: 0; }
  .inativos { display: inline-flex; align-items: center; gap: var(--esp-2); min-height: var(--alvo); }
  .erro-lista { display: grid; gap: var(--esp-2); justify-items: start; }
  a.ui-botao { text-decoration: none; display: inline-flex; align-items: center; }
</style>
