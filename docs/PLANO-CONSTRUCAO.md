# Plano de construção do MVP

Versão 2026-11-12. Especificação: `docs/REGRAS.md`. Gerente: Opus. Executor padrão: **SONNET**; OPUS só em SQL com segurança (RLS/RPC `security definer`) e revisão.

## Como rodar as ondas
- Tarefas da mesma onda rodam em paralelo; cada arquivo/pasta listado pertence a **uma** tarefa na onda. Precisa mexer em arquivo de outra tarefa? Pare e avise o gerente.
- Ninguém edita `package.json`/`package-lock.json`, `tests/db/helpers.ts`, `vite.config.ts` ou migração já existente, salvo se a tarefa listar. Migração aplicada nunca é editada: corrige-se com migração nova.
- Contrato entre ondas: a tarefa que cria a migração de um domínio também cria `src/lib/tipos/<dominio>.ts`, `src/lib/repos/<dominio>.ts` e `src/lib/validacao/<dominio>.ts`. As telas só consomem isso.
- Gerente faz merge/commit ao fim de cada onda depois de rodar `npm run check && npm run test && npm run build && npm run e2e`.
- **[PG]** = verificável só com PGlite/Vitest/Playwright com mock (sem Supabase). **[SB]** = precisa de projeto Supabase real (DEV ou TEST).

## Convenções obrigatórias
1. **Camadas:** só `src/lib/repos/*` chama `supabase.from/rpc/auth/storage`; repos devolvem `Resultado<T>` (`{ ok: true, dados } | { ok: false, erro: ErroApp }`) e nunca lançam para a UI. Regras puras em `src/lib/puro/*` (testadas no Vitest). Componentes por domínio em `src/lib/<dominio>/`; genéricos em `src/lib/ui/`.
2. **Tipos:** escritos à mão em `src/lib/tipos/<dominio>.ts` espelhando as colunas (snake_case como no banco) até a onda E gerar `supabase gen types`. Sem `any`.
3. **Validação:** valibot (bundle menor que zod) em `src/lib/validacao/`; o banco repete com CHECK/RPC. Mensagens em pt-BR.
4. **Svelte 5 runes:** `$state`, `$derived`, `$effect` (mínimo), `$props`; estado global em `src/lib/estado/*.svelte.ts`; sem stores legados nem `export let`.
5. **data-testid** em todo elemento que o E2E usa, padrão `modulo-elemento[-acao]` (ex.: `clientes-busca`, `os-btn-aprovar`). Preferir `getByRole` quando estável.
6. **Dinheiro:** banco `bigint` com sufixo `_centavos` e CHECK >= 0; no TS `number` inteiro (PostgREST devolve número; nunca passa de 2^53); só `parseReais`/`formatarReais`; nada de float em conta. Quantidade `numeric(12,3)` tratada como string decimal no TS.
7. **Soft-delete:** `ativo=false`, nunca DELETE (exceto `membro_permissao`). Listas filtram `ativo` por padrão com opção "mostrar inativos".
8. **SQL:** cada tabela com `org_id`, FK composta ao pai, índice `(org_id, ...)`, `enable row level security`, `revoke all` + GRANT por coluna, policies `(select private.pode(...))`, `versao` + `atualizado_em` via trigger comum, auditoria via trigger comum. Funções `security definer` com `set search_path = ''`, nomes qualificados, sem receber org_id/user_id para decidir acesso, EXECUTE revogado de `public, anon`. Migração idempotente como as do núcleo. Erros de regra com `errcode` (`P0001` regra, `42501` permissão, `23505` duplicado) e texto pt-BR.
9. **Erros:** `src/lib/erros.ts` mapeia `PostgrestError.code` para mensagem pt-BR; conflito de `versao` => "Alterado por outra pessoa. Recarregue." Nunca mostrar mensagem crua do Postgres além das `P0001` da RPC.
10. **Listas:** 25 por página, filtros/ordem/página na URL, sempre `limit`/`range`, busca com debounce 300 ms e `AbortController`.
11. **Textos pt-BR** com acentos na UI; identificadores em português sem acento (`ordem_servico`, `criarCliente`). Datas em America/Sao_Paulo.
12. **Testes por tarefa:** SQL => `tests/db/<dominio>.test.ts` cobrindo isolamento entre oficinas, anon, sem área, leitura x escrita, custo oculto, regras; fábricas em `tests/db/fabricas/<dominio>.ts`. Tela => `tests/e2e/<modulo>.spec.ts` com o mock de Supabase (`tests/e2e/apoio/supabase-mock.ts`).
13. Sem novas dependências sem o gerente. Sem `service_role`, segredos ou PII em código/log. Não fazer commit/push.

