# Pesquisa: arquitetura SaaS multi-oficina (Supabase + SvelteKit SPA)

Data: 2026-11-12. Base: CLAUDE.md e migrações `20261112120000..0200` (schema, funções private, RLS).
Legenda: [OK] confirmado em fonte oficial consultada; [VERIFICAR] vem de conhecimento prévio ou de blogs, conferir antes de decidir.

## 1. Multi-tenancy com RLS
- Padrão: `org_id` em toda tabela de negócio, policy `org_id = (select private.org_do_usuario())`, índice começando por `org_id`. [OK]
- `(select auth.uid())` / `(select private.f())` vira initPlan (avaliado 1x por consulta); sem o select roda por linha. Indexar colunas usadas em policies; filtrar também na query (`.eq('org_id', ...)`) para ajudar o planner. [OK]
  https://supabase.com/docs/guides/database/postgres/row-level-security-performance
  https://supabase.com/docs/guides/troubleshooting/rls-performance-and-best-practices-Z5Jjwv
- Helpers `security definer` ficam em schema NÃO exposto (`private`), com `set search_path = ''`, nomes qualificados, `stable`, EXECUTE revogado de public/anon. Os docs avisam: nunca em schema listado em "Exposed schemas". [OK] https://supabase.com/docs/guides/database/postgres/row-level-security
- Armadilhas:
  - Views ignoram RLS (rodam como dono): usar `with (security_invoker = true)` (Postgres 15+) ou não criar views sobre tabelas de tenant. [VERIFICAR versão do projeto]
  - `security definer` nunca deve receber org_id/user_id de fora para decidir acesso.
  - Tabela nova sem `enable row level security` fica aberta a quem tiver GRANT; usar Security Advisor. https://supabase.com/docs/guides/database/database-advisors
  - `user_metadata` é editável pelo usuário: nunca usar em policy; usar `app_metadata` ou a tabela `membro`.
  - Storage: policies em `storage.objects` precisam checar bucket + prefixo da org (seção 7). https://supabase.com/docs/guides/storage/security/access-control
  - Mudança Supabase 2026: projetos novos (após 30/05/2026) e existentes (a partir de 30/10/2026) exigem GRANT explícito para a Data API; as migrações já fazem grants mínimos. [VERIFICAR datas no changelog; fonte foi blog agregador]
- Teste de RLS: pgTAP (`supabase test db`) ou 2º projeto (decisão atual). Testar sempre: org A não lê/escreve org B, anon nada, funcionário sem área nada.
- Observação sobre as migrações atuais: coerentes com o padrão (private, search_path vazio, initPlan, FK composta org_id+membro_id, convite com hash de token). Atenção: índice único `membro(user_id) where ativo` limita 1 pessoa = 1 oficina (ok no MVP).

## 2. Autenticação
- PKCE é o fluxo recomendado para SPA/SSR; o link de e-mail traz `code`, trocado por `exchangeCodeForSession`. https://supabase.com/docs/guides/auth/sessions/pkce-flow
- Confirmação de e-mail ligada em produção (a migração já exige `email_confirmed_at`). Recuperação de senha: `resetPasswordForEmail` -> rota `/auth/callback` -> `updateUser({password})`. Redirect URLs exatas, sem wildcard amplo. https://supabase.com/docs/guides/auth/passwords
- SMTP: o e-mail embutido tem limite baixíssimo e é só para teste; produção com SMTP próprio (Resend, Brevo etc.). [VERIFICAR limite atual] https://supabase.com/docs/guides/auth/auth-smtp
- Abuso: Cloudflare Turnstile via CAPTCHA do Auth (Attack Protection) cobre signup, login e reset; rate limits do Auth configuráveis; leaked-password protection é recurso de plano pago [VERIFICAR]. https://supabase.com/docs/guides/auth/auth-captcha https://supabase.com/docs/guides/auth/rate-limits
- Sessão em adapter-static/SPA (ssr=false): supabase-js guarda sessão em localStorage e renova o token sozinho (`autoRefreshToken`, `onAuthStateChange`). Sem servidor, sem `hooks.server`. Trade-off: XSS lê o token, então CSP estrita e poucas dependências. https://supabase.com/docs/guides/auth/sessions https://svelte.dev/docs/kit/single-page-apps
- Guard de rota no `+layout.ts`/`+layout.svelte` do grupo `(app)`: sessão local + redirect para /login. É só UX; a segurança é RLS. Para ações sensíveis `getUser()` valida no servidor.
- Revogação: desativar membro (`ativo=false`) vale na hora porque a RLS consulta a tabela, não o JWT. Boa decisão já tomada.
- MFA (TOTP) opcional para o dono no futuro. https://supabase.com/docs/guides/auth/auth-mfa

