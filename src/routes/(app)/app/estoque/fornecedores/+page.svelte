<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import Botao from '../../../../../lib/ui/Botao.svelte';
  import Busca from '../../../../../lib/ui/Busca.svelte';
  import Carregando from '../../../../../lib/ui/Carregando.svelte';
  import ConfirmarDialogo from '../../../../../lib/ui/ConfirmarDialogo.svelte';
  import EstadoVazio from '../../../../../lib/ui/EstadoVazio.svelte';
  import Etiqueta from '../../../../../lib/ui/Etiqueta.svelte';
  import Paginacao from '../../../../../lib/ui/Paginacao.svelte';
  import Tabela from '../../../../../lib/ui/Tabela.svelte';
  import { toast } from '../../../../../lib/ui/toast.svelte';
  import SubNav from '../../../../../lib/estoque/SubNav.svelte';
  import FormFornecedor from '../../../../../lib/estoque/FormFornecedor.svelte';
  import { pode } from '../../../../../lib/estado/oficina.svelte';
  import { definirAtivoFornecedor, listarFornecedores } from '../../../../../lib/repos/fornecedores';
  import { formatarTelefone } from '../../../../../lib/puro/formatos';
  import type { Fornecedor } from '../../../../../lib/tipos/fornecedores';

  const q = $derived(page.url.searchParams.get('q') ?? '');
  const inativos = $derived(page.url.searchParams.get('inativos') === '1');
  const pagina = $derived(Math.max(1, Math.floor(Number(page.url.searchParams.get('p'))) || 1));
  const podeEscrever = $derived(pode('estoque', 'escrita') || pode('financeiro', 'escrita'));

  let texto = $state(page.url.searchParams.get('q') ?? '');
  let itens = $state<Fornecedor[]>([]);
  let total = $state(0);
  let carregando = $state(true);
  let erro = $state('');
  let recarga = $state(0);

  let formAberto = $state(false);
  let editando = $state<Fornecedor | null>(null);
  let alternando = $state<Fornecedor | null>(null);
  let dialogoAtivo = $state(false);
  let enviandoAtivo = $state(false);

  $effect(() => {
    void recarga;
    const ctrl = new AbortController();
    carregando = true;
    erro = '';
    void listarFornecedores({ busca: q, mostrarInativos: inativos, pagina }, ctrl.signal).then((r) => {
      if (ctrl.signal.aborted) return;
      carregando = false;
      if (r.ok) {
        itens = r.dados.itens;
        total = r.dados.total ?? r.dados.itens.length;
      } else {
        itens = [];
        erro = r.erro.mensagem;
      }
    });
    return () => ctrl.abort();
  });

  function atualizar(mudancas: Record<string, string | null>) {
    const u = new URL(page.url.href);
    for (const [k, val] of Object.entries(mudancas)) {
      if (val) u.searchParams.set(k, val);
      else u.searchParams.delete(k);
    }
    void goto(u.pathname + u.search, { replaceState: true });
  }

  function novo() {
    editando = null;
    formAberto = true;
  }
  function editar(f: Fornecedor) {
    editando = f;
    formAberto = true;
  }
  function pedirAtivo(f: Fornecedor) {
    alternando = f;
    dialogoAtivo = true;
  }
  async function confirmarAtivo() {
    const f = alternando;
    if (!f) return;
    enviandoAtivo = true;
    const r = await definirAtivoFornecedor(f.id, f.versao, !f.ativo);
    enviandoAtivo = false;
    if (!r.ok) {
      toast.erro(r.erro.mensagem);
      return;
    }
    dialogoAtivo = false;
    alternando = null;
    toast.sucesso(f.ativo ? 'Fornecedor desativado.' : 'Fornecedor reativado.');
    recarga++;
  }

  const colunas = [
    { chave: 'nome', rotulo: 'Fornecedor' },
    { chave: 'contato', rotulo: 'Contato' },
    { chave: 'telefone', rotulo: 'Telefone' },
    { chave: 'acoes', rotulo: 'Ações' }
  ];
  const filtrando = $derived(q !== '' || inativos);
