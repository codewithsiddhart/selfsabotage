

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
  on public.profiles
  for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- ---------------------------------------------------------------------------
-- leaderboard — one row per user; cumulative score (client upsert on user_id)
-- ---------------------------------------------------------------------------
create table if not exists public.leaderboard (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  score bigint not null default 0,
  display_name text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint leaderboard_user_id_key unique (user_id)
);

comment on table public.leaderboard is 'Global cumulative points; ordered by score desc in the game UI.';
comment on column public.leaderboard.user_id is 'FK to profiles.id — enables .select(''..., profiles(username)'').';
comment on column public.leaderboard.score is 'Non-negative running total (enforced by check when constraint present).';
comment on column public.leaderboard.display_name is 'Denormalized name for quick display without a join.';

alter table public.leaderboard add column if not exists display_name text;
alter table public.leaderboard
  add column if not exists created_at timestamptz not null default timezone('utc', now());
alter table public.leaderboard
  add column if not exists updated_at timestamptz not null default timezone('utc', now());

comment on column public.leaderboard.created_at is 'First time this user appeared on the board (UTC).';
comment on column public.leaderboard.updated_at is 'Last score/metadata write (UTC); trigger keeps this fresh.';

-- Level / XP / preconfigured progress (client-maintained; derived from score where noted)
alter table public.leaderboard add column if not exists level integer not null default 1;
alter table public.leaderboard add column if not exists xp integer not null default 0;
alter table public.leaderboard add column if not exists unique_levels_beaten integer not null default 0;
alter table public.leaderboard add column if not exists easy_levels_beaten integer not null default 0;
alter table public.leaderboard add column if not exists medium_levels_beaten integer not null default 0;
alter table public.leaderboard add column if not exists hard_levels_beaten integer not null default 0;

comment on column public.leaderboard.level is 'Display level: floor(score/100)+1.';
comment on column public.leaderboard.xp is 'XP within level band: score % 100.';
comment on column public.leaderboard.unique_levels_beaten is 'Distinct preconfigured levels completed at least once.';
comment on column public.leaderboard.easy_levels_beaten is 'Count of distinct easy-tier preconfigured levels first-completed.';
comment on column public.leaderboard.medium_levels_beaten is 'Count of distinct medium-tier preconfigured levels first-completed.';
comment on column public.leaderboard.hard_levels_beaten is 'Count of distinct hard-tier preconfigured levels first-completed.';

do $$
begin
  alter table public.leaderboard
    add constraint leaderboard_progress_nonneg_chk check (
      level >= 1 and xp >= 0
      and unique_levels_beaten >= 0
      and easy_levels_beaten >= 0 and medium_levels_beaten >= 0 and hard_levels_beaten >= 0
    ) not valid;
  alter table public.leaderboard validate constraint leaderboard_progress_nonneg_chk;
exception
  when duplicate_object then null;
  when check_violation then
    raise notice 'SSB: leaderboard_progress_nonneg_chk not validated — fix invalid rows then re-run.';
end
$$;

-- Backfill level/xp from existing score (unique_* left as-is unless client updates)
update public.leaderboard lb
set
  level = (greatest(lb.score, 0) / 100) + 1,
  xp = (greatest(lb.score, 0) % 100)::integer;

-- ---------------------------------------------------------------------------
-- user_completed_levels — first-time completion of a preconfigured level (dedupe)
-- ---------------------------------------------------------------------------
create table if not exists public.user_completed_levels (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  level_id text not null,
  completed_at timestamptz not null default timezone('utc', now()),
  constraint user_completed_levels_user_level_key unique (user_id, level_id),
  constraint user_completed_levels_level_id_len check (char_length(level_id) <= 64)
);

comment on table public.user_completed_levels is 'One row per user per built-in level_id after first win; insert-only dedupe for leaderboard counters.';

create index if not exists user_completed_levels_user_id_idx on public.user_completed_levels (user_id);

alter table public.user_completed_levels enable row level security;
alter table public.user_completed_levels force row level security;

drop policy if exists "user_completed_levels_select_own" on public.user_completed_levels;
create policy "user_completed_levels_select_own"
  on public.user_completed_levels
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "user_completed_levels_insert_own" on public.user_completed_levels;
create policy "user_completed_levels_insert_own"
  on public.user_completed_levels
  for insert
  to authenticated
  with check (auth.uid() is not null and auth.uid() = user_id);

-- Add sanity checks on older DBs (ignore if duplicate name or bad legacy data)
do $$
begin
  alter table public.leaderboard
    add constraint leaderboard_score_nonneg_chk check (score >= 0) not valid;
  alter table public.leaderboard validate constraint leaderboard_score_nonneg_chk;
exception
  when duplicate_object then null;
  when check_violation then
    raise notice 'SSB: leaderboard_score_nonneg_chk not validated — fix negative scores then re-run validate.';
end
$$;

do $$
begin
  alter table public.leaderboard
    add constraint leaderboard_display_name_len_chk check (
      display_name is null or char_length(display_name) <= 64
    ) not valid;
  alter table public.leaderboard validate constraint leaderboard_display_name_len_chk;
exception
  when duplicate_object then null;
  when check_violation then
    raise notice 'SSB: leaderboard_display_name_len_chk not validated — shorten long display_name values first.';
end
$$;

drop trigger if exists ssb_leaderboard_set_updated_at on public.leaderboard;
create trigger ssb_leaderboard_set_updated_at
  before insert or update on public.leaderboard
  for each row
  execute function public.ssb_set_updated_at();

