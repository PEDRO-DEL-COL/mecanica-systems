-- =============================================================================
-- Ordens de serviço (B5): RPCs. Únicas portas de escrita de status, itens,
-- versões e aprovações.
--
-- Regras comuns a todas as RPCs públicas (public.os_*):
--   * security definer, search_path = '', nomes qualificados;
--   * a oficina sai de auth.uid() (private.org_do_usuario), nunca de parâmetro;
--     ids de outra oficina = "não encontrado";
--   * área 'ordens' (escrita) via private.pode; linhas "só dono" da matriz
--     exigem private.eh_dono();
--   * concorrência otimista: p_versao = ordem_servico.versao lida pela UI;
--     diferente => P0001 'Alterado por outra pessoa. Recarregue.';
--   * erros: 42501 permissão, P0001 regra (texto pt-BR exibível);
--   * EXECUTE revogado de public/anon; só authenticated.
--
-- Matriz de transições (REGRAS §2; espelhada em src/lib/puro/os.ts):
--   orcamento   -> aprovado     escrita  os_registrar_aprovacao (total/parcial)
--   orcamento   -> cancelado    escrita  os_cancelar | aprovação com recusa
--   aprovado    -> em_execucao  escrita  os_iniciar_execucao (baixa estoque)
--   aprovado    -> cancelado    escrita  os_cancelar
--   em_execucao -> concluido    escrita  os_concluir (sem aditivo pendente)
--   em_execucao -> cancelado    dono     os_cancelar (estorna estoque)
--   concluido   -> em_execucao  escrita  os_retomar_execucao (motivo)
--   concluido   -> entregue     escrita  os_entregar (entrega + garantia)
--   concluido   -> cancelado    dono     os_cancelar (estorna estoque)
--   entregue    -> concluido    dono     os_reabrir (motivo)
--   entregue    -> cancelado    ninguém  (reabrir + estornos)
-- Idempotente: create or replace.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Funções internas (sem EXECUTE para as roles da API).
-- -----------------------------------------------------------------------------

-- Org do usuário logado se ele tem 'ordens' no nível pedido; senão erro.
create or replace function private.os_exigir(p_nivel text)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_org uuid;
begin
  if (select auth.uid()) is null then
    raise exception 'Não autenticado.' using errcode = '28000';
  end if;
  v_org := private.org_do_usuario();
  if v_org is null or not private.pode('ordens', p_nivel) then
    raise exception 'Você não tem permissão para ordens de serviço.' using errcode = '42501';
  end if;
  return v_org;
end;
$$;

-- Data de hoje no fuso da oficina (America/Sao_Paulo).
create or replace function private.hoje_sp()
returns date
language sql
stable
set search_path = ''
as $$
  select (now() at time zone 'America/Sao_Paulo')::date;
$$;

-- Trava a OS da oficina e confere a versão otimista (null = não confere).
create or replace function private.os_travar(p_org_id uuid, p_os_id uuid, p_versao integer)
returns public.ordem_servico
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_os public.ordem_servico;
begin
  select * into v_os
  from public.ordem_servico o
  where o.org_id = p_org_id and o.id = p_os_id
  for update;
  if not found then
    raise exception 'Ordem de serviço não encontrada.' using errcode = 'P0001';
  end if;
  if p_versao is not null and v_os.versao <> p_versao then
    raise exception 'Alterado por outra pessoa. Recarregue.' using errcode = 'P0001';
  end if;
  return v_os;
end;
$$;

-- Matriz: quem pode a transição de -> para ('escrita' | 'dono' | null = ninguém).
create or replace function private.os_regra_transicao(p_de text, p_para text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select case p_de || '>' || p_para
    when 'orcamento>aprovado' then 'escrita'
    when 'orcamento>cancelado' then 'escrita'
    when 'aprovado>em_execucao' then 'escrita'
    when 'aprovado>cancelado' then 'escrita'
    when 'em_execucao>concluido' then 'escrita'
    when 'em_execucao>cancelado' then 'dono'
    when 'concluido>em_execucao' then 'escrita'
    when 'concluido>entregue' then 'escrita'
    when 'concluido>cancelado' then 'dono'
    when 'entregue>concluido' then 'dono'
    else null
  end;
$$;

-- Valida a transição (status de origem esperado pela RPC + matriz + papel).
create or replace function private.os_checar_transicao(p_os public.ordem_servico, p_para text, p_origens text[])
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_regra text := private.os_regra_transicao(p_os.status, p_para);
begin
  if not (p_os.status = any (p_origens)) or v_regra is null then
    raise exception 'Transição não permitida: de % para %.', p_os.status, p_para using errcode = 'P0001';
  end if;
  if v_regra = 'dono' and not private.eh_dono() then
    raise exception 'Só o dono da oficina pode levar uma OS de % para %.', p_os.status, p_para
      using errcode = '42501';
  end if;
end;
$$;

create or replace function private.os_evento(p_os public.ordem_servico, p_acao text, p_dados jsonb)
returns void
language sql
volatile
security definer
set search_path = ''
as $$
  select private.registrar_evento(p_os.org_id, 'ordem_servico', p_os.id, p_acao,
    coalesce(p_dados, '{}'::jsonb) || jsonb_build_object('numero', p_os.numero));
$$;

create or replace function private.os_evento_transicao(p_os public.ordem_servico, p_para text, p_motivo text)
returns void
language sql
volatile
security definer
set search_path = ''
as $$
  select private.os_evento(p_os, 'transicionar',
    jsonb_strip_nulls(jsonb_build_object('de', p_os.status, 'para', p_para, 'motivo', p_motivo)));
$$;

-- Motivo obrigatório (3..500), normalizado.
create or replace function private.os_motivo(p_motivo text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v text := nullif(btrim(coalesce(p_motivo, '')), '');
begin
  if v is null or char_length(v) not between 3 and 500 then
    raise exception 'Informe o motivo (3 a 500 caracteres).' using errcode = 'P0001';
  end if;
  return v;
end;
$$;

-- Aditivo aberto = aditivo_atual > 0 ainda sem decisão do cliente.
create or replace function private.os_aditivo_aberto(p_os public.ordem_servico)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_os.aditivo_atual > 0 and not exists (
    select 1 from public.os_aprovacao a
    where a.org_id = p_os.org_id and a.os_id = p_os.id and a.aditivo_n = p_os.aditivo_atual
  );
$$;

-- Janela de edição de itens: devolve o aditivo_n editável ou erro.
--   orcamento                         -> 0
--   aprovado/em_execucao com aditivo aberto -> aditivo_atual
create or replace function private.os_janela_itens(p_os public.ordem_servico)
returns integer
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_os.status = 'orcamento' then
    return 0;
  end if;
  if p_os.status in ('aprovado', 'em_execucao') and private.os_aditivo_aberto(p_os) then
    return p_os.aditivo_atual;
  end if;
  raise exception 'Itens só podem ser alterados no orçamento ou em um aditivo aberto.' using errcode = 'P0001';
end;
$$;

-- Há itens aguardando decisão do cliente?
create or replace function private.os_tem_pendentes(p_org_id uuid, p_os_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.item_os i
    where i.org_id = p_org_id and i.os_id = p_os_id and i.ativo and i.situacao = 'pendente'
  );
$$;

-- Itens pendentes do aditivo k no formato congelado da versão (ordem estável).
create or replace function private.os_itens_snapshot(p_org_id uuid, p_os_id uuid, p_aditivo_n integer)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', i.id,
           'tipo', i.tipo,
           'item_catalogo_id', i.item_catalogo_id,
           'descricao', i.descricao,
           'quantidade', i.quantidade::text,
           'preco_unitario_centavos', i.preco_unitario_centavos,
           'desconto_centavos', i.desconto_centavos,
           'total_centavos', i.total_centavos,
           'condicao', i.condicao
         ) order by i.criado_em, i.id), '[]'::jsonb)
  from public.item_os i
  where i.org_id = p_org_id and i.os_id = p_os_id and i.ativo
    and i.situacao = 'pendente' and i.aditivo_n = p_aditivo_n;
