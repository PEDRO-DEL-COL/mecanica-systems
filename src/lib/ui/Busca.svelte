<script lang="ts">
  interface Props {
    valor?: string;
    placeholder?: string;
    rotulo?: string;
    /** Chamado apos o debounce; vazio ou com pelo menos `minimo` caracteres. */
    onbuscar: (texto: string) => void;
    atraso?: number;
    minimo?: number;
    testid?: string;
  }
  let {
    valor = $bindable(''),
    placeholder = 'Buscar…',
    rotulo = 'Buscar',
    onbuscar,
    atraso = 300,
    minimo = 2,
    testid = 'ui-busca'
  }: Props = $props();

  let timer: ReturnType<typeof setTimeout> | undefined;

  function aoDigitar() {
    clearTimeout(timer);
    timer = setTimeout(() => {
      const t = valor.trim();
      if (t.length === 0 || t.length >= minimo) onbuscar(t);
    }, atraso);
  }

  $effect(() => () => clearTimeout(timer));
</script>

<div class="ui-busca" role="search">
  <input
    type="search"
    bind:value={valor}
    oninput={aoDigitar}
    {placeholder}
    aria-label={rotulo}
    autocomplete="off"
    data-testid={testid}
  />
</div>
