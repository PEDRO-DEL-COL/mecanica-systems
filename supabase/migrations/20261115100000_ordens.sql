-- =============================================================================
-- Ordens de serviço (Onda B, tarefa B5): tabelas, triggers, RLS e grants.
-- As RPCs (únicas portas de escrita de status/itens/versões/aprovações) ficam
-- em 20261115110000_ordens_rpc.sql.
--
-- Tabelas:
--   ordem_servico  OS; número NNNNNN.AAAA/MM por oficina (nasce no orçamento)
--   item_os        itens (serviço/peça/terceiro); aprovado/recusado = imutável
--   item_os_custo  custo do item (tabela-sombra; só 'financeiro' lê)
--   os_versao      versão congelada (snapshot + hash SHA-256), APPEND-ONLY
--   os_aprovacao   decisão do cliente sobre uma versão (prova), APPEND-ONLY
-- Timeline/auditoria: reutiliza public.evento (entidade 'ordem_servico',
-- já legível por quem tem 'ordens/leitura'); as RPCs gravam eventos
-- explícitos (transição, item, versão, aprovação) com entidade_id = OS.
-- Pagamentos: tarefa C6 (não existem aqui).
--
-- Também:
--   * 'ordens/leitura' passa a ler item_catalogo (policy; ver abaixo);
--   * FK composta movimento_estoque(org_id, os_id) -> ordem_servico (pendente
--     da A4).
-- Idempotente: pode ser reaplicada.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Dependência pendente "quem tem 'ordens' lê item_catalogo" (o editor da OS
-- escolhe serviços/peças do catálogo). Resolvida na POLICY de item_catalogo
-- (mesmo padrão já usado para 'estoque' na A4), e não em
-- private.dependencias_permissao(): assim não se grava 'catalogo/leitura'
-- para quem tem 'ordens' (o menu Catálogo não aparece para o atendente),
-- não há backfill de membro_permissao e o contrato testado de
-- expandir_permissoes (comum) não muda. Custo continua só em item_custo.
-- -----------------------------------------------------------------------------
drop policy if exists item_catalogo_select on public.item_catalogo;
create policy item_catalogo_select on public.item_catalogo
  for select to authenticated
  using (
    org_id = (select private.org_do_usuario())
    and (
      (select private.pode('catalogo', 'leitura'))
      or (select private.pode('estoque', 'leitura'))
      or (select private.pode('ordens', 'leitura'))
    )
  );

