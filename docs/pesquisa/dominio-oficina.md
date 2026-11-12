# Domínio de oficina mecânica: padrões de sistemas de gestão

Data: 2026-11-12. Legenda: [FONTE] = confirmado em página consultada; [CONH] = conhecimento geral, NÃO verificado nesta pesquisa; [?] = incerto, validar com contador/advogado.
Não foram consultadas páginas de Shop-Ware, AutoLeap, Mitchell/RepairShopr, Oficina Integrada, Una ERP, On Motor, Workmotor, Oficina.app (sem confirmação individual deles).

## 1. Ciclo da OS
Fluxo comum (síntese; nomes variam por produto):
Agendado/Recepção -> Orçamento (em elaboração) -> Aguardando aprovação -> Aprovado (total/parcial) -> Em execução (aguardando peça / terceiro) -> Concluído/Pronto -> Faturado/Entregue -> Fechado. Laterais: Recusado, Cancelado, Retorno/Retrabalho.
- Tekmetric [FONTE]: Job Board em 3 estágios (Estimates, Work-in-Progress, Completed). Estimativa "Pending" = enviada ao cliente (e-mail/SMS/link). Autorizar ao menos 1 job move para Work-in-Progress; jobs autorizados ficam "Not Started"; labels (In Progress, Waiting on Parts, Waiting on Sublet) são customizáveis, mas os status centrais não. "Posted" (fechamento) é o que faz a OS contar em relatórios; crédito do técnico só no post. Aprovação pode ser clique simples ou assinatura digital. https://support.tekmetric.com/hc/en-us/articles/360039292193-RO-Labels-and-Workflow-Statuses ; https://support.tekmetric.com/hc/en-us/articles/4421125978391-Digital-Signature-Authorization-Process
- Shopmonkey [FONTE]: estimate -> (repair order opcional) -> invoice, movido por colunas de workflow; aprovação eletrônica do cliente gera registro; aba Activity loga atribuição de mão de obra, mensagens e autorização. https://help.shopmonkey.io/en/articles/9689433-repair-order-status ; https://help.shopmonkey.io/en/articles/4743116-how-do-i-use-the-service-writer-view
- Aprovação por item (job/serviço), não só da OS inteira: padrão Tekmetric [FONTE].
- Quem muda o quê (típico) [CONH]: recepção/consultor cria e envia orçamento; cliente aprova (link/WhatsApp/assinatura); mecânico move execução/pronto; consultor/caixa fatura e entrega; gerente cancela/reabre.
- Prova de aprovação [CONH]: guardar canal, data/hora, IP/dispositivo, texto exibido, valor e versão do orçamento, e quem registrou (se aprovação verbal/telefone: registrar o atendente). Assinatura em tela/link com log é o padrão digital.
- Aditivos [CONH]: novo serviço descoberto na execução vira aditivo vinculado à mesma OS, com nova aprovação; não alterar o valor já aprovado (CDC art. 40 §2º). Manter versões/histórico.
- Garantia/retrabalho [CONH]: OS de retorno vinculada à OS original (tipo garantia/retrabalho), sem cobrança ao cliente, rastreando mecânico/peça/fornecedor responsável.

## 2. Módulos e telas padrão
Confirmado em materiais de fornecedores BR (Actana, Contmatic, Ultracar): OS digital com orçamento, checklist de entrada, diagnóstico, serviços, peças e assinaturas; estoque; financeiro/fluxo de caixa; NF-e/NFS-e; comissão por mecânico/setor; histórico por placa; curva ABC. https://actana.com.br/sistema-para-oficina-mecanica ; https://simplifique.contmatic.com.br/blogs/ordem-de-servico-oficina-mecanica ; https://omecanico.com.br/cinco-ferramentas-de-gestao-para-a-oficina/
Telas [CONH salvo indicação]:
- Painel/kanban do pátio (colunas por status; Tekmetric Job Board/Tech Board [FONTE]); visão do mecânico (só suas OS).
- Agenda (por box/mecânico, tempo estimado, confirmação por WhatsApp).
- Checklist de entrada: combustível, km, avarias com fotos/croqui, pertences, assinatura do cliente.
- Inspeção digital (semáforo verde/amarelo/vermelho + foto por item) que alimenta o orçamento (Tekmetric [FONTE]: inspeção digital antes do estimate).
- Laudo/diagnóstico técnico; histórico por placa (OSs, peças, km); cadastro cliente + veículos (relação N:N ao longo do tempo).
- Lembretes de revisão por km/data (próxima = km atual + intervalo; projetar por média de km/mês, pois o km real só é conhecido na visita) e pós-venda/CRM (retorno, aniversário, NPS) via WhatsApp/SMS.
- Comissões (% sobre mão de obra e/ou peça, ou valor fixo por serviço); produtividade (horas vendidas x trabalhadas).

