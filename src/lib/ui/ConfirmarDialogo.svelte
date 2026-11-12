<script lang="ts">
  import Dialogo from './Dialogo.svelte';
  import Botao from './Botao.svelte';
  import Campo from './Campo.svelte';

  interface Props {
    aberto?: boolean;
    titulo: string;
    texto?: string;
    rotuloConfirmar?: string;
    rotuloCancelar?: string;
    perigo?: boolean;
    motivo?: 'nenhum' | 'opcional' | 'obrigatorio';
    carregando?: boolean;
    onconfirmar: (motivo: string) => void | Promise<void>;
    oncancelar?: () => void;
    testid?: string;
  }
  let {
    aberto = $bindable(false),
    titulo,
    texto,
    rotuloConfirmar = 'Confirmar',
    rotuloCancelar = 'Cancelar',
    perigo = false,
    motivo = 'nenhum',
    carregando = false,
    onconfirmar,
    oncancelar,
    testid = 'ui-confirmar'
  }: Props = $props();

  let motivoTexto = $state('');
  let erro = $state('');

  $effect(() => {
    if (aberto) {
      motivoTexto = '';
      erro = '';
    }
  });

  async function confirmar() {
    const m = motivoTexto.trim();
    if (motivo === 'obrigatorio' && !m) {
      erro = 'Informe o motivo.';
      return;
    }
    erro = '';
    await onconfirmar(m);
  }
  function cancelar() {
    aberto = false;
    oncancelar?.();
  }
</script>

<Dialogo bind:aberto {titulo} {testid}>
  {#if texto}<p>{texto}</p>{/if}
  {#if motivo !== 'nenhum'}
    <Campo
      label={motivo === 'obrigatorio' ? 'Motivo (obrigatório)' : 'Motivo (opcional)'}
      multilinha
      bind:valor={motivoTexto}
      {erro}
      testid="{testid}-motivo"
    />
  {/if}
  {#snippet rodape()}
    <Botao testid="{testid}-cancelar" onclick={cancelar}>{rotuloCancelar}</Botao>
    <Botao testid="{testid}-confirmar" variante={perigo ? 'perigo' : 'primario'} {carregando} onclick={confirmar}>
      {rotuloConfirmar}
    </Botao>
  {/snippet}
</Dialogo>