## Modelo de prompt de tarefa
```
Tarefa <ID> (<SONNET|OPUS>) em C:\Dev\mecanica-systems, branch online, PowerShell. NÃO faça commit/push.
Leia: CLAUDE.md, docs/REGRAS.md §<seções>, docs/PLANO-CONSTRUCAO.md (Convenções) e <arquivos de referência>.
Objetivo: <1-3 frases>.
Você só pode criar/editar: <lista exata>. Não toque em mais nada; se precisar, pare e explique.
Aceite: <comandos e comportamentos verificáveis>.
Responda em até 8 linhas: o que fez, arquivos, resultado dos comandos, pendências.
```

## Onda 0 — base compartilhada (paralelo) [PG]
- **0.1 SONNET Base de código.** Cria: `src/lib/erros.ts`, `src/lib/repos/base.ts` (`executar()`, `intervalo(pagina)`), `src/lib/puro/formatos.ts` (data/hora SP, telefone, quantidade), `src/lib/validacao/comum.ts` (placa, documento, telefone, e-mail, dinheiro), `tests/erros.test.ts`, `tests/formatos.test.ts`. Edita: `package.json` (+ valibot). Aceite: `npm run check`, `npm run test` verdes; mapeamento cobre 23505/42501/23514/P0001/PGRST116/rede.
- **0.2 SONNET Kit de UI.** Cria: `src/lib/ui/*` (Botao, Campo, CampoDinheiro, Selecao, Dialogo, ConfirmarDialogo com motivo, Tabela, Paginacao, Busca, EstadoVazio, Carregando, Toast + `toast.svelte.ts`, Etiqueta), `src/styles/app.css`, `src/routes/ui-vitrine/+page.svelte` (noindex), `tests/e2e/ui.spec.ts`. Aceite: vitrine renderiza todos; diálogo abre/fecha por teclado; e2e verde.
- **0.3 OPUS Migração comum.** Cria: `supabase/migrations/20261113100000_comum.sql` (pg_trgm + wrapper unaccent, `oficina_config` + `criar_oficina` atualizada, `contador` + `private.proximo_numero`, `evento` + trigger genérico, trigger `versao/atualizado_em`, RPCs `aceitar_convite`, `definir_permissoes` com dependências), `tests/db/comum.test.ts`, `tests/db/fabricas/comum.ts`. Edita: `tests/db/helpers.ts` (carregar extensões no PGlite **[VERIFICAR suporte]**). Aceite: `npm run test` verde; contador concorrente sem duplicar; convite expirado/usado/e-mail diferente recusado; funcionário não chama `definir_permissoes`.