-- -----------------------------------------------------------------------------
-- ordem_servico
-- -----------------------------------------------------------------------------
create table if not exists public.ordem_servico (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizacao (id),
  -- Sequência por oficina (private.proximo_numero(org, 'os')): nunca zera.
  numero_seq bigint not null check (numero_seq > 0),
  -- Exibição: private.formatar_numero(numero_seq, criado_em) = 000001.2026/11
  numero text not null check (numero ~ '^[0-9]{6,}\.[0-9]{4}/[0-9]{2}$'),
  tipo text not null default 'normal' check (tipo in ('normal', 'garantia', 'retrabalho')),
  -- OS de origem (garantia/retrabalho).
  os_origem_id uuid,
  cliente_id uuid not null,
  veiculo_id uuid not null,
  -- Status fixo; só muda pelas RPCs (sem GRANT de UPDATE na coluna).
  status text not null default 'orcamento'
    check (status in ('orcamento', 'aprovado', 'em_execucao', 'concluido', 'entregue', 'cancelado')),
  -- Etiquetas livres do pátio (aguardando peça etc.), separadas do status.
  etiquetas text[] not null default '{}'::text[] check (private.etiquetas_validas(etiquetas)),
  responsavel_membro_id uuid,
  mecanico_membro_id uuid,
  -- Entrada do veículo.
  entrada_em timestamptz not null default now(),
  km_entrada integer not null check (km_entrada between 0 and 9999999),
  -- Obrigatória quando km_entrada < km_atual do veículo.
  km_justificativa text check (km_justificativa is null
    or (km_justificativa = btrim(km_justificativa) and char_length(km_justificativa) between 3 and 500)),
  combustivel text check (combustivel is null or combustivel in ('reserva', '1/4', '1/2', '3/4', 'cheio')),
  relato_cliente text check (relato_cliente is null or char_length(relato_cliente) <= 4000),
  diagnostico text check (diagnostico is null or char_length(diagnostico) <= 4000),
  previsao_entrega timestamptz,
  -- Validade da última versão gerada (data da versão + validade_orcamento_dias).
  validade_ate date,
  -- Último aditivo aberto (0 = só o orçamento original).
  aditivo_atual integer not null default 0 check (aditivo_atual >= 0),
  -- Totais calculados no banco (itens ativos não recusados) e o aprovado.
  total_servicos_centavos bigint not null default 0 check (total_servicos_centavos >= 0),
  total_pecas_centavos bigint not null default 0 check (total_pecas_centavos >= 0),
  total_terceiros_centavos bigint not null default 0 check (total_terceiros_centavos >= 0),
  total_centavos bigint not null default 0 check (total_centavos >= 0),
  total_aprovado_centavos bigint not null default 0 check (total_aprovado_centavos >= 0),
  -- Entrega e garantia (CDC art. 26 II: mínimo 90 dias da entrega) [JUR].
  data_entrega timestamptz,
  garantia_ate date,
  -- Peças substituídas devolvidas ao cliente (opcional) [JUR/?].
  pecas_devolvidas boolean,
  motivo_cancelamento text check (motivo_cancelamento is null
    or (motivo_cancelamento = btrim(motivo_cancelamento) and char_length(motivo_cancelamento) between 3 and 500)),
  cancelado_em timestamptz,
  -- Fiscal: só organiza (sem emissão).
  nota_servico_numero text check (nota_servico_numero is null
    or (nota_servico_numero = btrim(nota_servico_numero) and char_length(nota_servico_numero) between 1 and 60)),
  nota_produto_numero text check (nota_produto_numero is null
    or (nota_produto_numero = btrim(nota_produto_numero) and char_length(nota_produto_numero) between 1 and 60)),
  observacao_fiscal text check (observacao_fiscal is null or char_length(observacao_fiscal) <= 1000),
  idempotency_key uuid,
  ativo boolean not null default true,
  criado_por uuid default auth.uid(),
  versao integer not null default 1,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  constraint ordem_servico_org_id_id_key unique (org_id, id),
  constraint ordem_servico_org_id_numero_seq_key unique (org_id, numero_seq),
  constraint ordem_servico_cliente_fk foreign key (org_id, cliente_id)
    references public.cliente (org_id, id),
  constraint ordem_servico_veiculo_fk foreign key (org_id, veiculo_id)
    references public.veiculo (org_id, id),
  constraint ordem_servico_origem_fk foreign key (org_id, os_origem_id)
    references public.ordem_servico (org_id, id),
  constraint ordem_servico_responsavel_fk foreign key (org_id, responsavel_membro_id)
    references public.membro (org_id, id),
  constraint ordem_servico_mecanico_fk foreign key (org_id, mecanico_membro_id)
    references public.membro (org_id, id),
  constraint ordem_servico_origem check ((tipo = 'normal') = (os_origem_id is null)),
  constraint ordem_servico_origem_outra check (os_origem_id is null or os_origem_id <> id),
  constraint ordem_servico_entrega check ((status = 'entregue') = (data_entrega is not null)),
  constraint ordem_servico_garantia check (
    (data_entrega is null) = (garantia_ate is null)
    and (garantia_ate is null
         or garantia_ate >= (data_entrega at time zone 'America/Sao_Paulo')::date + 90)
  ),
  constraint ordem_servico_cancelamento check (
    (status = 'cancelado') = (motivo_cancelamento is not null and cancelado_em is not null)
  ),
  constraint ordem_servico_aprovado_le_total check (total_aprovado_centavos <= total_centavos)
);

create index if not exists ordem_servico_org_id_status_idx
  on public.ordem_servico (org_id, status, criado_em desc);
create index if not exists ordem_servico_org_id_criado_em_idx
  on public.ordem_servico (org_id, criado_em desc);
create index if not exists ordem_servico_org_id_cliente_idx
  on public.ordem_servico (org_id, cliente_id);
create index if not exists ordem_servico_org_id_veiculo_idx
  on public.ordem_servico (org_id, veiculo_id, criado_em desc);
create index if not exists ordem_servico_org_id_origem_idx
  on public.ordem_servico (org_id, os_origem_id) where os_origem_id is not null;
create index if not exists ordem_servico_org_id_responsavel_idx
  on public.ordem_servico (org_id, responsavel_membro_id) where responsavel_membro_id is not null;
