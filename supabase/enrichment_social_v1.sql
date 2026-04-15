-- Self-Sabotage Builder — enrichment: level votes, tags, streak bonus RPC
-- Run in Supabase SQL editor after leaderboard_setup.sql (idempotent).

-- ---------------------------------------------------------------------------
-- Global level engagement columns
-- ---------------------------------------------------------------------------
alter table public.global_levels add column if not exists like_count integer not null default 0;
alter table public.global_levels add column if not exists dislike_count integer not null default 0;
alter table public.global_levels add column if not exists tags text[] not null default '{}';

comment on column public.global_levels.like_count is 'Denormalized like tally (maintained by ssb_vote_global_level).';
comment on column public.global_levels.dislike_count is 'Denormalized dislike tally.';
comment on column public.global_levels.tags is 'Curated tags: speedrun, puzzle, chaos, beginner, hardcore.';

do $$
begin
  alter table public.global_levels
    add constraint global_levels_like_count_nonneg_chk check (like_count >= 0) not valid;
  alter table public.global_levels validate constraint global_levels_like_count_nonneg_chk;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter table public.global_levels
    add constraint global_levels_dislike_count_nonneg_chk check (dislike_count >= 0) not valid;
  alter table public.global_levels validate constraint global_levels_dislike_count_nonneg_chk;
exception when duplicate_object then null;
end $$;

-- ---------------------------------------------------------------------------
-- Per-user votes on shared levels
-- ---------------------------------------------------------------------------
create table if not exists public.global_level_votes (
  level_id uuid not null references public.global_levels (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  vote smallint not null,
  created_at timestamptz not null default timezone('utc', now()),
  constraint global_level_votes_pk primary key (level_id, user_id),
  constraint global_level_votes_vote_chk check (vote in (-1, 1))
);

create index if not exists global_level_votes_level_id_idx on public.global_level_votes (level_id);

alter table public.global_level_votes enable row level security;
alter table public.global_level_votes force row level security;

drop policy if exists "global_level_votes_select_own" on public.global_level_votes;

drop policy if exists "global_level_votes_all_own" on public.global_level_votes;
create policy "global_level_votes_all_own"
  on public.global_level_votes
  for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

grant select, insert, update, delete on table public.global_level_votes to authenticated;

drop policy if exists "global_level_votes_write_not_blocked" on public.global_level_votes;
create policy "global_level_votes_write_not_blocked"
  on public.global_level_votes
  as restrictive
  for all
  to authenticated
  using (not public.ssb_is_blocked(auth.uid()))
  with check (not public.ssb_is_blocked(auth.uid()));

-- ---------------------------------------------------------------------------
-- Atomic vote + counter update (trusted server-side delta)
-- ---------------------------------------------------------------------------
create or replace function public.ssb_vote_global_level(p_level_id uuid, p_vote smallint)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  prev smallint;
begin
  if uid is null then
    raise exception 'not_authenticated';
  end if;
  if p_vote is null or p_vote not in (-1, 1) then
    raise exception 'invalid_vote';
  end if;

  select v.vote into prev
  from public.global_level_votes v
  where v.level_id = p_level_id and v.user_id = uid;

  if prev is null then
    insert into public.global_level_votes (level_id, user_id, vote)
    values (p_level_id, uid, p_vote);
    if p_vote = 1 then
      update public.global_levels set like_count = like_count + 1 where id = p_level_id;
    else
      update public.global_levels set dislike_count = dislike_count + 1 where id = p_level_id;
    end if;
    return;
  end if;

  if prev = p_vote then
    return;
  end if;

  update public.global_level_votes set vote = p_vote, created_at = timezone('utc', now())
  where level_id = p_level_id and user_id = uid;

  if prev = 1 and p_vote = -1 then
    update public.global_levels
      set like_count = greatest(0, like_count - 1), dislike_count = dislike_count + 1
    where id = p_level_id;
  elsif prev = -1 and p_vote = 1 then
    update public.global_levels
      set dislike_count = greatest(0, dislike_count - 1), like_count = like_count + 1
    where id = p_level_id;
  end if;
end;
$$;

revoke all on function public.ssb_vote_global_level(uuid, smallint) from public;
grant execute on function public.ssb_vote_global_level(uuid, smallint) to authenticated;

-- ---------------------------------------------------------------------------
-- Author-only tag update (allowed tags whitelist)
-- ---------------------------------------------------------------------------
create or replace function public.ssb_set_global_level_tags(p_level_id uuid, p_tags text[])
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  cleaned text[] := array[]::text[];
  t text;
  lt text;
begin
  if uid is null then raise exception 'not_authenticated'; end if;

  if not exists (select 1 from public.global_levels gl where gl.id = p_level_id and gl.author_id = uid) then
    raise exception 'forbidden';
  end if;

  if p_tags is null then
    update public.global_levels set tags = '{}' where id = p_level_id;
    return;
  end if;

  foreach t in array p_tags loop
    if t is null then continue; end if;
    lt := lower(trim(t));
    if lt in ('speedrun','puzzle','chaos','beginner','hardcore') then
      cleaned := array_append(cleaned, lt);
    end if;
  end loop;

  select coalesce(array_agg(distinct x order by x), '{}') into cleaned from unnest(cleaned) as x;

  update public.global_levels set tags = coalesce(cleaned, '{}') where id = p_level_id;
end;
$$;

revoke all on function public.ssb_set_global_level_tags(uuid, text[]) from public;
grant execute on function public.ssb_set_global_level_tags(uuid, text[]) to authenticated;

-- ---------------------------------------------------------------------------
-- Small capped coin bonus (streak multiplier top-up after base awards)
-- ---------------------------------------------------------------------------
create or replace function public.ssb_grant_streak_bonus_coins(p_extra integer)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  add_amt integer;
  cur bigint;
begin
  if uid is null then return 0; end if;
  add_amt := greatest(0, least(coalesce(p_extra, 0), 120));

  if add_amt <= 0 then
    return 0;
  end if;

  if public.ssb_is_blocked(uid) then
    return 0;
  end if;

  select coins into cur from public.profiles where id = uid;
  update public.profiles set coins = coalesce(cur, 0) + add_amt where id = uid;
  return add_amt;
end;
$$;

revoke all on function public.ssb_grant_streak_bonus_coins(integer) from public;
grant execute on function public.ssb_grant_streak_bonus_coins(integer) to authenticated;
