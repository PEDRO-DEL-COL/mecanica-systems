<script lang="ts">
  import { page } from '$app/state';
  import { obterCliente, atualizarCliente, desativarCliente, reativarCliente } from '../../../../../lib/repos/clientes';
  import { listarVeiculos } from '../../../../../lib/repos/veiculos';
  import { pode } from '../../../../../lib/estado/oficina.svelte';
  import { formatarTelefone } from '../../../../../lib/puro/formatos';
  import { toast } from '../../../../../lib/ui/toast.svelte';
  import type { Cliente } from '../../../../../lib/tipos/clientes';
  import type { Veiculo } from '../../../../../lib/tipos/veiculos';
  import Botao from '../../../../../lib/ui/Botao.svelte';
  import Carregando from '../../../../../lib/ui/Carregando.svelte';
  import ConfirmarDialogo from '../../../../../lib/ui/ConfirmarDialogo.svelte';
  import EstadoVazio from '../../../../../lib/ui/EstadoVazio.svelte';
  import Etiqueta from '../../../../../lib/ui/Etiqueta.svelte';
  import FormularioCliente from '../../../../../lib/clientes/FormularioCliente.svelte';

  const id = $derived(page.params.id ?? '');
  const escrita = $derived(pode('clientes', 'escrita'));

  let cliente = $state<Cliente | null>(null);
  let veiculos = $state<Veiculo[]>([]);
  let erroVeiculos = $state('');
  let carregando = $state(true);
  let erro = $state('');
  let editando = $state(false);
  let confirmando = $state(false);
  let alterando = $state(false);
  let erroAcao = $state('');
  let chaveForm = $state(0);

  async function carregar(idAtual: string) {
    carregando = true;
    erro = '';
    const [c, vs] = await Promise.all([
      obterCliente(idAtual),
      listarVeiculos({ clienteId: idAtual, incluirInativos: true })
    ]);
    if (idAtual !== id) return;
    carregando = false;
    if (!c.ok) {
      erro = c.erro.codigo === 'nao_encontrado' ? 'Cliente não encontrado.' : c.erro.mensagem;
      cliente = null;
      return;
    }
    cliente = c.dados;
    erroVeiculos = vs.ok ? '' : vs.erro.mensagem;
    veiculos = vs.ok ? vs.dados.itens : [];
  }

  $effect(() => {
    const atual = id;
    editando = false;
    void carregar(atual);
  });

  async function recarregar() {
    editando = false;
    erroAcao = '';
    chaveForm++;
    await carregar(id);
  }

  async function alternarAtivo() {
    if (!cliente) return;
    alterando = true;
    erroAcao = '';
    const r = cliente.ativo
      ? await desativarCliente(cliente.id, cliente.versao)
      : await reativarCliente(cliente.id, cliente.versao);
    alterando = false;
    confirmando = false;
    if (r.ok) {
      cliente = r.dados;
      toast.sucesso(r.dados.ativo ? 'Cliente reativado.' : 'Cliente desativado.');
    } else {
      erroAcao = r.erro.mensagem;
    }
  }
</script>

<svelte:head><title>{cliente?.nome ?? 'Cliente'} | Mecanica Systems</title></svelte:head>

<p><a href="/app/clientes">← Clientes</a></p>

