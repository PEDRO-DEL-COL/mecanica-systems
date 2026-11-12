<script lang="ts">
  import * as v from 'valibot';
  import type { ErroApp } from '../erros';
  import type { ItemCatalogo, ItemCusto, TipoItem } from '../tipos/catalogo';
  import { itemCatalogoSchema, type SaidaItemCatalogo } from '../validacao/catalogo';
  import { errosPorCampo } from '../validacao/comum';
  import { formatarReais } from '../puro/dinheiro';
  import Botao from '../ui/Botao.svelte';
  import Campo from '../ui/Campo.svelte';
  import CampoDinheiro from '../ui/CampoDinheiro.svelte';
  import CustoMargem from './CustoMargem.svelte';

  interface Props {
    tipo: TipoItem;
    inicial?: ItemCatalogo;
    somenteLeitura?: boolean;
    /** undefined = usuário sem financeiro/leitura: a seção nem é renderizada. */
    custo?: ItemCusto | null;
    /** Devolve o erro (ou null se salvou). */
    onsalvar: (dados: SaidaItemCatalogo) => Promise<ErroApp | null>;
    oncancelar?: () => void;
  }
  let { tipo, inicial, somenteLeitura = false, custo, onsalvar, oncancelar }: Props = $props();

  const ehPeca = $derived(tipo === 'peca');
  let codigo = $state(inicial?.codigo ?? '');
  let codigoFabricante = $state(inicial?.codigo_fabricante ?? '');
  let descricao = $state(inicial?.descricao ?? '');
  let unidade = $state(inicial?.unidade ?? 'un');
  let preco = $state<number | null>(inicial ? inicial.preco_venda_centavos : null);
  let controla = $state(inicial?.controla_estoque ?? tipo === 'peca');
  let minimo = $state(inicial && inicial.estoque_minimo ? inicial.estoque_minimo.replace('.', ',') : '0');
  let localizacao = $state(inicial?.localizacao ?? '');
  let erros = $state<Record<string, string>>({});
  let erroGeral = $state('');
  let salvando = $state(false);

  async function enviar(e: SubmitEvent) {
    e.preventDefault();
    if (somenteLeitura) return;
    erroGeral = '';
    const r = v.safeParse(itemCatalogoSchema, {
      tipo,
      codigo: ehPeca ? codigo : null,
      codigo_fabricante: ehPeca ? codigoFabricante : null,
      descricao,
      unidade,
      preco_venda_centavos: preco === null ? '' : formatarReais(preco),
      controla_estoque: ehPeca && controla,
      estoque_minimo: ehPeca ? minimo : '0',
      localizacao: ehPeca ? localizacao : null
    });
    if (!r.success) {
      erros = errosPorCampo(r.issues);
      return;
    }
    erros = {};
    salvando = true;
    const erro = await onsalvar(r.output);
    salvando = false;
    if (!erro) return;
    if (erro.codigo === 'duplicado' && ehPeca) erros = { codigo: 'Código já cadastrado' };
    else erroGeral = erro.mensagem;
  }
</script>

<form class="stack" onsubmit={enviar} novalidate data-testid="catalogo-form">
  <fieldset class="catalogo-fs" disabled={somenteLeitura}>
    <div class="form-grid">
      <div class="full">
        <Campo label="Descrição" bind:valor={descricao} erro={erros.descricao} maxlength={300} testid="catalogo-descricao" />
      </div>
      {#if ehPeca}
        <Campo label="Código (opcional)" bind:valor={codigo} erro={erros.codigo} testid="catalogo-codigo" />
        <Campo label="Código do fabricante (opcional)" bind:valor={codigoFabricante} erro={erros.codigo_fabricante} testid="catalogo-codigo-fabricante" />
      {/if}
      <Campo label="Unidade" bind:valor={unidade} erro={erros.unidade} ajuda="Ex.: un, h, l" testid="catalogo-unidade" />
      <CampoDinheiro label="Preço de venda" bind:valor={preco} erro={erros.preco_venda_centavos} testid="catalogo-preco" />
      {#if ehPeca}
        <Campo label="Estoque mínimo" bind:valor={minimo} erro={erros.estoque_minimo} inputmode="decimal" testid="catalogo-minimo" />
        <Campo label="Localização (prateleira/gaveta)" bind:valor={localizacao} erro={erros.localizacao} testid="catalogo-localizacao" />
        <label class="inline full">
          <input type="checkbox" bind:checked={controla} data-testid="catalogo-controla-estoque" />
          Controla estoque
        </label>
      {/if}
    </div>
  </fieldset>

  {#if custo !== undefined}
    <CustoMargem venda={preco} {custo} />
  {/if}

  {#if erroGeral}<p class="alerta alerta-erro" role="alert" data-testid="catalogo-erro">{erroGeral}</p>{/if}

  {#if !somenteLeitura}
    <div class="form-acoes">
      <Botao type="submit" variante="primario" carregando={salvando} testid="catalogo-btn-salvar">Salvar</Botao>
      {#if oncancelar}<Botao testid="catalogo-btn-cancelar" onclick={oncancelar}>Cancelar</Botao>{/if}
    </div>
  {/if}
</form>

<style>
  .catalogo-fs { border: 0; padding: 0; margin: 0; min-width: 0; }
  @media (max-width: 600px) {
    :global(.catalogo-fs .form-grid) { grid-template-columns: minmax(0, 1fr); }
  }
</style>
