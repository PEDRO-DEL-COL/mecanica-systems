<script lang="ts">
  import Botao from '../../lib/ui/Botao.svelte';
  import Campo from '../../lib/ui/Campo.svelte';
  import CampoDinheiro from '../../lib/ui/CampoDinheiro.svelte';
  import Selecao from '../../lib/ui/Selecao.svelte';
  import Dialogo from '../../lib/ui/Dialogo.svelte';
  import ConfirmarDialogo from '../../lib/ui/ConfirmarDialogo.svelte';
  import Tabela from '../../lib/ui/Tabela.svelte';
  import Paginacao from '../../lib/ui/Paginacao.svelte';
  import Busca from '../../lib/ui/Busca.svelte';
  import EstadoVazio from '../../lib/ui/EstadoVazio.svelte';
  import Carregando from '../../lib/ui/Carregando.svelte';
  import Etiqueta from '../../lib/ui/Etiqueta.svelte';
  import { toast } from '../../lib/ui/toast.svelte';
  import { formatarReais } from '../../lib/puro/dinheiro';

  type Linha = { nome: string; placa: string; total: number; situacao: string };
  const todas: Linha[] = [
    { nome: 'Ana Souza', placa: 'ABC1D23', total: 125000, situacao: 'Aprovada' },
    { nome: 'Bruno Lima', placa: 'QWE4R56', total: 48050, situacao: 'Orçamento' },
    { nome: 'Carla Dias', placa: 'JKL7M89', total: 310099, situacao: 'Cancelada' },
    { nome: 'Davi Prado', placa: 'XYZ0A12', total: 9900, situacao: 'Aprovada' }
  ];

  let aberto = $state(false);
  let confirmar = $state(false);
  let confirmarMotivo = $state(false);
  let carregandoBotao = $state(false);
  let nome = $state('');
  let email = $state('');
  let obs = $state('');
  let dinheiro = $state<number | null>(null);
  let uf = $state('');
  let busca = $state('');
  let ultimaBusca = $state('');
  let pagina = $state(1);
  let ordem = $state<{ chave: string; dir: 'asc' | 'desc' } | null>(null);
  let ultimoMotivo = $state('');

  const linhas = $derived.by(() => {
    if (!ordem) return todas;
    const { chave, dir } = ordem;
    const k = chave as keyof Linha;
    return [...todas].sort((a, b) => (a[k] > b[k] ? 1 : a[k] < b[k] ? -1 : 0) * (dir === 'asc' ? 1 : -1));
  });
  const tom = (s: string) => (s === 'Aprovada' ? 'sucesso' : s === 'Cancelada' ? 'erro' : 'aviso');

  function simular() {
    carregandoBotao = true;
    setTimeout(() => (carregandoBotao = false), 1500);
  }
</script>

<svelte:head>
  <title>Vitrine de UI | Mecanica Systems</title>
  <meta name="robots" content="noindex" />
</svelte:head>

