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
  import './styles/tokens.css';
  import './styles/base.css';

  type Aba = 'inicio' | 'clientes' | 'veiculos';
  // Para adicionar uma tela: incluir aqui (icone = path SVG 24x24) e tratar no bloco {#if aba} abaixo.
  const rotas: { id: Aba; rotulo: string; icone: string }[] = [
    { id: 'inicio', rotulo: 'Início', icone: 'M3 11l9-8 9 8M5 10v10h5v-6h4v6h5V10' },
    { id: 'clientes', rotulo: 'Clientes', icone: 'M16 19v-1.5a3.5 3.5 0 0 0-3.5-3.5h-5A3.5 3.5 0 0 0 4 17.5V19M10 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM20 19v-1.5a3.5 3.5 0 0 0-2.5-3.35M15.5 4.2a3.5 3.5 0 0 1 0 6.6' },
    { id: 'veiculos', rotulo: 'Veículos', icone: 'M4 16v-4l2-5h12l2 5v4M4 16h16M4 16v2h3v-2M17 16v2h3v-2M7.5 12.5h.01M16.5 12.5h.01' },
  ];
  const tituloAba = $derived(rotas.find((r) => r.id === aba)?.rotulo ?? '');
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
  <div class="app">
    <aside class="lateral">
      <div class="marca">
        <svg viewBox="0 0 24 24" width="28" height="28" aria-hidden="true"><path d="M14.7 6.3a4 4 0 0 0-5.4 5.2L3.5 17.3a1.8 1.8 0 0 0 2.5 2.5l5.8-5.8a4 4 0 0 0 5.2-5.4l-2.4 2.4-2.1-.6-.6-2.1z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>
        <h1>Mecanica Systems</h1>
      </div>
      {#if fase === 'pronto'}
        <nav class="menu" aria-label="Seções">
          {#each rotas as r (r.id)}
            <button type="button" data-testid={`aba-${r.id}`} class:sel={aba === r.id} aria-current={aba === r.id ? 'page' : undefined} onclick={() => irParaAba(r.id)}>
              <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d={r.icone} fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
              {r.rotulo}
            </button>
          {/each}
        </nav>
      {/if}
    </aside>

    <div class="principal">
      <header class="topo">
        <h2 class="titulo-pagina">{fase === 'pronto' ? tituloAba : ''}</h2>
        {#if fase === 'pronto'}<BuscaPlaca aoAbrirCliente={abrirCliente} />{/if}
      </header>

      <main class="conteudo">
        {#each compat.avisos as aviso}
          <p class="alerta alerta-aviso" role="status">{aviso}</p>
        {/each}

        {#if fase === 'erro'}
          <p class="alerta alerta-erro" role="alert" data-testid="erro-banco">{erro}</p>
        {:else if fase === 'iniciando'}
          <p class="muted">Abrindo banco…</p>
        {:else}
          {#if avisoPersistencia}
            <p class="alerta alerta-aviso" role="status">{avisoPersistencia}</p>
          {/if}

          {#if aba === 'clientes'}
            <Clientes abrirId={clienteParaAbrir} aoMudar={() => atualizarContagem().catch(() => {})} />
          {:else if aba === 'veiculos'}
            <Veiculos aoAbrirCliente={abrirCliente} />
          {:else}
            <div class="grade-cartoes">
              <section class="cartao">
                <h3>Banco de dados</h3>
                <p class="muted">Clientes cadastrados</p>
                <p class="metrica" data-testid="contagem-clientes">{totalClientes ?? '…'}</p>
                {#if info}
                  <dl>
                    <dt>SQLite</dt><dd>{info.sqlite}</dd>
                    <dt>VFS</dt><dd>{info.vfs}</dd>
                    <dt>Arquivo</dt><dd>{info.arquivo}</dd>
                    <dt>user_version</dt><dd data-testid="user-version">{info.userVersion} (app: {info.versaoApp})</dd>
                    <dt>Tabelas</dt><dd>{info.tabelas}</dd>
                  </dl>
                {/if}
                <button type="button" class="btn-pequeno" data-testid="btn-gravar-teste" onclick={gravarTeste} disabled={ocupado}>
                  Gravar registro de teste
                </button>
              </section>

              <section class="cartao">
                <h3>Armazenamento</h3>
                {#if persistencia}
                  <StatusArmazenamento {...persistencia} />
                {:else}
                  <p class="muted">Não disponível.</p>
                {/if}
              </section>

              <section class="cartao">
                <h3>Backup</h3>
                <p class="muted">Os dados ficam só neste computador. Exporte um backup com frequência.</p>
                <div class="row">
                  <button type="button" class="btn-primario" data-testid="btn-exportar" onclick={exportar} disabled={ocupado}>Exportar backup</button>
                  <button type="button" data-testid="btn-importar" onclick={() => inputArquivo?.click()} disabled={ocupado}>
                    Importar backup
                  </button>
                </div>
                <input
                  bind:this={inputArquivo}
                  type="file"
                  accept=".sqlite,.db,application/vnd.sqlite3,application/octet-stream"
                  data-testid="input-importar"
                  hidden
                  onchange={importar}
                />
                {#if msgBackup}<p class="alerta alerta-sucesso" role="status" data-testid="msg-backup">{msgBackup}</p>{/if}
                {#if erroBackup}<p class="alerta alerta-erro" role="alert" data-testid="erro-backup">{erroBackup}</p>{/if}
              </section>
            </div>
          {/if}
        {/if}
      </main>
    </div>
  </div>
{/if}

<style>
  .app { display: grid; grid-template-columns: 15rem 1fr; min-height: 100vh; }
  .lateral { background: var(--cor-lateral); color: var(--cor-lateral-texto); padding: var(--esp-4); position: sticky; top: 0; height: 100vh; }
  .marca { display: flex; align-items: center; gap: var(--esp-2); color: #fff; margin-bottom: var(--esp-5); }
  .marca svg { color: var(--cor-foco); flex: none; }
  .marca h1 { font-size: 1.05rem; margin: 0; color: #fff; }
  .menu { display: grid; gap: var(--esp-1); }
  .menu button { justify-content: flex-start; width: 100%; min-height: 2.75rem; background: transparent; border: none; color: inherit; font-size: var(--txt-md); font-weight: 500; }
  .menu button:hover:not(:disabled) { background: var(--cor-lateral-ativo); border: none; }
  .menu button.sel { background: var(--cor-lateral-ativo); color: #fff; box-shadow: inset 3px 0 0 var(--cor-foco); }
  .principal { min-width: 0; display: flex; flex-direction: column; }
  .topo { display: flex; align-items: flex-start; justify-content: space-between; gap: var(--esp-4); padding: var(--esp-4) var(--esp-6); background: var(--cor-superficie); border-bottom: 1px solid var(--cor-borda); position: sticky; top: 0; z-index: 5; }
  .titulo-pagina { margin: 0; line-height: var(--alvo); }
  .conteudo { width: 100%; max-width: 72rem; padding: var(--esp-5) var(--esp-6); margin: 0 auto; }
  dl { display: grid; grid-template-columns: max-content 1fr; gap: var(--esp-1) var(--esp-4); font-size: var(--txt-sm); margin: var(--esp-3) 0; }
  dt { font-weight: 600; color: var(--cor-texto-suave); }
  dd { margin: 0; font-family: var(--fonte-mono); word-break: break-all; }

  @media (max-width: 900px) {
    .app { grid-template-columns: 1fr; }
    .lateral { position: static; height: auto; display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: var(--esp-2); padding: var(--esp-2) var(--esp-4); }
    .marca { margin: 0; }
    .menu { display: flex; }
    .menu button { width: auto; }
    .topo { position: static; flex-wrap: wrap; padding: var(--esp-3) var(--esp-4); }
    .conteudo { padding: var(--esp-4); }
  }
</style>

