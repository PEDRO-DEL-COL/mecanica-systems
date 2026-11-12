<script lang="ts">
  import type { Snippet } from 'svelte';

  interface Props {
    titulo: string;
    texto?: string;
    /** CTA: normalmente um <Botao>. */
    acao?: Snippet;
    testid?: string;
  }
  let { titulo, texto, acao, testid = 'ui-estado-vazio' }: Props = $props();
</script>

<div class="ui-vazio" data-testid={testid}>
  <h3>{titulo}</h3>
  {#if texto}<p>{texto}</p>{/if}
  {#if acao}<div class="ui-vazio-acao">{@render acao()}</div>{/if}
</div>
