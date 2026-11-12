<script lang="ts">
  import { page } from '$app/state';
  import FichaVeiculo from '../../../../../lib/veiculos/FichaVeiculo.svelte';
</script>

<svelte:head><title>Veículo | Mecanica Systems</title></svelte:head>

<FichaVeiculo id={page.params.id ?? ''} />