-- Hot path: top scores (matches client .order(''score'', { ascending: false }))
create index if not exists leaderboard_score_desc_idx
  on public.leaderboard (score desc, updated_at desc);

alter table public.leaderboard enable row level security;
alter table public.leaderboard force row level security;

drop policy if exists "leaderboard_select_public" on public.leaderboard;
create policy "leaderboard_select_public"
  on public.leaderboard
  for select
  to anon, authenticated
  using (true);

drop policy if exists "leaderboard_insert_own" on public.leaderboard;
create policy "leaderboard_insert_own"
  on public.leaderboard
  for insert
  to authenticated
  with check (auth.uid() is not null and auth.uid() = user_id);

drop policy if exists "leaderboard_update_own" on public.leaderboard;
create policy "leaderboard_update_own"
  on public.leaderboard
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "leaderboard_delete_admin" on public.leaderboard;
create policy "leaderboard_delete_admin"
  on public.leaderboard
  for delete
  to authenticated
  using (
    lower(auth.jwt() ->> 'email') in ('admin01@gmail.com', 'admin02@gmail.com', 'admi02@gmail.com')
  );

-- ---------------------------------------------------------------------------
-- Issue reports inbox (user reports + captured runtime errors)
-- ---------------------------------------------------------------------------
create table if not exists public.ssb_issue_reports (
  id uuid primary key default extensions.gen_random_uuid(),
  reporter_user_id uuid references public.profiles (id) on delete set null,
  reporter_email text,
  category text not null default 'other',
  target_user_id text,
  details text not null,
  page_url text,
  technical jsonb,
  status text not null default 'open',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

drop trigger if exists ssb_issue_reports_set_updated_at on public.ssb_issue_reports;
create trigger ssb_issue_reports_set_updated_at
  before insert or update on public.ssb_issue_reports
  for each row
  execute function public.ssb_set_updated_at();

create index if not exists idx_ssb_issue_reports_created_at on public.ssb_issue_reports (created_at desc);
create index if not exists idx_ssb_issue_reports_status on public.ssb_issue_reports (status);

alter table public.ssb_issue_reports enable row level security;
alter table public.ssb_issue_reports force row level security;

drop policy if exists "ssb_issue_reports_insert_any" on public.ssb_issue_reports;
create policy "ssb_issue_reports_insert_any"
  on public.ssb_issue_reports
  for insert
  to anon, authenticated
  with check (
    reporter_user_id is null or auth.uid() = reporter_user_id
  );

drop policy if exists "ssb_issue_reports_select_admin" on public.ssb_issue_reports;
create policy "ssb_issue_reports_select_admin"
  on public.ssb_issue_reports
  for select
  to authenticated
  using (
    lower(auth.jwt() ->> 'email') in ('admin01@gmail.com', 'admin02@gmail.com', 'admi02@gmail.com')
  );

drop policy if exists "ssb_issue_reports_update_admin" on public.ssb_issue_reports;
create policy "ssb_issue_reports_update_admin"
  on public.ssb_issue_reports
  for update
  to authenticated
  using (
    lower(auth.jwt() ->> 'email') in ('admin01@gmail.com', 'admin02@gmail.com', 'admi02@gmail.com')
  )
  with check (
    lower(auth.jwt() ->> 'email') in ('admin01@gmail.com', 'admin02@gmail.com', 'admi02@gmail.com')
  );

grant select, insert, update on table public.ssb_issue_reports to anon, authenticated;

-- ---------------------------------------------------------------------------
-- API roles — PostgREST uses anon / authenticated with the JWT you send from the game
-- ---------------------------------------------------------------------------
grant usage on schema public to anon, authenticated;

grant select on table public.profiles to anon, authenticated;
grant insert, update on table public.profiles to authenticated;

grant select on table public.leaderboard to anon, authenticated;
grant insert, update, delete on table public.leaderboard to authenticated;

grant select, insert on table public.user_completed_levels to authenticated;

drop policy if exists "user_completed_levels_update_own" on public.user_completed_levels;
create policy "user_completed_levels_update_own"
  on public.user_completed_levels
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

grant update on table public.user_completed_levels to authenticated;

-- ============================================================================
-- Coins + Daily challenge + Shop + Global shared levels
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Player coin + shop state (stored on profiles for easy RLS)
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column if not exists coins bigint not null default 0;

alter table public.profiles
  add column if not exists last_coin_reset timestamptz not null default timezone('utc', now());

alter table public.profiles
  add column if not exists daily_preconfigured_coin_earned integer not null default 0;

alter table public.profiles
  add column if not exists daily_daily_coin_earned integer not null default 0;

alter table public.profiles
  add column if not exists intensity_unlocked boolean not null default false;

alter table public.profiles
  add column if not exists equipped_cosmetic_id text;

alter table public.profiles
  add column if not exists is_admin boolean not null default false;

comment on column public.profiles.is_admin is 'When true, game client treats user as admin (no leaderboard write; hidden from public leaderboard lists).';

-- ---------------------------------------------------------------------------
-- Preconfigured completion -> coin reward dedupe
-- ---------------------------------------------------------------------------
alter table public.user_completed_levels
  add column if not exists coins_awarded boolean not null default false;

-- ---------------------------------------------------------------------------
-- Daily challenge progress
-- ---------------------------------------------------------------------------
create table if not exists public.daily_challenge_progress (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  day_key date not null,
  attempts_used integer not null default 0,
  completed boolean not null default false,
  completed_at timestamptz,
  coins_awarded boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint daily_challenge_progress_user_day_key unique (user_id, day_key)
);

drop trigger if exists ssb_daily_challenge_progress_set_updated_at on public.daily_challenge_progress;
create trigger ssb_daily_challenge_progress_set_updated_at
  before insert or update on public.daily_challenge_progress
  for each row
  execute function public.ssb_set_updated_at();

create index if not exists idx_daily_challenge_progress_user_day on public.daily_challenge_progress (user_id, day_key desc);

alter table public.daily_challenge_progress enable row level security;
alter table public.daily_challenge_progress force row level security;

drop policy if exists "daily_challenge_progress_select_own" on public.daily_challenge_progress;
create policy "daily_challenge_progress_select_own"
  on public.daily_challenge_progress
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "daily_challenge_progress_insert_own" on public.daily_challenge_progress;
create policy "daily_challenge_progress_insert_own"
  on public.daily_challenge_progress
  for insert
  to authenticated
  with check (auth.uid() is not null and auth.uid() = user_id);

drop policy if exists "daily_challenge_progress_update_own" on public.daily_challenge_progress;
create policy "daily_challenge_progress_update_own"
  on public.daily_challenge_progress
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

grant select, insert, update on table public.daily_challenge_progress to authenticated;

-- ---------------------------------------------------------------------------
-- Shop: cosmetics (future-proof catalog)
-- ---------------------------------------------------------------------------
create table if not exists public.shop_cosmetics (
  id text primary key,
  name text not null,
  cost integer not null,
  dot_a text not null default '#7aa7ff',
  dot_b text not null default '#2dd4bf'
);

comment on table public.shop_cosmetics is 'Cosmetics catalog for coin-based shop.';

alter table public.shop_cosmetics enable row level security;
alter table public.shop_cosmetics force row level security;

drop policy if exists "shop_cosmetics_select_public" on public.shop_cosmetics;
create policy "shop_cosmetics_select_public"
  on public.shop_cosmetics
  for select
  to anon, authenticated
  using (true);

grant select on table public.shop_cosmetics to anon, authenticated;

insert into public.shop_cosmetics (id, name, cost, dot_a, dot_b)
values
  ('ghost_1', 'Ghost 1', 300, '#60a5fa', '#22d3ee'),
  ('ghost_2', 'Ghost 2', 300, '#34d399', '#10b981'),
  ('ghost_3', 'Ghost 3', 300, '#fb7185', '#f472b6'),
  ('ghost_4', 'Ghost 4', 300, '#fbbf24', '#f59e0b'),
  ('ghost_5', 'Ghost 5', 300, '#a78bfa', '#7c3aed')
on conflict (id) do update
set name = excluded.name,
    cost = excluded.cost,
    dot_a = excluded.dot_a,
    dot_b = excluded.dot_b;

create table if not exists public.user_owned_cosmetics (
  user_id uuid not null references public.profiles (id) on delete cascade,
  cosmetic_id text not null references public.shop_cosmetics (id) on delete cascade,
  acquired_at timestamptz not null default timezone('utc', now()),
  constraint user_owned_cosmetics_pk primary key (user_id, cosmetic_id)
);

alter table public.user_owned_cosmetics enable row level security;
alter table public.user_owned_cosmetics force row level security;

drop policy if exists "user_owned_cosmetics_select_own" on public.user_owned_cosmetics;
create policy "user_owned_cosmetics_select_own"
  on public.user_owned_cosmetics
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "user_owned_cosmetics_insert_own" on public.user_owned_cosmetics;
create policy "user_owned_cosmetics_insert_own"
  on public.user_owned_cosmetics
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "user_owned_cosmetics_delete_own" on public.user_owned_cosmetics;
create policy "user_owned_cosmetics_delete_own"
  on public.user_owned_cosmetics
  for delete
  to authenticated
  using (auth.uid() = user_id);

grant select, insert on table public.user_owned_cosmetics to authenticated;

-- ---------------------------------------------------------------------------
-- Powerups: structure only (coins purchasable later)
-- ---------------------------------------------------------------------------
create table if not exists public.user_owned_powerups (
  user_id uuid not null references public.profiles (id) on delete cascade,
  powerup_key text not null,
  amount integer not null default 0,
  acquired_at timestamptz not null default timezone('utc', now()),
  constraint user_owned_powerups_pk primary key (user_id, powerup_key)
);

alter table public.user_owned_powerups enable row level security;
alter table public.user_owned_powerups force row level security;

drop policy if exists "user_owned_powerups_select_own" on public.user_owned_powerups;
create policy "user_owned_powerups_select_own"
  on public.user_owned_powerups
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "user_owned_powerups_upsert_own" on public.user_owned_powerups;
create policy "user_owned_powerups_upsert_own"
  on public.user_owned_powerups
  for insert
  to authenticated
  with check (auth.uid() = user_id);

grant select, insert on table public.user_owned_powerups to authenticated;

-- ---------------------------------------------------------------------------
-- Global shared levels (player-created levels)
-- ---------------------------------------------------------------------------
create table if not exists public.global_levels (
  id uuid primary key default extensions.gen_random_uuid(),
  author_id uuid not null references public.profiles (id) on delete cascade,
  client_level_id text not null,
  name text not null,
  tiles_flat jsonb not null,
  texts jsonb,
  cols integer not null default 64,
  rows integer not null default 36,
  difficulty numeric,
  validation_state text not null default 'VALID',
  validation_notes text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint global_levels_author_client_level_key unique (author_id, client_level_id)
);

alter table public.global_levels add column if not exists validation_state text not null default 'VALID';
alter table public.global_levels add column if not exists validation_notes text;

drop trigger if exists ssb_global_levels_set_updated_at on public.global_levels;
create trigger ssb_global_levels_set_updated_at
  before insert or update on public.global_levels
  for each row
  execute function public.ssb_set_updated_at();

alter table public.global_levels enable row level security;
alter table public.global_levels force row level security;

drop policy if exists "global_levels_select_public" on public.global_levels;
create policy "global_levels_select_public"
  on public.global_levels
  for select
  to anon, authenticated
  using (true);

drop policy if exists "global_levels_insert_own" on public.global_levels;
create policy "global_levels_insert_own"
  on public.global_levels
  for insert
  to authenticated
  with check (auth.uid() = author_id);

drop policy if exists "global_levels_update_own" on public.global_levels;
create policy "global_levels_update_own"
  on public.global_levels
  for update
  to authenticated
  using (auth.uid() = author_id)
  with check (auth.uid() = author_id);

drop policy if exists "global_levels_delete_own" on public.global_levels;
create policy "global_levels_delete_own"
  on public.global_levels
  for delete
  to authenticated
  using (auth.uid() = author_id);

drop policy if exists "global_levels_delete_admin" on public.global_levels;
create policy "global_levels_delete_admin"
  on public.global_levels
  for delete
  to authenticated
  using (
    lower(auth.jwt() ->> 'email') in ('admin01@gmail.com', 'admin02@gmail.com')
  );

grant select on table public.global_levels to anon, authenticated;
grant insert, update, delete on table public.global_levels to authenticated;

create index if not exists idx_global_levels_created_at on public.global_levels (created_at desc);

-- ---------------------------------------------------------------------------
-- Level reporting + admin visibility (structure only)
-- ---------------------------------------------------------------------------
-- IMPORTANT:
-- Supabase auth users must be created manually (email confirmation should be disabled)
-- Email: Admin01@gmail.com  Password: admin123
-- Email: Admin02@gmail.com  Password: admin123

create table if not exists public.admin_emails (
  email text primary key
);

insert into public.admin_emails (email)
values
  ('Admin01@gmail.com'),
  ('Admin02@gmail.com')
on conflict (email) do nothing;

-- Central user moderation table (ban / restrict).
create table if not exists public.user_moderation (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  status text not null default 'none',
  reason text,
  until_at timestamptz,
  updated_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint user_moderation_status_chk check (status in ('none', 'restricted', 'banned'))
);

drop trigger if exists ssb_user_moderation_set_updated_at on public.user_moderation;
create trigger ssb_user_moderation_set_updated_at
  before insert or update on public.user_moderation
  for each row
  execute function public.ssb_set_updated_at();

alter table public.user_moderation enable row level security;
alter table public.user_moderation force row level security;

drop policy if exists "user_moderation_select_self_or_admin" on public.user_moderation;
drop policy if exists "user_moderation_select_self_or_staff" on public.user_moderation;
create policy "user_moderation_select_self_or_admin"
  on public.user_moderation
  for select
  to authenticated
  using (
    user_id = auth.uid()
    or lower(auth.jwt() ->> 'email') in ('admin01@gmail.com', 'admin02@gmail.com')
  );

drop policy if exists "user_moderation_upsert_admin_only" on public.user_moderation;
drop policy if exists "user_moderation_upsert_staff" on public.user_moderation;
create policy "user_moderation_upsert_admin_only"
  on public.user_moderation
  for all
  to authenticated
  using (lower(auth.jwt() ->> 'email') in ('admin01@gmail.com', 'admin02@gmail.com'))
  with check (lower(auth.jwt() ->> 'email') in ('admin01@gmail.com', 'admin02@gmail.com'));

grant select, insert, update, delete on table public.user_moderation to authenticated;

create or replace function public.ssb_is_blocked(p_user_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_moderation m
    where m.user_id = p_user_id
      and (
        m.status = 'banned'
        or (m.status = 'restricted' and (m.until_at is null or m.until_at > timezone('utc', now())))
      )
  );
$$;

revoke all on function public.ssb_is_blocked(uuid) from public;
grant execute on function public.ssb_is_blocked(uuid) to anon, authenticated;

-- Reports against shared global levels.
create table if not exists public.level_reports (
  id uuid primary key default extensions.gen_random_uuid(),
  level_id uuid not null references public.global_levels (id) on delete cascade,
  reporter_user_id uuid not null references public.profiles (id) on delete cascade,
  reason_code text,
  reason text,
  status text not null default 'open',
  admin_notes text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

drop trigger if exists ssb_level_reports_set_updated_at on public.level_reports;
create trigger ssb_level_reports_set_updated_at
  before insert or update on public.level_reports
  for each row
  execute function public.ssb_set_updated_at();

alter table public.level_reports enable row level security;
alter table public.level_reports force row level security;

drop policy if exists "level_reports_insert_own" on public.level_reports;
create policy "level_reports_insert_own"
  on public.level_reports
  for insert
  to authenticated
  with check (auth.uid() = reporter_user_id);

drop policy if exists "level_reports_select_self_or_admin" on public.level_reports;
drop policy if exists "level_reports_select_self_or_staff" on public.level_reports;
create policy "level_reports_select_self_or_admin"
  on public.level_reports
  for select
  to authenticated
  using (
    reporter_user_id = auth.uid()
    OR exists (
      select 1
      from public.admin_emails ae
      where lower(ae.email) = lower(auth.jwt() ->> 'email')
    )
  );

drop policy if exists "level_reports_update_admin_only" on public.level_reports;
drop policy if exists "level_reports_update_staff" on public.level_reports;
create policy "level_reports_update_admin_only"
  on public.level_reports
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.admin_emails ae
      where lower(ae.email) = lower(auth.jwt() ->> 'email')
    )
  )
  with check (
    exists (
      select 1
      from public.admin_emails ae
      where lower(ae.email) = lower(auth.jwt() ->> 'email')
    )
  );

