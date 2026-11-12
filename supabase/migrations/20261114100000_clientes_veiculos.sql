-- =============================================================================
-- Clientes e veículos (Onda A3): tabelas, busca sem acento (trigram), RLS,
-- grants por coluna, versão otimista, auditoria e RPC transferir_veiculo.
-- Depende de: núcleo (organizacao, private.pode/org_do_usuario) e comum
-- (private.texto_busca, trg_versao, trg_auditar, registrar_evento, evento).
-- Idempotente: create ... if not exists / or replace; drop ... if exists + create.
--
-- Permissões (áreas): cliente => 'clientes'; veiculo => 'veiculos'.
-- A dependência "ordens => leitura de clientes e veículos" NÃO é feita aqui:
-- vive em private.dependencias_permissao() e é gravada como linhas de
-- membro_permissao por definir_permissoes/aceitar_convite. As policies só
-- consultam private.pode(area, nivel).
-- Sem DELETE: remoção lógica via ativo = false.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- cliente
-- -----------------------------------------------------------------------------
create table if not exists public.cliente (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizacao (id),
  nome text not null check (char_length(btrim(nome)) between 1 and 200),
  -- CPF/CNPJ só dígitos (o app normaliza; o banco repete a regra).
  documento text check (documento is null or documento ~ '^([0-9]{11}|[0-9]{14})$'),
  -- DDD + número, só dígitos.
  telefone text check (telefone is null or telefone ~ '^[0-9]{10,11}$'),
  email text check (
    email is null
    or (email = lower(btrim(email)) and position('@' in email) > 1 and char_length(email) <= 254)
  ),
  endereco text check (endereco is null or char_length(endereco) <= 500),
  observacoes text check (observacoes is null or char_length(observacoes) <= 2000),
  ativo boolean not null default true,
  -- Coluna de busca: sem acento, minúscula, nome + telefone. Mantida pelo
  -- trigger cliente_a_busca (nunca recebe GRANT de escrita). Não é coluna
  -- gerada de propósito: private.trg_versao compara to_jsonb(new) com
  -- to_jsonb(old) e uma coluna gerada ainda não existe no BEFORE trigger
  -- (todo UPDATE "sem mudança" subiria a versão). Consulta:
  -- busca ilike '%termo%', com o termo já sem acento (o app faz isso).
  busca text not null default '',
  versao integer not null default 1,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  -- alvo da FK composta de veiculo (garante mesma oficina)
  constraint cliente_org_id_id_key unique (org_id, id)
);

-- Lista paginada ordenada por nome (filtro ativo).
create index if not exists cliente_org_id_ativo_nome_idx
  on public.cliente (org_id, ativo, nome);
-- Exceção à regra "índice começa por org_id": GIN trigram não indexa uuid sem
-- btree_gin (extensão nova). O isolamento por oficina é feito pela RLS/filtro;
-- o trigram só acelera o ilike '%termo%'.
create index if not exists cliente_busca_trgm_idx
  on public.cliente using gin (busca extensions.gin_trgm_ops);

-- Triggers BEFORE disparam em ordem alfabética: *_a_busca antes de *_versao,
-- então a versão já compara a busca recalculada.
create or replace function private.trg_cliente_busca()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.busca := private.texto_busca(new.nome || ' ' || coalesce(new.telefone, ''));
  return new;
end;
$$;

create or replace function private.trg_veiculo_busca()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.busca := private.texto_busca(new.placa || ' ' || new.marca || ' ' || new.modelo);
  return new;
end;
$$;

drop trigger if exists cliente_a_busca on public.cliente;
create trigger cliente_a_busca
  before insert or update on public.cliente
  for each row execute function private.trg_cliente_busca();

drop trigger if exists cliente_versao on public.cliente;
create trigger cliente_versao
  before insert or update on public.cliente
  for each row execute function private.trg_versao();

-- PII fora do evento: documento, telefone, e-mail, endereço, observações e a
-- coluna busca (repete nome + telefone).
drop trigger if exists cliente_auditoria on public.cliente;
create trigger cliente_auditoria
  after insert or update or delete on public.cliente
  for each row execute function private.trg_auditar(
    'documento', 'telefone', 'email', 'endereco', 'observacoes', 'busca');

