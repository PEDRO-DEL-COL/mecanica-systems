<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import FormularioVeiculo from '../../../../../lib/veiculos/FormularioVeiculo.svelte';
  import EstadoVazio from '../../../../../lib/ui/EstadoVazio.svelte';
  import { pode } from '../../../../../lib/estado/oficina.svelte';

  const clienteId = $derived(page.url.searchParams.get('cliente'));
</script>

<svelte:head><title>Novo veículo | Mecanica Systems</title></svelte:head>

<p><a href="/app/veiculos">← Veículos</a></p>
<h1>Novo veículo</h1>
{#if pode('veiculos', 'escrita')}
  <FormularioVeiculo
    clienteInicialId={clienteId}
    onsalvo={(v) => goto(`/app/veiculos/${v.id}`)}
    oncancelar={() => goto('/app/veiculos')}
  />
{:else}
  <EstadoVazio titulo="Sem permissão" texto="Você não pode cadastrar veículos." testid="veiculos-sem-permissao" />
{/if}
