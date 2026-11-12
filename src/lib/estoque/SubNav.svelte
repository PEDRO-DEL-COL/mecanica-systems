<script lang="ts">
  import { page } from '$app/state';
  import { pode } from '../estado/oficina.svelte';

  const abas = $derived(
    [
      { href: '/app/estoque', rotulo: 'Saldos', id: 'saldos', visivel: true },
      { href: '/app/estoque/entrada', rotulo: 'Entrada', id: 'entrada', visivel: pode('estoque', 'escrita') },
      { href: '/app/estoque/ajuste', rotulo: 'Ajuste', id: 'ajuste', visivel: pode('estoque', 'escrita') },
      { href: '/app/estoque/movimentos', rotulo: 'Movimentos', id: 'movimentos', visivel: true },
      { href: '/app/estoque/fornecedores', rotulo: 'Fornecedores', id: 'fornecedores', visivel: true }
    ].filter((a) => a.visivel)
  );
  const caminho = $derived(page.url.pathname.replace(/\/+$/, ''));
</script>

<nav class="subnav" aria-label="Estoque">
  {#each abas as a (a.id)}
    <a href={a.href} aria-current={caminho === a.href ? 'page' : undefined} data-testid="estoque-aba-{a.id}">{a.rotulo}</a>
  {/each}
</nav>

<style>
  .subnav { display: flex; flex-wrap: wrap; gap: var(--esp-2); margin-bottom: var(--esp-4); }
  a { display: inline-flex; align-items: center; min-height: var(--alvo); padding: 0 var(--esp-3); border: 1px solid var(--cor-borda); border-radius: var(--raio-sm); text-decoration: none; color: inherit; font-weight: 500; }
  a[aria-current='page'] { background: var(--cor-primaria); border-color: var(--cor-primaria); color: #fff; font-weight: 650; }
</style>