## 3. RBAC por área, convites, onboarding
- O modelo atual (papel dono/funcionário + `membro_permissao(area, nivel)`) é o padrão "permissões em tabela via função". Custom claims no JWT só se performance exigir, ao custo de revogação mais lenta. https://supabase.com/docs/guides/database/postgres/custom-claims-and-role-based-access-control-rbac
- Convite: só hash do token (já feito), expiração 7 dias, uso único, preso ao e-mail; aceite via RPC `security definer` que confere `auth.uid()` + e-mail confirmado igual ao do convite e cria `membro` + permissões na mesma transação. Envio automático de e-mail exige servidor (Edge Function; `service_role` nunca no front). MVP: o dono copia o link e manda por WhatsApp.
- Onboarding: signup -> confirmar e-mail -> "criar oficina" (RPC `criar_oficina`) -> checklist (cliente, serviço, 1ª OS), estado derivado dos dados.
- UI esconde o que não pode, mas a barreira real é RLS/RPC (`private.pode`).

## 4. Integridade de dados
- Soft-delete: `ativo`/`excluido_em` + índices únicos parciais `where ativo` (já usado). Sem DELETE físico em OS/financeiro.
- Auditoria: tabela `evento_auditoria` append-only (org_id, usuario, tabela, registro_id, ação, diff jsonb, em); trigger security definer; sem GRANT de update/delete; SELECT só dono/área configurada. Alternativa: supa_audit https://github.com/supabase/supa_audit [VERIFICAR manutenção]
- Numeração por oficina (`000001.2026/11`): tabela `contador(org_id, chave, ultimo)` com `insert ... on conflict do update set ultimo = contador.ultimo + 1 returning ultimo` dentro da RPC (lock de linha serializa por tenant; rollback desfaz junto). Não usar `max()+1` nem sequence global. Unique `(org_id, numero)`. https://www.postgresql.org/docs/current/explicit-locking.html
  Nota: se a transação der rollback o número volta (sem buraco), o que combina com "nunca zera".
- Transições de estado via RPC `security definer`: valida estado atual -> novo (matriz), permissão e grava evento; update direto de `status` bloqueado (GRANT por coluna ou trigger).
- Idempotência: cliente gera `idempotency_key` uuid; unique `(org_id, chave)`; RPC devolve o resultado existente em retry. Essencial para o futuro outbox. Referência: https://stripe.com/docs/api/idempotent_requests
- Concorrência otimista: coluna `versao int` e `update ... where id=$1 and versao=$2`; 0 linhas = "alterado por outra pessoa". Trigger incrementa.
- Dinheiro: `bigint` em centavos; nunca float; `Intl.NumberFormat('pt-BR')` na exibição; totais calculados no banco. Quantidades fracionadas `numeric(12,3)`.
- `timestamptz` em UTC; formatar em America/Sao_Paulo no front.

## 5. Estrutura do front-end
- Camadas: `src/lib/repos/*` (únicos que chamam `supabase.from/rpc`), `src/lib/services/*` (regras), componentes consomem serviços. Facilita o offline futuro.
- Tipos: `supabase gen types typescript` em script npm, commitado. https://supabase.com/docs/guides/api/rest/generating-types
- Validação: valibot (bundle menor, bom para SPA) ou zod; o banco mantém CHECKs. https://valibot.dev https://zod.dev
- Erros: mapear `PostgrestError.code` (23505 duplicidade, 42501 permissão, 23514 check, P0001 regra) para pt-BR; inesperados vão ao Sentry via `handleError`. https://svelte.dev/docs/kit/hooks
- Estado global: runes em módulos `.svelte.ts` (sessão, org, permissões); cache de dados por `load`/serviços; TanStack Query só se necessário [VERIFICAR]. https://svelte.dev/docs/svelte/$state
- Formulários acessíveis: `label for`, `aria-invalid` + `aria-describedby`, foco no 1º erro, botão desabilitado ao enviar, `autocomplete`/`inputmode`, `<dialog>` nativo, toasts com `aria-live`. https://www.w3.org/WAI/tutorials/forms/
- Tabelas: paginação keyset (`order by criado_em desc, id`) ou `.range()`; ordenação/filtros no servidor com estado na URL; sempre `limit`.
- Busca: `pg_trgm` + GIN (`gin_trgm_ops`) em nome/placa/telefone normalizado; `unaccent` é STABLE, precisa de wrapper immutable para índice. Placa/CPF só dígitos/maiúsculas. Debounce ~300 ms e cancelar request anterior. https://www.postgresql.org/docs/current/pgtrgm.html

