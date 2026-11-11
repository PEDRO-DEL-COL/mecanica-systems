<script lang="ts">
  import { veiculosRepo } from '../db/repos';
  import type { VeiculoComCliente } from '../db/repos/veiculos';

  let { aoAbrirCliente }: { aoAbrirCliente: (clienteId: number) => void } = $props();

  let todos = $state<VeiculoComCliente[]>([]);
  let erro = $state<string | null>(null);
  let carregando = $state(true);

  veiculosRepo
    .listarTodos()
    .then((r) => (todos = r))
    .catch((e) => (erro = e instanceof Error ? e.message : String(e)))
    .finally(() => (carregando = false));
</script>

<section>
  <h2>Veículos</h2>
  <p>Para cadastrar um veículo, abra o cliente na aba Clientes e use "Adicionar veículo".</p>
  {#if erro}<p class="erro" role="alert">{erro}</p>{/if}
  {#if carregando}
    <p>Carregando…</p>
  {:else if todos.length === 0}
    <p data-testid="veiculos-todos-vazio">Nenhum veículo cadastrado.</p>
  {:else}
    <table data-testid="tabela-veiculos">
      <thead><tr><th>Placa</th><th>Veículo</th><th>Dono</th><th></th></tr></thead>
      <tbody>
        {#each todos as r (r.veiculo.id)}
          <tr>
            <td><strong>{r.veiculo.placa}</strong></td>
            <td>{[r.veiculo.marca, r.veiculo.modelo, r.veiculo.ano, r.veiculo.cor].filter(Boolean).join(' ')}</td>
            <td>{r.cliente.nome}</td>
            <td><button type="button" onclick={() => aoAbrirCliente(r.cliente.id)}>Abrir cliente</button></td>
          </tr>
        {/each}
      </tbody>
    </table>
  {/if}
</section>

<style>
  table { border-collapse: collapse; }
  th, td { text-align: left; padding: 0.4rem 1rem 0.4rem 0; border-bottom: 1px solid #e5e7eb; }
  .erro { color: #b91c1c; }
</style>