<script lang="ts" generics="T">
  import type { Snippet } from 'svelte';

  interface Coluna {
    chave: string;
    rotulo: string;
    ordenavel?: boolean;
    alinhar?: 'esquerda' | 'direita' | 'centro';
  }
  interface Ordem {
    chave: string;
    dir: 'asc' | 'desc';
  }
  interface Props {
    colunas: Coluna[];
    linhas: T[];
    /** Renderiza os <td> de cada linha. */
    linha: Snippet<[T]>;
    ordem?: Ordem | null;
    onordenar?: (ordem: Ordem) => void;
    legenda?: string;
    vazio?: Snippet;
    altura?: string;
    testid?: string;
  }
  let { colunas, linhas, linha, ordem = null, onordenar, legenda, vazio, altura = '24rem', testid = 'ui-tabela' }: Props = $props();

  function ordenar(c: Coluna) {
    const dir = ordem?.chave === c.chave && ordem.dir === 'asc' ? 'desc' : 'asc';
    onordenar?.({ chave: c.chave, dir });
  }
  function aria(c: Coluna) {
    if (ordem?.chave !== c.chave) return 'none';
    return ordem.dir === 'asc' ? 'ascending' : 'descending';
  }
</script>

<div class="ui-tabela-wrap" style:max-height={altura} data-testid={testid}>
  <table class="ui-tabela">
    {#if legenda}<caption class="ui-sr-only">{legenda}</caption>{/if}
    <thead>
      <tr>
        {#each colunas as c (c.chave)}
          <th scope="col" class={c.alinhar && `ui-alinhar-${c.alinhar}`} aria-sort={c.ordenavel ? aria(c) : undefined}>
            {#if c.ordenavel}
              <button type="button" class="ui-th-ordenar" onclick={() => ordenar(c)} data-testid="{testid}-ordenar-{c.chave}">
                {c.rotulo}
                <span aria-hidden="true">{ordem?.chave === c.chave ? (ordem.dir === 'asc' ? '▲' : '▼') : '↕'}</span>
              </button>
            {:else}
              {c.rotulo}
            {/if}
          </th>
        {/each}
      </tr>
    </thead>
    <tbody>
      {#each linhas as item, i (i)}
        <tr data-testid="{testid}-linha">{@render linha(item)}</tr>
      {:else}
        <tr class="ui-tabela-vazio">
          <td colspan={colunas.length} data-testid="{testid}-vazio">
            {#if vazio}{@render vazio()}{:else}Nenhum registro.{/if}
          </td>
        </tr>
      {/each}
    </tbody>
  </table>
</div>
