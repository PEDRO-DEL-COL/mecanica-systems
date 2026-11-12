<script lang="ts">
  const problemas = [
    ['Orçamento no papel', 'Folhas soltas, rabiscos e valores que ninguém lembra de ter combinado com o cliente.'],
    ['Peça controlada de cabeça', 'Sem estoque registrado, a peça acaba na hora errada e a compra vira urgência.'],
    ['Histórico do carro perdido', 'O que foi feito no veículo na última visita? Ninguém sabe sem vasculhar caderno.'],
    ['Caixa que não fecha', 'Entradas e saídas espalhadas tornam difícil saber quanto a oficina realmente ganhou.']
  ];
  const recursos = [
    ['Clientes e veículos', 'Cadastro com histórico de serviços por placa, sempre à mão no atendimento.', 'M3 12l2-5a2 2 0 0 1 2-1h10a2 2 0 0 1 2 1l2 5v6h-3v-2H6v2H3zM7 14h.01M17 14h.01'],
    ['Orçamento e OS', 'Do orçamento à ordem de serviço, com aprovação do cliente registrada.', 'M6 3h9l4 4v14H6zM9 12h7M9 16h7'],
    ['Estoque com alerta', 'Controle de peças com aviso quando o mínimo é atingido.', 'M3 8l9-5 9 5v8l-9 5-9-5zM3 8l9 5 9-5M12 13v8'],
    ['Caixa e financeiro', 'Entradas, saídas e visão do que a oficina movimentou.', 'M3 6h18v12H3zM3 10h18M7 15h3'],
    ['PDF e WhatsApp', 'Gere o PDF do orçamento e envie ao cliente por WhatsApp.', 'M21 12a8 8 0 0 1-11.7 7L4 20l1.1-4.9A8 8 0 1 1 21 12z'],
    ['Equipe com permissões', 'O dono vê tudo; cada funcionário acessa apenas as áreas liberadas.', 'M16 11a3 3 0 1 0-6 0 3 3 0 0 0 6 0zM5 20a7 7 0 0 1 14 0']
  ];
  const faq = [
    ['O sistema emite nota fiscal?', 'Não. O sistema organiza os dados que você usa na nota, mas a emissão é feita fora dele. Não prometemos conformidade fiscal.'],
    ['Preciso instalar algo?', 'Não. Funciona 100% online, direto no navegador, no computador ou no celular.'],
    ['Quanto custa?', 'Durante o desenvolvimento o acesso é gratuito. Os planos serão divulgados antes de qualquer cobrança.'],
    ['Posso dar acesso aos funcionários?', 'Sim. O dono da oficina cria acessos restritos por área, como financeiro ou estoque.'],
    ['Os dados da minha oficina ficam seguros?', 'Cada oficina enxerga apenas os próprios dados. Veja detalhes na página de Privacidade.']
  ];
</script>

<svelte:head>
  <title>Mecanica Systems | Gestão simples de oficina mecânica na nuvem</title>
  <meta name="description" content="Gestão simples de oficina mecânica na nuvem: clientes, veículos, orçamentos, ordens de serviço, estoque e caixa, do orçamento à entrega." />
</svelte:head>

