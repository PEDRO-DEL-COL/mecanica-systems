<script lang="ts">
  import { page } from '$app/state';
  import { obterItem, obterCustoItem, atualizarItem, definirAtivoItem } from '../../../../../lib/repos/catalogo';
  import { obterSaldo } from '../../../../../lib/repos/estoque';
  import type { ItemCatalogo, ItemCusto } from '../../../../../lib/tipos/catalogo';
  import type { SaldoEstoque } from '../../../../../lib/tipos/estoque';
  import { pode } from '../../../../../lib/estado/oficina.svelte';
  import { formatarQuantidade } from '../../../../../lib/puro/formatos';
  import { toast } from '../../../../../lib/ui/toast.svelte';
  import FormularioItem from '../../../../../lib/catalogo/FormularioItem.svelte';
  import Botao from '../../../../../lib/ui/Botao.svelte';
  import Carregando from '../../../../../lib/ui/Carregando.svelte';
  import ConfirmarDialogo from '../../../../../lib/ui/ConfirmarDialogo.svelte';
  import Etiqueta from '../../../../../lib/ui/Etiqueta.svelte';
  import type { SaidaItemCatalogo } from '../../../../../lib/validacao/catalogo';

  const id = $derived(page.params.id ?? '');
  const escrita = $derived(pode('catalogo', 'escrita'));
  const verCusto = $derived(pode('financeiro', 'leitura'));
  const verSaldo = $derived(pode('estoque', 'leitura'));

  let item = $state<ItemCatalogo | null>(null);
  let custo = $state<ItemCusto | null>(null);
  let saldo = $state<SaldoEstoque | null>(null);
  let carregando = $state(true);
  let erro = $state('');
  let conflito = $state(false);
  let confirmar = $state(false);
  let trocando = $state(false);
  let chave = $state(0);

  async function carregar() {
    carregando = true;
    erro = '';
    conflito = false;
    const r = await obterItem(id);
    if (!r.ok) {
      erro = r.erro.mensagem;
      carregando = false;
      return;
    }
    item = r.dados;
    custo = null;
    saldo = null;
    // Custo só é pedido a quem tem financeiro/leitura; saldo só a quem tem estoque/leitura.
    const [c, s] = await Promise.all([
      verCusto ? obterCustoItem(id) : Promise.resolve(null),
      verSaldo && r.dados.tipo === 'peca' && r.dados.controla_estoque ? obterSaldo(id) : Promise.resolve(null)
    ]);
    if (c && c.ok) custo = c.dados;
    if (s && s.ok) saldo = s.dados;
    chave++;
    carregando = false;
  }

  $effect(() => {
    void id;
    void carregar();
  });

  async function salvar(dados: SaidaItemCatalogo) {
    if (!item) return null;
    const r = await atualizarItem(item.id, item.versao, dados);
    if (!r.ok) {
      if (r.erro.codigo === 'conflito') conflito = true;
      return r.erro;
    }
    item = r.dados;
    conflito = false;
    toast.sucesso('Alterações salvas.');
    return null;
  }

  async function alternarAtivo() {
    if (!item) return;
    trocando = true;
    const r = await definirAtivoItem(item.id, item.versao, !item.ativo);
    trocando = false;
    confirmar = false;
    if (!r.ok) {
      if (r.erro.codigo === 'conflito') conflito = true;
      toast.erro(r.erro.mensagem);
      return;
    }
    item = r.dados;
    toast.sucesso(r.dados.ativo ? 'Item reativado.' : 'Item desativado.');
  }
</script>

<svelte:head><title>{item?.descricao ?? 'Item'} | Catálogo | Mecanica Systems</title></svelte:head>

<p><a href="/app/catalogo?tipo={item?.tipo ?? 'servico'}">← Voltar ao catálogo</a></p>

{#if carregando && !item}
  <Carregando tipo="esqueleto" linhas={4} />
{:else if erro}
  <p class="alerta alerta-erro" role="alert" data-testid="catalogo-erro">{erro}</p>
{:else if item}
  <div class="catalogo-cab">
    <h1>{item.descricao}</h1>
    {#if item.ativo}<Etiqueta tom="sucesso" testid="catalogo-etiqueta-ativo">Ativo</Etiqueta>{:else}<Etiqueta testid="catalogo-etiqueta-inativo">Inativo</Etiqueta>{/if}
    {#if saldo}
      <Etiqueta tom={saldo.abaixo_minimo || saldo.negativo ? 'aviso' : 'info'} testid="catalogo-saldo">
        Saldo: {formatarQuantidade(saldo.saldo)} {item.unidade}
      </Etiqueta>
      {#if saldo.abaixo_minimo}<Etiqueta tom="erro" testid="catalogo-abaixo-minimo">Abaixo do mínimo</Etiqueta>{/if}
    {/if}
  </div>

  {#if conflito}
    <div class="alerta alerta-erro" role="alert" data-testid="catalogo-conflito">
      Alterado por outra pessoa. Recarregue.
      <Botao pequeno testid="catalogo-btn-recarregar" onclick={carregar}>Recarregar</Botao>
    </div>
  {/if}

  {#key chave}
    <FormularioItem
      tipo={item.tipo}
      inicial={item}
      somenteLeitura={!escrita}
      custo={verCusto ? custo : undefined}
      onsalvar={salvar}
    />
  {/key}

  {#if escrita}
    <div class="form-acoes catalogo-ativo">
      <Botao variante={item.ativo ? 'perigo' : 'secundario'} testid="catalogo-btn-ativo" onclick={() => (confirmar = true)}>
        {item.ativo ? 'Desativar' : 'Reativar'}
      </Botao>
    </div>
    <ConfirmarDialogo
      bind:aberto={confirmar}
      titulo={item.ativo ? 'Desativar item?' : 'Reativar item?'}
      texto={item.ativo
        ? 'O item deixa de aparecer nas listas e em novas ordens de serviço. O histórico é mantido.'
        : 'O item volta a aparecer nas listas e poderá ser usado em novas ordens de serviço.'}
      rotuloConfirmar={item.ativo ? 'Desativar' : 'Reativar'}
      perigo={item.ativo}
      carregando={trocando}
      onconfirmar={alternarAtivo}
      testid="catalogo-confirmar-ativo"
    />
  {/if}
{/if}

<style>
  .catalogo-cab { display: flex; flex-wrap: wrap; align-items: center; gap: var(--esp-2) var(--esp-3); margin-bottom: var(--esp-3); }
  .catalogo-cab h1 { margin: 0; overflow-wrap: anywhere; }
  .catalogo-ativo { margin-top: var(--esp-5); }
</style>