## 3. Estoque e compras [CONH, exceto curva ABC]
- Item: código interno, código do fabricante, aplicação (veículos compatíveis), unidade, localização (prateleira), mínimo/máximo, custo médio, preço de venda, NCM/CFOP/origem (para NF-e).
- Entrada por compra (NF de entrada/XML, vincula fornecedor, atualiza custo médio); baixa por OS (reserva ao aprovar, baixa ao executar/faturar); devolução ao fornecedor; peça trazida pelo cliente (sem estoque, só mão de obra).
- Inventário (contagem cíclica, ajuste com motivo e usuário); pedido de compra a partir de falta/mínimo; cotação entre fornecedores.
- Curva ABC [FONTE: citada por Ultracar e TCCs] para priorizar mínimo e contagem.
- Markup = (preço-custo)/custo; margem = (preço-custo)/preço. Não confundir. Tabelas de markup por faixa de custo/categoria são comuns.

## 4. Financeiro [CONH]
- Contas a receber (por OS, parcelas, A-R; Tekmetric tem estado "In A/R" [FONTE]) e a pagar (fornecedores, aluguel, impostos, folha); categorias e centros de custo.
- Formas: dinheiro, Pix, débito, crédito (parcelado, taxa da maquininha), boleto, transferência. Pagamento misto na mesma OS. Conciliação de taxas de cartão.
- Abertura/fechamento de caixa por operador (sangria/suprimento, conferência por forma de pagamento).
- Fluxo de caixa (previsto x realizado), DRE simples (receita peça/serviço - CMV - despesas - impostos); regime tributário afeta [?].

## 5. Papéis e permissões [CONH]
- Dono/Gerente: tudo, incl. custos, margens, DRE, comissões, parametrização. Financeiro: contas, caixa, NF. Consultor/Recepção: clientes, agenda, orçamento/OS, preço de venda, desconto limitado por alçada. Estoquista/Compras: itens, custos, pedidos. Mecânico: ver suas OS, checklist/inspeção, apontar tempo, solicitar peça, marcar pronto.
- Ocultar do mecânico: custo de compra, margem, lucro, comissões alheias, financeiro. Mostrar descrição/quantidade/localização da peça. Desconto acima do limite exige aprovação; cancelar/reabrir OS, estornar e alterar preço pós-aprovação só gerente, tudo com log de auditoria.
- Multi-oficina (tenant) deve isolar dados por empresa/filial.

## 6. Relatórios e KPIs [CONH; fórmulas padrão]
- Ticket médio = faturamento / nº de OS; taxa de aprovação = valor (ou nº) aprovado / orçado (por consultor); tempo médio de OS (entrada -> pronto -> entrega); horas vendidas x produtivas por mecânico; taxa de retorno/retrabalho; retorno de clientes (recorrência 6/12 meses); % mão de obra x peça; margem por peça/serviço; giro e ruptura de estoque; inadimplência; faturamento por forma de pagamento; comissões a pagar; orçamentos sem resposta.
- No Tekmetric só OS "postada" entra nos relatórios [FONTE]: definir claramente o evento de reconhecimento da receita.

