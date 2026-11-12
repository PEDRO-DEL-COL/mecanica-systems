# Regras do MVP (especificação consolidada)

Versão 2026-11-12. Fonte: `PROJETO.md`, `pesquisa/*.md`, migrações do núcleo. Marcas: **[JUR]** = validar com advogado antes de cobrar; **[CONT]** = validar com contador; **[VERIFICAR]** = fato técnico não confirmado. O que não tem marca é decisão de produto (pode mudar, mas vale até lá).

## 1. Módulos e telas
- **Público:** landing, preços, termos, privacidade (prontos); `/entrar`, `/cadastro`, `/recuperar-senha`, `/auth/callback`, `/nova-senha`, `/convite/[token]`.
- **Onboarding:** criar oficina (RPC `criar_oficina`) -> checklist inicial (1º cliente, 1º serviço no catálogo, 1ª OS), estado derivado dos dados.
- **Shell `/app`:** barra lateral só com as áreas que o usuário pode ler; topo com oficina, usuário, sair; responsivo (lateral vira gaveta no celular).
- **Painel** (`/app`): OS por status, orçamentos vencendo, entregas do dia, saldo do caixa (só com `financeiro`), estoque abaixo do mínimo.
- **Clientes:** lista + busca, ficha (dados, veículos, OS, consentimento), formulário, anonimizar/exportar.
- **Veículos:** lista + busca por placa, ficha com histórico por placa (OS, km, peças), transferir de cliente.
- **Catálogo:** serviços e peças (preço de venda; custo só com `financeiro`).
- **Estoque:** saldos (alerta de mínimo), entrada de compra, ajuste com motivo, movimentos, fornecedores.
- **Ordens:** lista (filtros por status/etiqueta/responsável/período), kanban do pátio, editor da OS (itens, totais, aditivos), checklist de entrada, aprovação (versão + prova), impressão/PDF e WhatsApp, abrir garantia.
- **Financeiro:** contas a receber e a pagar, receber OS (pagamento misto/parcelas), caixa (abrir, sangria/suprimento, fechar), categorias.
- **Equipe:** membros, convites (link copiado), permissões por área, desativar.
- **Configurações:** dados da oficina, validade do orçamento, dias de garantia, termo de garantia, rodapé do PDF, etiquetas do pátio, exportação da oficina.

## 2. Ordem de serviço
**Status fixos:** `orcamento`, `aprovado`, `em_execucao`, `concluido` (pronto), `entregue`, `cancelado`. Situações finas (aguardando peça, terceiro, aguardando cliente) são **etiquetas** configuráveis, não status. Recusa do cliente = `cancelado` com motivo "recusado pelo cliente".
**Numeração:** `NNNNNN.AAAA/MM` (ex. `000001.2026/11`). `NNNNNN` = sequência por oficina que nunca zera (tabela `contador`, upsert atômico na RPC, unique `(org_id, numero_seq)`); `AAAA/MM` = competência da criação em America/Sao_Paulo. Nasce na criação do orçamento; cancelada mantém o número; rollback devolve o número (sem buraco). Acima de 999999 cresce para 7 dígitos. Busca aceita só `123` ou o número completo.

| De -> Para | Quem (área `ordens`) | Condições / efeitos |
|---|---|---|
| (novo) -> orcamento | escrita | cliente + veículo obrigatórios; `km_entrada` >= último km do veículo (ou justificativa) |
| orcamento -> aprovado | escrita | existe versão gerada e não vencida; aprovação registrada com prova; ≥1 item aprovado |
| aprovado -> em_execucao | escrita | baixa de estoque das peças aprovadas |
| em_execucao -> concluido | escrita | nenhum aditivo pendente de decisão |
| concluido -> em_execucao | escrita | motivo (retrabalho interno) |
| concluido -> entregue | escrita | grava `data_entrega` e `garantia_ate`; saldo quitado **ou** títulos a receber gerados (precisa `financeiro/escrita`, ver 5) |
| entregue -> concluido (reabrir) | só dono | motivo; não apaga pagamentos |
| orcamento/aprovado -> cancelado | escrita | motivo obrigatório |
| em_execucao/concluido -> cancelado | só dono | motivo; estorno automático do estoque baixado; bloqueia se houver pagamento não estornado |
| entregue -> cancelado | ninguém | usar reabrir + estornos |

