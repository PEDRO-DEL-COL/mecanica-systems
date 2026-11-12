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

<section class="stack">
  <p class="muted">Para cadastrar um veículo, abra o cliente na aba Clientes e use "Adicionar veículo".</p>
  {#if erro}<p class="alerta alerta-erro" role="alert">{erro}</p>{/if}
  {#if carregando}
    <p class="muted">Carregando…</p>
  {:else if todos.length === 0}
    <div class="vazio" data-testid="veiculos-todos-vazio"><strong>Nenhum veículo cadastrado</strong>Cadastre o primeiro a partir de um cliente.</div>
  {:else}
    <div class="tabela-wrap">
      <table data-testid="tabela-veiculos">
        <thead><tr><th>Placa</th><th>Veículo</th><th>Dono</th><th><span class="sr-only">Ações</span></th></tr></thead>
        <tbody>
          {#each todos as r (r.veiculo.id)}
            <tr>
              <td><strong class="mono">{r.veiculo.placa}</strong></td>
              <td>{[r.veiculo.marca, r.veiculo.modelo, r.veiculo.ano, r.veiculo.cor].filter(Boolean).join(' ')}</td>
              <td>{r.cliente.nome}</td>
              <td><button type="button" class="btn-pequeno" onclick={() => aoAbrirCliente(r.cliente.id)}>Abrir cliente</button></td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
</section>
