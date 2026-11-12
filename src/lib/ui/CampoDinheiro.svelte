<script lang="ts">
  import { untrack } from 'svelte';
  import { parseReais, formatarReais } from '../puro/dinheiro';

  interface Props {
    label: string;
    /** Valor em centavos inteiros; null quando vazio ou invalido. */
    valor?: number | null;
    ajuda?: string;
    erro?: string;
    disabled?: boolean;
    testid?: string;
  }
  let { label, valor = $bindable(null), ajuda, erro, disabled = false, testid = 'ui-campo-dinheiro' }: Props = $props();

  const uid = $props.id();
  const idCampo = `dinheiro-${uid}`;
  const idAjuda = `${idCampo}-ajuda`;
  const idErro = `${idCampo}-erro`;

  let texto = $state(valor === null ? '' : formatarReais(valor));
  let erroLocal = $state('');
  const msg = $derived(erro || erroLocal);
  const descrito = $derived([ajuda ? idAjuda : '', msg ? idErro : ''].filter(Boolean).join(' ') || undefined);

  function interpretar(t: string): number | null {
    try {
      return t.trim() ? parseReais(t) : null;
    } catch {
      return null;
    }
  }

  // Sincroniza quando o pai altera o valor de fora.
  $effect(() => {
    const v = valor;
    if (v !== untrack(() => interpretar(texto))) {
      texto = v === null ? '' : formatarReais(v);
      erroLocal = '';
    }
  });

  function confirmar() {
    if (!texto.trim()) {
      valor = null;
      erroLocal = '';
      return;
    }
    try {
      const c = parseReais(texto);
      valor = c;
      texto = formatarReais(c);
      erroLocal = '';
    } catch (e) {
      valor = null;
      erroLocal = e instanceof Error ? e.message : 'Valor inválido.';
    }
  }
</script>

<div class="ui-campo">
  <label for={idCampo}>{label}</label>
  <input
    id={idCampo}
    type="text"
    inputmode="decimal"
    autocomplete="off"
    placeholder="R$ 0,00"
    {disabled}
    bind:value={texto}
    onblur={confirmar}
    onkeydown={(e) => e.key === 'Enter' && confirmar()}
    aria-invalid={msg ? 'true' : undefined}
    aria-describedby={descrito}
    data-testid={testid}
  />
  {#if ajuda}<small id={idAjuda} class="ui-ajuda">{ajuda}</small>{/if}
  {#if msg}<small id={idErro} class="ui-erro" role="alert" data-testid="{testid}-erro">{msg}</small>{/if}
</div>