-- -----------------------------------------------------------------------------
-- veiculo
-- -----------------------------------------------------------------------------
create table if not exists public.veiculo (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizacao (id),
  cliente_id uuid not null,
  -- Placa normalizada: maiúscula, sem hífen (antiga ABC1234 ou Mercosul ABC1D23).
  placa text not null check (placa ~ '^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$'),
  marca text not null check (char_length(btrim(marca)) between 1 and 60),
  modelo text not null check (char_length(btrim(modelo)) between 1 and 80),
  ano smallint check (ano is null or ano between 1900 and 2100),
  cor text check (cor is null or char_length(btrim(cor)) between 1 and 40),
  chassi text check (chassi is null or chassi ~ '^[A-Z0-9]{5,25}$'),
  km_atual integer not null default 0 check (km_atual between 0 and 9999999),
  ativo boolean not null default true,
  busca text not null default '',
  versao integer not null default 1,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  -- SEGURANÇA: FK composta impede apontar para cliente de outra oficina.
  constraint veiculo_cliente_fk
    foreign key (org_id, cliente_id) references public.cliente (org_id, id),
  constraint veiculo_org_id_id_key unique (org_id, id)
);

-- Placa única por oficina ENTRE ATIVOS; desativado libera a placa.
create unique index if not exists veiculo_org_id_placa_ativo_key
  on public.veiculo (org_id, placa) where ativo;
-- Veículos de um cliente (ficha do cliente) e FK composta.
create index if not exists veiculo_org_id_cliente_id_idx
  on public.veiculo (org_id, cliente_id);
create index if not exists veiculo_org_id_ativo_placa_idx
  on public.veiculo (org_id, ativo, placa);
-- Mesma exceção do cliente (GIN trigram).
create index if not exists veiculo_busca_trgm_idx
  on public.veiculo using gin (busca extensions.gin_trgm_ops);

drop trigger if exists veiculo_a_busca on public.veiculo;
create trigger veiculo_a_busca
  before insert or update on public.veiculo
  for each row execute function private.trg_veiculo_busca();

drop trigger if exists veiculo_versao on public.veiculo;
create trigger veiculo_versao
  before insert or update on public.veiculo
  for each row execute function private.trg_versao();

-- PII fora do evento: chassi e a coluna busca.
drop trigger if exists veiculo_auditoria on public.veiculo;
create trigger veiculo_auditoria
  after insert or update or delete on public.veiculo
  for each row execute function private.trg_auditar('chassi', 'busca');

-- -----------------------------------------------------------------------------
-- RLS e grants (o Supabase dá ALL por default privileges: revogamos tudo).
-- -----------------------------------------------------------------------------
alter table public.cliente enable row level security;
alter table public.veiculo enable row level security;

revoke all on table public.cliente, public.veiculo from public, anon, authenticated;

-- cliente: sem GRANT DELETE. org_id só no INSERT (nunca muda). versao,
-- atualizado_em, criado_em e busca só pelos triggers/banco.
grant select on public.cliente to authenticated;
grant insert (id, org_id, nome, documento, telefone, email, endereco, observacoes)
  on public.cliente to authenticated;
grant update (nome, documento, telefone, email, endereco, observacoes, ativo)
  on public.cliente to authenticated;

drop policy if exists cliente_select on public.cliente;
create policy cliente_select on public.cliente
  for select to authenticated
  using (
    org_id = (select private.org_do_usuario())
    and (select private.pode('clientes', 'leitura'))
  );

drop policy if exists cliente_insert on public.cliente;
create policy cliente_insert on public.cliente
  for insert to authenticated
  with check (
    org_id = (select private.org_do_usuario())
    and (select private.pode('clientes', 'escrita'))
  );

drop policy if exists cliente_update on public.cliente;
create policy cliente_update on public.cliente
  for update to authenticated
  using (
    org_id = (select private.org_do_usuario())
    and (select private.pode('clientes', 'escrita'))
  )
  with check (
    org_id = (select private.org_do_usuario())
    and (select private.pode('clientes', 'escrita'))
  );

-- veiculo: cliente_id NÃO é atualizável (troca de dono só pela RPC
-- transferir_veiculo, que audita). Sem GRANT DELETE.
grant select on public.veiculo to authenticated;
grant insert (id, org_id, cliente_id, placa, marca, modelo, ano, cor, chassi, km_atual)
  on public.veiculo to authenticated;
