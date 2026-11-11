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

## Próximos passos (ordem de construção)
1. Esqueleto PWA + SQLite OPFS + migração v1 + teste grava/fecha/reabre (fase 0)
2. Clientes e veículos (busca por placa) 3. Catálogo 4. Orçamento/OS 5. Pagamentos e estoque 6. PDF/WhatsApp 7. Backup 8. Teste com oficina real

## Status
- Fase 0 implementada (PWA, SQLite OPFS em worker, migração v1, backup exportar/importar, trava de aba única). Pendente apenas de validação E2E em Chrome/Edge reais (testes em tests/e2e já escritos; rodar `npm run e2e`).

## Decisões novas
- TypeScript fixado em 6.0.3; @sqlite.org/sqlite-wasm fixado em 3.54.1-build1 (versões exatas, sem ^).
- Worker do banco processa as requisições em fila (uma por vez).
- Importar backup substitui TODOS os dados; antes, o app baixa automaticamente um backup do banco atual.
- Hospedagem: Cloudflare Pages.
- Vitest só coleta tests/*.test.ts (vitest.config.ts); E2E fica em tests/e2e (Playwright, contexto persistente porque OPFS não persiste em contexto normal).
