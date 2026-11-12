<script lang="ts">
  import { page } from '$app/state';
  import EstadoVazio from '../../../../../lib/ui/EstadoVazio.svelte';
  import SubNav from '../../../../../lib/estoque/SubNav.svelte';
  import FormAjuste from '../../../../../lib/estoque/FormAjuste.svelte';
  import { pode } from '../../../../../lib/estado/oficina.svelte';
</script>

<svelte:head><title>Ajuste de estoque | Mecanica Systems</title></svelte:head>

<h1>Ajuste de estoque</h1>
<SubNav />
{#if pode('estoque', 'escrita')}
  <FormAjuste itemInicial={page.url.searchParams.get('item') ?? ''} />
{:else}
  <EstadoVazio titulo="Sem permissão" texto="Você só pode consultar o estoque." testid="estoque-sem-escrita" />
{/if}
