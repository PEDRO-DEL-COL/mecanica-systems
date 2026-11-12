<script lang="ts">
  let { persistente, usadoBytes, quotaBytes }: {
    persistente: boolean;
    usadoBytes: number;
    quotaBytes: number;
  } = $props();

  const mb = (b: number) => (b / 1024 / 1024).toFixed(1);
  const pct = $derived(quotaBytes > 0 ? Math.min(100, (usadoBytes / quotaBytes) * 100) : 0);
</script>

<div class="status">
  <p>
    Armazenamento persistente:
    <span class="badge" class:badge-ativo={persistente} class:badge-inativo={!persistente}>{persistente ? 'sim' : 'não'}</span>
  </p>
  <p>Uso: {mb(usadoBytes)} MB / {mb(quotaBytes)} MB</p>
  <div class="barra" role="progressbar" aria-label="Uso do armazenamento" aria-valuemin="0" aria-valuemax="100" aria-valuenow={Math.round(pct)}>
    <div style:width={`${Math.max(pct, 1)}%`}></div>
  </div>
</div>

<style>
  .status p { margin: 0 0 var(--esp-2); }
  .barra { height: 8px; border-radius: 999px; background: var(--cor-borda); overflow: hidden; }
  .barra div { height: 100%; background: var(--cor-primaria); }
</style>
