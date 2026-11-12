<script lang="ts">
  import * as v from 'valibot';
  import Campo from '../ui/Campo.svelte';
  import Botao from '../ui/Botao.svelte';
  import SeletorCliente from './SeletorCliente.svelte';
  import { criarVeiculo, atualizarVeiculo } from '../repos/veiculos';
  import { obterCliente } from '../repos/clientes';
  import { veiculoSchema, veiculoEdicaoSchema } from '../validacao/clientes';
  import type { Cliente } from '../tipos/clientes';
  import type { Veiculo, VeiculoEdicao, VeiculoEntrada } from '../tipos/veiculos';
  import { toast } from '../ui/toast.svelte';
  import { formatarKm } from './formato';

  interface Props {
    /** Presente => edição (dono não muda aqui; use transferir). */
    veiculo?: Veiculo;
    /** Cliente pré-selecionado (?cliente=ID). */
    clienteInicialId?: string | null;
    onsalvo: (v: Veiculo) => void;
    oncancelar: () => void;
  }
  let { veiculo, clienteInicialId = null, onsalvo, oncancelar }: Props = $props();

  const edicao = veiculo !== undefined;
  let cliente = $state<Cliente | null>(null);
  let placa = $state(veiculo?.placa ?? '');
  let marca = $state(veiculo?.marca ?? '');
  let modelo = $state(veiculo?.modelo ?? '');
  let ano = $state(veiculo?.ano ? String(veiculo.ano) : '');
  let cor = $state(veiculo?.cor ?? '');
  let chassi = $state(veiculo?.chassi ?? '');
  let km = $state(veiculo ? String(veiculo.km_atual) : '');
  let erros = $state<Record<string, string>>({});
  let erroGeral = $state('');
  let salvando = $state(false);

  $effect(() => {
    const id = clienteInicialId;
    if (edicao || !id) return;
    void obterCliente(id).then((r) => {
      if (r.ok && !cliente) cliente = r.dados;
    });
  });

  /** Texto -> número; vazio => null; inválido => NaN (o schema recusa). */
  function numero(t: string): number | null {
    const s = t.trim().replace(/\./g, '').replace(',', '.');
    if (s === '') return null;
    return Number(s);
  }

  const kmNumero = $derived(numero(km));
  const kmMenor = $derived(
    edicao && veiculo !== undefined && kmNumero !== null && Number.isFinite(kmNumero) && kmNumero < veiculo.km_atual
  );

  async function salvar(e: SubmitEvent) {
    e.preventDefault();
    erros = {};
    erroGeral = '';
    const n = numero(km);
    const base = {
      placa,
      marca,
      modelo,
      ano: numero(ano),
      cor,
      chassi,
      km_atual: n === null ? 0 : n
    };
    const val = edicao
      ? v.safeParse(veiculoEdicaoSchema, base)
      : v.safeParse(veiculoSchema, { ...base, cliente_id: cliente?.id ?? '' });
    if (!val.success) {
      const novos: Record<string, string> = {};
      for (const i of val.issues) {
        const dados = i.path?.[0] as { key?: unknown } | undefined;
        const chave = String(dados?.key ?? 'geral');
        if (!novos[chave]) novos[chave] = i.message;
      }
      if (novos.cliente_id && !cliente) novos.cliente_id = 'Selecione o cliente.';
      erros = novos;
      return;
    }
    salvando = true;
    const r =
      edicao && veiculo
        ? await atualizarVeiculo(veiculo.id, veiculo.versao, val.output as VeiculoEdicao)
        : await criarVeiculo(val.output as VeiculoEntrada);
    salvando = false;
    if (!r.ok) {
      if (r.erro.codigo === 'duplicado') erros = { placa: 'Placa já cadastrada' };
      else erroGeral = r.erro.mensagem;
      return;
    }
    toast.sucesso(edicao ? 'Veículo atualizado.' : 'Veículo cadastrado.');
    onsalvo(r.dados);
  }
</script>

<form class="form-veiculo" onsubmit={salvar} novalidate data-testid="veiculos-form">
  {#if !edicao}
    <SeletorCliente bind:cliente erro={erros.cliente_id} />
  {/if}
  <Campo
    label="Placa"
    bind:valor={placa}
    erro={erros.placa}
    ajuda="ABC-1234 ou ABC1D23 (Mercosul)"
    autocapitalize="characters"
    autocomplete="off"
    testid="veiculos-placa"
  />
  <div class="linha">
    <Campo label="Marca" bind:valor={marca} erro={erros.marca} testid="veiculos-marca" />
    <Campo label="Modelo" bind:valor={modelo} erro={erros.modelo} testid="veiculos-modelo" />
  </div>
  <div class="linha">
    <Campo label="Ano" bind:valor={ano} erro={erros.ano} inputmode="numeric" testid="veiculos-ano" />
    <Campo label="Cor" bind:valor={cor} erro={erros.cor} testid="veiculos-cor" />
  </div>
  <Campo label="Chassi" bind:valor={chassi} erro={erros.chassi} testid="veiculos-chassi" />
  <Campo label="Quilometragem (km)" bind:valor={km} erro={erros.km_atual} inputmode="numeric" testid="veiculos-km" />
  {#if kmMenor && veiculo}
    <p class="aviso" role="status" data-testid="veiculos-km-aviso">
      Atenção: a quilometragem informada é menor que a atual ({formatarKm(veiculo.km_atual)}). Você ainda pode salvar.
    </p>
  {/if}
  {#if erroGeral}<p class="ui-erro" role="alert" data-testid="veiculos-form-erro">{erroGeral}</p>{/if}
  <div class="acoes">
    <Botao testid="veiculos-btn-cancelar" onclick={oncancelar}>Cancelar</Botao>
    <Botao type="submit" variante="primario" carregando={salvando} testid="veiculos-btn-salvar">Salvar</Botao>
  </div>
</form>

<style>
  .form-veiculo {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    max-width: 36rem;
  }
  .linha {
    display: grid;
    grid-template-columns: 1fr;
    gap: 1rem;
  }
  @media (min-width: 560px) {
    .linha {
      grid-template-columns: 1fr 1fr;
    }
  }
  .acoes {
    display: flex;
    gap: 0.5rem;
    justify-content: flex-end;
    flex-wrap: wrap;
  }
  .aviso {
    margin: 0;
    padding: 0.6rem 0.8rem;
    border-radius: 0.4rem;
    background: #f5a62326;
    border: 1px solid #f5a623;
  }
</style>
