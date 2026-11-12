<script lang="ts">
  interface Props {
    tipo?: 'spinner' | 'esqueleto';
    linhas?: number;
    rotulo?: string;
    testid?: string;
  }
  let { tipo = 'spinner', linhas = 3, rotulo = 'Carregando…', testid = 'ui-carregando' }: Props = $props();
</script>

<div class="ui-carregando" role="status" aria-live="polite" data-testid={testid}>
  {#if tipo === 'spinner'}
    <span class="ui-spinner" aria-hidden="true"></span>
    <span>{rotulo}</span>
  {:else}
    <span class="ui-sr-only">{rotulo}</span>
    {#each Array(linhas) as _, i (i)}
      <div class="ui-esqueleto" style:width="{100 - i * 12}%" aria-hidden="true"></div>
    {/each}
  {/if}
</div>