grant select, insert on table public.level_reports to authenticated;
grant update on table public.level_reports to authenticated;

-- Blocked users cannot write to gameplay/social tables.
drop policy if exists "profiles_write_not_blocked" on public.profiles;
create policy "profiles_write_not_blocked"
  on public.profiles
  as restrictive
  for all
  to authenticated
  using (not public.ssb_is_blocked(auth.uid()))
  with check (not public.ssb_is_blocked(auth.uid()));

drop policy if exists "leaderboard_write_not_blocked" on public.leaderboard;
create policy "leaderboard_write_not_blocked"
  on public.leaderboard
  as restrictive
  for all
  to authenticated
  using (not public.ssb_is_blocked(auth.uid()))
  with check (not public.ssb_is_blocked(auth.uid()));

drop policy if exists "user_completed_levels_write_not_blocked" on public.user_completed_levels;
create policy "user_completed_levels_write_not_blocked"
  on public.user_completed_levels
  as restrictive
  for all
  to authenticated
  using (not public.ssb_is_blocked(auth.uid()))
  with check (not public.ssb_is_blocked(auth.uid()));

drop policy if exists "daily_challenge_write_not_blocked" on public.daily_challenge_progress;
create policy "daily_challenge_write_not_blocked"
  on public.daily_challenge_progress
  as restrictive
  for all
  to authenticated
  using (not public.ssb_is_blocked(auth.uid()))
  with check (not public.ssb_is_blocked(auth.uid()));

