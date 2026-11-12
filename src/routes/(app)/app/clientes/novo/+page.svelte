<script lang="ts">
  import { goto } from '$app/navigation';
  import { criarCliente } from '../../../../../lib/repos/clientes';
  import { pode } from '../../../../../lib/estado/oficina.svelte';
  import { toast } from '../../../../../lib/ui/toast.svelte';
  import EstadoVazio from '../../../../../lib/ui/EstadoVazio.svelte';
  import FormularioCliente from '../../../../../lib/clientes/FormularioCliente.svelte';
</script>

<svelte:head><title>Novo cliente | Mecanica Systems</title></svelte:head>

<p><a href="/app/clientes">← Clientes</a></p>
<h1>Novo cliente</h1>

{#if !pode('clientes', 'escrita')}
  <EstadoVazio titulo="Sem permissão" texto="Você não pode cadastrar clientes. Peça ao dono da oficina." testid="clientes-sem-escrita" />
{:else}
  <FormularioCliente
    onsalvar={criarCliente}
    onsalvo={(c) => {
      toast.sucesso('Cliente cadastrado.');
      void goto(`/app/clientes/${c.id}`);
    }}
    oncancelar={() => void goto('/app/clientes')}
  />
{/if}