Toda transição é RPC `security definer` (`os_transicionar`) que valida matriz + permissão + `versao` e grava evento; UPDATE direto de `status` não tem GRANT.
**Itens:** tipo `servico`|`peca`, descrição, quantidade `numeric(12,3)`, valor unitário e desconto em centavos, situação `pendente|aprovado|recusado`, `aditivo_n` (0 = orçamento original), mecânico responsável opcional, condição da peça (`nova_original`, `nova_paralela`, `usada`, `recondicionada`, `do_cliente`). Total da OS = soma dos itens aprovados (calculado no banco).
**Versão e aprovação:** "Gerar versão" congela um snapshot jsonb (itens, totais, condições de pagamento, prazo, validade) com hash SHA-256 em `orcamento_versao`; é o que o cliente vê (PDF/WhatsApp). A aprovação aponta para a versão e guarda: decisão (aprovada/parcial/recusada) e itens aprovados, canal (`presencial`, `whatsapp`, `telefone`, `email`, `link`), nome e relação de quem aprovou (proprietário/condutor/responsável PJ), data/hora, usuário que registrou, texto do termo exibido, autorização expressa para peça não nova/não original, evidência opcional (print/assinatura no Storage), IP/user-agent quando por link. Telefone/verbal tem prova fraca: a UI recomenda confirmar por WhatsApp **[JUR]**.
**Bloqueio pós-aprovação:** item aprovado não pode ter preço/quantidade/descrição alterados nem ser apagado (trigger). Mudança = aditivo.
**Aditivo:** em `aprovado`/`em_execucao`, novos itens entram com `aditivo_n = k`, geram versão tipo `aditivo` e exigem nova aprovação antes de executar; o valor aprovado antes não muda. Itens recusados ficam visíveis como recusados.
**Garantia:** `garantia_ate = data_entrega + garantia_dias` (config, padrão e mínimo 90 para serviço; ver 3). "Abrir garantia" cria OS nova tipo `garantia` com `os_origem_id`, número próprio, itens com valor 0 por padrão e marca de causa (mão de obra/peça/fornecedor). Fora do prazo a UI avisa, mas o dono pode abrir (vício oculto conta da descoberta).
**Validade:** `validade_ate = data da versão + validade_orcamento_dias` (padrão 10). Versão vencida não pode ser aprovada; gerar nova versão (pode manter preços).
**Fiscal:** só organiza: campos `nota_servico_numero`, `nota_produto_numero`, datas e observação na OS; nº da nota do fornecedor na entrada de estoque e no título a pagar. Sem emissão, sem promessa de conformidade; PDF diz "documento sem valor fiscal".

## 3. CDC aplicado (todas [JUR] antes de cobrar)
- Art. 39 VI: sem aprovação registrada a OS não entra em execução (regra dura no banco).
- Art. 40 caput/§1º: versão discrimina mão de obra, peças, condições de pagamento, datas de início/término; validade 10 dias do recebimento salvo estipulação (configurável). Usar a data da versão como "recebimento" é simplificação **[JUR]**.
- Art. 40 §2º: aprovado obriga as partes; alteração só por nova aprovação (aditivo). `PROJETO.md` cita §3º para acréscimos; o §3º trata de serviços de terceiros não previstos (o consumidor não responde por eles) **[VERIFICAR texto]**: OS com serviço de terceiro não previsto deve ir como aditivo.
- Art. 21: peça nova e original por padrão; outras condições exigem autorização expressa na aprovação. Se `nova_paralela` exige autorização: **[JUR]** (decisão provisória: exige).
- Art. 26 II e §1º: 90 dias para vício aparente em serviço/produto durável, contados da entrega/término. Garantia contratual (art. 50) soma à legal; o sistema não permite configurar menos que 90 **[JUR]**.
- Devolução das peças substituídas ao cliente: campo opcional na entrega **[JUR/?]**.

## 4. Estoque
- Só itens de catálogo tipo `peca` com `controla_estoque`. `estoque_movimento` é **append-only** (sem UPDATE/DELETE): `entrada_compra`, `saida_os`, `estorno_os`, `ajuste_entrada`, `ajuste_saida`, `devolucao_fornecedor`. Correção = movimento inverso com `estorna_id`.
- `estoque_saldo(org_id, item_id, quantidade)` atualizado na mesma transação da RPC; teste garante `saldo = soma(movimentos)`.
- Baixa: ao iniciar execução (itens aprovados) e ao aprovar aditivo de OS já em execução; estorno automático ao cancelar ou recusar item já baixado. Peça `do_cliente` não movimenta estoque.
- Saldo pode ficar negativo (não travar a oficina): aviso na hora e destaque na lista/painel.
- Custo médio ponderado recalculado na entrada; devolução ao fornecedor sai pelo custo da entrada. Ajuste exige motivo. Markup = (preço−custo)/custo; margem = (preço−custo)/preço: rótulos explícitos.