## Onda A — entrada no app (paralelo; depende da 0)
- **A1 SONNET Auth.** Cria: `src/routes/(publico)/{entrar,cadastro,recuperar-senha,nova-senha}/`, `src/routes/auth/callback/` (ssr=false), `src/lib/repos/auth.ts`, `tests/e2e/auth.spec.ts`. Edita: `vite.config.ts` (remover exceção de `/entrar` e `/cadastro`). Aceite [PG]: validações, mensagens, redirecionamentos com mock; [SB] login/cadastro/reset real no DEV (manual).
- **A2 SONNET Shell, guarda, onboarding.** Cria: `src/routes/(app)/+layout.ts` (guarda: sem sessão => `/entrar`; sem oficina => `/onboarding`), `src/routes/(app)/app/+layout.svelte` (lateral por permissão), `src/routes/(app)/onboarding/` (fora do shell), placeholders `src/routes/(app)/app/{clientes,veiculos,catalogo,estoque,ordens,caixa,financeiro,equipe,configuracoes}/+page.svelte`, `src/lib/app/navegacao.ts`, `src/lib/estado/{sessao,oficina}.svelte.ts`, `src/lib/repos/oficina.ts`, `tests/e2e/apoio/supabase-mock.ts`, `tests/e2e/shell.spec.ts`. Edita: `tests/e2e/smoke.spec.ts`. Aceite [PG]: funcionário só com `clientes/leitura` vê só Clientes; URL de área sem permissão mostra "sem acesso"; celular 375 px com gaveta.
- **A3 SONNET Migração clientes/veículos** (revisada na E1). Cria: `supabase/migrations/20261114100000_clientes_veiculos.sql`, `tests/db/clientes_veiculos.test.ts`, `tests/db/fabricas/clientes.ts`, `src/lib/{tipos,repos,validacao}/clientes.ts`, `src/lib/repos/veiculos.ts`, `src/lib/tipos/veiculos.ts`. Aceite [PG]: placa única por oficina entre ativos; transferência auditada; busca trigram por nome/placa/telefone; matriz de permissões testada.
- **A4 OPUS Migração catálogo/estoque/fornecedores.** Cria: `supabase/migrations/20261114110000_catalogo_estoque.sql`, `tests/db/catalogo_estoque.test.ts`, `tests/db/fabricas/estoque.ts`, `src/lib/{tipos,repos,validacao}/{catalogo,estoque,fornecedores}.ts`. Aceite [PG]: movimento sem UPDATE/DELETE; saldo = soma; custo médio correto (entrada, devolução); `estoque/escrita` grava entrada com custo mas não lê `item_custo`; só `financeiro` lê custo.

## Onda B — cadastros (paralelo; depende da A)
- **B1 SONNET Telas de clientes.** Cria: `src/routes/(app)/app/clientes/**`, `src/lib/clientes/*`, `tests/e2e/clientes.spec.ts`. Aceite [PG]: lista paginada com busca na URL, vazio com CTA, criar/editar/desativar com confirmação, erros de validação acessíveis.
- **B2 SONNET Telas de veículos.** Cria: `src/routes/(app)/app/veiculos/**`, `src/lib/veiculos/*`, `tests/e2e/veiculos.spec.ts`. Aceite [PG]: busca por placa em qualquer formato; transferir cliente com confirmação; aviso de km menor.
- **B3 SONNET Telas de catálogo.** Cria: `src/routes/(app)/app/catalogo/**`, `src/lib/catalogo/*`, `tests/e2e/catalogo.spec.ts`. Aceite [PG]: campo de custo/margem só aparece com `financeiro`; markup e margem rotulados.
- **B4 SONNET Telas de estoque e fornecedores.** Cria: `src/routes/(app)/app/estoque/**`, `src/lib/estoque/*`, `tests/e2e/estoque.spec.ts`. Aceite [PG]: entrada, ajuste com motivo obrigatório, estorno via movimento inverso, alerta de mínimo e de saldo negativo.
- **B5 OPUS Migração de OS.** Cria: `supabase/migrations/20261115100000_ordens.sql` e `20261115110000_ordens_rpc.sql`, `tests/db/ordens*.test.ts`, `tests/db/fabricas/ordens.ts`, `src/lib/{tipos,repos,validacao}/ordens.ts`, `src/lib/puro/os.ts` (formatar número, matriz de transições espelhada, totais) + `tests/os.test.ts`. Aceite [PG]: numeração `000001.2026/11` sem duplicar; cada linha da tabela de transições (REGRAS §2) testada (permitida e negada); item aprovado imutável; aditivo exige nova aprovação; baixa/estorno de estoque; garantia com `os_origem_id`; custo do item oculto sem `financeiro`.

