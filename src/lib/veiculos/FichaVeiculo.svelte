<script lang="ts">
  import { goto } from '$app/navigation';
  import Botao from '../ui/Botao.svelte';
  import Dialogo from '../ui/Dialogo.svelte';
  import ConfirmarDialogo from '../ui/ConfirmarDialogo.svelte';
  import EstadoVazio from '../ui/EstadoVazio.svelte';
  import Carregando from '../ui/Carregando.svelte';
  import Etiqueta from '../ui/Etiqueta.svelte';
  import { toast } from '../ui/toast.svelte';
  import { obterVeiculo, desativarVeiculo, reativarVeiculo, transferirVeiculo } from '../repos/veiculos';
  import { obterCliente } from '../repos/clientes';
  import { pode } from '../estado/oficina.svelte';
  import type { Veiculo } from '../tipos/veiculos';
  import type { Cliente } from '../tipos/clientes';
  import type { ErroApp } from '../erros';
  import FormularioVeiculo from './FormularioVeiculo.svelte';
  import SeletorCliente from './SeletorCliente.svelte';
  import { formatarKm, formatarPlaca, descricaoVeiculo } from './formato';

  let { id }: { id: string } = $props();

  let veiculo = $state<Veiculo | null>(null);
  let dono = $state<Cliente | null>(null);
  let carregando = $state(true);
  let erro = $state<ErroApp | null>(null);
  let editando = $state(false);

  let dialogoTransferir = $state(false);
  let confirmarTransferir = $state(false);
  let novoDono = $state<Cliente | null>(null);
  let confirmarAtivo = $state(false);
  let processando = $state(false);

  const podeEscrever = $derived(pode('veiculos', 'escrita'));

  async function carregar() {
    carregando = true;
    erro = null;
    const r = await obterVeiculo(id);
    if (!r.ok) {
      erro = r.erro;
      carregando = false;
      return;
    }
    veiculo = r.dados;
    const c = await obterCliente(r.dados.cliente_id);
    dono = c.ok ? c.dados : null;
    carregando = false;
  }

  $effect(() => {
    void id;
    void carregar();
  });

  function apos(r: { ok: boolean; erro?: ErroApp }, sucesso: string): boolean {
    if (r.ok) {
      toast.sucesso(sucesso);
      return true;
    }
    const e = r.erro as ErroApp;
    toast.erro(e.codigo === 'duplicado' ? 'Placa já cadastrada' : e.mensagem);
    if (e.codigo === 'conflito') void carregar();
    return false;
  }

  async function alternarAtivo() {
    if (!veiculo) return;
    processando = true;
    const r = veiculo.ativo
      ? await desativarVeiculo(veiculo.id, veiculo.versao)
      : await reativarVeiculo(veiculo.id, veiculo.versao);
    processando = false;
    confirmarAtivo = false;
    if (apos(r, veiculo.ativo ? 'Veículo desativado.' : 'Veículo reativado.') && r.ok) veiculo = r.dados;
  }

  function continuarTransferencia() {
    if (!novoDono) return;
    dialogoTransferir = false;
    confirmarTransferir = true;
  }

  async function transferir() {
    if (!veiculo || !novoDono) return;
    processando = true;
    const r = await transferirVeiculo(veiculo.id, novoDono.id);
    processando = false;
    confirmarTransferir = false;
    if (apos(r, 'Veículo transferido.') && r.ok) {
      veiculo = r.dados;
      dono = novoDono;
      novoDono = null;
    }
  }

  function abrirTransferir() {
    novoDono = null;
    dialogoTransferir = true;
  }
</script>

