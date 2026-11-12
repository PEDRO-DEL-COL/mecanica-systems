<script lang="ts">
  import Busca from '../ui/Busca.svelte';
  import Selecao from '../ui/Selecao.svelte';
  import { listarSaldos, obterSaldo } from '../repos/estoque';
  import type { SaldoEstoque } from '../tipos/estoque';
  import { quantidadeComSinal } from './formato';

  interface Props {
    /** item_id escolhido. */
    valor?: string;
    erro?: string;
    testid?: string;
    onescolher?: (s: SaldoEstoque | null) => void;
  }
  let { valor = $bindable(''), erro, testid = 'estoque-peca', onescolher }: Props = $props();

  let texto = $state('');
  let achados = $state<SaldoEstoque[]>([]);
  let escolhido = $state<SaldoEstoque | null>(null);
  let msg = $state('');

  const opcoes = $derived.by(() => {
    const lista = [...achados];
    const e = escolhido;
    if (e && !lista.some((s) => s.item_id === e.item_id)) lista.unshift(e);
    return lista.map((s) => ({
      valor: s.item_id,
      rotulo: `${s.codigo ? s.codigo + ' · ' : ''}${s.descricao} (saldo ${quantidadeComSinal(s.saldo)} ${s.unidade})`
    }));
  });

  async function buscar(t: string) {
    msg = '';
    const r = await listarSaldos({ busca: t });
    if (r.ok) {
      achados = r.dados.itens;
      if (t && achados.length === 0) msg = 'Nenhuma peça encontrada.';
    } else msg = r.erro.mensagem;
  }

  // Sincroniza a peça escolhida (inclusive pré-seleção vinda da URL).
  $effect(() => {
    const id = valor;
    if (id && escolhido?.item_id !== id) {
      const doAchado = achados.find((s) => s.item_id === id);
      if (doAchado) {
        escolhido = doAchado;
        onescolher?.(doAchado);
      } else {
        void obterSaldo(id).then((r) => {
          if (r.ok && r.dados && valor === id) {
            escolhido = r.dados;
            onescolher?.(r.dados);
          }
        });
      }
    } else if (!id && escolhido) {
      escolhido = null;
      onescolher?.(null);
    }
  });
</script>

<div class="seletor">
  <Busca
    bind:valor={texto}
    rotulo="Buscar peça"
    placeholder="Buscar peça por nome ou código…"
    onbuscar={buscar}
    testid="{testid}-busca"
  />
  {#if msg}<small class="ui-erro" role="status">{msg}</small>{/if}
  <Selecao
    label="Peça"
    placeholder="Selecione a peça"
    {opcoes}
    bind:valor
    {erro}
    ajuda="Digite ao menos 2 letras para buscar."
    testid="{testid}-selecao"
  />
</div>

<style>
  .seletor { display: grid; gap: var(--esp-2); }
</style>
