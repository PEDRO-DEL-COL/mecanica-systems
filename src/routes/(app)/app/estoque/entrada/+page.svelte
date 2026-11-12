<script lang="ts">
  import { page } from '$app/state';
  import EstadoVazio from '../../../../../lib/ui/EstadoVazio.svelte';
  import SubNav from '../../../../../lib/estoque/SubNav.svelte';
  import FormEntrada from '../../../../../lib/estoque/FormEntrada.svelte';
  import { pode } from '../../../../../lib/estado/oficina.svelte';
</script>

<svelte:head><title>Entrada de estoque | Mecanica Systems</title></svelte:head>

<h1>Entrada de compra</h1>
<SubNav />
{#if pode('estoque', 'escrita')}
  <FormEntrada itemInicial={page.url.searchParams.get('item') ?? ''} />
{:else}
  <EstadoVazio titulo="Sem permissão" texto="Você só pode consultar o estoque." testid="estoque-sem-escrita" />
{/if}
