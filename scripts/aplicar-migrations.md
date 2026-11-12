# Aplicar as migrations no Supabase (projeto de TESTE primeiro)

Os testes `tests/db/*.test.ts` rodam num Postgres WASM (PGlite) com um *stub* do Supabase.
RLS, roles, grants e as funções são testados de verdade, mas o stub NÃO cobre:
o Auth real (JWT emitido pelo GoTrue), o PostgREST (schemas expostos, chamada RPC via
`supabase-js`) e os default privileges exatos do seu projeto. Por isso, valide uma vez no
projeto Supabase de teste antes de produção.

## 1. Aplicar
Opção A (sem CLI): no SQL Editor do projeto de teste, rode os arquivos de
`supabase/migrations/` **em ordem de nome**. São idempotentes (pode rodar de novo).

Opção B (CLI): `npx supabase link --project-ref <ref>` e `npx supabase db push`.

Confira em *Settings > API > Exposed schemas*: deve ter `public` (e `graphql_public`), **nunca `private`**.

## 2. Flag de DEV (e-mail não confirmado)
Só no projeto de DEV, onde *Auth > Confirm email* está desligado:
```sql
update private.configuracao set valor = 'false' where chave = 'exigir_email_confirmado';
```
RISCO: sem confirmação, alguém pode criar conta com e-mail de outra pessoa e cadastrar
oficina em nome dela (e, quando existir, aceitar convites endereçados a esse e-mail).
Em produção o valor deve ser `'true'` (padrão da migration).

## 3. Roteiro de verificação manual (SQL Editor)
Crie 2 usuários em *Authentication > Users* (confirmados) e substitua `<UID_A>`, `<UID_B>`.

```sql
-- simula o usuário A
begin;
select set_config('request.jwt.claims', '{"sub":"<UID_A>","role":"authenticated"}', true);
set local role authenticated;
select public.criar_oficina('Oficina A');          -- ok, retorna uuid
select public.criar_oficina('De novo');            -- ERRO: já faz parte de uma oficina
commit;

begin;
select set_config('request.jwt.claims', '{"sub":"<UID_B>","role":"authenticated"}', true);
set local role authenticated;
select public.criar_oficina('Oficina B');
select count(*) from public.organizacao;           -- 1 (só a B)
select count(*) from public.membro;                -- 1 (só ele)
insert into public.membro (org_id, user_id, papel)
  select id, '<UID_B>', 'dono' from public.organizacao;  -- ERRO: permission denied
update public.membro set papel = 'dono';           -- ERRO: permission denied (coluna)
rollback;

-- anon
begin;
set local role anon;
select * from public.organizacao;                  -- ERRO: permission denied
select public.criar_oficina('x');                  -- ERRO: permission denied
rollback;
```

Grants esperados (rode como postgres):
```sql
select grantee, table_name, privilege_type
from information_schema.role_table_grants
where table_schema = 'public' and grantee in ('anon', 'authenticated')
order by 2, 1, 3;   -- anon: nenhuma linha; authenticated: só SELECT (+ DELETE em membro_permissao)
select grantee, table_name, column_name, privilege_type
from information_schema.column_privileges
where table_schema = 'public' and grantee = 'authenticated'
  and privilege_type in ('INSERT', 'UPDATE')
order by 2, 4, 3;   -- só as colunas listadas na migration de RLS
```

Pelo app (supabase-js com a anon key): login com um usuário confirmado e
`supabase.rpc('criar_oficina', { p_nome: 'Minha Oficina' })`; depois
`supabase.from('organizacao').select()` deve trazer só a oficina dele.