-- Exceção à regra "índice começa por org_id" (GIN em text[] sem btree_gin):
-- acelera o filtro por etiqueta (etiquetas @> '{x}'); isolamento pela RLS.
create index if not exists ordem_servico_etiquetas_idx
  on public.ordem_servico using gin (etiquetas);
create unique index if not exists ordem_servico_idempotency_key
  on public.ordem_servico (org_id, idempotency_key) where idempotency_key is not null;

-- -----------------------------------------------------------------------------
-- item_os
-- -----------------------------------------------------------------------------
create table if not exists public.item_os (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizacao (id),
  os_id uuid not null,
  tipo text not null check (tipo in ('servico', 'peca', 'terceiro')),
  item_catalogo_id uuid,
  descricao text not null check (descricao = btrim(descricao) and char_length(descricao) between 1 and 300),
  quantidade numeric(12, 3) not null check (quantidade > 0 and quantidade <= 1000000),
  preco_unitario_centavos bigint not null check (preco_unitario_centavos between 0 and 100000000000),
  desconto_centavos bigint not null default 0 check (desconto_centavos >= 0),
  -- round(quantidade * preço) - desconto; mantido pelo trigger item_os_a_total.
  total_centavos bigint not null default 0 check (total_centavos >= 0),
  -- Só peça. CDC art. 21: padrão nova_original; demais exigem autorização
  -- expressa na aprovação (nova_paralela: decisão provisória, exige) [JUR].
  condicao text check (condicao is null
    or condicao in ('nova_original', 'nova_paralela', 'usada', 'recondicionada', 'do_cliente')),
  -- Autorização expressa do cliente para a condição (gravada na aprovação).
  autorizacao_condicao boolean not null default false,
  -- pendente -> aprovado | recusado (só pela RPC de aprovação). Aprovado ou
  -- recusado = travado (trigger item_os_b_guarda).
  situacao text not null default 'pendente' check (situacao in ('pendente', 'aprovado', 'recusado')),
  -- 0 = orçamento original; k = k-ésimo aditivo.
  aditivo_n integer not null default 0 check (aditivo_n >= 0),
  mecanico_membro_id uuid,
  -- Saída de estoque desta peça (saida_os), quando baixada.
  baixa_movimento_id uuid,
  ativo boolean not null default true,
  criado_por uuid default auth.uid(),
  versao integer not null default 1,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  constraint item_os_org_id_id_key unique (org_id, id),
  constraint item_os_os_fk foreign key (org_id, os_id)
    references public.ordem_servico (org_id, id),
  constraint item_os_catalogo_fk foreign key (org_id, item_catalogo_id)
    references public.item_catalogo (org_id, id),
  constraint item_os_mecanico_fk foreign key (org_id, mecanico_membro_id)
    references public.membro (org_id, id),
  constraint item_os_baixa_fk foreign key (org_id, baixa_movimento_id)
    references public.movimento_estoque (org_id, id),
  constraint item_os_condicao_peca check ((tipo = 'peca') = (condicao is not null)),
  constraint item_os_desconto check (desconto_centavos <= round(quantidade * preco_unitario_centavos)),
  constraint item_os_terceiro_sem_catalogo check (tipo <> 'terceiro' or item_catalogo_id is null),
  constraint item_os_baixa check (baixa_movimento_id is null or (tipo = 'peca' and situacao = 'aprovado')),
  constraint item_os_autorizacao check (not autorizacao_condicao or tipo = 'peca')
);

create index if not exists item_os_org_id_os_idx on public.item_os (org_id, os_id, aditivo_n, criado_em);
create index if not exists item_os_org_id_catalogo_idx
  on public.item_os (org_id, item_catalogo_id) where item_catalogo_id is not null;
create unique index if not exists item_os_baixa_movimento_key
  on public.item_os (baixa_movimento_id) where baixa_movimento_id is not null;

-- -----------------------------------------------------------------------------
-- item_os_custo: custo unitário do item (só 'financeiro' lê). Gravado pelas
-- RPCs (custo informado no item; ou custo médio no momento da baixa).
-- -----------------------------------------------------------------------------
create table if not exists public.item_os_custo (
  item_os_id uuid primary key,
  org_id uuid not null,
  custo_unitario_centavos bigint not null check (custo_unitario_centavos between 0 and 100000000000),
  atualizado_em timestamptz not null default now(),
  constraint item_os_custo_item_fk foreign key (org_id, item_os_id)
    references public.item_os (org_id, id)
);