{#if carregando}
  <Carregando tipo="esqueleto" linhas={4} rotulo="Carregando cliente…" testid="cliente-carregando" />
{:else if erro || !cliente}
  <EstadoVazio titulo={erro || 'Cliente não encontrado.'} testid="cliente-erro-carga">
    {#snippet acao()}<a class="ui-botao" href="/app/clientes">Voltar à lista</a>{/snippet}
  </EstadoVazio>
{:else}
  <div class="cabecalho">
    <h1 data-testid="cliente-titulo">{cliente.nome}</h1>
    {#if cliente.ativo}
      <Etiqueta tom="sucesso" testid="cliente-situacao">Ativo</Etiqueta>
    {:else}
      <Etiqueta testid="cliente-situacao">Inativo</Etiqueta>
    {/if}
  </div>

  {#if erroAcao}
    <p class="ui-erro" role="alert" data-testid="cliente-erro-acao">
      {erroAcao}
      <Botao pequeno testid="cliente-recarregar-acao" onclick={recarregar}>Recarregar</Botao>
    </p>
  {/if}

  {#if editando && escrita}
    {#key chaveForm}
      <FormularioCliente
        inicial={cliente}
        onsalvar={(e) => atualizarCliente(cliente!.id, cliente!.versao, e)}
        onsalvo={(c) => {
          cliente = c;
          editando = false;
          toast.sucesso('Cliente atualizado.');
        }}
        oncancelar={() => (editando = false)}
        onrecarregar={recarregar}
      />
    {/key}
  {:else}
    <dl class="dados" data-testid="cliente-dados">
      <dt>CPF/CNPJ</dt><dd>{cliente.documento ?? '—'}</dd>
      <dt>Telefone</dt><dd>{cliente.telefone ? formatarTelefone(cliente.telefone) : '—'}</dd>
      <dt>E-mail</dt><dd>{cliente.email ?? '—'}</dd>
      <dt>Endereço</dt><dd>{cliente.endereco ?? '—'}</dd>
      <dt>Observações</dt><dd class="obs">{cliente.observacoes ?? '—'}</dd>
    </dl>
    {#if escrita}
      <div class="acoes">
        <Botao testid="cliente-editar" onclick={() => (editando = true)}>Editar</Botao>
        {#if cliente.ativo}
          <Botao variante="perigo" testid="cliente-desativar" onclick={() => (confirmando = true)}>Desativar</Botao>
        {:else}
          <Botao testid="cliente-reativar" onclick={() => (confirmando = true)}>Reativar</Botao>
        {/if}
      </div>
    {/if}
  {/if}

  <section class="veiculos" aria-labelledby="titulo-veiculos">
    <div class="cabecalho">
      <h2 id="titulo-veiculos">Veículos</h2>
      {#if pode('veiculos', 'escrita') && cliente.ativo}
        <a class="ui-botao" href="/app/veiculos/novo?cliente={cliente.id}" data-testid="cliente-add-veiculo">Adicionar veículo</a>
      {/if}
    </div>
    {#if erroVeiculos}
      <p class="ui-erro" role="alert">{erroVeiculos}</p>
    {:else if veiculos.length === 0}
      <p data-testid="cliente-sem-veiculos">Nenhum veículo cadastrado para este cliente.</p>
    {:else}
      <ul class="lista-veiculos" data-testid="cliente-veiculos">
        {#each veiculos as ve (ve.id)}
          <li data-testid="cliente-veiculo">
            <a href="/app/veiculos/{ve.id}"><strong>{ve.placa}</strong> · {ve.marca} {ve.modelo}{ve.ano ? ` (${ve.ano})` : ''}</a>
            {#if !ve.ativo}<Etiqueta>Inativo</Etiqueta>{/if}
          </li>
        {/each}
      </ul>
    {/if}
  </section>

  <ConfirmarDialogo
    bind:aberto={confirmando}
    titulo={cliente.ativo ? 'Desativar cliente?' : 'Reativar cliente?'}
    texto={cliente.ativo
      ? 'O cliente some da lista padrão e não pode receber novas ordens. O histórico é mantido e você pode reativar depois.'
      : 'O cliente volta à lista padrão.'}
    rotuloConfirmar={cliente.ativo ? 'Desativar' : 'Reativar'}
    perigo={cliente.ativo}
    carregando={alterando}
    onconfirmar={alternarAtivo}
    testid="cliente-confirmar"
  />
{/if}

<style>
  .cabecalho { display: flex; flex-wrap: wrap; align-items: center; gap: var(--esp-3); margin-bottom: var(--esp-3); }
  .cabecalho h1, .cabecalho h2 { margin: 0; }
  .dados { display: grid; grid-template-columns: max-content minmax(0, 1fr); gap: var(--esp-2) var(--esp-4); margin: 0 0 var(--esp-4); }
  .dados dt { font-weight: 600; color: var(--cor-texto-suave); }
  .dados dd { margin: 0; overflow-wrap: anywhere; }
  .obs { white-space: pre-wrap; }
  .acoes { display: flex; flex-wrap: wrap; gap: var(--esp-2); }
  .veiculos { margin-top: 2rem; }
  .lista-veiculos { list-style: none; margin: 0; padding: 0; display: grid; gap: var(--esp-2); }
  a.ui-botao { text-decoration: none; display: inline-flex; align-items: center; }
  @media (max-width: 479px) { .dados { grid-template-columns: minmax(0, 1fr); gap: 0; } .dados dd { margin-bottom: var(--esp-2); } }
</style>