<main class="vitrine" data-testid="ui-vitrine">
  <h1>Vitrine do kit de UI</h1>

  <section aria-labelledby="v-botoes">
    <h2 id="v-botoes">Botões e etiquetas</h2>
    <div class="linha">
      <Botao variante="primario">Primário</Botao>
      <Botao variante="secundario">Secundário</Botao>
      <Botao variante="perigo">Perigo</Botao>
      <Botao>Neutro</Botao>
      <Botao pequeno>Pequeno</Botao>
      <Botao variante="primario" carregando={carregandoBotao} testid="vitrine-carregando-btn" onclick={simular}>Salvar</Botao>
    </div>
    <div class="linha">
      <Etiqueta>Neutro</Etiqueta><Etiqueta tom="info">Info</Etiqueta><Etiqueta tom="sucesso">Sucesso</Etiqueta>
      <Etiqueta tom="aviso">Aviso</Etiqueta><Etiqueta tom="erro">Erro</Etiqueta>
    </div>
  </section>

  <section aria-labelledby="v-campos">
    <h2 id="v-campos">Campos</h2>
    <div class="grade">
      <Campo label="Nome" ajuda="Como no documento." bind:valor={nome} testid="vitrine-nome" />
      <Campo label="E-mail" type="email" bind:valor={email} erro="Informe um e-mail válido." testid="vitrine-email" />
      <CampoDinheiro label="Valor" ajuda="Digite em reais." bind:valor={dinheiro} />
      <Selecao
        label="Estado"
        placeholder="Selecione"
        bind:valor={uf}
        opcoes={[
          { valor: 'SP', rotulo: 'São Paulo' },
          { valor: 'MG', rotulo: 'Minas Gerais' },
          { valor: 'RJ', rotulo: 'Rio de Janeiro' }
        ]}
      />
      <Campo label="Observações" multilinha bind:valor={obs} testid="vitrine-obs" />
    </div>
    <p data-testid="vitrine-centavos">Centavos: {dinheiro ?? 'vazio'}</p>
  </section>

  <section aria-labelledby="v-dialogos">
    <h2 id="v-dialogos">Diálogos e avisos</h2>
    <div class="linha">
      <Botao testid="vitrine-abrir-dialogo" onclick={() => (aberto = true)}>Abrir diálogo</Botao>
      <Botao variante="perigo" testid="vitrine-abrir-confirmar" onclick={() => (confirmar = true)}>Excluir…</Botao>
      <Botao variante="perigo" testid="vitrine-abrir-motivo" onclick={() => (confirmarMotivo = true)}>Cancelar OS…</Botao>
      <Botao testid="vitrine-toast" onclick={() => toast.sucesso('Salvo com sucesso.')}>Toast sucesso</Botao>
      <Botao onclick={() => toast.aviso('Atenção: estoque baixo.')}>Toast aviso</Botao>
      <Botao onclick={() => toast.erro('Não foi possível salvar.')}>Toast erro</Botao>
    </div>
    {#if ultimoMotivo}<p data-testid="vitrine-motivo">Motivo: {ultimoMotivo}</p>{/if}
  </section>

  <section aria-labelledby="v-tabela">
    <h2 id="v-tabela">Busca, tabela e paginação</h2>
    <Busca bind:valor={busca} placeholder="Buscar por nome ou placa" onbuscar={(t) => (ultimaBusca = t)} />
    <p data-testid="vitrine-ultima-busca">Última busca: {ultimaBusca || '(nenhuma)'}</p>
    <Tabela
      legenda="Ordens de serviço"
      colunas={[
        { chave: 'nome', rotulo: 'Cliente', ordenavel: true },
        { chave: 'placa', rotulo: 'Placa' },
        { chave: 'total', rotulo: 'Total', ordenavel: true, alinhar: 'direita' },
        { chave: 'situacao', rotulo: 'Situação' }
      ]}
      {linhas}
      {ordem}
      onordenar={(o) => (ordem = o)}
    >
      {#snippet linha(l: Linha)}
        <td>{l.nome}</td>
        <td>{l.placa}</td>
        <td class="ui-alinhar-direita">{formatarReais(l.total)}</td>
        <td><Etiqueta tom={tom(l.situacao)}>{l.situacao}</Etiqueta></td>
      {/snippet}
    </Tabela>
    <Tabela testid="ui-tabela-vazia" colunas={[{ chave: 'a', rotulo: 'Coluna' }]} linhas={[] as string[]} altura="10rem">
      {#snippet linha(_: string)}<td></td>{/snippet}
    </Tabela>
    <Paginacao {pagina} total={92} onmudar={(p) => (pagina = p)} />
  </section>

  <section aria-labelledby="v-estados">
    <h2 id="v-estados">Estados</h2>
    <div class="grade">
      <EstadoVazio titulo="Nenhum cliente ainda" texto="Cadastre o primeiro cliente para abrir uma ordem de serviço.">
        {#snippet acao()}<Botao variante="primario">Novo cliente</Botao>{/snippet}
      </EstadoVazio>
      <div class="cartao">
        <Carregando />
        <br />
        <Carregando tipo="esqueleto" testid="ui-carregando-esqueleto" />
      </div>
    </div>
  </section>
</main>

<Dialogo bind:aberto titulo="Exemplo de diálogo">
  <p>Foco fica preso aqui. Esc fecha e o foco volta ao botão que abriu.</p>
  <Campo label="Campo dentro do diálogo" testid="vitrine-dialogo-campo" />
  {#snippet rodape()}
    <Botao testid="vitrine-fechar-dialogo" onclick={() => (aberto = false)}>Fechar</Botao>
  {/snippet}
</Dialogo>

<ConfirmarDialogo
  bind:aberto={confirmar}
  titulo="Excluir item?"
  texto="Esta ação não pode ser desfeita."
  rotuloConfirmar="Excluir"
  perigo
  onconfirmar={() => {
    confirmar = false;
    toast.sucesso('Item excluído.');
  }}
/>

<ConfirmarDialogo
  bind:aberto={confirmarMotivo}
  testid="ui-confirmar-motivo"
  titulo="Cancelar ordem de serviço?"
  motivo="obrigatorio"
  rotuloConfirmar="Cancelar OS"
  perigo
  onconfirmar={(m) => {
    ultimoMotivo = m;
    confirmarMotivo = false;
  }}
/>
