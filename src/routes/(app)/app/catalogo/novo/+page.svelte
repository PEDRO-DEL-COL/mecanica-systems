<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import { criarItem } from '../../../../../lib/repos/catalogo';
  import { pode } from '../../../../../lib/estado/oficina.svelte';
  import { toast } from '../../../../../lib/ui/toast.svelte';
  import FormularioItem from '../../../../../lib/catalogo/FormularioItem.svelte';
  import EstadoVazio from '../../../../../lib/ui/EstadoVazio.svelte';
  import type { SaidaItemCatalogo } from '../../../../../lib/validacao/catalogo';

  const tipo = $derived(page.url.searchParams.get('tipo') === 'peca' ? 'peca' : 'servico');
  const escrita = $derived(pode('catalogo', 'escrita'));
  const verCusto = $derived(pode('financeiro', 'leitura'));

  async function salvar(dados: SaidaItemCatalogo) {
    const r = await criarItem(dados, crypto.randomUUID());
    if (!r.ok) return r.erro;
    toast.sucesso(tipo === 'peca' ? 'Peça cadastrada.' : 'Serviço cadastrado.');
    await goto(`/app/catalogo?tipo=${tipo}`);
    return null;
  }
</script>

<svelte:head><title>{tipo === 'peca' ? 'Nova peça' : 'Novo serviço'} | Mecanica Systems</title></svelte:head>

<p><a href="/app/catalogo?tipo={tipo}">← Voltar ao catálogo</a></p>
<h1>{tipo === 'peca' ? 'Nova peça' : 'Novo serviço'}</h1>

{#if !escrita}
  <EstadoVazio titulo="Sem permissão" texto="Você não tem permissão para cadastrar itens no catálogo." />
{:else}
  {#key tipo}
    <!-- Sem custo no cadastro: o custo médio nasce nas entradas de estoque. -->
    <FormularioItem {tipo} custo={verCusto ? null : undefined} onsalvar={salvar} oncancelar={() => goto(`/app/catalogo?tipo=${tipo}`)} />
  {/key}
{/if}
