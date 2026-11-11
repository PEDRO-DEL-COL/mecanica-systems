<script lang="ts">
  import { db, ErroBanco } from './db/client';
  import type { VersaoInfo } from './db/protocol';
  import { adquirirLockDeAba } from './db/tabLock';
  import { baixarArquivo, nomeArquivoBackup } from './db/backup';
  import { verificarCompatibilidade, pedirPersistencia, type Persistencia } from './lib/storage';
  import IncompativelTela from './components/IncompativelTela.svelte';
  import AbaDuplicada from './components/AbaDuplicada.svelte';
  import StatusArmazenamento from './components/StatusArmazenamento.svelte';
  import BuscaPlaca from './components/BuscaPlaca.svelte';
  import Clientes from './components/Clientes.svelte';
  import Veiculos from './components/Veiculos.svelte';

  type Aba = 'inicio' | 'clientes' | 'veiculos';
  let aba = $state<Aba>('inicio');
  let clienteParaAbrir = $state<number | null>(null);

  function abrirCliente(id: number) {
    clienteParaAbrir = id;
    aba = 'clientes';
  }
  function irParaAba(a: Aba) {
    aba = a;
    if (a === 'inicio') atualizarContagem().catch(() => {});
  }

  type Fase = 'iniciando' | 'incompativel' | 'aba-duplicada' | 'pronto' | 'erro';

  const compat = verificarCompatibilidade();
  let fase = $state<Fase>(compat.ok ? 'iniciando' : 'incompativel');
  let info = $state<VersaoInfo | null>(null);
  let persistencia = $state<Persistencia | null>(null);
  let avisoPersistencia = $state<string | null>(null);
  let erro = $state<string | null>(null);
  let totalClientes = $state<number | null>(null);
  let ocupado = $state(false);
  let msgBackup = $state<string | null>(null);
  let erroBackup = $state<string | null>(null);
  let inputArquivo = $state<HTMLInputElement | null>(null);

  function mensagemErro(e: unknown): string {
    if (e instanceof ErroBanco) {
      switch (e.codigo) {
        case 'SEM_OPFS':
          return `Armazenamento local (OPFS) indisponível. ${e.message}`;
        case 'VERSAO_MAIS_NOVA':
          return `${e.message} Seus dados não foram alterados.`;
        case 'INIT':
          return `Não foi possível iniciar o banco de dados. ${e.message}`;
        default:
          return e.codigo ? `[${e.codigo}] ${e.message}` : e.message;
      }
    }
    return e instanceof Error ? e.message : String(e);
  }

  async function atualizarContagem() {
    const [linha] = await db.query<{ n: number }>('SELECT count(*) AS n FROM cliente');
    totalClientes = Number(linha?.n ?? 0);
  }

  async function iniciar() {
    if (!compat.ok) return;
    try {
      // Sem o lock, o worker NAO e criado (o client so instancia o worker na primeira chamada).
      if (!(await adquirirLockDeAba())) {
        fase = 'aba-duplicada';
        return;
      }
      try {
        persistencia = await pedirPersistencia();
        if (!persistencia.persistente) {
          avisoPersistencia =
            'O navegador não concedeu armazenamento persistente: os dados podem ser apagados em caso de pouco espaço. Faça backups regulares.';
        }
      } catch (e) {
        avisoPersistencia = `Não foi possível verificar o armazenamento persistente: ${mensagemErro(e)}`;
      }
      info = await db.versaoInfo();
      await atualizarContagem();
      fase = 'pronto';
    } catch (e) {
      erro = mensagemErro(e);
      fase = 'erro';
    }
  }

  async function gravarTeste() {
    erroBackup = null;
    try {
      await db.exec('INSERT INTO cliente (nome) VALUES (?)', [`Teste ${new Date().toISOString()}`]);
      await atualizarContagem();
    } catch (e) {
      erroBackup = mensagemErro(e);
    }
  }

  async function exportar() {
    ocupado = true;
    erroBackup = null;
    msgBackup = null;
    try {
      const nome = nomeArquivoBackup();
      baixarArquivo(await db.exportar(), nome);
      msgBackup = `Backup exportado: ${nome}`;
    } catch (e) {
      erroBackup = `Falha ao exportar: ${mensagemErro(e)}`;
    } finally {
      ocupado = false;
    }
  }

  async function importar(ev: Event) {
    const input = ev.currentTarget as HTMLInputElement;
    const arquivo = input.files?.[0];
    input.value = '';
    if (!arquivo) return;
    ocupado = true;
    erroBackup = null;
    msgBackup = null;
    try {
      const bytes = new Uint8Array(await arquivo.arrayBuffer());
      // 1) Valida numa copia temporaria; arquivo invalido para aqui sem tocar no banco.
      const v = await db.validarBackup(bytes);
      if (!v.ok) {
        erroBackup = `Backup rejeitado: ${v.motivo} O banco atual não foi alterado.`;
        return;
      }
      if (
        !confirm(
          `Substituir TODOS os dados atuais pelo backup "${arquivo.name}"? Um backup do banco atual será baixado antes.`,
        )
      ) {
        return;
      }
      // 2) Backup automatico do banco atual antes de substituir.
      baixarArquivo(await db.exportar(), nomeArquivoBackup(new Date(), '-antes-da-importacao'));
      // 3) Fecha, importa no sahpool, reabre e migra (o worker revalida).
      info = await db.importar(bytes);
      await atualizarContagem();
      msgBackup = `Backup "${arquivo.name}" importado com sucesso.`;
    } catch (e) {
      erroBackup = `Falha ao importar: ${mensagemErro(e)}`;
    } finally {
      ocupado = false;
    }
  }

  iniciar();
