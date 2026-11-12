<script lang="ts">
  interface Opcao {
    valor: string;
    rotulo: string;
    desabilitada?: boolean;
  }
  interface Props {
    label: string;
    opcoes: Opcao[];
    valor?: string;
    placeholder?: string;
    ajuda?: string;
    erro?: string;
    disabled?: boolean;
    testid?: string;
  }
  let {
    label,
    opcoes,
    valor = $bindable(''),
    placeholder,
    ajuda,
    erro,
    disabled = false,
    testid = 'ui-selecao'
  }: Props = $props();

  const uid = $props.id();
  const idCampo = `selecao-${uid}`;
  const idAjuda = `${idCampo}-ajuda`;
  const idErro = `${idCampo}-erro`;
  const descrito = $derived([ajuda ? idAjuda : '', erro ? idErro : ''].filter(Boolean).join(' ') || undefined);
</script>

<div class="ui-campo">
  <label for={idCampo}>{label}</label>
  <select
    id={idCampo}
    bind:value={valor}
    {disabled}
    aria-invalid={erro ? 'true' : undefined}
    aria-describedby={descrito}
    data-testid={testid}
  >
    {#if placeholder}<option value="">{placeholder}</option>{/if}
    {#each opcoes as o (o.valor)}
      <option value={o.valor} disabled={o.desabilitada}>{o.rotulo}</option>
    {/each}
  </select>
  {#if ajuda}<small id={idAjuda} class="ui-ajuda">{ajuda}</small>{/if}
  {#if erro}<small id={idErro} class="ui-erro" role="alert">{erro}</small>{/if}
</div>