drop policy if exists "user_owned_cosmetics_write_not_blocked" on public.user_owned_cosmetics;
create policy "user_owned_cosmetics_write_not_blocked"
  on public.user_owned_cosmetics
  as restrictive
  for all
  to authenticated
  using (not public.ssb_is_blocked(auth.uid()))
  with check (not public.ssb_is_blocked(auth.uid()));

drop policy if exists "global_levels_write_not_blocked" on public.global_levels;
create policy "global_levels_write_not_blocked"
  on public.global_levels
  as restrictive
  for all
  to authenticated
  using (not public.ssb_is_blocked(auth.uid()))
  with check (not public.ssb_is_blocked(auth.uid()));

drop policy if exists "level_reports_write_not_blocked" on public.level_reports;
create policy "level_reports_write_not_blocked"
  on public.level_reports
  as restrictive
  for all
  to authenticated
  using (not public.ssb_is_blocked(auth.uid()))
  with check (not public.ssb_is_blocked(auth.uid()));

-- ---------------------------------------------------------------------------
-- Coin awarding functions (strict caps, no double credit)
-- ---------------------------------------------------------------------------

-- Preconfigured level -> coins
create or replace function public.ssb_award_preconfigured_coins(p_user_id uuid, p_level_id text)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  reward integer := 0;
  coins_current bigint := 0;
  did_confirm boolean := false;