## 5. Financeiro
- `titulo` (receber|pagar): cliente ou fornecedor, OS opcional, categoria, valor, vencimento, parcela n/m, nº nota, status derivado (`aberto`, `parcial`, `pago`, `cancelado`).
- `pagamento` append-only: título, valor, forma (`dinheiro`, `pix`, `debito`, `credito`, `boleto`, `transferencia`, `outro`), parcelas do cartão, taxa (opcional), data, sessão de caixa. Estorno = nova linha com `estorna_id` (só dono). Pagamento misto = várias linhas.
- Receber OS: sinal permitido antes da entrega; na entrega, saldo vira pagamento(s) ou parcelas a receber. Receita é reconhecida em `entregue` (relatórios usam `data_entrega`).
- Caixa: uma sessão aberta por oficina (MVP); abertura com troco, sangria/suprimento com motivo, fechamento com contagem por forma e diferença registrada. Pagamento em dinheiro exige caixa aberto.
- Decisão: receber pagamento exige `financeiro/escrita` (o atendente sem financeiro só vê o total da OS).

## 6. Permissões
Áreas (lista única em `private.areas()`): `clientes, veiculos, catalogo, estoque, ordens, caixa, financeiro, equipe, configuracoes` (`caixa` = receber pagamentos e operar o caixa; `financeiro` = única que vê custos, margens, contas a pagar e relatórios); níveis `leitura`/`escrita` (escrita implica leitura); sem linha = sem acesso. Dono: tudo. Barreira real = RLS/RPC (`private.pode`); a UI só esconde.
| Área | Leitura | Escrita |
|---|---|---|
| clientes | ver/buscar | criar/editar/desativar; anonimizar e exportar = só dono |
| veiculos | ver/histórico | criar/editar/transferir |
| catalogo | itens e preço de venda | criar/editar/desativar |
| estoque | saldos/movimentos (sem custo) | entrada, ajuste, fornecedores (digita custo, não lê custo médio) |
| ordens | OS, versões, aprovações, timeline | criar/editar/transicionar/registrar aprovação/checklist |
| financeiro | títulos, caixa, **custos, margens**, relatórios de valor | receber, pagar, caixa |
| equipe | lista de membros | = leitura no MVP (gestão de equipe e convites é só do dono, já na RLS) |
| configuracoes | ver config | editar dados/config da oficina |
Dependências (fonte única `private.dependencias_permissao()`, aplicadas transitivamente por `definir_permissoes` e `aceitar_convite`, sem rebaixar escrita): `ordens` => `clientes`+`veiculos` leitura; `caixa` => `ordens` leitura; `financeiro` => `ordens`+`caixa` leitura; `estoque` => `catalogo` leitura.
**Ocultos sem `financeiro/leitura`:** custo médio, custo de entrada, custo do item na OS, margem/markup, lucro, DRE, caixa. Implementação: tabelas-sombra `item_custo`, `item_os_custo`, `estoque_movimento_custo` com RLS de financeiro (RLS não esconde coluna; GRANT por coluna vale para todos os usuários).
**Só dono:** reabrir OS entregue, cancelar OS em execução/concluída, estornar pagamento, gerir equipe/convites, anonimizar/exportar, ver auditoria completa.

## 7. Auditoria
`evento` append-only (org_id, entidade, entidade_id, ação, dados jsonb com diff sem PII sensível, usuario_id, em); triggers `security definer` nas tabelas de negócio + eventos explícitos das RPCs (transição, aprovação, estorno). Sem GRANT de UPDATE/DELETE. Leitura: dono tudo; quem lê `ordens` vê a timeline da OS.

## 8. Modelo de dados (novo além do núcleo)
Regras: `org_id` em toda tabela, FK composta `(org_id, x_id)` para o pai, índice começando por `org_id`, RLS + `revoke all` + GRANT mínimo por coluna, `ativo` (soft-delete) + únicos parciais `where ativo`, `versao int` nas tabelas editáveis, `criado_em/atualizado_em timestamptz`, dinheiro `bigint` `_centavos` (CHECK >= 0), uuid gerado no cliente permitido, `idempotency_key` unique nas RPCs de criação.
- `oficina_config` (1:1 organizacao): telefone, endereço, validade_orcamento_dias, garantia_dias, termo_garantia, rodape_pdf, etiquetas text[].
- `contador(org_id, chave, ultimo)`; `evento`.
- `cliente` (tipo PF/PJ, nome, documento?, telefone, whatsapp, email?, endereço?, obs, consentimento_marketing + em, anonimizado_em); `veiculo` (placa normalizada unique por org `where ativo`, marca, modelo, ano, cor, combustível, chassi?, km_atual, cliente_atual_id).
- `fornecedor`; `item_catalogo` (tipo, código, descrição, unidade, preço_venda, controla_estoque, estoque_minimo, localização, código_fabricante); `item_custo` (custo_medio); `estoque_saldo`; `estoque_movimento`; `estoque_movimento_custo`.
- `ordem_servico` (numero_seq, numero, competencia, cliente_id, veiculo_id, status, etiqueta, responsavel_membro_id, km_entrada, relato, diagnostico, previsao_entrega, validade_ate, tipo normal|garantia, os_origem_id, data_entrega, garantia_ate, motivo_cancelamento, notas fiscais, totais calculados); `item_os`; `item_os_custo`; `orcamento_versao`; `aprovacao`; `os_checklist` (combustível, km, itens jsonb, avarias, pertences, assinatura_path?).
- `categoria_financeira`, `titulo`, `pagamento`, `caixa_sessao`, `caixa_movimento`.
- SHOULD: `foto` (os_id, path `{org_id}/{os_id}/{uuid}.jpg`), `link_aprovacao` (token_hash, expira, uso único).
- RPCs principais: `aceitar_convite`, `definir_permissoes`, `os_criar`, `os_gerar_versao`, `os_registrar_aprovacao`, `os_transicionar`, `os_abrir_garantia`, `estoque_entrada`, `estoque_ajuste`, `receber`, `pagar`, `estornar_pagamento`, `caixa_abrir/movimentar/fechar`, `painel_resumo`, `exportar_cliente`, `exportar_oficina`, `anonimizar_cliente`, `buscar_global`.