grant update (placa, marca, modelo, ano, cor, chassi, km_atual, ativo)
  on public.veiculo to authenticated;

drop policy if exists veiculo_select on public.veiculo;
create policy veiculo_select on public.veiculo
  for select to authenticated
  using (
    org_id = (select private.org_do_usuario())
    and (select private.pode('veiculos', 'leitura'))
  );

drop policy if exists veiculo_insert on public.veiculo;
create policy veiculo_insert on public.veiculo
  for insert to authenticated
  with check (
    org_id = (select private.org_do_usuario())
    and (select private.pode('veiculos', 'escrita'))
  );

drop policy if exists veiculo_update on public.veiculo;
create policy veiculo_update on public.veiculo
  for update to authenticated
  using (
    org_id = (select private.org_do_usuario())
    and (select private.pode('veiculos', 'escrita'))
  )
  with check (
    org_id = (select private.org_do_usuario())
    and (select private.pode('veiculos', 'escrita'))
  );

-- -----------------------------------------------------------------------------
-- RPC public.transferir_veiculo(veiculo, novo_cliente).
-- security definer: a org vem de private.org_do_usuario() (nunca de parâmetro);
-- veículo e cliente destino são conferidos contra ELA (ids de outra oficina =
-- "não encontrado"). Exige veiculos/escrita. Grava evento 'transferir' com
-- antes/depois (além do 'alterar' do trigger genérico, que mostra o diff).
-- Devolve o veículo atualizado.
-- -----------------------------------------------------------------------------
create or replace function public.transferir_veiculo(p_veiculo_id uuid, p_novo_cliente_id uuid)
returns public.veiculo
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_org_id uuid := private.org_do_usuario();
  v_veiculo public.veiculo;
  v_antes uuid;
begin
  if (select auth.uid()) is null then
    raise exception 'Não autenticado.' using errcode = '28000';
  end if;
  if v_org_id is null or not private.pode('veiculos', 'escrita') then
    raise exception 'Sem permissão para transferir veículos.' using errcode = '42501';
  end if;
  if p_veiculo_id is null or p_novo_cliente_id is null then
    raise exception 'Informe o veículo e o novo cliente.' using errcode = 'P0001';
  end if;

  select * into v_veiculo
  from public.veiculo v
  where v.id = p_veiculo_id and v.org_id = v_org_id
  for update;

  if not found then
    raise exception 'Veículo não encontrado.' using errcode = 'P0001';
  end if;
  if not v_veiculo.ativo then
    raise exception 'Veículo inativo não pode ser transferido. Reative-o antes.' using errcode = 'P0001';
  end if;
  if v_veiculo.cliente_id = p_novo_cliente_id then
    raise exception 'O veículo já pertence a este cliente.' using errcode = 'P0001';
  end if;

  -- SEGURANÇA: destino precisa ser cliente ATIVO da MESMA oficina.
  if not exists (
    select 1 from public.cliente c
    where c.id = p_novo_cliente_id and c.org_id = v_org_id and c.ativo
  ) then
    raise exception 'Cliente de destino não encontrado.' using errcode = 'P0001';
  end if;

  v_antes := v_veiculo.cliente_id;

  update public.veiculo v
     set cliente_id = p_novo_cliente_id
   where v.id = p_veiculo_id and v.org_id = v_org_id
  returning * into v_veiculo;

  perform private.registrar_evento(v_org_id, 'veiculo', p_veiculo_id, 'transferir',
    jsonb_build_object(
      'antes', jsonb_build_object('cliente_id', v_antes),
      'depois', jsonb_build_object('cliente_id', p_novo_cliente_id)));

  return v_veiculo;
end;
$$;

revoke all on function private.trg_cliente_busca() from public, anon, authenticated;
revoke all on function private.trg_veiculo_busca() from public, anon, authenticated;

-- cliente_id só muda pela RPC: o UPDATE dela roda como dono da função (o
-- GRANT por coluna acima não inclui cliente_id para authenticated).
revoke all on function public.transferir_veiculo(uuid, uuid) from public, anon, authenticated;
grant execute on function public.transferir_veiculo(uuid, uuid) to authenticated;
