-- ============================================================
-- Gerencia Financeira CETEM - RLS para usuarios autenticados
-- ============================================================
-- Roda DEPOIS de 01_supabase_schema.sql.
-- Substitui as policies abertas por policies que exigem login.
-- Modelo: dados COMPARTILHADOS entre todos os usuarios autenticados
-- (uso interno CETEM, time pequeno).
-- ============================================================

-- 1) Remove policies antigas (abertas)
drop policy if exists "uso interno - acesso aberto (anon)"           on public.empresas;
drop policy if exists "uso interno - acesso aberto (authenticated)"  on public.empresas;

-- 2) Garante RLS ativo
alter table public.empresas enable row level security;

-- 3) Nova policy: SO usuarios autenticados podem ler/escrever.
--    Como os dados sao compartilhados (mesma "empresa CETEM"),
--    qualquer usuario logado ve todas as linhas.
create policy "cetem - autenticados leem todas as empresas"
  on public.empresas
  for select
  to authenticated
  using (true);

create policy "cetem - autenticados inserem"
  on public.empresas
  for insert
  to authenticated
  with check (true);

create policy "cetem - autenticados atualizam"
  on public.empresas
  for update
  to authenticated
  using (true)
  with check (true);

create policy "cetem - autenticados deletam"
  on public.empresas
  for delete
  to authenticated
  using (true);

-- 4) Bloqueia explicitamente role 'anon' (sem login) - boa pratica defensiva.
--    Sem policy para 'anon', RLS ja barra acesso, mas deixar explicito ajuda
--    em auditoria futura.

-- ============================================================
-- VERIFICACAO
-- ============================================================
-- Cole esta query separadamente e veja se aparecem 4 policies:
--   select policyname, cmd, roles from pg_policies
--    where tablename = 'empresas';
--
-- Esperado:
--   cetem - autenticados leem todas as empresas    SELECT  {authenticated}
--   cetem - autenticados inserem                   INSERT  {authenticated}
--   cetem - autenticados atualizam                 UPDATE  {authenticated}
--   cetem - autenticados deletam                   DELETE  {authenticated}
-- ============================================================
