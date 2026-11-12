# Mecanica Systems

Plataforma SaaS 100% online para oficinas mecânicas (multi-oficina). Planejamento em `docs/PROJETO.md`.

## Leia antes de qualquer tarefa
- `docs/REGRAS.md`: especificação do MVP (OS, CDC, estoque, financeiro, permissões, modelo de dados, UX, LGPD, MUST/SHOULD/COULD).
- `docs/PLANO-CONSTRUCAO.md`: ondas 0/A-E, tarefas com arquivos exclusivos, convenções obrigatórias e modelo de prompt.
- `docs/pesquisa/`: pesquisa de apoio (marcas [CONH]/[VERIFICAR]/[?] = não verificado).

## Status (2026-11-12)
Núcleo pronto: migrações `nucleo_*` (oficina, membro, permissões por área, convite, RLS) com testes PGlite; site público. Próximo: Onda 0 do plano.

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
