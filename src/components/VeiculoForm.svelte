<script lang="ts">
  import { veiculosRepo } from '../db/repos';
  import type { Veiculo } from '../db/repos/veiculos';

  let { clienteId, veiculo = null, aoSalvar, aoCancelar }: {
    clienteId: number;
    veiculo?: Veiculo | null;
    aoSalvar: () => void;
    aoCancelar: () => void;
  } = $props();

  // Valores iniciais lidos uma vez (o pai recria o componente via {#key}).
  // svelte-ignore state_referenced_locally
  const ini = veiculo;
  let placa = $state(ini?.placa ?? '');
  let marca = $state(ini?.marca ?? '');
  let modelo = $state(ini?.modelo ?? '');
  let ano = $state(ini?.ano?.toString() ?? '');
  let cor = $state(ini?.cor ?? '');
  let km = $state(ini?.kmAtual?.toString() ?? '');
  let erro = $state<string | null>(null);
  let salvando = $state(false);

  async function salvar(ev: SubmitEvent) {
    ev.preventDefault();
    erro = null;
    salvando = true;
    try {
      const dados = {
        placa,
        marca,
        modelo,
        cor,
        ano: ano.trim() ? Number(ano) : null,
        kmAtual: km.trim() ? Number(km) : null,
      };
      if (ini) await veiculosRepo.atualizar(ini.id, dados);
      else await veiculosRepo.criar(clienteId, dados);
      aoSalvar();
    } catch (e) {
      erro = e instanceof Error ? e.message : String(e);
    } finally {
      salvando = false;
    }
  }
</script>

<form onsubmit={salvar} data-testid="form-veiculo" class="form">
  <h4>{ini ? 'Editar veículo' : 'Novo veículo'}</h4>
  <label>Placa * <input data-testid="veiculo-placa" bind:value={placa} required maxlength="8" /></label>
  <label>Marca <input data-testid="veiculo-marca" bind:value={marca} /></label>
  <label>Modelo <input data-testid="veiculo-modelo" bind:value={modelo} /></label>
  <label>Ano <input data-testid="veiculo-ano" type="number" min="1900" max="2100" bind:value={ano} /></label>
  <label>Cor <input data-testid="veiculo-cor" bind:value={cor} /></label>
  <label>Km atual <input data-testid="veiculo-km" type="number" min="0" bind:value={km} /></label>
  {#if erro}<p class="erro" role="alert" data-testid="erro-veiculo">{erro}</p>{/if}
  <div>
    <button type="submit" data-testid="btn-salvar-veiculo" disabled={salvando}>Salvar veículo</button>
    <button type="button" onclick={aoCancelar}>Cancelar</button>
  </div>
</form>

<style>
  .form { display: grid; gap: 0.5rem; max-width: 26rem; padding: 0.75rem; border: 1px solid #d1d5db; border-radius: 6px; margin-top: 0.75rem; }
  label { display: grid; gap: 0.15rem; font-weight: 600; }
  input { padding: 0.35rem; font-size: 1rem; font-weight: 400; }
  h4 { margin: 0; }
  .erro { color: #b91c1c; margin: 0; }
</style>