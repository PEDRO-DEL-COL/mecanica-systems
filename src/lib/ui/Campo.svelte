<script lang="ts">
  import type { HTMLInputAttributes } from 'svelte/elements';

  interface Props extends Omit<HTMLInputAttributes, 'value' | 'children'> {
    label: string;
    valor?: string;
    ajuda?: string;
    erro?: string;
    multilinha?: boolean;
    linhas?: number;
    testid?: string;
  }
  let {
    label,
    valor = $bindable(''),
    ajuda,
    erro,
    multilinha = false,
    linhas = 3,
    testid = 'ui-campo',
    ...resto
  }: Props = $props();

  const uid = $props.id();
  const idCampo = `campo-${uid}`;
  const idAjuda = `${idCampo}-ajuda`;
  const idErro = `${idCampo}-erro`;
  const descrito = $derived([ajuda ? idAjuda : '', erro ? idErro : ''].filter(Boolean).join(' ') || undefined);
</script>

<div class="ui-campo">
  <label for={idCampo}>{label}</label>
  {#if multilinha}
    <textarea
      id={idCampo}
      rows={linhas}
      bind:value={valor}
      aria-invalid={erro ? 'true' : undefined}
      aria-describedby={descrito}
      data-testid={testid}
    ></textarea>
  {:else}
    <input
      {...resto}
      id={idCampo}
      bind:value={valor}
      aria-invalid={erro ? 'true' : undefined}
      aria-describedby={descrito}
      data-testid={testid}
    />
  {/if}
  {#if ajuda}<small id={idAjuda} class="ui-ajuda">{ajuda}</small>{/if}
  {#if erro}<small id={idErro} class="ui-erro" role="alert" data-testid="{testid}-erro">{erro}</small>{/if}
</div>
