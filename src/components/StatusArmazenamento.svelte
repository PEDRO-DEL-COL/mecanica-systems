<script lang="ts">
  let { persistente, usadoBytes, quotaBytes }: {
    persistente: boolean;
    usadoBytes: number;
    quotaBytes: number;
  } = $props();

  const mb = (b: number) => (b / 1024 / 1024).toFixed(1);
</script>

<div class="status">
  <span>Armazenamento persistente: {persistente ? 'sim' : 'não'}</span>
  <span>Uso: {mb(usadoBytes)} MB / {mb(quotaBytes)} MB</span>
</div>

<style>
  .status { display: flex; gap: 1rem; font-size: 0.85rem; font-family: sans-serif; }
</style>