create index if not exists item_os_custo_org_id_idx on public.item_os_custo (org_id, item_os_id);

-- -----------------------------------------------------------------------------
-- os_versao (append-only): o que o cliente vê (PDF/WhatsApp) e aprova.
-- hash = hex(SHA-256(snapshot::text)).
-- -----------------------------------------------------------------------------
create table if not exists public.os_versao (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizacao (id),
  os_id uuid not null,
  -- 1, 2, 3... por OS
  numero integer not null check (numero > 0),
  tipo text not null check (tipo in ('orcamento', 'aditivo')),
  aditivo_n integer not null check (aditivo_n >= 0),
  snapshot jsonb not null check (jsonb_typeof(snapshot) = 'object'),
  hash text not null check (hash ~ '^[0-9a-f]{64}$'),
  total_centavos bigint not null check (total_centavos >= 0),
  -- CDC art. 40 §1º: data da versão + validade_orcamento_dias (padrão 10).
  -- Usar a data da versão como "recebimento" é simplificação [JUR].
  validade_ate date not null,
  criado_por uuid default auth.uid(),
  criado_em timestamptz not null default now(),
  constraint os_versao_org_id_id_key unique (org_id, id),
  constraint os_versao_os_numero_key unique (os_id, numero),
  constraint os_versao_os_fk foreign key (org_id, os_id)
    references public.ordem_servico (org_id, id),
  constraint os_versao_tipo check ((tipo = 'orcamento') = (aditivo_n = 0))
);

create index if not exists os_versao_org_id_os_idx on public.os_versao (org_id, os_id, numero desc);

-- -----------------------------------------------------------------------------
-- os_aprovacao (append-only): uma decisão por versão.
-- -----------------------------------------------------------------------------
create table if not exists public.os_aprovacao (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizacao (id),
  os_id uuid not null,
  versao_id uuid not null,
  aditivo_n integer not null check (aditivo_n >= 0),
  decisao text not null check (decisao in ('total', 'parcial', 'recusa')),
  itens_aprovados uuid[] not null default '{}'::uuid[],
  -- Total aprovado congelado (soma dos itens aprovados desta versão).
  total_aprovado_centavos bigint not null check (total_aprovado_centavos >= 0),
  canal text not null check (canal in ('presencial', 'whatsapp', 'telefone', 'email', 'link')),
  aprovador_nome text not null
    check (aprovador_nome = btrim(aprovador_nome) and char_length(aprovador_nome) between 1 and 200),
  aprovador_relacao text not null
    check (aprovador_relacao in ('proprietario', 'condutor', 'responsavel_pj', 'outro')),
  -- Prova/observação (ex.: "confirmou por WhatsApp às 14h"). Telefone/verbal
  -- é prova fraca: a UI recomenda confirmar por escrito [JUR].
  prova text not null check (prova = btrim(prova) and char_length(prova) between 3 and 2000),
  -- Print/assinatura no Storage (SHOULD).
  evidencia_path text check (evidencia_path is null or char_length(evidencia_path) between 1 and 500),
  termo_texto text check (termo_texto is null or char_length(termo_texto) <= 10000),
  -- CDC art. 21: autorização expressa para peça não nova/não original.
  autorizacao_condicao boolean not null default false,
  aprovado_em timestamptz not null,
  registrado_por uuid default auth.uid(),
  criado_em timestamptz not null default now(),
  constraint os_aprovacao_org_id_id_key unique (org_id, id),
  constraint os_aprovacao_versao_key unique (versao_id),
  constraint os_aprovacao_os_fk foreign key (org_id, os_id)
    references public.ordem_servico (org_id, id),
  constraint os_aprovacao_versao_fk foreign key (org_id, versao_id)
    references public.os_versao (org_id, id),
  constraint os_aprovacao_itens check ((decisao = 'recusa') = (cardinality(itens_aprovados) = 0))
);

create index if not exists os_aprovacao_org_id_os_idx on public.os_aprovacao (org_id, os_id, criado_em);

-- -----------------------------------------------------------------------------
-- FK pendente da A4: movimento_estoque.os_id -> ordem_servico (composta).
-- -----------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'movimento_estoque_os_fk' and conrelid = 'public.movimento_estoque'::regclass
  ) then
    alter table public.movimento_estoque
      add constraint movimento_estoque_os_fk foreign key (org_id, os_id)
      references public.ordem_servico (org_id, id);
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- Triggers.
-- -----------------------------------------------------------------------------

