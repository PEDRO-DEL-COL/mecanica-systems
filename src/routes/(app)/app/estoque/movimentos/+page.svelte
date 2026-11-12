<script lang="ts">
  import * as v from 'valibot';
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import Botao from '../../../../../lib/ui/Botao.svelte';
  import Carregando from '../../../../../lib/ui/Carregando.svelte';
  import ConfirmarDialogo from '../../../../../lib/ui/ConfirmarDialogo.svelte';
  import EstadoVazio from '../../../../../lib/ui/EstadoVazio.svelte';
  import Etiqueta from '../../../../../lib/ui/Etiqueta.svelte';
  import Paginacao from '../../../../../lib/ui/Paginacao.svelte';
  import Tabela from '../../../../../lib/ui/Tabela.svelte';
  import { toast } from '../../../../../lib/ui/toast.svelte';
  import SubNav from '../../../../../lib/estoque/SubNav.svelte';
  import SeletorPeca from '../../../../../lib/estoque/SeletorPeca.svelte';
  import { quantidadeComSinal, ROTULO_TIPO } from '../../../../../lib/estoque/formato';
  import { pode } from '../../../../../lib/estado/oficina.svelte';
  import { estornarMovimento, listarCustosMovimentos, listarEstornados, listarMovimentos } from '../../../../../lib/repos/estoque';
  import { obterCustoItem } from '../../../../../lib/repos/catalogo';
  import { estornoSchema } from '../../../../../lib/validacao/estoque';
  import { formatarDataHora } from '../../../../../lib/puro/formatos';
  import { formatarReais } from '../../../../../lib/puro/dinheiro';
  import type { MovimentoEstoque, SaldoEstoque } from '../../../../../lib/tipos/estoque';

  const itemUrl = $derived(page.url.searchParams.get('item') ?? '');
  const pagina = $derived(Math.max(1, Math.floor(Number(page.url.searchParams.get('p'))) || 1));
  const verCusto = $derived(pode('financeiro', 'leitura'));
  const podeEstornar = $derived(pode('estoque', 'escrita'));

  let itemSel = $state(page.url.searchParams.get('item') ?? '');
  let saldoItem = $state<SaldoEstoque | null>(null);
  let movimentos = $state<MovimentoEstoque[]>([]);
  let total = $state(0);
  let estornados = $state<Set<string>>(new Set());
  let custos = $state<Map<string, number>>(new Map());
  let custoMedio = $state<number | null>(null);
  let carregando = $state(false);
  let erro = $state('');
  let recarga = $state(0);

  let estornando = $state<MovimentoEstoque | null>(null);
  let dialogoEstorno = $state(false);
  let enviandoEstorno = $state(false);
  let erroEstorno = $state('');

  // Seleção da peça -> URL.
  $effect(() => {
    if (itemSel !== itemUrl) {
      const u = new URL(page.url.href);
      if (itemSel) u.searchParams.set('item', itemSel);
      else u.searchParams.delete('item');
      u.searchParams.delete('p');
      void goto(u.pathname + u.search, { replaceState: true });
    }
  });

  $effect(() => {
    void recarga;
    const id = itemUrl;
    const p = pagina;
    const comCusto = verCusto;
    if (!id) {
      movimentos = [];
      total = 0;
      return;
    }
    const ctrl = new AbortController();
    carregando = true;
    erro = '';
    void (async () => {
      const r = await listarMovimentos({ itemId: id, pagina: p }, ctrl.signal);
      if (ctrl.signal.aborted) return;
      if (!r.ok) {
        carregando = false;
        movimentos = [];
        erro = r.erro.mensagem;
        return;
      }
      const ids = r.dados.itens.map((m) => m.id);
      const [est, cus, med] = await Promise.all([
        listarEstornados(ids),
        comCusto ? listarCustosMovimentos(ids) : Promise.resolve(null),
        comCusto ? obterCustoItem(id) : Promise.resolve(null)
      ]);
      if (ctrl.signal.aborted) return;
      estornados = new Set(est.ok ? est.dados : []);
      custos = new Map(cus && cus.ok ? cus.dados.map((c) => [c.movimento_id, c.custo_unitario_centavos]) : []);
      custoMedio = med && med.ok && med.dados ? med.dados.custo_medio_centavos : null;
      movimentos = r.dados.itens;
      total = r.dados.total ?? r.dados.itens.length;
      carregando = false;
    })();
    return () => ctrl.abort();
  });

  function irPara(p: number) {
    const u = new URL(page.url.href);
    if (p > 1) u.searchParams.set('p', String(p));
    else u.searchParams.delete('p');
    void goto(u.pathname + u.search, { replaceState: true });
  }

  function pedirEstorno(m: MovimentoEstoque) {
    estornando = m;
    erroEstorno = '';
    dialogoEstorno = true;
  }

  async function confirmarEstorno(motivo: string) {
    if (!estornando) return;
    const r0 = v.safeParse(estornoSchema, { movimento_id: estornando.id, motivo });
    if (!r0.success) {
      erroEstorno = r0.issues[0].message;
      toast.erro(erroEstorno);
      return;
    }
    enviandoEstorno = true;
    const r = await estornarMovimento(r0.output);
    enviandoEstorno = false;
    if (!r.ok) {
      toast.erro(r.erro.mensagem);
      return;
    }
    dialogoEstorno = false;
    estornando = null;
    toast.sucesso(`Movimento estornado. Saldo atual: ${quantidadeComSinal(r.dados.saldo)}.`);
    recarga++;
  }

  function estornavel(m: MovimentoEstoque): boolean {
    return podeEstornar && m.tipo !== 'estorno' && m.tipo !== 'saida_os' && !estornados.has(m.id);
  }

  const colunas = $derived([
    { chave: 'data', rotulo: 'Data' },
    { chave: 'tipo', rotulo: 'Tipo' },
    { chave: 'qtd', rotulo: 'Quantidade', alinhar: 'direita' as const },
    ...(verCusto ? [{ chave: 'custo', rotulo: 'Custo unit.', alinhar: 'direita' as const }] : []),
    { chave: 'detalhe', rotulo: 'Detalhes' },
    { chave: 'acoes', rotulo: 'Ações' }
  ]);
