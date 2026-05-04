-- ============================================================
-- Gerência Financeira CETEM - schema Supabase v1 (provisorio)
-- ============================================================
-- Estratégia: tabela única `empresas` com state JSONB.
-- Faz o app rodar end-to-end no Supabase mantendo o mesmo
-- modelo de dados do localStorage. Quando a versão final
-- definir as queries reais, normalizamos por módulo.
--
-- COMO RODAR:
--   1. No painel Supabase: SQL Editor -> New Query
--   2. Cole TODO este arquivo, clique RUN
--   3. Verifique em Table Editor se a tabela `empresas` apareceu
-- ============================================================

-- Limpa eventual versao anterior (idempotente).
-- CASCADE remove o trigger junto com a function, evitando erro
-- de "table does not exist" na primeira execucao.
drop function if exists public.tg_set_updated_at() cascade;

-- ------------------------------------------------------------
-- Tabela principal: uma linha por empresa, state inteiro em JSONB
-- ------------------------------------------------------------
create table if not exists public.empresas (
  id          text primary key,
  nome        text not null default 'Empresa',
  state       jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table public.empresas is 'Estado completo de cada empresa (drop-in do localStorage do app v0.5).';

-- ------------------------------------------------------------
-- Trigger para manter updated_at automaticamente
-- ------------------------------------------------------------
create or replace function public.tg_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger empresas_updated_at
  before update on public.empresas
  for each row execute function public.tg_set_updated_at();

-- ------------------------------------------------------------
-- Row Level Security
-- ------------------------------------------------------------
-- IMPORTANTE: enquanto o app roda em modo "uso interno sem login",
-- a chave publishable (sb_publishable_*) acessa via role 'anon'.
-- Liberamos full access para essa role. NA VERSAO FINAL, trocar
-- por policies baseadas em auth.uid() / claims de empresa.
-- ------------------------------------------------------------
alter table public.empresas enable row level security;

drop policy if exists "uso interno - acesso aberto (anon)" on public.empresas;
create policy "uso interno - acesso aberto (anon)"
  on public.empresas
  for all
  to anon
  using (true)
  with check (true);

-- Authenticated tambem acessa (caso voce ative auth depois)
drop policy if exists "uso interno - acesso aberto (authenticated)" on public.empresas;
create policy "uso interno - acesso aberto (authenticated)"
  on public.empresas
  for all
  to authenticated
  using (true)
  with check (true);

-- ------------------------------------------------------------
-- Indices
-- ------------------------------------------------------------
create index if not exists empresas_updated_at_idx on public.empresas(updated_at desc);

-- ------------------------------------------------------------
-- Verificacao
-- ------------------------------------------------------------
-- Roda esta linha sozinha para confirmar:
--   select id, nome, jsonb_typeof(state) as tipo_state, updated_at from public.empresas;
