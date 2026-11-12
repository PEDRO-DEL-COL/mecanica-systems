<script lang="ts">
  import '../../styles/publico.css';
  let { children } = $props();
</script>

<header class="pub-topo">
  <div class="in">
    <a class="pub-logo" href="/">
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.4 2.4-2.6-.6-.6-2.6z"/></svg>
      Mecanica Systems
    </a>
    <nav class="pub-nav" aria-label="Principal">
      <a href="/#recursos">Recursos</a>
      <a href="/#como-funciona">Como funciona</a>
      <a href="/precos">Preços</a>
      <a href="/#perguntas">Perguntas</a>
    </nav>
    <div class="pub-acoes">
      <a class="btn" href="/entrar">Entrar</a>
      <a class="btn btn-primario" href="/cadastro">Criar conta</a>
    </div>
  </div>
</header>

<main class="pub-main">
  {@render children()}
</main>

<footer class="pub-rodape">
  <div class="pub-wrap">
    <span>&copy; {new Date().getFullYear()} Mecanica Systems. Todos os direitos reservados.</span>
    <nav aria-label="Legal">
      <a href="/termos">Termos</a>
      <a href="/privacidade">Privacidade</a>
    </nav>
  </div>
</footer>
