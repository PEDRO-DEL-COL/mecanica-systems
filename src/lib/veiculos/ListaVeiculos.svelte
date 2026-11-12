<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import Botao from '../ui/Botao.svelte';
  import Busca from '../ui/Busca.svelte';
  import Tabela from '../ui/Tabela.svelte';
  import Paginacao from '../ui/Paginacao.svelte';
  import EstadoVazio from '../ui/EstadoVazio.svelte';
  import Carregando from '../ui/Carregando.svelte';
  import Etiqueta from '../ui/Etiqueta.svelte';
  import { listarVeiculos } from '../repos/veiculos';
  import { obterCliente } from '../repos/clientes';
  import { pode } from '../estado/oficina.svelte';
  import type { Veiculo } from '../tipos/veiculos';
  import { formatarKm, formatarPlaca, descricaoVeiculo } from './formato';

  const colunas = [
    { chave: 'placa', rotulo: 'Placa' },
    { chave: 'veiculo', rotulo: 'Veículo' },
    { chave: 'dono', rotulo: 'Dono' },
    { chave: 'km', rotulo: 'Km', alinhar: 'direita' as const },
    { chave: 'situacao', rotulo: 'Situação' }
  ];

  const busca = $derived(page.url.searchParams.get('q') ?? '');
  const pagina = $derived(Math.max(1, Number(page.url.searchParams.get('pagina')) || 1));
  const inativos = $derived(page.url.searchParams.get('inativos') === '1');

  let textoBusca = $state(page.url.searchParams.get('q') ?? '');
  let itens = $state<Veiculo[]>([]);
  let total = $state(0);
  let carregando = $state(true);
  let erro = $state('');
  let donos = $state<Record<string, string>>({});
  let seq = 0;

  function irPara(mudar: (p: URLSearchParams) => void) {
    const p = new URLSearchParams(page.url.searchParams.toString());
    mudar(p);
    const qs = p.toString();
    void goto(qs ? `?${qs}` : page.url.pathname, { replaceState: true });
  }

  function aoBuscar(t: string) {
    irPara((p) => {
      if (t) p.set('q', t);
      else p.delete('q');
      p.delete('pagina');
    });
  }

  function alternarInativos(e: Event) {
    const marcado = (e.currentTarget as HTMLInputElement).checked;
    irPara((p) => {
      if (marcado) p.set('inativos', '1');
      else p.delete('inativos');
      p.delete('pagina');
    });
  }

  function mudarPagina(n: number) {
    irPara((p) => {
      if (n > 1) p.set('pagina', String(n));
      else p.delete('pagina');
    });
  }

  async function carregarDonos(lista: Veiculo[]) {
    const ids = [...new Set(lista.map((i) => i.cliente_id))].filter((id) => !(id in donos));
    const rs = await Promise.all(ids.map((id) => obterCliente(id)));
    const novos: Record<string, string> = {};
    rs.forEach((r, i) => {
      novos[ids[i]] = r.ok ? r.dados.nome : '—';
    });
    donos = { ...donos, ...novos };
  }

  $effect(() => {
    const parametros = { busca, pagina, incluirInativos: inativos };
    const meu = ++seq;
    carregando = true;
    erro = '';
    void listarVeiculos(parametros).then((r) => {
      if (meu !== seq) return;
      carregando = false;
      if (!r.ok) {
        erro = r.erro.mensagem;
        itens = [];
        total = 0;
        return;
      }
      itens = r.dados.itens;
      total = r.dados.total;
      void carregarDonos(r.dados.itens);
    });
  });

  const podeCriar = $derived(pode('veiculos', 'escrita'));
  const filtrando = $derived(busca.length > 0 || inativos);
</script>

<div class="cabecalho">
  <h1>Veículos</h1>
  {#if podeCriar}
    <Botao variante="primario" testid="veiculos-btn-novo" onclick={() => goto('/app/veiculos/novo')}>Novo veículo</Botao>
  {/if}
</div>

<div class="filtros">
  <Busca
    bind:valor={textoBusca}
    rotulo="Buscar veículo"
    placeholder="Buscar por placa, marca ou modelo…"
    onbuscar={aoBuscar}
    testid="veiculos-busca"
  />
  <label class="inativos">
    <input type="checkbox" checked={inativos} onchange={alternarInativos} data-testid="veiculos-inativos" />
    Mostrar inativos
  </label>
</div>

{#if erro}
  <p class="ui-erro" role="alert" data-testid="veiculos-erro">{erro}</p>
{:else if carregando && itens.length === 0}
  <Carregando tipo="esqueleto" linhas={4} testid="veiculos-carregando" />
{:else if itens.length === 0}
  <EstadoVazio
    titulo={filtrando ? 'Nenhum veículo encontrado' : 'Nenhum veículo cadastrado'}
    texto={filtrando ? 'Ajuste a busca ou os filtros.' : 'Cadastre o primeiro veículo para começar.'}
    testid="veiculos-vazio"
  >
    {#snippet acao()}
      {#if podeCriar && !filtrando}
        <Botao variante="primario" testid="veiculos-vazio-novo" onclick={() => goto('/app/veiculos/novo')}>Novo veículo</Botao>
      {/if}
    {/snippet}
  </EstadoVazio>
{:else}
  <Tabela {colunas} linhas={itens} legenda="Lista de veículos" altura="none" testid="veiculos-tabela">
    {#snippet linha(v: Veiculo)}
      <td>
        <a href="/app/veiculos/{v.id}" data-testid="veiculos-link">{formatarPlaca(v.placa)}</a>
      </td>
      <td>{descricaoVeiculo(v)}{v.cor ? ` · ${v.cor}` : ''}</td>
      <td>{donos[v.cliente_id] ?? '…'}</td>
      <td class="ui-alinhar-direita">{formatarKm(v.km_atual)}</td>
      <td>{#if v.ativo}<Etiqueta tom="sucesso">Ativo</Etiqueta>{:else}<Etiqueta tom="neutro">Inativo</Etiqueta>{/if}</td>
    {/snippet}
  </Tabela>
  <Paginacao {pagina} {total} onmudar={mudarPagina} testid="veiculos-paginacao" />
{/if}

<style>
  .cabecalho {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    flex-wrap: wrap;
  }
  .filtros {
    display: flex;
    gap: 1rem;
    align-items: center;
    flex-wrap: wrap;
    margin: 1rem 0;
  }
  .inativos {
    display: inline-flex;
    gap: 0.4rem;
    align-items: center;
  }
</style>
