<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { HTMLButtonAttributes } from 'svelte/elements';

  interface Props extends Omit<HTMLButtonAttributes, 'children'> {
    variante?: 'primario' | 'secundario' | 'perigo' | 'neutro';
    pequeno?: boolean;
    carregando?: boolean;
    testid?: string;
    children: Snippet;
  }
  let {
    variante = 'neutro',
    pequeno = false,
    carregando = false,
    type = 'button',
    disabled = false,
    testid = 'ui-botao',
    children,
    ...resto
  }: Props = $props();
</script>

<button
  {...resto}
  {type}
  class={['ui-botao', `ui-botao-${variante}`, pequeno && 'ui-botao-pequeno']}
  disabled={disabled || carregando}
  aria-busy={carregando}
  data-testid={testid}
>
  {#if carregando}<span class="ui-spinner ui-spinner-pequeno" aria-hidden="true"></span>{/if}
  {@render children()}
</button>