-- Total do item (BEFORE; "a_" roda antes de "b_guarda" e de "versao").
create or replace function private.trg_item_os_total()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.total_centavos := round(new.quantidade * new.preco_unitario_centavos)::bigint - new.desconto_centavos;
  return new;
end;
$$;

-- Item aprovado/recusado é imutável (preço, quantidade, descrição, condição,
-- situação, remoção). Vale para TODOS, inclusive RPCs definer e postgres:
-- mudança = aditivo. Só podem mudar depois: mecânico e a baixa de estoque.
-- DELETE nunca (remoção lógica de item pendente via ativo = false).
create or replace function private.trg_item_os_guarda()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Item da OS não pode ser apagado.' using errcode = '42501';
  end if;
  if new.org_id is distinct from old.org_id or new.os_id is distinct from old.os_id then
    raise exception 'Não é possível mover o item para outra OS.' using errcode = '42501';
  end if;
  if old.situacao <> 'pendente' and (
       new.tipo is distinct from old.tipo
       or new.item_catalogo_id is distinct from old.item_catalogo_id
       or new.descricao is distinct from old.descricao
       or new.quantidade is distinct from old.quantidade
       or new.preco_unitario_centavos is distinct from old.preco_unitario_centavos
       or new.desconto_centavos is distinct from old.desconto_centavos
       or new.condicao is distinct from old.condicao
       or new.autorizacao_condicao is distinct from old.autorizacao_condicao
       or new.situacao is distinct from old.situacao
       or new.aditivo_n is distinct from old.aditivo_n
       or new.ativo is distinct from old.ativo
     ) then
    raise exception 'Item % não pode ser alterado nem removido. Mudanças entram como aditivo.',
      case when old.situacao = 'aprovado' then 'aprovado' else 'recusado' end
      using errcode = 'P0001';
  end if;
  if old.baixa_movimento_id is not null and new.baixa_movimento_id is distinct from old.baixa_movimento_id then
    raise exception 'Baixa de estoque do item não pode ser trocada.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

-- Guarda da OS: org/número/cliente/veículo nunca mudam; OS entregue ou
-- cancelada só aceita etiquetas e dados fiscais por UPDATE direto (as RPCs
-- mudam status e os campos de entrega/cancelamento).
create or replace function private.trg_ordem_servico_guarda()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.org_id is distinct from old.org_id
     or new.numero_seq is distinct from old.numero_seq
     or new.numero is distinct from old.numero
     or new.cliente_id is distinct from old.cliente_id
     or new.veiculo_id is distinct from old.veiculo_id
     or new.tipo is distinct from old.tipo
     or new.os_origem_id is distinct from old.os_origem_id then
    raise exception 'Número, cliente, veículo e tipo da OS não podem ser alterados.' using errcode = 'P0001';
  end if;
  if old.status in ('entregue', 'cancelado') and new.status = old.status and (
       new.relato_cliente is distinct from old.relato_cliente
       or new.diagnostico is distinct from old.diagnostico
       or new.previsao_entrega is distinct from old.previsao_entrega
       or new.responsavel_membro_id is distinct from old.responsavel_membro_id
       or new.mecanico_membro_id is distinct from old.mecanico_membro_id
       or new.combustivel is distinct from old.combustivel
       or new.km_entrada is distinct from old.km_entrada
     ) then
    raise exception 'OS % não pode ser editada.',
      case when old.status = 'entregue' then 'entregue (reabra antes)' else 'cancelada' end
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists ordem_servico_guarda on public.ordem_servico;
create trigger ordem_servico_guarda
  before update on public.ordem_servico
  for each row execute function private.trg_ordem_servico_guarda();

drop trigger if exists ordem_servico_versao on public.ordem_servico;
create trigger ordem_servico_versao
  before insert or update on public.ordem_servico
  for each row execute function private.trg_versao();

-- Relato e diagnóstico podem conter dados pessoais: fora do evento.
drop trigger if exists ordem_servico_auditoria on public.ordem_servico;
create trigger ordem_servico_auditoria
  after insert or update or delete on public.ordem_servico
  for each row execute function private.trg_auditar('relato_cliente', 'diagnostico', 'km_justificativa');

drop trigger if exists item_os_a_total on public.item_os;
create trigger item_os_a_total
  before insert or update on public.item_os
  for each row execute function private.trg_item_os_total();

