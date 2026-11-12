<script lang="ts">
  import type { Snippet } from 'svelte';

  interface Props {
    tom?: 'neutro' | 'info' | 'sucesso' | 'aviso' | 'erro';
    testid?: string;
    children: Snippet;
  }
  let { tom = 'neutro', testid = 'ui-etiqueta', children }: Props = $props();
</script>

<span class="ui-etiqueta ui-etiqueta-{tom}" data-testid={testid}>{@render children()}</span>