## 7. Regras brasileiras
- CDC art. 39 VI: executar serviço sem orçamento prévio/autorização expressa é prática abusiva. Art. 40: orçamento prévio discriminando mão de obra, materiais, condições de pagamento e prazos; validade de 10 dias do recebimento (salvo estipulação em contrário); aprovado, obriga as partes e só muda por livre negociação; serviços adicionais exigem autorização expressa [parte CONH]. [FONTE: §1º, §2º e 39 VI confirmados] https://www.admdireito.com.br/legislacao/art/LEI_00080781990-40 ; https://www.tjdft.jus.br/institucional/imprensa/campanhas-e-produtos/direito-facil/edicao-semanal/pratica-abusiva-servico-sem-orcamento ; https://mpce.mp.br/decon/duvidas/servicos/cobranca-por-orcamento-e-legal/
- Art. 21: no conserto, peças de reposição originais adequadas e novas, salvo autorização em contrário do consumidor (peça usada/recondicionada só com autorização expressa registrada). [Idec confirma originais/recondicionadas: https://idec.org.br/print/24942 ; texto literal do artigo é CONH]
- Garantia legal, art. 26: 90 dias para vícios aparentes em serviço/produto durável (30 se não durável), contados da entrega/término do serviço; vício oculto conta da descoberta. O "90 dias" é do art. 26, não do 21. Garantia contratual (termo escrito, art. 50) é complementar [CONH]. Prazo de reparo citado pelo Idec: 30 dias por regra salvo acordo [?: validar fundamento].
- Fiscal: regra geral (SEFAZ-SP, RC 21492M1/2021): peças em NF-e (ICMS) e mão de obra em NFS-e (ISS), duas notas; fornecedor de software cita NFC-e para peça no balcão; há fontes citando nota conjugada em alguns casos: validar com contador/município [?]. Oficina que só cobra mão de obra (peça do cliente) emite só NFS-e. https://legislacao.fazenda.sp.gov.br/Paginas/RC21492M1_2021.aspx ; https://actana.com.br/emissao-de-nota-fiscal-para-oficina-mecanica . NFS-e padrão nacional vs modelo municipal varia por prefeitura [?]. Sugestão [CONH, não pesquisado]: integrar emissor terceirizado (Focus NFe, eNotas, Nuvem Fiscal) em vez de emitir direto.
- Placa/FIPE: tabela FIPE (preço) tem API gratuita: fipe.parallelum.com.br/api/v2 sem auth básico (TabNews); fipe.api.br com 1.000 req/dia grátis e Pro R$ 49,90/mês [FONTE, valores podem ter mudado]; lib PHP cita 500/dia sem token [?]. https://www.tabnews.com.br/dedx/guia-completo-da-api-fipe-como-consultar-precos-de-veiculos-no-brasil ; https://github.com/deividfortuna/fipe . FIPE NÃO consulta por placa. Consulta por placa: sem API gratuita confiável encontrada; Apify brasildados ~US$1,20 por consulta [FONTE], Infosimples por DETRAN (preços não encontrados), gov.br só manual via QR Code. https://apify.com/brasildados/consulta-veiculo-por-placa.md ; https://infosimples.com/consultas/ecrvsp-multas-placa/ . MVP: digitação manual + FIPE por marca/modelo/ano; placa como chave de busca interna.
- LGPD [CONH]: base legal execução de contrato/legítimo interesse; coletar o mínimo (CPF só se necessário para NF); dono do veículo é dado pessoal; consentimento específico e opt-out para marketing/WhatsApp; fotos do veículo podem conter placa/pessoas; retenção fiscal (5 anos [?]); log de acesso; direitos do titular (exportar/excluir); contrato de operador se SaaS.

## Lista priorizada de funcionalidades do MVP completo
MUST
- Cadastro cliente + veículo (placa, km, histórico por placa); OS com itens (serviço/peça), versão de orçamento, validade 10 dias, PDF discriminando mão de obra e peças.
- Estados da OS com transições por papel + log de auditoria; aprovação por link/assinatura com prova (data, canal, IP, versão); aprovação por item; aditivo vinculado; marca de peça usada/recondicionada com autorização.
- Checklist de entrada com fotos e assinatura; kanban do pátio; visão do mecânico sem custos.
- Estoque básico (entrada, baixa por OS, mínimo, localização, custo médio) + fornecedores.
- Financeiro básico: receber por OS (Pix/cartão/dinheiro/misto, parcelas), pagar, caixa diário.
- Permissões por papel, multi-tenant; garantia (termo, 90 dias) e OS de retorno; LGPD básica.
SHOULD
- Agenda; inspeção digital semáforo; comissões; lembretes de revisão por km/data via WhatsApp; compras/pedidos; inventário; fluxo de caixa e DRE simples; KPIs (ticket médio, taxa de aprovação, tempo de OS); FIPE; NFS-e/NF-e via integrador.
COULD
- Curva ABC, CRM/NPS, produtividade por horas, conciliação de cartão, XML de entrada, consulta de placa paga, app do mecânico, portal do cliente, catálogo de aplicação de peças.

## Armadilhas comuns
- Alterar valor/itens após aprovação sem nova aprovação (CDC art. 40 §2º, 39 VI); aprovação sem prova.
- Confundir markup com margem; mostrar custo/margem ao mecânico; desconto sem alçada.
- Baixar estoque só no faturamento (peça sumida) ou reservar ao orçar (reserva eterna); custo médio errado após devolução.
- Reconhecer receita/comissão antes do fechamento; comissão sobre OS cancelada ou de garantia.
- Misturar peça e serviço numa só nota; esquecer peça trazida pelo cliente (só NFS-e, sem estoque).
- Veículo preso a um cliente (venda do carro); km regredindo (validar); placa antiga x Mercosul.
- Depender de API de placa gratuita/estável; não cachear FIPE (limites diários).
- Lembrete de revisão sem opt-out (LGPD); fotos sem controle de acesso.
- Status demais/rígidos: preferir poucos status fixos + labels configuráveis (padrão Tekmetric [FONTE]).
- Validar tributação (Simples, ICMS-ST, CFOP 5405 para peças citado em fórum [?]) com contador antes de codar.