$$;

-- Recalcula os totais da OS (itens ativos não recusados; e o aprovado).
create or replace function private.os_recalcular_totais(p_org_id uuid, p_os_id uuid)
returns void
language sql
volatile
security definer
set search_path = ''
as $$
  update public.ordem_servico o
     set total_servicos_centavos = t.servicos,
         total_pecas_centavos = t.pecas,
         total_terceiros_centavos = t.terceiros,
         total_centavos = t.servicos + t.pecas + t.terceiros,
         total_aprovado_centavos = t.aprovado
    from (
      select
        coalesce(sum(i.total_centavos) filter (where i.tipo = 'servico' and i.situacao <> 'recusado'), 0)::bigint as servicos,
        coalesce(sum(i.total_centavos) filter (where i.tipo = 'peca' and i.situacao <> 'recusado'), 0)::bigint as pecas,
        coalesce(sum(i.total_centavos) filter (where i.tipo = 'terceiro' and i.situacao <> 'recusado'), 0)::bigint as terceiros,
        coalesce(sum(i.total_centavos) filter (where i.situacao = 'aprovado'), 0)::bigint as aprovado
      from public.item_os i
      where i.org_id = p_org_id and i.os_id = p_os_id and i.ativo
    ) t
   where o.org_id = p_org_id and o.id = p_os_id
     and (o.total_servicos_centavos, o.total_pecas_centavos, o.total_terceiros_centavos, o.total_aprovado_centavos)
         is distinct from (t.servicos, t.pecas, t.terceiros, t.aprovado);
$$;

-- Baixa de estoque das peças APROVADAS ainda não baixadas (catálogo com
-- controle de estoque; peça do cliente não movimenta). Usa as funções de
-- estoque da A4 (trava do item). Grava o custo médio do momento em
-- movimento_estoque_custo e item_os_custo (se ainda sem custo informado).
-- Saldo pode ficar negativo (não trava a oficina; REGRAS §4).
create or replace function private.os_baixar_pecas(p_org_id uuid, p_os_id uuid)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_item record;
  v_mov uuid;
  v_custo bigint;
  v_n integer := 0;
begin
  for v_item in
    select i.id, i.item_catalogo_id, i.quantidade
    from public.item_os i
    join public.item_catalogo c on c.org_id = i.org_id and c.id = i.item_catalogo_id
    where i.org_id = p_org_id and i.os_id = p_os_id and i.ativo
      and i.tipo = 'peca' and i.situacao = 'aprovado' and i.baixa_movimento_id is null
      and i.condicao <> 'do_cliente'
      and c.tipo = 'peca' and c.controla_estoque
    order by i.criado_em, i.id
    for update of i
  loop
    perform private.estoque_travar_item(p_org_id, v_item.item_catalogo_id, false);

    insert into public.movimento_estoque (org_id, item_id, tipo, quantidade, os_id)
    values (p_org_id, v_item.item_catalogo_id, 'saida_os', -v_item.quantidade, p_os_id)
    returning id into v_mov;

    select c.custo_medio_centavos into v_custo
    from public.item_custo c
    where c.org_id = p_org_id and c.item_id = v_item.item_catalogo_id;

    if v_custo is not null then
      insert into public.movimento_estoque_custo (movimento_id, org_id, custo_unitario_centavos)
      values (v_mov, p_org_id, v_custo);
      insert into public.item_os_custo (item_os_id, org_id, custo_unitario_centavos)
      values (v_item.id, p_org_id, v_custo)
      on conflict (item_os_id) do nothing;
    end if;

    update public.item_os i
       set baixa_movimento_id = v_mov
     where i.org_id = p_org_id and i.id = v_item.id;
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$$;

-- Estorno de todas as saídas de estoque da OS ainda não estornadas
-- (private.estoque_estornar da A4: movimento inverso + custo).
create or replace function private.os_estornar_pecas(p_org_id uuid, p_os_id uuid, p_motivo text)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_mov uuid;
  v_n integer := 0;
begin
  for v_mov in
    select m.id
    from public.movimento_estoque m
    where m.org_id = p_org_id and m.os_id = p_os_id and m.tipo = 'saida_os'
      and not exists (select 1 from public.movimento_estoque e
                      where e.org_id = m.org_id and e.estorna_id = m.id)
    order by m.criado_em, m.id
  loop
    perform private.estoque_estornar(p_org_id, v_mov, p_motivo);
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$$;

