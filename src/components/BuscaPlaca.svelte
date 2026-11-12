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
    <span class="sr-only">Buscar por placa</span>
    <input
      type="search"
      data-testid="busca-placa"
      placeholder="Buscar por placa: ABC-1234 ou ABC1D23"
      bind:value={texto}
      oninput={buscar}
      autocomplete="off"
    />
  </label>
  {#if erro}<p class="alerta alerta-erro" role="alert">{erro}</p>{/if}
  {#if resultados}
    <ul data-testid="resultado-placa" class="resultados">
      {#each resultados as r (r.veiculo.id)}
        <li data-testid="resultado-placa-item">
          <div>
            <strong class="mono" data-testid="resultado-placa-placa">{r.veiculo.placa}</strong>
            {[r.veiculo.marca, r.veiculo.modelo, r.veiculo.ano].filter(Boolean).join(' ')}
            <div class="muted">
              Dono: <span data-testid="resultado-placa-dono">{r.cliente.nome}</span>
              {#if r.cliente.telefone}({r.cliente.telefone}){/if}
              {#if !r.cliente.ativo}<span class="badge badge-inativo">cliente inativo</span>{/if}
            </div>
          </div>
          <button type="button" class="btn-pequeno" data-testid="btn-abrir-dono" onclick={() => aoAbrirCliente(r.cliente.id)}>
            Abrir cliente
          </button>
        </li>
      {:else}
        <li data-testid="resultado-placa-vazio" class="muted">Nenhum veículo encontrado com essa placa.</li>
      {/each}
    </ul>
  {/if}
</section>

<style>
  .busca { position: relative; width: 24rem; max-width: 100%; }
  input { text-transform: uppercase; }
  input::placeholder { text-transform: none; }
  .resultados { position: absolute; left: 0; right: 0; top: calc(100% + 4px); z-index: 10; list-style: none; margin: 0; padding: var(--esp-1); background: var(--cor-superficie); border: 1px solid var(--cor-borda); border-radius: var(--raio); box-shadow: var(--sombra-forte); max-height: 60vh; overflow: auto; }
  .resultados li { display: flex; justify-content: space-between; align-items: center; gap: var(--esp-3); padding: var(--esp-2) var(--esp-3); font-size: var(--txt-sm); }
  .resultados li + li { border-top: 1px solid var(--cor-borda); }
  @media (max-width: 900px) { .busca { width: 100%; } }
</style>