## 6. PDF e compartilhamento
- `pdf-lib` (https://pdf-lib.js.org) gera PDF no cliente, sem layout automático; para acentos embutir fonte via `@pdf-lib/fontkit`; carregar com `import()` dinâmico. Alternativas: pdfmake (layout declarativo, mais pesado) ou `window.print()` com `@media print` (mais simples para MVP). [VERIFICAR escolha]
- Web Share com arquivos (`navigator.canShare({files})`): HTTPS, suporte bom no mobile, parcial no desktop; fallback download. https://developer.mozilla.org/docs/Web/API/Navigator/share
- `https://wa.me/55DDDNUMERO?text=<urlencode>` só envia texto/link, não anexo. Para o PDF: Web Share com arquivo ou link assinado do Storage de validade curta. https://faq.whatsapp.com/5913398998672934
- PDF sem valor fiscal (alinhado ao MVP); incluir aviso.

## 7. Storage de fotos
- Bucket privado, path `{org_id}/{os_id}/{uuid}.jpg`; policy em `storage.objects`: `bucket_id='fotos' and (storage.foldername(name))[1] = (select private.org_do_usuario())::text` + `private.pode('ordens', ...)`. Exibir via `createSignedUrl`. https://supabase.com/docs/guides/storage/security/access-control
- Bucket com `file_size_limit` e `allowed_mime_types`; validar também no cliente. https://supabase.com/docs/guides/storage/buckets/creating-buckets
- Compressão no cliente (canvas/`createImageBitmap`, ~1600px, JPEG/WebP q 0.75, ou `browser-image-compression`); canvas remove EXIF/GPS. Meta 200-400 KB/foto (free tem ~1 GB). [VERIFICAR limites]
- Tabela `foto` (org_id, os_id, path, tamanho) como fonte da verdade; órfãos limpos por job; transformação de imagem do Supabase é de plano pago [VERIFICAR].

## 8. Observabilidade e operação
- Sentry: `@sentry/sveltekit` só no client; plano Developer gratuito (~5k erros/mês) [VERIFICAR]; `beforeSend` removendo PII (placa, CPF); sourcemaps. https://docs.sentry.io/platforms/javascript/guides/sveltekit/
- Supabase Logs Explorer e Advisors antes de cada release. https://supabase.com/docs/guides/telemetry/logs
- Limites Free (blogs agregadores 2026; [VERIFICAR em supabase.com/pricing]): 500 MB banco, 1 GB storage, 50k MAU, ~5 GB egress (um blog diz 10 GB), 2 projetos, pausa após 7 dias sem atividade. Pro US$25/mês: backups diários (7 dias) e sem pausa; PITR é add-on [VERIFICAR]. Conclusão: free para dev/teste; produção com clientes = Pro.
  Fonte da busca: https://www.jetadmin.io/blog/supabase-pricing-2026-guide-to-plans-limits-and-real-world-costs/
- Backups externos: `pg_dump` agendado (GitHub Actions) para storage criptografado; testar restauração. https://supabase.com/docs/guides/platform/backups
- Migrations versionadas via CLI (`migration new`, `db push`); nunca editar migração aplicada em prod. https://supabase.com/docs/guides/deployment/database-migrations
- Ambientes: DEV, TEST (RLS) e PROD separados; Cloudflare Pages com preview por branch apontando para DEV; CI roda `check`, `test`, `e2e`. Supabase Branching é pago [VERIFICAR].
- Cloudflare Pages `_headers` (CSP, HSTS, nosniff, Referrer-Policy). https://developers.cloudflare.com/pages/configuration/headers/

## 9. LGPD operacional
- Oficina = controladora dos dados dos clientes dela; nós = operadores (e controladores dos dados dos usuários/donos). Política de privacidade, termos, contato do encarregado. [VERIFICAR com advogado] https://www.gov.br/anpd/pt-br
- Exportação: RPC que gera JSON/CSV por cliente e da oficina inteira.
- Anonimização: RPC que apaga nome/telefone/e-mail/documento do cliente mantendo OS e financeiro (guarda legal; prazos fiscais [VERIFICAR]); evento de auditoria sem dados pessoais.
- Retenção: prazos por tipo; `pg_cron` para purgar; cancelamento de conta = exportar e eliminar após 30-90 dias.
- Minimizar dados (CPF só se necessário); sem PII em logs/Sentry; backups contêm dados (documentar ciclo); listar subprocessadores (Sentry, e-mail) que ficam no exterior.

## 10. Offline futuro (comparação curta)
- PWA cacheia o shell; dados offline exigem réplica local + fila.
- Própria (outbox): IndexedDB ou SQLite-OPFS + fila de operações com `idempotency_key`, envio em ordem via RPCs idempotentes, conflito por `versao`. Prós: controle e custo zero; contras: muito trabalho. Já existe protótipo na tag `v0-local-first`.
- PowerSync https://www.powersync.com: sync Postgres <-> SQLite, integração Supabase, regras de sync por tenant; maduro, mas serviço extra/custo e outro modelo de permissões.
- ElectricSQL https://electric-sql.com: sync de leitura (shapes); escrita é por conta própria. [VERIFICAR estado atual]
- RxDB https://rxdb.info: banco reativo local com replicação Supabase; plugins avançados pagos [VERIFICAR].
- Recomendação: preparar hoje (uuid no cliente, RPCs idempotentes, `versao`, repositórios abstratos) e escolher só quando houver demanda.

## Decisões recomendadas para o nosso projeto
1. Manter RLS com helpers `private` + `(select ...)`; toda tabela nova: `org_id`, índice `(org_id, ...)`, RLS ligada, GRANT mínimo, teste de isolamento no projeto TEST.
2. Views só com `security_invoker = true`; rodar Security/Performance Advisors a cada release.
3. Auth: PKCE, confirmação de e-mail obrigatória em PROD, SMTP próprio, Turnstile + rate limits, `exigir_email_confirmado=false` só no DEV.
4. Guard de rota no layout `(app)` só para UX; segurança sempre na RLS/RPC.
5. Convites: token com hash, aceite por RPC; link manual no MVP, e-mail automático depois (Edge Function).
6. Auditoria append-only por trigger; soft-delete `ativo`; sem DELETE físico em OS/financeiro.
7. Numeração via tabela `contador` com upsert atômico na RPC do orçamento.
8. Status só por RPC com matriz de transições + permissão + evento; `versao` para concorrência otimista; `idempotency_key` nas RPCs de criação.
9. Dinheiro em centavos `bigint`; totais no banco.
10. Front: repos -> services -> UI; `gen types` em script; valibot; erros mapeados por código; runes em `.svelte.ts`; listas com filtro/ordem/paginação no servidor (estado na URL); `pg_trgm` na busca.
11. PDF: começar com `window.print()` ou pdf-lib dinâmico com fonte acentuada; compartilhar via Web Share com fallback wa.me + link assinado.
12. Fotos: bucket privado, path `{org_id}/...`, policy por org+área, limite de tamanho/mime, compressão no cliente.
13. Operação: Sentry sem PII, 3 projetos Supabase, migrations só via CLI, `pg_dump` externo agendado, Pro antes do 1º cliente pagante.
14. LGPD: RPCs de exportação e anonimização, política de retenção, lista de subprocessadores, revisão jurídica.
15. Offline: adiar; preparar com uuid, idempotência e `versao`.

## Riscos
- Token em localStorage (SPA) exposto a XSS: exigir CSP e disciplina de dependências.
- Free tier pausa em 7 dias e sem backups confiáveis: indisponibilidade/perda se usado em produção.
- 1 pessoa = 1 oficina (índice único) pode barrar casos reais (mecânico em duas oficinas, contador).
- Funções `security definer` mal escritas são o maior vetor de vazamento entre tenants: revisão e teste a cada nova.
- Mudança de grants da Data API (2026) pode quebrar tabelas novas sem GRANT explícito. [VERIFICAR]
- Fotos podem estourar 1 GB rapidamente; egress de signed URLs.
- Limites e preços aqui vêm em parte de blogs agregadores: confirmar nas páginas oficiais.
- Não é parecer jurídico (LGPD/fiscal).
- Só o cabeçalho de `20261112120200_nucleo_rls.sql` foi lido; as policies em si não foram auditadas.