<section class="hero">
  <div class="pub-wrap">
    <div>
      <h1>Gestão simples de oficina mecânica, do orçamento à entrega</h1>
      <p class="lead">Organize clientes, veículos, orçamentos, ordens de serviço, estoque e caixa em um só lugar, online, sem instalar nada.</p>
      <div class="row">
        <a class="btn btn-primario btn-grande" href="/cadastro">Criar conta grátis</a>
        <a class="btn btn-grande" href="#como-funciona">Ver como funciona</a>
      </div>
      <p class="muted" style="margin-top: var(--esp-3); font-size: var(--txt-sm)">Em desenvolvimento: acesso gratuito durante esta fase.</p>
    </div>
    <div class="hero-arte" aria-hidden="true">
      <svg viewBox="0 0 320 220">
        <rect x="0" y="0" width="320" height="220" rx="8" fill="var(--cor-superficie-2)" />
        <rect x="16" y="16" width="130" height="14" rx="4" fill="var(--cor-primaria)" />
        <rect x="16" y="42" width="200" height="8" rx="4" fill="var(--cor-borda)" />
        <g fill="var(--cor-superficie)" stroke="var(--cor-borda)">
          <rect x="16" y="66" width="288" height="34" rx="6" /><rect x="16" y="108" width="288" height="34" rx="6" /><rect x="16" y="150" width="288" height="34" rx="6" />
        </g>
        <g fill="var(--cor-texto-suave)"><rect x="28" y="79" width="90" height="8" rx="4" /><rect x="28" y="121" width="110" height="8" rx="4" /><rect x="28" y="163" width="80" height="8" rx="4" /></g>
        <rect x="236" y="76" width="56" height="14" rx="7" fill="var(--cor-sucesso-bg)" stroke="var(--cor-sucesso)" />
        <rect x="236" y="118" width="56" height="14" rx="7" fill="var(--cor-aviso-bg)" stroke="var(--cor-aviso)" />
        <rect x="236" y="160" width="56" height="14" rx="7" fill="var(--cor-primaria-suave)" stroke="var(--cor-primaria)" />
        <rect x="16" y="194" width="90" height="14" rx="4" fill="var(--cor-acento)" />
      </svg>
    </div>
  </div>
</section>

<section class="secao" id="problemas" aria-labelledby="h-prob">
  <div class="pub-wrap">
    <h2 id="h-prob">Problemas que o dia a dia da oficina conhece bem</h2>
    <p class="sub">O Mecanica Systems foi pensado para tirar o improviso da rotina.</p>
    <div class="grade">
      {#each problemas as [t, d]}
        <div class="cartao"><h3>{t}</h3><p>{d}</p></div>
      {/each}
    </div>
  </div>
</section>

<section class="secao" id="recursos" aria-labelledby="h-rec">
  <div class="pub-wrap">
    <h2 id="h-rec">Recursos</h2>
    <p class="sub">O essencial para atender, orçar, executar e acompanhar o caixa.</p>
    <div class="grade grade-3">
      {#each recursos as [t, d, p]}
        <div class="cartao">
          <div class="ico"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d={p} /></svg></div>
          <h3>{t}</h3><p>{d}</p>
        </div>
      {/each}
    </div>
  </div>
</section>

<section class="secao" id="como-funciona" aria-labelledby="h-como">
  <div class="pub-wrap">
    <h2 id="h-como">Como funciona</h2>
    <ol class="passos">
      <li><h3>Cadastre a oficina</h3><p>Crie sua conta e informe os dados básicos da oficina.</p></li>
      <li><h3>Lance orçamentos e OS</h3><p>Registre clientes, veículos e serviços, e envie o orçamento para aprovação.</p></li>
      <li><h3>Acompanhe caixa e estoque</h3><p>Veja o que entrou, o que saiu e quais peças estão acabando.</p></li>
    </ol>
  </div>
</section>

<section class="secao" id="aviso" aria-labelledby="h-aviso">
  <div class="pub-wrap">
    <div class="alerta alerta-aviso">
      <h2 id="h-aviso" style="font-size: var(--txt-md)">Em desenvolvimento</h2>
      <p style="margin:0">O Mecanica Systems está sendo construído e algumas funções ainda não estão disponíveis. Sobre fiscal: o sistema organiza os dados da nota, mas a emissão é feita fora dele, e não prometemos conformidade fiscal.</p>
    </div>
  </div>
</section>

<section class="secao faq" id="perguntas" aria-labelledby="h-faq">
  <div class="pub-wrap">
    <h2 id="h-faq">Perguntas frequentes</h2>
    {#each faq as [q, a]}
      <details><summary>{q}</summary><p>{a}</p></details>
    {/each}
  </div>
</section>

<section class="cta-final">
  <div class="pub-wrap">
    <h2>Pronto para organizar a sua oficina?</h2>
    <p>Crie sua conta gratuitamente durante o desenvolvimento.</p>
    <div class="row"><a class="btn btn-primario btn-grande" href="/cadastro">Criar conta</a></div>
  </div>
</section>
