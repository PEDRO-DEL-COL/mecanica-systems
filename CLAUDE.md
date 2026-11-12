# Mecanica Systems

Plataforma SaaS 100% online para oficinas mecânicas (multi-oficina). Planejamento em `docs/PROJETO.md`.

## Leia antes de qualquer tarefa
- `docs/REGRAS.md`: especificação do MVP (OS, CDC, estoque, financeiro, permissões, modelo de dados, UX, LGPD, MUST/SHOULD/COULD).
- `docs/PLANO-CONSTRUCAO.md`: ondas 0/A-E, tarefas com arquivos exclusivos, convenções obrigatórias e modelo de prompt.
- `docs/pesquisa/`: pesquisa de apoio (marcas [CONH]/[VERIFICAR]/[?] = não verificado).

## Status (2026-11-12, trabalho pausado por falta de créditos)
FEITO (check 0 erros, 143 testes unitários; E2E com rede simulada): Onda 0 (base de código, kit de UI, migração comum), Onda A (login/cadastro/recuperação, shell do app com menu por permissão, onboarding, migrações de clientes/veículos e catálogo/estoque/fornecedores) e Onda B menos B5: telas de clientes (B1), veículos (B2), catálogo (B3), estoque/fornecedores (B4). Nova área de permissão `caixa` (receber pagamento sem ver custos); telas do caixa em `/app/caixa`.
INCOMPLETO — RETOMAR AQUI: tarefa B5 (OPUS, banco das ordens de serviço) foi interrompida. Existem `supabase/migrations/20261115100000_ordens.sql`, `20261115110000_ordens_rpc.sql`, `tests/db/ordens.test.ts` e `tests/db/fabricas/ordens.ts` como RASCUNHO NÃO REVISADO. Faltam `src/lib/{tipos,repos,validacao}/ordens.ts`, `src/lib/puro/os.ts` + `tests/os.test.ts`, e revisar/concluir as migrações e testes conforme docs/PLANO-CONSTRUCAO.md (B5). Depois: Onda C (telas da OS, pátio, aprovação, checklist, financeiro C6, painel/LGPD C7), Onda D, Onda E (revisão de segurança Opus, E2E real).
AJUSTES PENDENTES: busca de veículos por dono; gravar o motivo da transferência de veículo; devolução ao fornecedor sem tela; o `goto` do SvelteKit 3.2 não aceita keepFocus/noScroll (usar `{ replace: true, reset: false }`).
BLOQUEIO DO PEDRO: criar projeto Supabase em São Paulo (o atual está em East US) e passar URL + anon key (nunca service_role nem senha do banco); o 1º teste real do login/cadastro depende disso. Trocar a senha do banco atual (foi exposta no chat).

## Decisões
- Plataforma online multi-oficina; Supabase (região São Paulo) com Auth + RLS + RPCs. Migrations em `supabase/migrations`.
- Front: SvelteKit + TypeScript com adapter-static (fallback SPA `200.html`), hospedado no Cloudflare Pages. Rotas `(app)` são SPA (ssr=false).
- O dono da oficina tem acesso total e cria acessos restritos por área para funcionários (permissões por área, ex.: financeiro).
- Numeração de OS `000001.2026/11`: sequencial por oficina, nunca zera, nasce no orçamento.
- Sem `service_role` no front. Sem segredos no git (repo público, All rights reserved). Config via `.env.local` (`PUBLIC_SUPABASE_*`).
- Fiscal: no MVP o sistema só organiza dados, não emite nem promete conformidade.
- Planos/preços e cobrança (Asaas recomendado) ficam para depois.
- Testes de banco/RLS em Postgres WASM (PGlite, `tests/db`); E2E real num 2º projeto Supabase de teste quando existir (sem Docker).
- A versão local-first (SQLite/OPFS) está na tag `v0-local-first`, para um futuro modo offline.
- TypeScript fixado em 6.0.3 (svelte-check não roda com TS 7).

## Fluxo de trabalho
- Opus 5.5 é o gerente; Sonnet 5.5 faz tarefas simples. Economizar créditos.
- Dúvidas: perguntar ao Pedro.

## Comandos
`npm run dev | build | preview | check | test | e2e`