</script>

<svelte:head><title>Movimentos de estoque | Mecanica Systems</title></svelte:head>

<h1>Movimentos de estoque</h1>
<SubNav />

<div class="seletor">
  <SeletorPeca bind:valor={itemSel} onescolher={(s) => (saldoItem = s)} testid="estoque-mov-peca" />
</div>

{#if !itemUrl}
  <EstadoVazio titulo="Escolha uma peça" texto="Selecione a peça para ver o histórico de movimentos." testid="estoque-mov-escolha" />
{:else}
  {#if saldoItem}
    <p class="resumo" data-testid="estoque-mov-resumo">
      <strong>{saldoItem.descricao}</strong>: saldo {quantidadeComSinal(saldoItem.saldo)} {saldoItem.unidade}
      {#if saldoItem.negativo}<Etiqueta tom="erro">Saldo negativo</Etiqueta>{/if}
      {#if verCusto && custoMedio !== null}
        <span data-testid="estoque-mov-custo-medio">Custo médio: {formatarReais(custoMedio)}</span>
      {/if}
    </p>
  {/if}
  {#if carregando}
    <Carregando tipo="esqueleto" rotulo="Carregando movimentos…" testid="estoque-mov-carregando" />
  {:else if erro}
    <p class="ui-erro" role="alert" data-testid="estoque-mov-erro">{erro}</p>
  {:else if movimentos.length === 0}
    <EstadoVazio titulo="Sem movimentos" texto="Esta peça ainda não teve movimentos de estoque." testid="estoque-mov-vazio">
      {#snippet acao()}
        {#if podeEstornar}
          <a class="ui-botao ui-botao-primario" href="/app/estoque/entrada?item={itemUrl}">Registrar entrada</a>
        {/if}
      {/snippet}
    </EstadoVazio>
  {:else}
    <Tabela {colunas} linhas={movimentos} legenda="Movimentos da peça" altura="none" testid="estoque-mov-tabela">
      {#snippet linha(m: MovimentoEstoque)}
        <td>{formatarDataHora(m.criado_em)}</td>
        <td>
          {ROTULO_TIPO[m.tipo]}
          {#if estornados.has(m.id)}<Etiqueta tom="neutro" testid="estoque-mov-estornado">Estornado</Etiqueta>{/if}
        </td>
        <td class="ui-alinhar-direita" data-testid="estoque-mov-qtd">{quantidadeComSinal(m.quantidade)}</td>
        {#if verCusto}
          <td class="ui-alinhar-direita" data-testid="estoque-mov-custo">
            {custos.has(m.id) ? formatarReais(custos.get(m.id) ?? 0) : ''}
          </td>
        {/if}
        <td>
          {#if m.motivo}{m.motivo}{/if}
          {#if m.nota_fiscal}<br /><small>NF {m.nota_fiscal}</small>{/if}
        </td>
        <td>
          {#if estornavel(m)}
            <Botao pequeno variante="perigo" testid="estoque-btn-estornar" onclick={() => pedirEstorno(m)}>Estornar</Botao>
          {/if}
        </td>
      {/snippet}
    </Tabela>
    <Paginacao {pagina} {total} onmudar={irPara} testid="estoque-mov-paginacao" />
  {/if}
{/if}

<ConfirmarDialogo
  bind:aberto={dialogoEstorno}
  titulo="Estornar movimento"
  texto="Será criado um movimento inverso. O movimento original é mantido no histórico."
  rotuloConfirmar="Estornar"
  perigo
  motivo="obrigatorio"
  carregando={enviandoEstorno}
  onconfirmar={confirmarEstorno}
  testid="estoque-estorno"
/>
{#if erroEstorno}<span class="ui-sr-only" role="status">{erroEstorno}</span>{/if}

<style>
  .seletor { max-width: 32rem; margin-bottom: var(--esp-4); }
  .resumo { display: flex; flex-wrap: wrap; gap: var(--esp-3); align-items: center; }
  a.ui-botao { text-decoration: none; display: inline-flex; align-items: center; }
</style>
