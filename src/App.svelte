<script lang="ts">
  import { db, ErroBanco } from './db/client';
  import type { VersaoInfo } from './db/protocol';

  let info = $state<VersaoInfo | null>(null);
  let erro = $state<string | null>(null);

  db.versaoInfo()
    .then((v) => (info = v))
    .catch((e: unknown) => {
      erro = e instanceof ErroBanco && e.codigo ? `[${e.codigo}] ${e.message}` : String(e instanceof Error ? e.message : e);
    });
</script>

<main>
  <h1>Mecanica Systems</h1>
  <section>
    <h2>Diagnóstico do banco</h2>
    {#if erro}
      <p class="erro" role="alert">{erro}</p>
    {:else if !info}
      <p>Abrindo banco…</p>
    {:else}
      <dl>
        <dt>SQLite</dt><dd>{info.sqlite}</dd>
        <dt>VFS</dt><dd>{info.vfs}</dd>
        <dt>Arquivo</dt><dd>{info.arquivo}</dd>
        <dt>user_version</dt><dd>{info.userVersion} (app: {info.versaoApp})</dd>
        <dt>Tabelas</dt><dd>{info.tabelas}</dd>
      </dl>
    {/if}
  </section>
</main>

<style>
  dl { display: grid; grid-template-columns: max-content 1fr; gap: 0.25rem 1rem; }
  dt { font-weight: 600; }
  dd { margin: 0; font-family: monospace; }
  .erro { color: #b91c1c; }
</style>
