<script lang="ts">
  import type { ItemCusto } from '../tipos/catalogo';
  import { formatarReais } from '../puro/dinheiro';
  import { calcularMargem, formatarPercentualDecimos } from '../puro/margem';

  interface Props {
    /** Preço de venda atual (centavos); null se o campo estiver vazio/inválido. */
    venda: number | null;
    /** Custo do item; null = ainda sem custo informado. */
    custo: ItemCusto | null;
  }
  let { venda, custo }: Props = $props();

  const calc = $derived(venda !== null && custo ? calcularMargem(venda, custo.custo_medio_centavos) : null);
</script>

<section class="cartao catalogo-custo" aria-labelledby="catalogo-custo-titulo" data-testid="catalogo-custo">
  <h2 id="catalogo-custo-titulo">Custo e margem</h2>
  {#if !custo}
    <p data-testid="catalogo-custo-vazio">Custo ainda não informado. Ele é atualizado a cada entrada de estoque.</p>
  {:else}
    <dl class="catalogo-custo-lista">
      <div>
        <dt>Custo médio</dt>
        <dd data-testid="catalogo-custo-medio">{formatarReais(custo.custo_medio_centavos)}</dd>
      </div>
      {#if custo.ultimo_custo_centavos !== null}
        <div>
          <dt>Último custo</dt>
          <dd data-testid="catalogo-custo-ultimo">{formatarReais(custo.ultimo_custo_centavos)}</dd>
        </div>
      {/if}
      <div>
        <dt>Markup (sobre o custo)</dt>
        <dd data-testid="catalogo-markup">{calc ? formatarPercentualDecimos(calc.markupDecimos) : '—'}</dd>
      </div>
      <div>
        <dt>Margem (sobre a venda)</dt>
        <dd data-testid="catalogo-margem">{calc ? formatarPercentualDecimos(calc.margemDecimos) : '—'}</dd>
      </div>
    </dl>
    <small class="ui-ajuda">Markup = (venda − custo) ÷ custo. Margem = (venda − custo) ÷ venda.</small>
  {/if}
</section>

<style>
  .catalogo-custo-lista { display: grid; grid-template-columns: repeat(auto-fit, minmax(10rem, 1fr)); gap: var(--esp-3); margin: 0 0 var(--esp-2); }
  .catalogo-custo-lista dt { font-size: var(--txt-xs); color: var(--cor-texto-suave); }
  .catalogo-custo-lista dd { margin: 0; font-weight: 650; font-size: var(--txt-lg); }
</style>