## 9. Validação e UX
- Validação no front (valibot) e no banco (CHECK/RPC). Placa e documento normalizados (`src/lib/puro`); telefone só dígitos com DDD; e-mail lower/trim; km inteiro >= 0; dinheiro digitado em reais, guardado em centavos.
- Busca: campo único com debounce 300 ms, cancela a anterior, mínimo 2 caracteres; `pg_trgm` em nome/placa/telefone/número da OS (`unaccent` precisa wrapper immutable; disponibilidade no PGlite **[VERIFICAR]**).
- Listas: 25 por página, ordenação e filtros no servidor, estado na URL (`?q=&pagina=&status=`), sempre com `limit`; total aproximado.
- Estados: carregando (esqueleto), vazio (texto + botão de ação primária), erro (mensagem pt-BR + tentar de novo), sem permissão (explica qual área falta).
- Confirmação com `<dialog>` para cancelar OS, estornar, desativar, anonimizar, fechar caixa; motivo obrigatório onde a regra pede. Nada de `confirm()` nativo.
- Formulários: `label for`, `aria-invalid` + `aria-describedby`, foco no 1º erro, botão desabilitado enquanto envia, `inputmode` numérico, toasts `aria-live`. Conflito de `versao`: "Alterado por outra pessoa, recarregue".
- Datas exibidas em America/Sao_Paulo (`dd/mm/aaaa HH:mm`); dinheiro `R$ 1.234,56`. Uso confortável no celular (pátio).

## 10. Segurança e LGPD
- Sem `service_role` no front; segredos fora do git; CSP estrita e HSTS em `static/_headers`; poucas dependências (token em localStorage).
- Toda tabela nova com RLS + teste de isolamento (org A x org B, anon, funcionário sem área, leitura x escrita, custo oculto) no PGlite; funções definer em `private` ou com checagem explícita de `auth.uid()`, nunca recebem org_id para decidir acesso.
- Auth: PKCE, e-mail confirmado em PROD, SMTP próprio, CAPTCHA/rate limit **[VERIFICAR plano]**. Convite: hash do token, 7 dias, uso único, preso ao e-mail.
- Storage: bucket privado por `{org_id}/`, limite de tamanho/mime, signed URL curta, compressão no cliente remove EXIF.
- LGPD **[JUR]**: oficina controladora, nós operadores; coletar mínimo (CPF opcional); consentimento separado para marketing/lembretes com opt-out; exportar cliente e oficina (JSON/CSV); anonimizar cliente mantendo OS/financeiro; sem PII em logs/Sentry; retenção fiscal (5 anos **[CONT]**); lista de subprocessadores na política.

## 11. Primeira versão completa
**MUST:** auth + onboarding + convites/permissões; clientes; veículos com histórico por placa; catálogo; estoque (entrada, baixa/estorno por OS, ajuste, mínimo, fornecedores); OS completa (numeração, itens, versões, aprovação com prova, aditivo, transições, cancelamento, garantia, etiquetas, kanban); checklist de entrada (sem fotos); impressão/PDF + WhatsApp (texto + link/arquivo); financeiro (receber/pagar, misto, parcelas, caixa); custos ocultos; auditoria; configurações; painel inicial; exportação/anonimização LGPD; testes RLS PGlite + E2E do fluxo principal.
**SHOULD:** fotos no checklist e assinatura em tela; aprovação por link público (RPC anon com token, exige revisão Opus); limite de desconto por alçada; relatórios (ticket médio, taxa de aprovação, tempo de OS, faturamento por forma); lembretes de revisão via wa.me com opt-out; Sentry sem PII; FIPE por marca/modelo.
**COULD:** agenda, comissões, inspeção semáforo, inventário/curva ABC, DRE simples, compras/cotação, portal do cliente, emissão fiscal via integrador, offline.
