<script lang="ts">
  import '../../../styles/app.css';
  let { children } = $props();
</script>

<div class="centro">{@render children()}</div>

<style>
  .centro { min-height: 100dvh; display: grid; place-items: center; padding: var(--esp-4); }
</style>