begin
  -- Only award if user_completed_levels row exists and wasn't credited.
  select true into did_confirm
  from public.user_completed_levels
  where user_id = p_user_id and level_id = p_level_id and coins_awarded = false
  limit 1;

  if did_confirm is null then
    return 0;
  end if;

  -- Map built-in level_id -> reward (first completion only; dedupe via coins_awarded).
  reward := case
    when p_level_id in (
      'builtin_training','builtin_gentle','builtin_sunny','builtin_hopskip','builtin_gentlerise','builtin_saferun','builtin_beginner',
      'builtin_tut_spikes','builtin_tut_pad','builtin_tut_hex','builtin_tut_lava','builtin_tut_platform'
    ) then 10
    when p_level_id in (
      'builtin_betrayal','builtin_mid','builtin_doublecross','builtin_midclimb','builtin_hexlane','builtin_spikegauntlet','builtin_stepping','builtin_bridge'
    ) then 15
    when p_level_id in (
      'builtin_chaos','builtin_gauntlet','builtin_summit','builtin_chaosrun','builtin_finaltest','builtin_nomercy','builtin_tower','builtin_endurance'
    ) then 20
    else 0
  end;

  if reward <= 0 then
    update public.user_completed_levels
      set coins_awarded = true
      where user_id = p_user_id and level_id = p_level_id and coins_awarded = false;
    return 0;
  end if;

  select coins into coins_current from public.profiles where id = p_user_id;

  update public.profiles
    set coins = COALESCE(coins_current, 0) + reward
    where id = p_user_id;

  update public.user_completed_levels
    set coins_awarded = true
    where user_id = p_user_id and level_id = p_level_id and coins_awarded = false;

  return reward;
end;
$$;

-- Daily challenge -> coins
create or replace function public.ssb_award_daily_challenge_coins(p_user_id uuid, p_day_key date)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  reward integer := 200;
  coins_current bigint := 0;
  did_confirm boolean := false;
begin
  select true into did_confirm
  from public.daily_challenge_progress
  where user_id = p_user_id and day_key = p_day_key and coins_awarded = false
  limit 1;

  if did_confirm is null then
    return 0;
  end if;

  select coins into coins_current from public.profiles where id = p_user_id;

  update public.profiles
    set coins = COALESCE(coins_current, 0) + reward
    where id = p_user_id;

  update public.daily_challenge_progress
    set completed = true,
        completed_at = COALESCE(completed_at, timezone('utc', now())),
        coins_awarded = true
    where user_id = p_user_id and day_key = p_day_key and coins_awarded = false;

  return reward;