</script>

{#if fase === 'incompativel'}
  <IncompativelTela faltando={compat.faltando} />
{:else if fase === 'aba-duplicada'}
  <AbaDuplicada />
{:else}
  <main>
    <h1>Mecanica Systems</h1>
    {#each compat.avisos as aviso}
      <p class="aviso" role="status">{aviso}</p>
    {/each}

    {#if fase === 'erro'}
      <p class="erro" role="alert" data-testid="erro-banco">{erro}</p>
    {:else if fase === 'iniciando'}
      <p>Abrindo banco…</p>
    {:else}
      {#if persistencia}
        <StatusArmazenamento {...persistencia} />
      {/if}
      {#if avisoPersistencia}
        <p class="aviso" role="status">{avisoPersistencia}</p>
      {/if}

      <BuscaPlaca aoAbrirCliente={abrirCliente} />

      <nav class="abas" aria-label="Seções">
        <button type="button" data-testid="aba-inicio" class:sel={aba === 'inicio'} onclick={() => irParaAba('inicio')}>Início</button>
        <button type="button" data-testid="aba-clientes" class:sel={aba === 'clientes'} onclick={() => irParaAba('clientes')}>Clientes</button>
        <button type="button" data-testid="aba-veiculos" class:sel={aba === 'veiculos'} onclick={() => irParaAba('veiculos')}>Veículos</button>
      </nav>

      {#if aba === 'clientes'}
        <Clientes abrirId={clienteParaAbrir} aoMudar={() => atualizarContagem().catch(() => {})} />
      {:else if aba === 'veiculos'}
        <Veiculos aoAbrirCliente={abrirCliente} />
      {:else}
      <section>
        <h2>Diagnóstico do banco</h2>
        {#if info}
          <dl>
            <dt>SQLite</dt><dd>{info.sqlite}</dd>
            <dt>VFS</dt><dd>{info.vfs}</dd>
            <dt>Arquivo</dt><dd>{info.arquivo}</dd>
            <dt>user_version</dt><dd data-testid="user-version">{info.userVersion} (app: {info.versaoApp})</dd>
            <dt>Tabelas</dt><dd>{info.tabelas}</dd>
            <dt>Clientes</dt><dd data-testid="contagem-clientes">{totalClientes ?? '…'}</dd>
          </dl>
        {/if}
        <button type="button" data-testid="btn-gravar-teste" onclick={gravarTeste} disabled={ocupado}>
          Gravar registro de teste
        </button>
      </section>

      <section>
        <h2>Backup</h2>
        <button type="button" data-testid="btn-exportar" onclick={exportar} disabled={ocupado}>Exportar backup</button>
        <button type="button" data-testid="btn-importar" onclick={() => inputArquivo?.click()} disabled={ocupado}>
          Importar backup
        </button>
        <input
          bind:this={inputArquivo}
          type="file"
          accept=".sqlite,.db,application/vnd.sqlite3,application/octet-stream"
          data-testid="input-importar"
          hidden
          onchange={importar}
        />
        {#if msgBackup}<p role="status" data-testid="msg-backup">{msgBackup}</p>{/if}
        {#if erroBackup}<p class="erro" role="alert" data-testid="erro-backup">{erroBackup}</p>{/if}
      </section>
      {/if}
    {/if}
  </main>
{/if}

<style>
  dl { display: grid; grid-template-columns: max-content 1fr; gap: 0.25rem 1rem; }
  dt { font-weight: 600; }
  dd { margin: 0; font-family: monospace; }
  .erro { color: #b91c1c; }
  .aviso { color: #92400e; background: #fef3c7; padding: 0.5rem; }
  section { margin-top: 1rem; }
  button { margin-right: 0.5rem; }
  .abas { display: flex; gap: 0.25rem; border-bottom: 2px solid #d1d5db; margin-bottom: 1rem; }
  .abas button { margin: 0; padding: 0.5rem 1.25rem; border: 1px solid #d1d5db; border-bottom: none; background: #f9fafb; font-size: 1rem; cursor: pointer; }
  .abas button.sel { background: #fff; font-weight: 700; border-color: #3b82f6; }
</style>