## Onda C — ordens de serviço (paralelo; depende da B)
- **C1 SONNET Lista e nova OS.** Cria: `src/routes/(app)/app/ordens/+page.svelte`, `.../ordens/nova/**`, `src/lib/ordens/{ListaOs,NovaOs}*.svelte`, `tests/e2e/ordens-lista.spec.ts`. Aceite: filtros por status/etiqueta/responsável/período na URL; nova OS com busca de cliente/veículo e cadastro rápido.
- **C2 SONNET Editor da OS.** Cria: `src/routes/(app)/app/ordens/[id]/+page.{ts,svelte}`, `src/lib/ordens/{Editor,Itens,Totais,Aditivo,BarraTransicoes,Timeline}*.svelte`, `tests/e2e/ordens-editor.spec.ts`. Aceite: itens travados após aprovação; aditivo destacado; só botões de transição permitidos; cancelar com motivo.
- **C3 SONNET Aprovação.** Cria: `src/routes/(app)/app/ordens/[id]/aprovacao/**`, `src/lib/ordens/{Versao,Aprovacao}*.svelte`, `tests/e2e/ordens-aprovacao.spec.ts`. Aceite: gerar versão, registrar aprovação total/parcial/recusa com canal e nome; bloqueia versão vencida; exige autorização para peça não nova.
- **C4 SONNET Pátio (kanban).** Cria: `src/routes/(app)/app/ordens/patio/**`, `src/lib/ordens/Kanban*.svelte`, `tests/e2e/ordens-patio.spec.ts`. Aceite: colunas por status, etiquetas, mover por botão (sem depender de arrastar), filtro "minhas".
- **C5 SONNET Checklist de entrada.** Cria: `src/routes/(app)/app/ordens/[id]/checklist/**`, `src/lib/ordens/Checklist*.svelte`, `tests/e2e/ordens-checklist.spec.ts`. Aceite: combustível, km, itens, avarias, pertences salvos e exibidos no editor (link).
- **C6 OPUS Migração financeiro.** Cria: `supabase/migrations/20261116100000_financeiro.sql`, `tests/db/financeiro.test.ts`, `tests/db/fabricas/financeiro.ts`, `src/lib/{tipos,repos,validacao}/financeiro.ts`. Aceite [PG]: pagamento append-only; estorno só dono; misto e parcelas; caixa único aberto; dinheiro sem caixa recusado; entrega com saldo exige pagamento/títulos.
- **C7 OPUS Migração painel/LGPD/busca.** Cria: `supabase/migrations/20261116110000_painel_lgpd.sql`, `tests/db/painel_lgpd.test.ts`, `src/lib/repos/{painel,lgpd}.ts`, `src/lib/tipos/painel.ts`. Aceite [PG]: `anonimizar_cliente` mantém OS/financeiro sem PII; exportações só do dono e só da própria oficina; `buscar_global` respeita áreas.
- **C8 SONNET Histórico nas fichas.** Edita: `src/routes/(app)/app/veiculos/[id]/**`, `src/routes/(app)/app/clientes/[id]/**`. Cria: `src/lib/ordens/HistoricoOs.svelte`, `tests/e2e/historico.spec.ts`. Aceite: OS, km e peças por placa.