end;
$$;

-- Intensity unlock: cost 500 coins
create or replace function public.ssb_buy_intensity_unlock(p_user_id uuid)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  price integer := 500;
  cur_coins bigint := 0;
  already_unlocked boolean := false;
  new_coins bigint := -1;
  is_adm boolean := false;
begin
  select coins, intensity_unlocked, coalesce(is_admin, false)
    into cur_coins, already_unlocked, is_adm
  from public.profiles
  where id = p_user_id;

  if already_unlocked then
    return -1;
  end if;

  if is_adm then
    update public.profiles
      set intensity_unlocked = true
      where id = p_user_id;
    select coins into new_coins from public.profiles where id = p_user_id;
    return COALESCE(new_coins, -1);
  end if;

  if cur_coins < price then
    return -1;
  end if;

  update public.profiles
    set coins = coins - price,
        intensity_unlocked = true
    where id = p_user_id and coins >= price;

  select coins into new_coins from public.profiles where id = p_user_id;
  return COALESCE(new_coins, -1);
end;
$$;

-- Cosmetic purchase
create or replace function public.ssb_buy_cosmetic(p_user_id uuid, p_cosmetic_id text)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  cost integer := 0;
  already_owned boolean := false;
  coins_current bigint := 0;
  new_coins bigint := -1;
  is_adm boolean := false;
begin
  select coins, coalesce(is_admin, false) into coins_current, is_adm from public.profiles where id = p_user_id;
  if coins_current is null then
    return -1;
  end if;

  select cost into cost from public.shop_cosmetics where id = p_cosmetic_id;
  if cost is null then
    return -1;
  end if;

  select true into already_owned
  from public.user_owned_cosmetics
  where user_id = p_user_id and cosmetic_id = p_cosmetic_id
  limit 1;

  if already_owned then
    select coins into new_coins from public.profiles where id = p_user_id;
    return COALESCE(new_coins, -1);
  end if;

  if is_adm then
    insert into public.user_owned_cosmetics (user_id, cosmetic_id)
    values (p_user_id, p_cosmetic_id)
    on conflict (user_id, cosmetic_id) do nothing;
    select coins into new_coins from public.profiles where id = p_user_id;
    return COALESCE(new_coins, -1);
  end if;

  if coins_current < cost then
    return -1;
  end if;

  insert into public.user_owned_cosmetics (user_id, cosmetic_id)
  values (p_user_id, p_cosmetic_id);

  update public.profiles
    set coins = coins - cost
  where id = p_user_id and coins >= cost;

  select coins into new_coins from public.profiles where id = p_user_id;
  return COALESCE(new_coins, -1);
exception
  when unique_violation then
    -- Race: already owned, do not charge.
    select coins into new_coins from public.profiles where id = p_user_id;
    return COALESCE(new_coins, -1);
end;
$$;

-- Equip cosmetic
create or replace function public.ssb_equip_cosmetic(p_user_id uuid, p_cosmetic_id text)
returns boolean
language plpgsql
security invoker
set search_path = public
as $$
declare
  ok boolean := false;
  is_adm boolean := false;
  n int := 0;
begin
  if p_user_id is null or auth.uid() is null or p_user_id <> auth.uid() then
    return false;
  end if;

  select coalesce(is_admin, false) into is_adm from public.profiles where id = p_user_id;

  if is_adm then
    update public.profiles
      set equipped_cosmetic_id = p_cosmetic_id
      where id = p_user_id;
    get diagnostics n = row_count;
    return n > 0;
  end if;

  select true into ok
  from public.user_owned_cosmetics
  where user_id = p_user_id and cosmetic_id = p_cosmetic_id
  limit 1;

  if ok is null then
    return false;
  end if;

  update public.profiles
    set equipped_cosmetic_id = p_cosmetic_id
    where id = p_user_id;
  get diagnostics n = row_count;
  return n > 0;
end;
$$;

-- Client RPCs (browser uses anon JWT + authenticated session)
grant execute on function public.ssb_award_preconfigured_coins(uuid, text) to authenticated;
grant execute on function public.ssb_award_daily_challenge_coins(uuid, date) to authenticated;
grant execute on function public.ssb_buy_intensity_unlock(uuid) to authenticated;
grant execute on function public.ssb_buy_cosmetic(uuid, text) to authenticated;
grant execute on function public.ssb_equip_cosmetic(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Mods, featured preconfigured levels, staff announcement (run after main setup)
-- ---------------------------------------------------------------------------

alter table public.profiles
  add column if not exists is_mod boolean not null default false;

comment on column public.profiles.is_mod is 'Moderator: ban/restrict and edit staff message; cannot manage admins or grant mod.';

alter table public.global_levels
  add column if not exists featured_tier text;

alter table public.global_levels
  drop constraint if exists global_levels_featured_tier_chk;

alter table public.global_levels
  add constraint global_levels_featured_tier_chk
  check (featured_tier is null or featured_tier in ('easy', 'medium', 'hard'));

create table if not exists public.game_announcement (
  id smallint primary key default 1,
  body_html text not null default '',
  updated_at timestamptz not null default timezone('utc', now()),
  updated_by uuid references public.profiles (id) on delete set null,
  constraint game_announcement_singleton_chk check (id = 1)
);

insert into public.game_announcement (id, body_html)
values (1, '<p>Welcome! Staff can edit this sparkly message in the Admin or Mod panel.</p>')
on conflict (id) do nothing;

alter table public.game_announcement enable row level security;
alter table public.game_announcement force row level security;

drop policy if exists "game_announcement_select_public" on public.game_announcement;
create policy "game_announcement_select_public"
  on public.game_announcement
  for select
  to anon, authenticated
  using (true);

drop policy if exists "game_announcement_update_staff" on public.game_announcement;
create policy "game_announcement_update_staff"
  on public.game_announcement
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and (coalesce(p.is_admin, false) or coalesce(p.is_mod, false))
    )
  )
  with check (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and (coalesce(p.is_admin, false) or coalesce(p.is_mod, false))
    )
  );