drop trigger if exists item_os_b_guarda on public.item_os;
create trigger item_os_b_guarda
  before update or delete on public.item_os
  for each row execute function private.trg_item_os_guarda();

drop trigger if exists item_os_versao on public.item_os;
create trigger item_os_versao
  before insert or update on public.item_os
  for each row execute function private.trg_versao();

drop trigger if exists os_versao_append_only on public.os_versao;
create trigger os_versao_append_only
  before update or delete on public.os_versao
  for each row execute function private.trg_somente_insercao();

drop trigger if exists os_versao_sem_truncate on public.os_versao;
create trigger os_versao_sem_truncate
  before truncate on public.os_versao
  for each statement execute function private.trg_somente_insercao();

drop trigger if exists os_aprovacao_append_only on public.os_aprovacao;
create trigger os_aprovacao_append_only
  before update or delete on public.os_aprovacao
  for each row execute function private.trg_somente_insercao();

drop trigger if exists os_aprovacao_sem_truncate on public.os_aprovacao;
create trigger os_aprovacao_sem_truncate
  before truncate on public.os_aprovacao
  for each statement execute function private.trg_somente_insercao();

-- -----------------------------------------------------------------------------
-- RLS e grants.
-- -----------------------------------------------------------------------------
alter table public.ordem_servico enable row level security;
alter table public.item_os enable row level security;
alter table public.item_os_custo enable row level security;
alter table public.os_versao enable row level security;
alter table public.os_aprovacao enable row level security;

revoke all on table public.ordem_servico, public.item_os, public.item_os_custo,
  public.os_versao, public.os_aprovacao
  from public, anon, authenticated;

-- ordem_servico: leitura com 'ordens/leitura'. Sem INSERT (só
-- os_criar_orcamento, que numera). UPDATE direto só de campos descritivos;
-- status, totais, entrega, garantia, cancelamento e versao NÃO têm GRANT
-- (só as RPCs mudam). Sem DELETE.
grant select on public.ordem_servico to authenticated;
grant update (etiquetas, responsavel_membro_id, mecanico_membro_id, combustivel, relato_cliente,
  diagnostico, previsao_entrega, nota_servico_numero, nota_produto_numero, observacao_fiscal)
  on public.ordem_servico to authenticated;

drop policy if exists ordem_servico_select on public.ordem_servico;
create policy ordem_servico_select on public.ordem_servico
  for select to authenticated
  using (
    org_id = (select private.org_do_usuario())
    and (select private.pode('ordens', 'leitura'))
  );

drop policy if exists ordem_servico_update on public.ordem_servico;
create policy ordem_servico_update on public.ordem_servico
  for update to authenticated
  using (
    org_id = (select private.org_do_usuario())
    and (select private.pode('ordens', 'escrita'))
  )
  with check (
    org_id = (select private.org_do_usuario())
    and (select private.pode('ordens', 'escrita'))
  );

-- item_os, os_versao, os_aprovacao: só leitura (escrita só via RPC).
grant select on public.item_os to authenticated;
grant select on public.os_versao to authenticated;
grant select on public.os_aprovacao to authenticated;

drop policy if exists item_os_select on public.item_os;
create policy item_os_select on public.item_os
  for select to authenticated
  using (
    org_id = (select private.org_do_usuario())
    and (select private.pode('ordens', 'leitura'))
  );

drop policy if exists os_versao_select on public.os_versao;
create policy os_versao_select on public.os_versao
  for select to authenticated
  using (
    org_id = (select private.org_do_usuario())
    and (select private.pode('ordens', 'leitura'))
  );

drop policy if exists os_aprovacao_select on public.os_aprovacao;
create policy os_aprovacao_select on public.os_aprovacao
  for select to authenticated
  using (
    org_id = (select private.org_do_usuario())
    and (select private.pode('ordens', 'leitura'))
  );

-- item_os_custo: só leitura e só com 'financeiro'.
grant select on public.item_os_custo to authenticated;

drop policy if exists item_os_custo_select on public.item_os_custo;
create policy item_os_custo_select on public.item_os_custo
  for select to authenticated
  using (
    org_id = (select private.org_do_usuario())
    and (select private.pode('financeiro', 'leitura'))
  );

revoke all on function private.trg_item_os_total() from public, anon, authenticated;
revoke all on function private.trg_item_os_guarda() from public, anon, authenticated;
revoke all on function private.trg_ordem_servico_guarda() from public, anon, authenticated;
