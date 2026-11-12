<script lang="ts">
  import '../../styles/app.css';
  import Toasts from '../../lib/ui/Toasts.svelte';
  let { children } = $props();
</script>

{@render children()}
<Toasts />