## Onda D — financeiro, equipe e acabamento (paralelo; depende da C)
- **D1 SONNET Contas a receber/pagar e categorias.** Cria: `src/routes/(app)/app/financeiro/{+page.svelte,receber,pagar,categorias}/**`, `src/lib/financeiro/Titulos*.svelte`, `tests/e2e/financeiro.spec.ts`.
- **D2 SONNET Caixa.** Cria: `src/routes/(app)/app/caixa/**` (área `caixa`, não `financeiro`), `src/lib/caixa/Caixa*.svelte`, `tests/e2e/caixa.spec.ts`. Aceite: abrir, sangria/suprimento, fechar com diferença por forma.
- **D3 SONNET Receber/entregar/garantia na OS.** Cria: `src/lib/ordens/{Receber,Entregar,Garantia}*.svelte`, `tests/e2e/ordens-entrega.spec.ts`. Edita: `src/lib/ordens/BarraTransicoes.svelte`. Aceite: pagamento misto; entrega gera garantia; abrir garantia cria OS vinculada.
- **D4 SONNET Equipe e convites.** Cria: `src/routes/(app)/app/equipe/**`, `src/routes/convite/[token]/**` (ssr=false), `src/lib/equipe/*`, `src/lib/repos/equipe.ts`, `tests/e2e/equipe.spec.ts`. Aceite: matriz de áreas com dependências automáticas; link copiável; desativar com confirmação. [SB] aceite real do convite.
- **D5 SONNET Configurações.** Cria: `src/routes/(app)/app/configuracoes/**`, `src/lib/configuracoes/*`, `tests/e2e/configuracoes.spec.ts`. Aceite: garantia < 90 recusada; exportar oficina baixa JSON.
- **D6 SONNET Painel inicial.** Cria: `src/routes/(app)/app/+page.svelte`, `src/lib/painel/*`, `tests/e2e/painel.spec.ts`. Aceite: cartões somem sem a área; checklist de onboarding.
- **D7 SONNET Impressão/PDF e WhatsApp.** Cria: `src/routes/(app)/app/ordens/[id]/imprimir/**`, `src/lib/ordens/Compartilhar.svelte`, `src/lib/puro/whatsapp.ts` + `tests/whatsapp.test.ts`, `src/styles/impressao.css`. Edita: `src/routes/(app)/app/ordens/[id]/+page.svelte` (botão). Decisão: `window.print()` + `@media print` no MVP (sem dependência); PDF com mão de obra e peças separadas, validade, termo de garantia e "sem valor fiscal"; wa.me com texto e Web Share de arquivo quando houver.
- **D8 SONNET LGPD na ficha do cliente.** Cria: `src/lib/clientes/LgpdAcoes.svelte`, `tests/e2e/lgpd.spec.ts`. Edita: `src/routes/(app)/app/clientes/[id]/+page.svelte`. Aceite: só dono vê; anonimizar com digitação de confirmação.

## Onda E — segurança, testes reais, polimento
- **E1 OPUS Revisão de segurança** (todas as migrações e repos). Cria: `supabase/migrations/20261118100000_revisao_seguranca.sql` (se precisar), `tests/db/seguranca.test.ts` (varre `pg_catalog`: toda tabela `public` com RLS, sem grant a anon, toda definer com `search_path=''`), `static/_headers` (CSP, HSTS, nosniff, Referrer-Policy). [SB] Security/Performance Advisors sem alertas.
- **E2 SONNET E2E real** [SB, projeto TEST]: `tests/e2e-real/**`, `playwright.real.config.ts`. Fluxo: cadastro -> oficina -> cliente -> veículo -> OS -> versão -> aprovação -> execução (baixa) -> entrega com pagamento misto -> garantia; funcionário sem `financeiro` não vê custo.
- **E3 SONNET Tipos gerados** [SB]: script `tipos:gerar` em `package.json`, `src/lib/tipos/banco.ts`, ajuste de `src/lib/tipos/*`. Aceite: `npm run check` verde.
- **E4 SONNET Polimento**: `src/styles/**`, `src/lib/ui/**`, `tests/e2e/acessibilidade.spec.ts`. Aceite: 375 px sem rolagem horizontal; foco visível; estados vazio/erro em todas as listas.

## Depois do MUST (SHOULD, ordem sugerida)
Fotos e assinatura no Storage [SB] (OPUS policy + SONNET tela); link público de aprovação (OPUS, RPC anon com token); alçada de desconto; relatórios; lembretes de revisão; Sentry sem PII.
