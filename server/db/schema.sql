-- ============================================================================
-- Supabase: run this entire file once in SQL Editor → click Run.
--
-- If you see "Success. No rows returned" — that is CORRECT. This script only
-- creates tables/policies; it does not SELECT data, so zero rows is expected.
--
-- Project URL and service_role key are NOT printed here. Get them from:
--   Dashboard → your project → Project Settings (gear) → API
--   - Project URL  → use as SUPABASE_URL on Render
--   - service_role → use as SUPABASE_SERVICE_ROLE_KEY on Render (secret)
--
-- Service role on the server bypasses RLS below. Never put service_role in the browser.
-- ============================================================================

create extension if not exists "pgcrypto";

create table if not exists public.users (
  id uuid primary key default gen_random_uuid(),
  client_public_id text unique,
  display_name text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_users_client_public_id on public.users (client_public_id);

create table if not exists public.rooms (
  id uuid primary key default gen_random_uuid(),
  room_code text not null,
  server_room_id text,
  max_players int not null default 8,
  meta jsonb not null default '{}'::jsonb,
  ended_at timestamptz not null default now()
);

create index if not exists idx_rooms_code on public.rooms (room_code);
create index if not exists idx_rooms_ended_at on public.rooms (ended_at desc);

create table if not exists public.scores (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms (id) on delete cascade,
  user_id uuid references public.users (id) on delete set null,
  display_name text,
  total_score int not null,
  match_rank int,
  created_at timestamptz not null default now()
);

create index if not exists idx_scores_user on public.scores (user_id);
create index if not exists idx_scores_room on public.scores (room_id);

alter table public.users enable row level security;
alter table public.rooms enable row level security;
alter table public.scores enable row level security;

-- No anonymous client access: server uses service role only (service role bypasses RLS).
drop policy if exists "deny_all_users" on public.users;
drop policy if exists "deny_all_rooms" on public.rooms;
drop policy if exists "deny_all_scores" on public.scores;

create policy "deny_all_users" on public.users for all using (false);
create policy "deny_all_rooms" on public.rooms for all using (false);
create policy "deny_all_scores" on public.scores for all using (false);