grant select on table public.game_announcement to anon, authenticated;
grant update on table public.game_announcement to authenticated;

-- Staff (admin or mod) can moderate non-admin users
drop policy if exists "user_moderation_select_self_or_admin" on public.user_moderation;
drop policy if exists "user_moderation_select_self_or_staff" on public.user_moderation;
create policy "user_moderation_select_self_or_staff"
  on public.user_moderation
  for select
  to authenticated
  using (
    user_id = auth.uid()
    or exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and (coalesce(p.is_admin, false) or coalesce(p.is_mod, false))
    )
  );

drop policy if exists "user_moderation_upsert_admin_only" on public.user_moderation;
drop policy if exists "user_moderation_upsert_staff" on public.user_moderation;
create policy "user_moderation_upsert_staff"
  on public.user_moderation
  for all
  to authenticated
  using (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and (coalesce(p.is_admin, false) or coalesce(p.is_mod, false))
    )
    and not exists (
      select 1
      from public.profiles t
      where t.id = user_moderation.user_id
        and coalesce(t.is_admin, false)
    )
  )
  with check (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and (coalesce(p.is_admin, false) or coalesce(p.is_mod, false))
    )
    and not exists (
      select 1
      from public.profiles t
      where t.id = user_moderation.user_id
        and coalesce(t.is_admin, false)
    )
  );

-- Level reports: staff by profile flags (not only hardcoded admin emails)
drop policy if exists "level_reports_select_self_or_admin" on public.level_reports;
drop policy if exists "level_reports_select_self_or_staff" on public.level_reports;
create policy "level_reports_select_self_or_staff"
  on public.level_reports
  for select
  to authenticated
  using (
    reporter_user_id = auth.uid()
    or exists (
      select 1
      from public.admin_emails ae
      where lower(ae.email) = lower(auth.jwt() ->> 'email')
    )
    or exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and (coalesce(p.is_admin, false) or coalesce(p.is_mod, false))
    )
  );

drop policy if exists "level_reports_update_admin_only" on public.level_reports;
drop policy if exists "level_reports_update_staff" on public.level_reports;
create policy "level_reports_update_staff"
  on public.level_reports
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.admin_emails ae
      where lower(ae.email) = lower(auth.jwt() ->> 'email')
    )
    or exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and (coalesce(p.is_admin, false) or coalesce(p.is_mod, false))
    )
  )
  with check (
    exists (
      select 1
      from public.admin_emails ae
      where lower(ae.email) = lower(auth.jwt() ->> 'email')
    )
    or exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and (coalesce(p.is_admin, false) or coalesce(p.is_mod, false))
    )
  );

drop policy if exists "global_levels_delete_admin" on public.global_levels;
create policy "global_levels_delete_admin"
  on public.global_levels
  for delete
  to authenticated
  using (
    lower(auth.jwt() ->> 'email') in ('admin01@gmail.com', 'admin02@gmail.com')
    or exists (
      select 1
      from public.profiles p
      where p.id = auth.uid() and coalesce(p.is_admin, false)
    )
  );

-- Admin: set featured tab (easy/medium/hard) for own published global level
create or replace function public.ssb_set_global_level_featured_tier(p_client_level_id text, p_tier text)
returns boolean
language plpgsql
security invoker
set search_path = public
as $$
declare
  n int := 0;
  t text;
begin
  if auth.uid() is null or p_client_level_id is null or length(trim(p_client_level_id)) = 0 then
    return false;
  end if;
  if not exists (select 1 from public.profiles where id = auth.uid() and coalesce(is_admin, false)) then
    return false;
  end if;
  t := lower(trim(p_tier));
  if t = '' or t = 'none' then
    update public.global_levels gl
      set featured_tier = null
      where gl.author_id = auth.uid() and gl.client_level_id = p_client_level_id;
  elsif t in ('easy', 'medium', 'hard') then
    update public.global_levels gl
      set featured_tier = t
      where gl.author_id = auth.uid() and gl.client_level_id = p_client_level_id;
  else
    return false;
  end if;
  get diagnostics n = row_count;
  return n > 0;
end;
$$;

grant execute on function public.ssb_set_global_level_featured_tier(text, text) to authenticated;

-- Admin only: grant or revoke mod (cannot target admins)
create or replace function public.ssb_set_user_mod(p_target_user_id uuid, p_is_mod boolean)
returns boolean
language plpgsql
security invoker
set search_path = public
as $$
declare
  n int := 0;
begin
  if auth.uid() is null or p_target_user_id is null then
    return false;
  end if;
  if not exists (select 1 from public.profiles where id = auth.uid() and coalesce(is_admin, false)) then
    return false;
  end if;
  if exists (select 1 from public.profiles where id = p_target_user_id and coalesce(is_admin, false)) then
    return false;
  end if;
  update public.profiles
    set is_mod = coalesce(p_is_mod, false)
  where id = p_target_user_id;
  get diagnostics n = row_count;
  return n > 0;
