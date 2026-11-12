<script lang="ts">
  import { toast } from './toast.svelte';
</script>

<div class="ui-toasts" aria-live="polite" aria-atomic="false" data-testid="ui-toasts">
  {#each toast.itens as t (t.id)}
    <div class="ui-toast ui-toast-{t.tom}" role={t.tom === 'erro' ? 'alert' : 'status'} data-testid="ui-toast">
      <span>{t.mensagem}</span>
      <button type="button" class="ui-toast-fechar" aria-label="Fechar aviso" onclick={() => toast.fechar(t.id)}>×</button>
    </div>
  {/each}
</div>
