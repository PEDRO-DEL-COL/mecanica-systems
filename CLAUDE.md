# Mecanica Systems

Sistema de gestão para oficinas mecânicas: PWA local-first (offline, dados no PC do cliente). Detalhes em docs/PROJETO.md.

## Decisões já tomadas
- Plataforma: só PC Windows (Chrome/Edge); aviso para Safari.
- Nicho: mecânica geral. 1 PC por oficina no MVP (sem sincronização).
- Fiscal no MVP: só organiza dados e guarda nº da nota emitida fora.
- Stack: TypeScript, Svelte + Vite + Vite PWA, @sqlite.org/sqlite-wasm (OPFS, Web Worker), pdf-lib, Vitest + Playwright. Python só para scripts de apoio.
- Dinheiro em centavos inteiros; datas ISO 8601; nunca apagar cliente/OS (inativar/cancelar); migrações com PRAGMA user_version.
- Cobrança só depois do MVP (fase 3).

## Fluxo de trabalho
- Opus 5.5 = gerente de projeto (planeja e revisa); Sonnet 5.5 = tarefas simples. Economizar créditos.
- Dúvida que não dá para pesquisar: perguntar ao Pedro.
- Licença: All rights reserved (portfólio). Não adicionar licença open source.

## Como retomar em outro PC
- `git clone https://github.com/PEDRO-DEL-COL/mecanica-systems.git`, `npm install`, abrir a pasta no VS Code (fora de OneDrive e de caminhos com acento). Este arquivo é o contexto do projeto; o histórico da conversa NÃO é sincronizado entre PCs.
- Verificar: `npm test`, `npm run check`, `npm run build`, `npm run e2e` (precisa de Chrome ou Edge).

## Status (atualizado em 2026-11-11)
- FEITO e verificado (testes unitários + E2E em Chrome): fase 0 completa (PWA, SQLite OPFS em worker, migrações, backup exportar/importar, trava de aba única, persistência) e passo 2 da fase 1 (clientes e veículos, busca por placa).
- PRÓXIMO: 3 Catálogo de serviços e peças -> 4 Orçamento/OS (CDC: só vai a em_execucao com aprovação) -> 5 Pagamentos e estoque -> 6 PDF/WhatsApp -> 7 lembretes de backup -> 8 teste com oficina real. Depois: publicar no Cloudflare Pages.
- Pendentes do Pedro: proteger a branch main no GitHub; apagar a pasta antiga no OneDrive.

## Decisões novas
- TypeScript fixado em 6.0.3; @sqlite.org/sqlite-wasm fixado em 3.54.1-build1 (versões exatas, sem ^).
- Worker do banco processa as requisições em fila (uma por vez).
- Importar backup substitui TODOS os dados; antes, o app baixa automaticamente um backup do banco atual.
- Hospedagem: Cloudflare Pages.
- Vitest só coleta tests/*.test.ts (vitest.config.ts); E2E fica em tests/e2e (Playwright, contexto persistente porque OPFS não persiste em contexto normal).