{#if carregando}
  <Carregando tipo="esqueleto" linhas={4} testid="veiculos-ficha-carregando" />
{:else if erro || !veiculo}
  <EstadoVazio
    titulo={erro?.codigo === 'nao_encontrado' ? 'Veículo não encontrado' : 'Não foi possível carregar'}
    texto={erro?.mensagem}
    testid="veiculos-ficha-erro"
  >
    {#snippet acao()}
      <Botao testid="veiculos-btn-voltar" onclick={() => goto('/app/veiculos')}>Voltar à lista</Botao>
    {/snippet}
  </EstadoVazio>
{:else}
  <p><a href="/app/veiculos" data-testid="veiculos-voltar">← Veículos</a></p>
  <div class="cabecalho">
    <h1 data-testid="veiculos-ficha-placa">{formatarPlaca(veiculo.placa)}</h1>
    {#if veiculo.ativo}<Etiqueta tom="sucesso" testid="veiculos-ficha-situacao">Ativo</Etiqueta>
    {:else}<Etiqueta tom="neutro" testid="veiculos-ficha-situacao">Inativo</Etiqueta>{/if}
  </div>

  {#if editando}
    <FormularioVeiculo
      {veiculo}
      onsalvo={(v) => {
        veiculo = v;
        editando = false;
      }}
      oncancelar={() => (editando = false)}
    />
  {:else}
    <dl class="dados">
      <dt>Veículo</dt>
      <dd data-testid="veiculos-ficha-descricao">{descricaoVeiculo(veiculo)}</dd>
      <dt>Cor</dt>
      <dd>{veiculo.cor ?? '—'}</dd>
      <dt>Chassi</dt>
      <dd>{veiculo.chassi ?? '—'}</dd>
      <dt>Quilometragem</dt>
      <dd data-testid="veiculos-ficha-km">{formatarKm(veiculo.km_atual)}</dd>
      <dt>Dono</dt>
      <dd>
        {#if dono}
          <a href="/app/clientes/{dono.id}" data-testid="veiculos-ficha-dono">{dono.nome}</a>
        {:else}—{/if}
      </dd>
    </dl>

    {#if podeEscrever}
      <div class="acoes">
        <Botao testid="veiculos-btn-editar" onclick={() => (editando = true)}>Editar</Botao>
        {#if veiculo.ativo}
          <Botao testid="veiculos-btn-transferir" onclick={abrirTransferir}>Transferir para outro cliente</Botao>
          <Botao variante="perigo" testid="veiculos-btn-desativar" onclick={() => (confirmarAtivo = true)}>Desativar</Botao>
        {:else}
          <Botao variante="primario" testid="veiculos-btn-reativar" onclick={() => (confirmarAtivo = true)}>Reativar</Botao>
        {/if}
      </div>
    {/if}

    <section class="historico">
      <h2>Histórico de OS</h2>
      <EstadoVazio titulo="Histórico em breve" texto="As ordens de serviço deste veículo aparecerão aqui." testid="veiculos-historico" />
    </section>
  {/if}

  <Dialogo bind:aberto={dialogoTransferir} titulo="Transferir veículo" testid="veiculos-transferir">
    <SeletorCliente bind:cliente={novoDono} excluirId={veiculo.cliente_id} label="Novo dono" testid="veiculos-novo-dono" />
    {#snippet rodape()}
      <Botao testid="veiculos-transferir-cancelar" onclick={() => (dialogoTransferir = false)}>Cancelar</Botao>
      <Botao variante="primario" testid="veiculos-transferir-continuar" disabled={!novoDono} onclick={continuarTransferencia}>
        Continuar
      </Botao>
    {/snippet}
  </Dialogo>

  <ConfirmarDialogo
    bind:aberto={confirmarTransferir}
    titulo="Confirmar transferência"
    texto={`Transferir ${formatarPlaca(veiculo.placa)} de ${dono?.nome ?? 'dono atual'} para ${novoDono?.nome ?? ''}?`}
    rotuloConfirmar="Transferir"
    motivo="opcional"
    carregando={processando}
    onconfirmar={transferir}
    testid="veiculos-confirmar-transferir"
  />

  <ConfirmarDialogo
    bind:aberto={confirmarAtivo}
    titulo={veiculo.ativo ? 'Desativar veículo' : 'Reativar veículo'}
    texto={veiculo.ativo
      ? 'O veículo deixa de aparecer nas buscas, mas o histórico é mantido.'
      : 'O veículo volta a aparecer nas buscas.'}
    rotuloConfirmar={veiculo.ativo ? 'Desativar' : 'Reativar'}
    perigo={veiculo.ativo}
    carregando={processando}
    onconfirmar={alternarAtivo}
    testid="veiculos-confirmar-ativo"
  />
{/if}

<style>
  .cabecalho {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    flex-wrap: wrap;
  }
  .dados {
    display: grid;
    grid-template-columns: max-content 1fr;
    gap: 0.4rem 1rem;
    margin: 1rem 0;
  }
  .dados dt {
    font-weight: 600;
  }
  .dados dd {
    margin: 0;
    overflow-wrap: anywhere;
  }
  .acoes {
    display: flex;
    gap: 0.5rem;
    flex-wrap: wrap;
  }
  .historico {
    margin-top: 2rem;
  }
</style>