</script>

<svelte:head><title>Fornecedores | Mecanica Systems</title></svelte:head>

<h1>Fornecedores</h1>
<SubNav />

<div class="barra">
  <div class="busca">
    <Busca
      bind:valor={texto}
      rotulo="Buscar fornecedor"
      placeholder="Buscar por nome…"
      onbuscar={(t) => atualizar({ q: t || null, p: null })}
      testid="fornecedores-busca"
    />
  </div>
  <label class="inativos">
    <input
      type="checkbox"
      checked={inativos}
      onchange={(e) => atualizar({ inativos: e.currentTarget.checked ? '1' : null, p: null })}
      data-testid="fornecedores-inativos"
    />
    Mostrar inativos
  </label>
  {#if podeEscrever}
    <Botao variante="primario" testid="fornecedores-btn-novo" onclick={novo}>Novo fornecedor</Botao>
  {/if}
</div>

{#if carregando}
  <Carregando tipo="esqueleto" rotulo="Carregando fornecedores…" testid="fornecedores-carregando" />
{:else if erro}
  <p class="ui-erro" role="alert" data-testid="fornecedores-erro">{erro}</p>
{:else if itens.length === 0}
  <EstadoVazio
    titulo={filtrando ? 'Nenhum fornecedor encontrado' : 'Nenhum fornecedor cadastrado'}
    texto={filtrando ? 'Ajuste a busca.' : 'Cadastre os fornecedores das suas compras de peças.'}
    testid="fornecedores-vazio"
  >
    {#snippet acao()}
      {#if podeEscrever && !filtrando}
        <Botao variante="primario" testid="fornecedores-vazio-novo" onclick={novo}>Cadastrar fornecedor</Botao>
      {/if}
    {/snippet}
  </EstadoVazio>
{:else}
  <Tabela {colunas} linhas={itens} legenda="Fornecedores" altura="none" testid="fornecedores-tabela">
    {#snippet linha(f: Fornecedor)}
      <td>
        <strong>{f.nome}</strong>
        {#if !f.ativo}<Etiqueta tom="neutro" testid="fornecedores-inativo">Inativo</Etiqueta>{/if}
      </td>
      <td>{f.contato ?? ''}</td>
      <td>{f.telefone ? formatarTelefone(f.telefone) : ''}</td>
      <td class="acoes-linha">
        {#if podeEscrever}
          <Botao pequeno testid="fornecedores-btn-editar" onclick={() => editar(f)}>Editar</Botao>
          <Botao pequeno testid="fornecedores-btn-ativo" onclick={() => pedirAtivo(f)}>{f.ativo ? 'Desativar' : 'Reativar'}</Botao>
        {/if}
      </td>
    {/snippet}
  </Tabela>
  <Paginacao {pagina} {total} onmudar={(p) => atualizar({ p: p > 1 ? String(p) : null })} testid="fornecedores-paginacao" />
{/if}

<FormFornecedor bind:aberto={formAberto} fornecedor={editando} onsalvo={() => recarga++} />

<ConfirmarDialogo
  bind:aberto={dialogoAtivo}
  titulo={alternando?.ativo ? 'Desativar fornecedor' : 'Reativar fornecedor'}
  texto={alternando?.ativo
    ? 'O fornecedor deixa de aparecer nas novas entradas. O histórico é mantido.'
    : 'O fornecedor volta a aparecer nas novas entradas.'}
  rotuloConfirmar={alternando?.ativo ? 'Desativar' : 'Reativar'}
  perigo={alternando?.ativo ?? false}
  carregando={enviandoAtivo}
  onconfirmar={confirmarAtivo}
  testid="fornecedores-ativo"
/>

<style>
  .barra { display: flex; flex-wrap: wrap; gap: var(--esp-3); align-items: center; margin-bottom: var(--esp-4); }
  .busca { flex: 1 1 16rem; min-width: 0; }
  .inativos { display: inline-flex; align-items: center; gap: var(--esp-2); min-height: var(--alvo); }
  .acoes-linha { display: flex; flex-wrap: wrap; gap: var(--esp-2); }
</style>
