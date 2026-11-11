<script lang="ts">
  import { veiculosRepo } from '../db/repos';
  import type { VeiculoComCliente } from '../db/repos/veiculos';

  let { aoAbrirCliente }: { aoAbrirCliente: (clienteId: number) => void } = $props();

  let texto = $state('');
  let resultados = $state<VeiculoComCliente[] | null>(null);
  let erro = $state<string | null>(null);
  let seq = 0;

  async function buscar() {
    const minha = ++seq;
    erro = null;
    try {
      const r = await veiculosRepo.buscarPorPlaca(texto);
      if (minha === seq) resultados = texto.trim() ? r : null;
    } catch (e) {
      erro = e instanceof Error ? e.message : String(e);
    }
  }
</script>

<section class="busca" aria-label="Busca por placa">
  <label>
    Buscar por placa
    <input
      type="search"
      data-testid="busca-placa"
      placeholder="ABC-1234 ou ABC1D23"
      bind:value={texto}
      oninput={buscar}
      autocomplete="off"
    />
  </label>
  {#if erro}<p class="erro" role="alert">{erro}</p>{/if}
  {#if resultados}
    <ul data-testid="resultado-placa" class="resultados">
      {#each resultados as r (r.veiculo.id)}
        <li data-testid="resultado-placa-item">
          <strong data-testid="resultado-placa-placa">{r.veiculo.placa}</strong>
          {[r.veiculo.marca, r.veiculo.modelo, r.veiculo.ano].filter(Boolean).join(' ')}
          — dono: <span data-testid="resultado-placa-dono">{r.cliente.nome}</span>
          {#if r.cliente.telefone}({r.cliente.telefone}){/if}
          {#if !r.cliente.ativo}<em>(cliente inativo)</em>{/if}
          <button type="button" data-testid="btn-abrir-dono" onclick={() => aoAbrirCliente(r.cliente.id)}>
            Abrir cliente
          </button>
        </li>
      {:else}
        <li data-testid="resultado-placa-vazio">Nenhum veículo encontrado com essa placa.</li>
      {/each}
    </ul>
  {/if}
</section>

<style>
  .busca { margin: 1rem 0; padding: 0.75rem; background: #f3f4f6; border-radius: 6px; }
  input { display: block; width: 20rem; max-width: 100%; padding: 0.4rem; font-size: 1rem; text-transform: uppercase; }
  .resultados { list-style: none; padding: 0; margin: 0.5rem 0 0; }
  .resultados li { padding: 0.35rem 0; border-top: 1px solid #d1d5db; }
  .erro { color: #b91c1c; }
</style>