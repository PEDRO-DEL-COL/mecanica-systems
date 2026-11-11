# Projeto: Sistema para Oficinas Mecânicas (web, local-first)

Resumo do documento de planejamento (11/11/2026).

## Visão
PWA que roda no navegador e guarda os dados no computador do cliente (SQLite no OPFS), sem servidor de banco e com custo de hospedagem zero. Público: oficinas pequenas, MEIs e autônomos que usam caderno/planilha/WhatsApp. Diferenciais a validar: funciona offline, sem mensalidade de nuvem, foco no box.

## Fases
- **0 Fundação:** PWA instalável, SQLite OPFS, migrações, backup. Pronto quando grava, fecha o navegador e os dados voltam.
- **1 MVP:** clientes, veículos, catálogo, orçamento/OS (orçamento = OS com status "orcamento"), checklist de entrada, estoque simples, financeiro básico, PDF/WhatsApp, backup. Pronto quando uma oficina usa 2 semanas no lugar do caderno.
- **2 Diferenciais:** comissão, checklist com fotos, agenda, kanban do pátio, lembretes de revisão, relatórios, consulta de placa, fornecedores/compras.
- **3 Cobrança/escala:** emissão fiscal via emissor, portal do cliente, multiusuário/sync, boletos, licença e pagamento (cobrar pelo que exige servidor).

## Regras de negócio (CDC)
- OS só vai a "em_execucao" com aprovação registrada (art. 39, VI).
- Orçamento discrimina mão de obra, peças, pagamento, datas; validade padrão 10 dias (art. 40).
- Peça com condição (nova/original/usada; usada exige autorização) (art. 21).
- Garantia 90 dias a partir da entrega (art. 26, II); acréscimo exige novo aceite (art. 40 §3º).
- Fiscal: NFS-e (mão de obra) e NF-e/NFC-e (peça) separadas; sistema não promete "conformidade fiscal".
- LGPD: dados ficam locais; termos e política de privacidade revisados por jurista antes de cobrar.

## Modelo de dados (SQLite)
Tabelas: cliente, veiculo, usuario, item_catalogo, ordem_servico, item_os, pagamento, movimento_estoque, checklist_entrada. Status da OS: orcamento, aprovado, em_execucao, concluido, entregue, cancelado. Dinheiro em centavos; datas ISO 8601; `PRAGMA user_version` para migrações.

## Riscos principais
Perda de dados do cliente (limpar navegador/formatar PC): backup em arquivo, lembrete diário, `navigator.storage.persist()`, testar restauração na fase 0. Segunda aba abrindo o mesmo banco: bloquear e avisar. Nunca cair em banco em memória silenciosamente. Mais de um PC por oficina: hipótese a validar.