end;
$$;

grant execute on function public.ssb_set_user_mod(uuid, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- Fixes: JWT admin_emails = same powers as profiles.is_admin for shop RPCs;
-- global_levels.list_in_global (hide staff preconfigured levels from community list)
-- ---------------------------------------------------------------------------

alter table public.global_levels
  add column if not exists list_in_global boolean not null default true;

comment on column public.global_levels.list_in_global is 'When false, level is staff/preconfigured-only (Easy/Medium/Hard tabs), hidden from Global shared list.';

update public.global_levels
  set list_in_global = false
  where featured_tier is not null
    and list_in_global = true;

create or replace function public.ssb_buy_cosmetic(p_user_id uuid, p_cosmetic_id text)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  cost integer := 0;
  already_owned boolean := false;
  coins_current bigint := 0;
  new_coins bigint := -1;
  is_adm boolean := false;
  jwt_email text;
begin
  select coins, coalesce(is_admin, false) into coins_current, is_adm from public.profiles where id = p_user_id;
  jwt_email := lower(trim(coalesce(auth.jwt() ->> 'email', '')));
  if jwt_email <> '' and exists (select 1 from public.admin_emails ae where lower(ae.email) = jwt_email) then
    is_adm := true;
  end if;

  if coins_current is null then
    return -1;
  end if;

  select cost into cost from public.shop_cosmetics where id = p_cosmetic_id;
  if cost is null then
    return -1;
  end if;

  select true into already_owned
  from public.user_owned_cosmetics
  where user_id = p_user_id and cosmetic_id = p_cosmetic_id
  limit 1;

  if already_owned then
    select coins into new_coins from public.profiles where id = p_user_id;
    return COALESCE(new_coins, -1);
  end if;

  if is_adm then
    insert into public.user_owned_cosmetics (user_id, cosmetic_id)
    values (p_user_id, p_cosmetic_id)
    on conflict (user_id, cosmetic_id) do nothing;
    select coins into new_coins from public.profiles where id = p_user_id;
    return COALESCE(new_coins, -1);
  end if;

  if coins_current < cost then
    return -1;
  end if;

  insert into public.user_owned_cosmetics (user_id, cosmetic_id)
  values (p_user_id, p_cosmetic_id);

  update public.profiles
    set coins = coins - cost
  where id = p_user_id and coins >= cost;

  select coins into new_coins from public.profiles where id = p_user_id;
  return COALESCE(new_coins, -1);
exception
  when unique_violation then
    select coins into new_coins from public.profiles where id = p_user_id;
    return COALESCE(new_coins, -1);
end;
$$;

create or replace function public.ssb_equip_cosmetic(p_user_id uuid, p_cosmetic_id text)
returns boolean
language plpgsql
security invoker
set search_path = public
as $$
declare
  ok boolean := false;
  is_adm boolean := false;
  n int := 0;
  jwt_email text;
begin
  if p_user_id is null or auth.uid() is null or p_user_id <> auth.uid() then
    return false;
  end if;

  select coalesce(is_admin, false) into is_adm from public.profiles where id = p_user_id;
  jwt_email := lower(trim(coalesce(auth.jwt() ->> 'email', '')));
  if jwt_email <> '' and exists (select 1 from public.admin_emails ae where lower(ae.email) = jwt_email) then
    is_adm := true;
  end if;

  if is_adm then
    insert into public.user_owned_cosmetics (user_id, cosmetic_id)
    values (p_user_id, p_cosmetic_id)
    on conflict (user_id, cosmetic_id) do nothing;
    update public.profiles
      set equipped_cosmetic_id = p_cosmetic_id
      where id = p_user_id;
    get diagnostics n = row_count;
    return n > 0;
  end if;

  select true into ok
  from public.user_owned_cosmetics
  where user_id = p_user_id and cosmetic_id = p_cosmetic_id
  limit 1;

  if ok is null then
    return false;
  end if;

  update public.profiles
    set equipped_cosmetic_id = p_cosmetic_id
  where id = p_user_id;
  get diagnostics n = row_count;
  return n > 0;
end;
$$;

-- Admin / JWT admin: publish to preconfigured tab (hidden from global) or community list only
create or replace function public.ssb_admin_publish_level(p_client_level_id text, p_publish_mode text)
returns boolean
language plpgsql
security invoker
set search_path = public
as $$
declare
  n int := 0;
  is_adm boolean := false;
  jwt_email text;
  mode text := lower(trim(p_publish_mode));
begin
  if auth.uid() is null or p_client_level_id is null or length(trim(p_client_level_id)) = 0 then
    return false;
  end if;

  select coalesce(is_admin, false) into is_adm from public.profiles where id = auth.uid();
  jwt_email := lower(trim(coalesce(auth.jwt() ->> 'email', '')));
  if jwt_email <> '' and exists (select 1 from public.admin_emails ae where lower(ae.email) = jwt_email) then
    is_adm := true;
  end if;

  if not is_adm then
    return false;
  end if;

  if mode in ('easy', 'medium', 'hard') then
    update public.global_levels gl
      set featured_tier = mode,
          list_in_global = false
    where gl.author_id = auth.uid() and gl.client_level_id = p_client_level_id;
  elsif mode = 'global' then
    update public.global_levels gl
      set featured_tier = null,
          list_in_global = true
    where gl.author_id = auth.uid() and gl.client_level_id = p_client_level_id;
  else
    return false;
  end if;

  get diagnostics n = row_count;
  return n > 0;
end;
$$;

grant execute on function public.ssb_admin_publish_level(text, text) to authenticated;

