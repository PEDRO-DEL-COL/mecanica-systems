# Projeto: Sistema para Oficinas Mecânicas (plataforma online multi-oficina)

Resumo do documento de planejamento (11/11/2026).

## Visão
Plataforma SaaS 100% online, multi-oficina (Supabase: Auth + RLS + RPCs; front SvelteKit estático no Cloudflare Pages). Cada oficina tem seu dono (acesso total) e acessos restritos por área para funcionários. Público: oficinas pequenas, MEIs e autônomos que usam caderno/planilha/WhatsApp. A versão local-first (SQLite/OPFS) fica na tag `v0-local-first` para um futuro modo offline.

## Fases
- **0 Fundação:** projeto SvelteKit, Supabase (migrations em supabase/migrations), Auth, multi-oficina com RLS. Pronto quando o dono entra, cria a oficina e os dados persistem na nuvem.
- **1 MVP:** clientes, veículos, catálogo, orçamento/OS (orçamento = OS com status "orcamento"), checklist de entrada, estoque simples, financeiro básico, PDF/WhatsApp, backup. Pronto quando uma oficina usa 2 semanas no lugar do caderno.
- **2 Diferenciais:** comissão, checklist com fotos, agenda, kanban do pátio, lembretes de revisão, relatórios, consulta de placa, fornecedores/compras.
- **3 Cobrança/escala:** emissão fiscal via emissor, portal do cliente, boletos, planos/preços e cobrança (Asaas recomendado).

## Regras de negócio (CDC)
- OS só vai a "em_execucao" com aprovação registrada (art. 39, VI).
- Orçamento discrimina mão de obra, peças, pagamento, datas; validade padrão 10 dias (art. 40).
- Peça com condição (nova/original/usada; usada exige autorização) (art. 21).
- Garantia 90 dias a partir da entrega (art. 26, II); acréscimo exige novo aceite (art. 40 §3º).
- Fiscal: NFS-e (mão de obra) e NF-e/NFC-e (peça) separadas; sistema não promete "conformidade fiscal".
- LGPD: dados ficam no Supabase (região São Paulo), isolados por oficina via RLS; termos e política de privacidade revisados por jurista antes de cobrar.

## Modelo de dados (Postgres/Supabase)
Tabelas: cliente, veiculo, usuario, item_catalogo, ordem_servico, item_os, pagamento, movimento_estoque, checklist_entrada. Status da OS: orcamento, aprovado, em_execucao, concluido, entregue, cancelado. Dinheiro em centavos; datas ISO 8601; migrations versionadas em supabase/migrations. Toda tabela tem oficina_id com RLS. Numeração de OS 000001.2026/11, sequencial por oficina, nunca zera, nasce no orçamento.

## Riscos principais
Vazamento entre oficinas (RLS bem testada, sem service_role no front); disponibilidade do Supabase; custo por oficina; LGPD (termos revisados por jurista antes de cobrar).
