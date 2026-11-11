<script lang="ts">
  let { faltando }: { faltando: string[] } = $props();
</script>

<div role="alert" class="tela">
  <h1>Navegador incompatível</h1>
  <p>Recursos ausentes:</p>
  <ul>
    {#each faltando as item}
      <li>{item}</li>
    {/each}
  </ul>
  <p>Recomendamos usar Chrome ou Edge no Windows.</p>
</div>

<style>
  .tela { padding: 2rem; font-family: sans-serif; }
  ul { display: inline-block; text-align: left; }
</style>