-- -----------------------------------------------------------------------------
-- GANCHOS PARA O FINANCEIRO (tarefa C6). Hoje não fazem nada.
-- A C6 deve substituí-los (create or replace, MESMA assinatura) para:
--   os_gancho_entrega:      exigir saldo da OS quitado OU títulos a receber
--                           gerados (REGRAS §2 concluido -> entregue; §5);
--   os_gancho_cancelamento: bloquear se houver pagamento não estornado
--                           (REGRAS §2 em_execucao/concluido -> cancelado).
-- Devem lançar P0001 com mensagem pt-BR quando a regra não for atendida.
-- São chamados DENTRO da transação da RPC, com a OS travada (for update).
-- -----------------------------------------------------------------------------
create or replace function private.os_gancho_entrega(p_org_id uuid, p_os_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  -- C6: checagem de saldo/títulos a receber.
  return;
end;
$$;

create or replace function private.os_gancho_cancelamento(p_org_id uuid, p_os_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  -- C6: bloquear com pagamento não estornado.
  return;
end;
$$;

-- -----------------------------------------------------------------------------
-- (novo) -> orcamento
-- Cliente e veículo ativos da oficina; km_entrada >= km do veículo ou
-- justificativa; atualiza o km do veículo se maior. Número sequencial por
-- oficina (rollback devolve o número). Garantia/retrabalho exige OS de
-- origem do mesmo veículo; garantia fora do prazo só o dono abre.
-- -----------------------------------------------------------------------------
create or replace function public.os_criar_orcamento(
  p_cliente_id uuid,
  p_veiculo_id uuid,
  p_km_entrada integer,
  p_relato_cliente text default null,
  p_combustivel text default null,
  p_km_justificativa text default null,
  p_previsao_entrega timestamptz default null,
  p_responsavel_membro_id uuid default null,
  p_tipo text default 'normal',
  p_os_origem_id uuid default null,
  p_idempotency_key uuid default null
)
returns public.ordem_servico
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_org uuid := private.os_exigir('escrita');
  v_os public.ordem_servico;
  v_km_atual integer;
  v_origem record;
  v_tipo text := coalesce(p_tipo, 'normal');
  v_just text := nullif(btrim(coalesce(p_km_justificativa, '')), '');
  v_seq bigint;
  v_agora timestamptz := now();
begin
  if p_idempotency_key is not null then
    select * into v_os from public.ordem_servico o
    where o.org_id = v_org and o.idempotency_key = p_idempotency_key;
    if found then
      return v_os;
    end if;
  end if;

  if p_cliente_id is null or p_veiculo_id is null then
    raise exception 'Informe o cliente e o veículo.' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.cliente c where c.org_id = v_org and c.id = p_cliente_id and c.ativo) then
    raise exception 'Cliente não encontrado.' using errcode = 'P0001';
  end if;

  select v.km_atual into v_km_atual
  from public.veiculo v
  where v.org_id = v_org and v.id = p_veiculo_id and v.ativo
  for update;
  if not found then
    raise exception 'Veículo não encontrado.' using errcode = 'P0001';
  end if;

  if p_km_entrada is null or p_km_entrada < 0 then
    raise exception 'Informe o km de entrada.' using errcode = 'P0001';
  end if;
  if p_km_entrada < v_km_atual and (v_just is null or char_length(v_just) < 3) then
    raise exception 'Km de entrada (%) menor que o último km do veículo (%). Informe a justificativa.',
      p_km_entrada, v_km_atual using errcode = 'P0001';
  end if;

  if p_responsavel_membro_id is not null and not exists (
    select 1 from public.membro m where m.org_id = v_org and m.id = p_responsavel_membro_id and m.ativo
  ) then
    raise exception 'Responsável não encontrado.' using errcode = 'P0001';
  end if;

  if v_tipo not in ('normal', 'garantia', 'retrabalho') then
    raise exception 'Tipo de OS inválido.' using errcode = 'P0001';
  end if;
  if v_tipo = 'normal' then
    if p_os_origem_id is not null then
      raise exception 'OS normal não tem OS de origem.' using errcode = 'P0001';
    end if;
  else
    if p_os_origem_id is null then
      raise exception 'Informe a OS de origem da garantia/retrabalho.' using errcode = 'P0001';
    end if;
    select o.id, o.status, o.veiculo_id, o.garantia_ate into v_origem
    from public.ordem_servico o
    where o.org_id = v_org and o.id = p_os_origem_id;
    if not found then
      raise exception 'OS de origem não encontrada.' using errcode = 'P0001';
    end if;
    if v_origem.veiculo_id <> p_veiculo_id then
      raise exception 'A OS de origem é de outro veículo.' using errcode = 'P0001';
    end if;
    if v_tipo = 'garantia' then
      if v_origem.status <> 'entregue' then
        raise exception 'Garantia só para OS entregue.' using errcode = 'P0001';
      end if;
      -- Fora do prazo a UI avisa; só o dono abre (vício oculto conta da descoberta).
      if v_origem.garantia_ate < private.hoje_sp() and not private.eh_dono() then
        raise exception 'Garantia vencida. Só o dono pode abrir a garantia fora do prazo.' using errcode = '42501';
      end if;
    elsif v_origem.status not in ('concluido', 'entregue') then
      raise exception 'Retrabalho só para OS concluída ou entregue.' using errcode = 'P0001';
    end if;
  end if;

  -- Numeração: atômica por oficina; rollback devolve o número.
  v_seq := private.proximo_numero(v_org, 'os');

  insert into public.ordem_servico (
    org_id, numero_seq, numero, tipo, os_origem_id, cliente_id, veiculo_id,
    responsavel_membro_id, entrada_em, km_entrada, km_justificativa, combustivel,
    relato_cliente, previsao_entrega, idempotency_key, criado_por, criado_em
  ) values (
    v_org, v_seq, private.formatar_numero(v_seq, v_agora), v_tipo, p_os_origem_id, p_cliente_id, p_veiculo_id,
    p_responsavel_membro_id, v_agora, p_km_entrada,
    case when p_km_entrada < v_km_atual then v_just end,
    nullif(btrim(coalesce(p_combustivel, '')), ''),
    nullif(btrim(coalesce(p_relato_cliente, '')), ''),
    p_previsao_entrega, p_idempotency_key, auth.uid(), v_agora
  )
  returning * into v_os;

  if p_km_entrada > v_km_atual then
    update public.veiculo v set km_atual = p_km_entrada
     where v.org_id = v_org and v.id = p_veiculo_id;
  end if;

  perform private.os_evento(v_os, 'transicionar',
    jsonb_strip_nulls(jsonb_build_object('de', null, 'para', 'orcamento', 'tipo', v_tipo,
      'os_origem_id', p_os_origem_id)));
  return v_os;
end;
$$;

-- -----------------------------------------------------------------------------
-- Itens: só no orçamento (aditivo 0) ou num aditivo aberto; só item pendente.
-- p_item_id: null = novo; id existente = edição; id novo = uuid do cliente.
-- Item do catálogo: tipo vem do catálogo; descrição/preço padrão dele.
-- p_custo_unitario_centavos (opcional): grava o custo em item_os_custo
-- (quem não tem 'financeiro' digita mas não lê).
-- -----------------------------------------------------------------------------
create or replace function public.os_salvar_item(
  p_os_id uuid,
  p_item_id uuid default null,
  p_tipo text default null,
  p_descricao text default null,
  p_quantidade numeric default 1,
  p_preco_unitario_centavos bigint default null,
  p_desconto_centavos bigint default 0,
  p_item_catalogo_id uuid default null,
  p_condicao text default null,
  p_mecanico_membro_id uuid default null,
  p_custo_unitario_centavos bigint default null,
  p_item_versao integer default null
)
returns public.item_os
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_org uuid := private.os_exigir('escrita');
  v_os public.ordem_servico;
  v_k integer;
  v_item public.item_os;
  v_existe boolean := false;
  v_cat record;
  v_tipo text := nullif(btrim(coalesce(p_tipo, '')), '');
  v_desc text := nullif(btrim(coalesce(p_descricao, '')), '');
  v_preco bigint := p_preco_unitario_centavos;
  v_cond text := nullif(btrim(coalesce(p_condicao, '')), '');
  v_desconto bigint := coalesce(p_desconto_centavos, 0);
begin
  v_os := private.os_travar(v_org, p_os_id, null);
  v_k := private.os_janela_itens(v_os);

  if p_item_id is not null then
    select * into v_item from public.item_os i
    where i.org_id = v_org and i.id = p_item_id
    for update;
    v_existe := found;
    if not v_existe and exists (select 1 from public.item_os i where i.id = p_item_id) then
      raise exception 'Item não encontrado.' using errcode = 'P0001';
    end if;
  end if;

  if v_existe then
    if v_item.os_id <> p_os_id or not v_item.ativo then
      raise exception 'Item não encontrado.' using errcode = 'P0001';
    end if;
    if v_item.situacao <> 'pendente' then
      raise exception 'Item % não pode ser alterado. Mudanças entram como aditivo.',
        case when v_item.situacao = 'aprovado' then 'aprovado' else 'recusado' end using errcode = 'P0001';
    end if;
    if v_item.aditivo_n <> v_k then
      raise exception 'Este item pertence a outra etapa da OS e não pode ser alterado agora.' using errcode = 'P0001';
    end if;
    if p_item_versao is not null and v_item.versao <> p_item_versao then
      raise exception 'Alterado por outra pessoa. Recarregue.' using errcode = 'P0001';
    end if;
  end if;

  if p_item_catalogo_id is not null then
    select c.tipo, c.descricao, c.preco_venda_centavos into v_cat
    from public.item_catalogo c
    where c.org_id = v_org and c.id = p_item_catalogo_id and c.ativo;
    if not found then
      raise exception 'Item do catálogo não encontrado ou inativo.' using errcode = 'P0001';
    end if;
    if v_tipo is not null and v_tipo <> v_cat.tipo then
      raise exception 'Tipo do item diferente do catálogo.' using errcode = 'P0001';
    end if;
    v_tipo := v_cat.tipo;
    v_desc := coalesce(v_desc, v_cat.descricao);
    v_preco := coalesce(v_preco, v_cat.preco_venda_centavos);
  end if;

  if v_tipo is null or v_tipo not in ('servico', 'peca', 'terceiro') then
    raise exception 'Informe o tipo do item (serviço, peça ou terceiro).' using errcode = 'P0001';
  end if;
  if v_desc is null or char_length(v_desc) > 300 then
    raise exception 'Informe a descrição do item (até 300 caracteres).' using errcode = 'P0001';
  end if;
  if p_quantidade is null or p_quantidade <= 0 or p_quantidade <> round(p_quantidade, 3)
     or p_quantidade > 1000000 then
    raise exception 'Quantidade inválida: maior que zero, até 3 casas decimais.' using errcode = 'P0001';
  end if;
  if v_preco is null or v_preco < 0 then
    raise exception 'Informe o valor unitário (zero ou mais).' using errcode = 'P0001';
  end if;
  if v_desconto < 0 or v_desconto > round(p_quantidade * v_preco) then
    raise exception 'Desconto inválido: entre zero e o valor do item.' using errcode = 'P0001';
  end if;
  if v_tipo = 'peca' then
    v_cond := coalesce(v_cond, 'nova_original');
  else
    v_cond := null;
  end if;
  if p_mecanico_membro_id is not null and not exists (
    select 1 from public.membro m where m.org_id = v_org and m.id = p_mecanico_membro_id and m.ativo
  ) then
    raise exception 'Mecânico não encontrado.' using errcode = 'P0001';
  end if;
  if p_custo_unitario_centavos is not null and p_custo_unitario_centavos < 0 then
    raise exception 'Custo inválido.' using errcode = 'P0001';
  end if;

  if v_existe then
    update public.item_os i
       set tipo = v_tipo, item_catalogo_id = p_item_catalogo_id, descricao = v_desc,
           quantidade = p_quantidade, preco_unitario_centavos = v_preco, desconto_centavos = v_desconto,
           condicao = v_cond, mecanico_membro_id = p_mecanico_membro_id
     where i.org_id = v_org and i.id = v_item.id
    returning * into v_item;
  else
    insert into public.item_os (
      id, org_id, os_id, tipo, item_catalogo_id, descricao, quantidade, preco_unitario_centavos,
      desconto_centavos, condicao, aditivo_n, mecanico_membro_id, criado_por
    ) values (
      coalesce(p_item_id, gen_random_uuid()), v_org, p_os_id, v_tipo, p_item_catalogo_id, v_desc, p_quantidade,
      v_preco, v_desconto, v_cond, v_k, p_mecanico_membro_id, auth.uid()
    )
    returning * into v_item;
  end if;

  if p_custo_unitario_centavos is not null then
    insert into public.item_os_custo (item_os_id, org_id, custo_unitario_centavos)
    values (v_item.id, v_org, p_custo_unitario_centavos)
    on conflict (item_os_id) do update
      set custo_unitario_centavos = excluded.custo_unitario_centavos, atualizado_em = now();
  end if;

  perform private.os_recalcular_totais(v_org, p_os_id);
  perform private.os_evento(v_os, case when v_existe then 'alterar_item' else 'incluir_item' end,
    jsonb_build_object('item_id', v_item.id, 'tipo', v_item.tipo, 'descricao', v_item.descricao,
      'quantidade', v_item.quantidade::text, 'total_centavos', v_item.total_centavos, 'aditivo_n', v_item.aditivo_n));
  return v_item;
end;
$$;

-- Remoção lógica de item pendente (mesma janela de edição).
create or replace function public.os_remover_item(p_item_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_org uuid := private.os_exigir('escrita');
  v_item public.item_os;
  v_os public.ordem_servico;
  v_k integer;
begin
  select * into v_item from public.item_os i where i.org_id = v_org and i.id = p_item_id;
  if not found or not v_item.ativo then
    raise exception 'Item não encontrado.' using errcode = 'P0001';
  end if;
  v_os := private.os_travar(v_org, v_item.os_id, null);
  if v_item.situacao <> 'pendente' then
    raise exception 'Item % não pode ser alterado nem removido. Mudanças entram como aditivo.',
      case when v_item.situacao = 'aprovado' then 'aprovado' else 'recusado' end using errcode = 'P0001';
  end if;
  v_k := private.os_janela_itens(v_os);
  if v_item.aditivo_n <> v_k then
    raise exception 'Este item pertence a outra etapa da OS e não pode ser removido agora.' using errcode = 'P0001';
  end if;

  update public.item_os i set ativo = false where i.org_id = v_org and i.id = p_item_id;
  perform private.os_recalcular_totais(v_org, v_item.os_id);
  perform private.os_evento(v_os, 'remover_item',
    jsonb_build_object('item_id', v_item.id, 'descricao', v_item.descricao, 'aditivo_n', v_item.aditivo_n));
end;
$$;

-- -----------------------------------------------------------------------------
-- Gerar versão: congela os itens pendentes da etapa aberta (orçamento ou
-- aditivo), totais, condições e validade (oficina_config.validade_orcamento_dias,
-- padrão 10). Mudou item depois? A versão não serve mais para aprovação.
-- -----------------------------------------------------------------------------
create or replace function public.os_gerar_versao(
  p_os_id uuid,
  p_versao integer,
  p_condicoes_pagamento text default null,
  p_observacao text default null
)
returns public.os_versao
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_org uuid := private.os_exigir('escrita');
  v_os public.ordem_servico;
  v_k integer;
  v_itens jsonb;
  v_dias integer;
  v_validade date;
  v_numero integer;
  v_snapshot jsonb;
  v_total bigint;
  v_servicos bigint;
  v_pecas bigint;
  v_terceiros bigint;
  v_cond text := nullif(btrim(coalesce(p_condicoes_pagamento, '')), '');
  v_obs text := nullif(btrim(coalesce(p_observacao, '')), '');
  v_versao public.os_versao;
begin
  v_os := private.os_travar(v_org, p_os_id, p_versao);
  v_k := private.os_janela_itens(v_os);
  if char_length(coalesce(v_cond, '')) > 1000 or char_length(coalesce(v_obs, '')) > 2000 then
    raise exception 'Condições (até 1000) ou observação (até 2000 caracteres) muito longas.' using errcode = 'P0001';
  end if;

  v_itens := private.os_itens_snapshot(v_org, p_os_id, v_k);
  if jsonb_array_length(v_itens) = 0 then
    raise exception 'Inclua ao menos um item antes de gerar a versão.' using errcode = 'P0001';
  end if;

  select
    coalesce(sum((e ->> 'total_centavos')::bigint) filter (where e ->> 'tipo' = 'servico'), 0),
    coalesce(sum((e ->> 'total_centavos')::bigint) filter (where e ->> 'tipo' = 'peca'), 0),
    coalesce(sum((e ->> 'total_centavos')::bigint) filter (where e ->> 'tipo' = 'terceiro'), 0)
    into v_servicos, v_pecas, v_terceiros
  from jsonb_array_elements(v_itens) as e;
  v_total := v_servicos + v_pecas + v_terceiros;

  select c.validade_orcamento_dias into v_dias from public.oficina_config c where c.org_id = v_org;
  v_validade := private.hoje_sp() + coalesce(v_dias, 10);

  select coalesce(max(vv.numero), 0) + 1 into v_numero
  from public.os_versao vv where vv.org_id = v_org and vv.os_id = p_os_id;

  -- CDC art. 40: discrimina mão de obra (serviços), peças e terceiros,
  -- condições de pagamento, previsão e validade. Aditivo com serviço de
  -- terceiro não previsto: art. 40 §3º [VERIFICAR texto / JUR].
  v_snapshot := jsonb_build_object(
    'os_id', p_os_id,
    'numero_os', v_os.numero,
    'versao', v_numero,
    'tipo', case when v_k = 0 then 'orcamento' else 'aditivo' end,
    'aditivo_n', v_k,
    'cliente_id', v_os.cliente_id,
    'veiculo_id', v_os.veiculo_id,
    'km_entrada', v_os.km_entrada,
    'previsao_entrega', v_os.previsao_entrega,
    'data_versao', private.hoje_sp(),
    'validade_ate', v_validade,
    'condicoes_pagamento', v_cond,
    'observacao', v_obs,
    'itens', v_itens,
    'total_servicos_centavos', v_servicos,
    'total_pecas_centavos', v_pecas,
    'total_terceiros_centavos', v_terceiros,
    'total_centavos', v_total
  );

  insert into public.os_versao (org_id, os_id, numero, tipo, aditivo_n, snapshot, hash, total_centavos,
                                validade_ate, criado_por)
  values (v_org, p_os_id, v_numero, case when v_k = 0 then 'orcamento' else 'aditivo' end, v_k, v_snapshot,
          encode(sha256(convert_to(v_snapshot::text, 'UTF8')), 'hex'), v_total, v_validade, auth.uid())
  returning * into v_versao;

  update public.ordem_servico o set validade_ate = v_validade where o.org_id = v_org and o.id = p_os_id;

  perform private.os_evento(v_os, 'gerar_versao',
    jsonb_build_object('versao_id', v_versao.id, 'versao', v_numero, 'aditivo_n', v_k,
      'total_centavos', v_total, 'hash', v_versao.hash, 'validade_ate', v_validade));
  return v_versao;
end;
$$;

-- -----------------------------------------------------------------------------
-- Registrar aprovação (orcamento -> aprovado | cancelado por recusa; ou
-- decisão de um aditivo). Exige: versão mais recente da etapa aberta, não
-- vencida, com itens iguais aos atuais; prova; >= 1 item aprovado (total ou
-- parcial); autorização expressa para peça não nova/não original (art. 21).
-- Aditivo aprovado com a OS em execução baixa as peças na hora.
-- -----------------------------------------------------------------------------
create or replace function public.os_registrar_aprovacao(
  p_os_id uuid,
  p_versao integer,
  p_versao_id uuid,
  p_decisao text,
  p_canal text,
  p_aprovador_nome text,
  p_aprovador_relacao text,
  p_prova text,
  p_itens_aprovados uuid[] default null,
  p_autorizacao_condicao boolean default false,
  p_aprovado_em timestamptz default null,
  p_termo_texto text default null,
  p_evidencia_path text default null
)
returns public.ordem_servico
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_org uuid := private.os_exigir('escrita');
  v_os public.ordem_servico;
  v_k integer;
  v_v public.os_versao;
  v_ids uuid[];
  v_aprovados uuid[];
  v_total bigint;
  v_em timestamptz := coalesce(p_aprovado_em, now());
  v_nome text := nullif(btrim(coalesce(p_aprovador_nome, '')), '');
  v_prova text := nullif(btrim(coalesce(p_prova, '')), '');
  v_aut boolean := coalesce(p_autorizacao_condicao, false);
  v_aprovacao_id uuid;
begin
  v_os := private.os_travar(v_org, p_os_id, p_versao);
  v_k := private.os_janela_itens(v_os);

  select * into v_v from public.os_versao vv
  where vv.org_id = v_org and vv.id = p_versao_id and vv.os_id = p_os_id;
  if not found then
    raise exception 'Versão não encontrada.' using errcode = 'P0001';
  end if;
  if v_v.aditivo_n <> v_k or exists (
    select 1 from public.os_versao n
    where n.org_id = v_org and n.os_id = p_os_id and n.aditivo_n = v_k and n.numero > v_v.numero
  ) then
    raise exception 'Esta não é a versão vigente. Use a versão mais recente.' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.os_aprovacao a where a.org_id = v_org and a.versao_id = v_v.id) then
    raise exception 'Esta versão já tem decisão registrada.' using errcode = 'P0001';
  end if;
  if v_v.validade_ate < private.hoje_sp() then
    raise exception 'Esta versão venceu em %. Gere uma nova versão.', to_char(v_v.validade_ate, 'DD/MM/YYYY')
      using errcode = 'P0001';
  end if;
  if (v_v.snapshot -> 'itens') is distinct from private.os_itens_snapshot(v_org, p_os_id, v_k) then
    raise exception 'Os itens mudaram depois desta versão. Gere uma nova versão.' using errcode = 'P0001';
  end if;

  if p_decisao is null or p_decisao not in ('total', 'parcial', 'recusa') then
    raise exception 'Decisão inválida (total, parcial ou recusa).' using errcode = 'P0001';
  end if;
  if p_canal is null or p_canal not in ('presencial', 'whatsapp', 'telefone', 'email', 'link') then
    raise exception 'Canal da aprovação inválido.' using errcode = 'P0001';
  end if;
  if p_aprovador_relacao is null
     or p_aprovador_relacao not in ('proprietario', 'condutor', 'responsavel_pj', 'outro') then
    raise exception 'Informe a relação de quem decidiu com o veículo.' using errcode = 'P0001';
  end if;
  if v_nome is null or char_length(v_nome) > 200 then
    raise exception 'Informe o nome de quem aprovou.' using errcode = 'P0001';
  end if;
  if v_prova is null or char_length(v_prova) not between 3 and 2000 then
    raise exception 'Registre a prova/observação da decisão (3 a 2000 caracteres).' using errcode = 'P0001';
  end if;
  if v_em > now() + interval '5 minutes' or v_em < v_v.criado_em - interval '5 minutes' then
    raise exception 'Data da aprovação inválida (entre a versão e agora).' using errcode = 'P0001';
  end if;

  select array_agg((e ->> 'id')::uuid) into v_ids from jsonb_array_elements(v_v.snapshot -> 'itens') as e;

  if p_decisao = 'total' then
    v_aprovados := v_ids;
  elsif p_decisao = 'recusa' then
    v_aprovados := '{}'::uuid[];
  else
    select coalesce(array_agg(distinct x), '{}'::uuid[]) into v_aprovados
    from unnest(coalesce(p_itens_aprovados, '{}'::uuid[])) as x;
    if cardinality(v_aprovados) = 0 then
      raise exception 'Aprovação parcial: marque ao menos um item aprovado.' using errcode = 'P0001';
    end if;
    if not (v_aprovados <@ v_ids) then
      raise exception 'Item aprovado não pertence a esta versão.' using errcode = 'P0001';
    end if;
  end if;

  -- CDC art. 21: peça não nova/não original exige autorização expressa.
  if not v_aut and exists (
    select 1 from public.item_os i
    where i.org_id = v_org and i.id = any (v_aprovados) and i.tipo = 'peca' and i.condicao <> 'nova_original'
  ) then
    raise exception 'Peça usada, paralela, recondicionada ou do cliente exige autorização expressa do cliente.'
      using errcode = 'P0001';
  end if;

  select coalesce(sum(i.total_centavos), 0) into v_total
  from public.item_os i where i.org_id = v_org and i.id = any (v_aprovados);

  insert into public.os_aprovacao (
    org_id, os_id, versao_id, aditivo_n, decisao, itens_aprovados, total_aprovado_centavos, canal,
    aprovador_nome, aprovador_relacao, prova, evidencia_path, termo_texto, autorizacao_condicao,
    aprovado_em, registrado_por
  ) values (
    v_org, p_os_id, v_v.id, v_k, p_decisao, v_aprovados, v_total, p_canal,
    v_nome, p_aprovador_relacao, v_prova, nullif(btrim(coalesce(p_evidencia_path, '')), ''),
    nullif(btrim(coalesce(p_termo_texto, '')), ''), v_aut, v_em, auth.uid()
  )
  returning id into v_aprovacao_id;

  update public.item_os i
     set situacao = case when i.id = any (v_aprovados) then 'aprovado' else 'recusado' end,
         autorizacao_condicao = (i.id = any (v_aprovados) and v_aut and i.tipo = 'peca'
                                 and i.condicao <> 'nova_original')
   where i.org_id = v_org and i.id = any (v_ids);

  perform private.os_evento(v_os, 'registrar_aprovacao',
    jsonb_build_object('aprovacao_id', v_aprovacao_id, 'versao_id', v_v.id, 'versao', v_v.numero,
      'aditivo_n', v_k, 'decisao', p_decisao, 'canal', p_canal, 'total_aprovado_centavos', v_total));

  if v_k = 0 then
    if p_decisao = 'recusa' then
      perform private.os_checar_transicao(v_os, 'cancelado', array['orcamento']);
      update public.ordem_servico o
         set status = 'cancelado', motivo_cancelamento = 'Recusado pelo cliente', cancelado_em = now()
       where o.org_id = v_org and o.id = p_os_id;
      perform private.os_evento_transicao(v_os, 'cancelado', 'Recusado pelo cliente');
    else
      perform private.os_checar_transicao(v_os, 'aprovado', array['orcamento']);
      update public.ordem_servico o set status = 'aprovado' where o.org_id = v_org and o.id = p_os_id;
      perform private.os_evento_transicao(v_os, 'aprovado', null);
    end if;
  elsif v_os.status = 'em_execucao' and p_decisao <> 'recusa' then
    perform private.os_baixar_pecas(v_org, p_os_id);
  end if;

  perform private.os_recalcular_totais(v_org, p_os_id);
  select * into v_os from public.ordem_servico o where o.org_id = v_org and o.id = p_os_id;
  return v_os;
end;
$$;

-- -----------------------------------------------------------------------------
-- aprovado -> em_execucao: CDC art. 39 VI (sem aprovação não executa);
-- nenhum item pendente (aditivo exige nova aprovação antes de executar);
-- baixa de estoque das peças aprovadas.
-- -----------------------------------------------------------------------------
create or replace function public.os_iniciar_execucao(p_os_id uuid, p_versao integer)
returns public.ordem_servico
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_org uuid := private.os_exigir('escrita');
  v_os public.ordem_servico;
  v_n integer;
begin
  v_os := private.os_travar(v_org, p_os_id, p_versao);
  if v_os.status = 'orcamento' then
    raise exception 'Sem aprovação registrada do cliente a OS não pode entrar em execução.' using errcode = 'P0001';
  end if;
  perform private.os_checar_transicao(v_os, 'em_execucao', array['aprovado']);
  if not exists (
    select 1 from public.os_aprovacao a
    where a.org_id = v_org and a.os_id = p_os_id and a.aditivo_n = 0 and a.decisao <> 'recusa'
  ) then
    raise exception 'Sem aprovação registrada do cliente a OS não pode entrar em execução.' using errcode = 'P0001';
  end if;
  if private.os_tem_pendentes(v_org, p_os_id) then
    raise exception 'Há itens de aditivo aguardando aprovação do cliente.' using errcode = 'P0001';
  end if;
  if exists (
    select 1 from public.item_os i
    where i.org_id = v_org and i.os_id = p_os_id and i.ativo and i.situacao = 'aprovado'
      and i.tipo = 'peca' and i.condicao <> 'nova_original' and not i.autorizacao_condicao
  ) then
    raise exception 'Peça não nova/não original sem autorização expressa do cliente.' using errcode = 'P0001';
  end if;

  v_n := private.os_baixar_pecas(v_org, p_os_id);
  update public.ordem_servico o set status = 'em_execucao' where o.org_id = v_org and o.id = p_os_id
  returning * into v_os;
  perform private.os_evento(v_os, 'transicionar',
    jsonb_build_object('de', 'aprovado', 'para', 'em_execucao', 'pecas_baixadas', v_n));
  return v_os;
end;
$$;

-- -----------------------------------------------------------------------------
-- Aditivo (aprovado/em_execucao): abre a etapa k = aditivo_atual + 1. Novos
-- itens entram com aditivo_n = k, geram versão tipo 'aditivo' e exigem nova
-- aprovação (CDC art. 40 §2º; o aprovado antes não muda). Serviço de
-- terceiro não previsto deve ir como aditivo: art. 40 §3º [JUR - validar].
-- -----------------------------------------------------------------------------
create or replace function public.os_criar_aditivo(p_os_id uuid, p_versao integer)
returns public.ordem_servico
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_org uuid := private.os_exigir('escrita');
  v_os public.ordem_servico;
begin
  v_os := private.os_travar(v_org, p_os_id, p_versao);
  if v_os.status not in ('aprovado', 'em_execucao') then
    raise exception 'Aditivo só em OS aprovada ou em execução.' using errcode = 'P0001';
  end if;
  if private.os_aditivo_aberto(v_os) then
    raise exception 'Já existe um aditivo aberto (nº %).', v_os.aditivo_atual using errcode = 'P0001';
  end if;
  update public.ordem_servico o set aditivo_atual = o.aditivo_atual + 1
   where o.org_id = v_org and o.id = p_os_id
  returning * into v_os;
  perform private.os_evento(v_os, 'criar_aditivo', jsonb_build_object('aditivo_n', v_os.aditivo_atual));
  return v_os;
end;
$$;

-- em_execucao -> concluido: nenhum aditivo pendente de decisão.
create or replace function public.os_concluir(p_os_id uuid, p_versao integer)
returns public.ordem_servico
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_org uuid := private.os_exigir('escrita');
  v_os public.ordem_servico;
begin
  v_os := private.os_travar(v_org, p_os_id, p_versao);
  perform private.os_checar_transicao(v_os, 'concluido', array['em_execucao']);
  if private.os_tem_pendentes(v_org, p_os_id) then
    raise exception 'Há aditivo pendente de decisão do cliente.' using errcode = 'P0001';
  end if;
  perform private.os_evento_transicao(v_os, 'concluido', null);
  update public.ordem_servico o set status = 'concluido' where o.org_id = v_org and o.id = p_os_id
  returning * into v_os;
  return v_os;
end;
$$;

-- concluido -> em_execucao: retrabalho interno, motivo obrigatório.
create or replace function public.os_retomar_execucao(p_os_id uuid, p_versao integer, p_motivo text)
returns public.ordem_servico
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_org uuid := private.os_exigir('escrita');
  v_os public.ordem_servico;
  v_motivo text;
begin
  v_os := private.os_travar(v_org, p_os_id, p_versao);
  perform private.os_checar_transicao(v_os, 'em_execucao', array['concluido']);
  v_motivo := private.os_motivo(p_motivo);
  perform private.os_evento_transicao(v_os, 'em_execucao', v_motivo);
  update public.ordem_servico o set status = 'em_execucao' where o.org_id = v_org and o.id = p_os_id
  returning * into v_os;
  return v_os;
end;
$$;

-- -----------------------------------------------------------------------------
-- concluido -> entregue: grava data_entrega e garantia_ate = data da entrega
-- (SP) + garantia_dias da oficina (nunca < 90; CDC art. 26 II) [JUR].
-- GANCHO C6: private.os_gancho_entrega (saldo quitado ou títulos gerados).
-- -----------------------------------------------------------------------------
create or replace function public.os_entregar(p_os_id uuid, p_versao integer, p_pecas_devolvidas boolean default null)
returns public.ordem_servico
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_org uuid := private.os_exigir('escrita');
  v_os public.ordem_servico;
  v_dias integer;
  v_agora timestamptz := now();
begin
  v_os := private.os_travar(v_org, p_os_id, p_versao);
  perform private.os_checar_transicao(v_os, 'entregue', array['concluido']);
  perform private.os_gancho_entrega(v_org, p_os_id);

  select c.garantia_dias into v_dias from public.oficina_config c where c.org_id = v_org;
  v_dias := greatest(coalesce(v_dias, 90), 90);

  perform private.os_evento_transicao(v_os, 'entregue', null);
  update public.ordem_servico o
     set status = 'entregue',
         data_entrega = v_agora,
         garantia_ate = (v_agora at time zone 'America/Sao_Paulo')::date + v_dias,
         pecas_devolvidas = p_pecas_devolvidas
   where o.org_id = v_org and o.id = p_os_id
  returning * into v_os;
  return v_os;
end;
$$;

-- -----------------------------------------------------------------------------
-- Cancelar com motivo. orcamento/aprovado: escrita. em_execucao/concluido:
-- só dono, com estorno automático do estoque baixado. entregue: ninguém
-- (reabrir + estornos). GANCHO C6: private.os_gancho_cancelamento.
-- -----------------------------------------------------------------------------
create or replace function public.os_cancelar(p_os_id uuid, p_versao integer, p_motivo text)
returns public.ordem_servico
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_org uuid := private.os_exigir('escrita');
  v_os public.ordem_servico;
  v_motivo text;
  v_n integer;
begin
  v_os := private.os_travar(v_org, p_os_id, p_versao);
  if v_os.status = 'entregue' then
    raise exception 'OS entregue não pode ser cancelada. Reabra a OS e faça os estornos.' using errcode = 'P0001';
  end if;
  perform private.os_checar_transicao(v_os, 'cancelado',
    array['orcamento', 'aprovado', 'em_execucao', 'concluido']);
  v_motivo := private.os_motivo(p_motivo);
  perform private.os_gancho_cancelamento(v_org, p_os_id);

  v_n := private.os_estornar_pecas(v_org, p_os_id,
    btrim(left('Cancelamento da OS ' || v_os.numero || ': ' || v_motivo, 500)));

  perform private.os_evento(v_os, 'transicionar',
    jsonb_build_object('de', v_os.status, 'para', 'cancelado', 'motivo', v_motivo, 'pecas_estornadas', v_n));
  update public.ordem_servico o
     set status = 'cancelado', motivo_cancelamento = v_motivo, cancelado_em = now()
   where o.org_id = v_org and o.id = p_os_id
  returning * into v_os;
  return v_os;
end;
$$;

-- entregue -> concluido (reabrir): só dono, motivo. Limpa entrega/garantia
-- (recalculadas na nova entrega; o histórico fica no evento). Não apaga
-- pagamentos (C6).
create or replace function public.os_reabrir(p_os_id uuid, p_versao integer, p_motivo text)
returns public.ordem_servico
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_org uuid := private.os_exigir('escrita');
  v_os public.ordem_servico;
  v_motivo text;
begin
  v_os := private.os_travar(v_org, p_os_id, p_versao);
  perform private.os_checar_transicao(v_os, 'concluido', array['entregue']);
  v_motivo := private.os_motivo(p_motivo);
  perform private.os_evento(v_os, 'transicionar',
    jsonb_build_object('de', 'entregue', 'para', 'concluido', 'motivo', v_motivo,
      'data_entrega_anterior', v_os.data_entrega, 'garantia_ate_anterior', v_os.garantia_ate));
  update public.ordem_servico o
     set status = 'concluido', data_entrega = null, garantia_ate = null
   where o.org_id = v_org and o.id = p_os_id
  returning * into v_os;
  return v_os;
end;
$$;

-- -----------------------------------------------------------------------------
-- Privilégios.
-- -----------------------------------------------------------------------------
revoke all on function private.os_exigir(text) from public, anon, authenticated;
revoke all on function private.hoje_sp() from public, anon, authenticated;
revoke all on function private.os_travar(uuid, uuid, integer) from public, anon, authenticated;
revoke all on function private.os_regra_transicao(text, text) from public, anon, authenticated;
revoke all on function private.os_checar_transicao(public.ordem_servico, text, text[]) from public, anon, authenticated;
revoke all on function private.os_evento(public.ordem_servico, text, jsonb) from public, anon, authenticated;
revoke all on function private.os_evento_transicao(public.ordem_servico, text, text) from public, anon, authenticated;
revoke all on function private.os_motivo(text) from public, anon, authenticated;
revoke all on function private.os_aditivo_aberto(public.ordem_servico) from public, anon, authenticated;
revoke all on function private.os_janela_itens(public.ordem_servico) from public, anon, authenticated;
revoke all on function private.os_tem_pendentes(uuid, uuid) from public, anon, authenticated;
revoke all on function private.os_itens_snapshot(uuid, uuid, integer) from public, anon, authenticated;
revoke all on function private.os_recalcular_totais(uuid, uuid) from public, anon, authenticated;
revoke all on function private.os_baixar_pecas(uuid, uuid) from public, anon, authenticated;
revoke all on function private.os_estornar_pecas(uuid, uuid, text) from public, anon, authenticated;
revoke all on function private.os_gancho_entrega(uuid, uuid) from public, anon, authenticated;
revoke all on function private.os_gancho_cancelamento(uuid, uuid) from public, anon, authenticated;

revoke all on function public.os_criar_orcamento(uuid, uuid, integer, text, text, text, timestamptz, uuid, text, uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.os_salvar_item(uuid, uuid, text, text, numeric, bigint, bigint, uuid, text, uuid, bigint, integer)
  from public, anon, authenticated;
revoke all on function public.os_remover_item(uuid) from public, anon, authenticated;
revoke all on function public.os_gerar_versao(uuid, integer, text, text) from public, anon, authenticated;
revoke all on function public.os_registrar_aprovacao(uuid, integer, uuid, text, text, text, text, text, uuid[], boolean,
  timestamptz, text, text) from public, anon, authenticated;
revoke all on function public.os_iniciar_execucao(uuid, integer) from public, anon, authenticated;
revoke all on function public.os_criar_aditivo(uuid, integer) from public, anon, authenticated;
revoke all on function public.os_concluir(uuid, integer) from public, anon, authenticated;
revoke all on function public.os_retomar_execucao(uuid, integer, text) from public, anon, authenticated;
revoke all on function public.os_entregar(uuid, integer, boolean) from public, anon, authenticated;
revoke all on function public.os_cancelar(uuid, integer, text) from public, anon, authenticated;
revoke all on function public.os_reabrir(uuid, integer, text) from public, anon, authenticated;

grant execute on function public.os_criar_orcamento(uuid, uuid, integer, text, text, text, timestamptz, uuid, text, uuid, uuid)
  to authenticated;
grant execute on function public.os_salvar_item(uuid, uuid, text, text, numeric, bigint, bigint, uuid, text, uuid, bigint, integer)
  to authenticated;
grant execute on function public.os_remover_item(uuid) to authenticated;
grant execute on function public.os_gerar_versao(uuid, integer, text, text) to authenticated;
grant execute on function public.os_registrar_aprovacao(uuid, integer, uuid, text, text, text, text, text, uuid[], boolean,
  timestamptz, text, text) to authenticated;
grant execute on function public.os_iniciar_execucao(uuid, integer) to authenticated;
grant execute on function public.os_criar_aditivo(uuid, integer) to authenticated;
grant execute on function public.os_concluir(uuid, integer) to authenticated;
grant execute on function public.os_retomar_execucao(uuid, integer, text) to authenticated;
grant execute on function public.os_entregar(uuid, integer, boolean) to authenticated;
grant execute on function public.os_cancelar(uuid, integer, text) to authenticated;
grant execute on function public.os_reabrir(uuid, integer, text) to authenticated;
