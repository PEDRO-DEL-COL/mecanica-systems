<script lang="ts">
  import type { Snippet } from 'svelte';

  interface Props {
    aberto?: boolean;
    titulo: string;
    onfechar?: () => void;
    testid?: string;
    children: Snippet;
    rodape?: Snippet;
  }
  let { aberto = $bindable(false), titulo, onfechar, testid = 'ui-dialogo', children, rodape }: Props = $props();

  const uid = $props.id();
  const idTitulo = `dialogo-${uid}-titulo`;
  let el: HTMLDialogElement | undefined = $state();
  let anterior: HTMLElement | null = null;

  // <dialog> modal nativo: foco preso, Esc fecha, resto da pagina inerte.
  $effect(() => {
    if (!el) return;
    if (aberto && !el.open) {
      anterior = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      el.showModal();
    } else if (!aberto && el.open) {
      el.close();
    }
  });

  function aoFechar() {
    const volta = anterior;
    anterior = null;
    if (aberto) aberto = false;
    onfechar?.();
    volta?.focus();
  }

  function aoClicar(e: MouseEvent) {
    if (e.target === el) aberto = false; // clique no backdrop
  }
</script>

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions -->
<dialog bind:this={el} class="ui-dialogo" aria-labelledby={idTitulo} onclose={aoFechar} onclick={aoClicar} data-testid={testid}>
  {#if aberto}
    <div class="ui-dialogo-corpo">
      <h2 id={idTitulo} class="ui-dialogo-titulo">{titulo}</h2>
      <div class="ui-dialogo-conteudo">{@render children()}</div>
      {#if rodape}<div class="ui-dialogo-rodape">{@render rodape()}</div>{/if}
    </div>
  {/if}
</dialog>
