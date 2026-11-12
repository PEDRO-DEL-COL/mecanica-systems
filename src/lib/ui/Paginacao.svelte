<script lang="ts">
  import Botao from './Botao.svelte';

  interface Props {
    pagina: number; // 1-based
    total: number;
    porPagina?: number;
    onmudar: (pagina: number) => void;
    testid?: string;
  }
  let { pagina, total, porPagina = 25, onmudar, testid = 'ui-paginacao' }: Props = $props();

  const paginas = $derived(Math.max(1, Math.ceil(total / porPagina)));
  const de = $derived(total === 0 ? 0 : (pagina - 1) * porPagina + 1);
  const ate = $derived(Math.min(total, pagina * porPagina));
</script>

<nav class="ui-paginacao" aria-label="Paginação" data-testid={testid}>
  <span class="ui-paginacao-info" aria-live="polite">{de}–{ate} de {total}</span>
  <div class="ui-paginacao-botoes">
    <Botao pequeno testid="{testid}-anterior" disabled={pagina <= 1} onclick={() => onmudar(pagina - 1)}>Anterior</Botao>
    <span class="ui-paginacao-pagina">Página {pagina} de {paginas}</span>
    <Botao pequeno testid="{testid}-proxima" disabled={pagina >= paginas} onclick={() => onmudar(pagina + 1)}>Próxima</Botao>
  </div>
</nav>
