-- Migration 009 — cutover from legacy schema to PowerSync rewrite.
--
-- This migration is the SINGLE bridge that takes production from the
-- old app's schema (last migration: `002_accept_friend_request_auto_roster`
-- in the legacy repo) to what the new PowerSync rewrite expects. It
-- intentionally does NOT depend on migrations 002–008 from the new
-- repo being applied to prod — those migrations were designed for
-- fresh-install (staging) and conflict with prod's existing tables
-- (`scorecards`, `profiles`, `friendships`, `friend_requests`,
-- `roster_players`, `courses` all already exist with overlapping but
-- non-identical shapes).
--
-- Idempotent end-to-end so an aborted run + re-run is safe. Every
-- CREATE uses `if not exists`, every policy is dropped before
-- recreate, every column add uses `if not exists`, every data
-- transform uses ON CONFLICT or deterministic translations so
-- re-runs are no-ops once the data has already moved.
--
-- DOES NOT DROP LEGACY COLUMNS / TABLES yet (`roster_players`,
-- `scorecards.scores` jsonb, `scorecards.round_id`,
-- `scorecards.mentioned_user_ids`, `scorecards.current_hole_number`,
-- `scorecards.caption`, `scorecards.is_live_shareable`,
-- `scorecards.last_score_at`). Those get a grace period and then
-- get dropped in migration 010 once the new app has been stable in
-- prod for ~1 week.
--
-- SECTIONS
--   A. PowerSync publication
--   B. Shared helpers (touch_updated_at, is_friend_of) + temp
--      pg_temp.rewrite_participant_key used by sections I.4 / I.5 / I.6
--   C. Strip legacy demo-seed plumbing (so dropping is_demo_seed works)
--   D. New columns on existing scorecards (course_id, created_at)
--      — added WITHOUT defaults so the backfill in section I has
--        real work to do
--   E. New tables (scorecard_scores, custom_players, comments)
--   F. Friendships PK swap (compound → synthetic id uuid)
--      — restructured as 6 independently-idempotent steps so an
--        interrupted run is recoverable
--   G. SECURITY DEFINER RPCs for friending + complete_profile
--   H. RLS policy refresh on scorecards / profiles / friend_requests
--   I. Data transforms (the in-place rewrites)
--      I.1 Backfill scorecards.course_id from course_snapshot->>'id'
--      I.2 Backfill scorecards.created_at from started_at
--      I.3 Backfill scorecards.teams from null → '[]'::jsonb
--      I.4 Populate custom_players from TWO sources (runs BEFORE
--          the participantKey rewrite so source B can still read
--          the legacy `custom-player:` prefix from participants):
--          (a) roster_players bare-uuid rows
--          (b) scorecards.participants[*].participantKey of shape
--              "custom-player:<legacy-id>" — those don't appear in
--              roster_players but need a backing row so the
--              custom:<uuid> resolver finds something
--      I.5 Rewrite scorecards.participants[*].participantKey
--          AND scorecards.player_ids[*] AND scorecards.teams[*].playerIds[*]
--      I.6 Fan out scorecards.scores jsonb → scorecard_scores rows
--   J. Tighten constraints (NOT NULL on backfilled columns)
--   K. Drop profiles.is_demo_seed
--   L. Recreate post-008 indexes that aren't already in old prod
--
-- ASSUMPTIONS (verified from the 20260529-143527 prod dump):
--   * 3 profiles, all `is_demo_seed = false` — safe to drop the column.
--   * 8 scorecards (6 scramble + 2 stroke). Score jsonb keys are
--     camelCase (`strokes`, `scorerId`, `holeNumber`). Distinct
--     `scorerId` values in prod are only `"user"` or `"team-N-<ts>"`.
--   * `scorecards.participants[*].participantKey` uses 4 formats in
--     prod data:
--       "user"                           → "user:<owner_user_id>"
--       "player-<friend_uuid>"           → "user:<friend_uuid>"
--       "custom-player:<legacy-id>"      → "custom:<md5(owner:legacy)::uuid>"
--                                          (deterministic mapping; also
--                                           inserts a custom_players row
--                                           with snapshot nickname/color
--                                           so the resolver finds it)
--       "<uuid>"  (bare uuid)            → "custom:<uuid>"
--     The same translation is applied to `player_ids[*]` and
--     `teams[*].playerIds[*]` because both columns carry the same
--     participantKey shapes.
--   * 13 roster_players rows. Three are `id='user'` self-placeholders
--     (skipped); five are `id='player-<uuid>'` friend-linked
--     (skipped — friend graph handles these now); the rest are true
--     custom players that copy to `custom_players` preserving their
--     existing uuid id.

-- =====================================================
-- A. PowerSync publication
-- =====================================================
-- The new app uses PowerSync, which requires a `powersync` logical
-- replication publication on the source DB. Old prod was on a
-- "refresh-only sync" model and never had this publication.
--
-- Validate `puballtables=true` because the new app's migrations
-- assume new tables join the publication automatically. If a stale
-- publication exists with a narrower table list it would silently
-- under-replicate (rows would never reach client devices).

do $$
declare
  is_all_tables boolean;
begin
  select puballtables into is_all_tables
  from pg_publication
  where pubname = 'powersync';

  if is_all_tables is null then
    create publication powersync for all tables;
  elsif not is_all_tables then
    raise exception 'A `powersync` publication exists but is not FOR ALL TABLES. The new app assumes new tables join it automatically. Drop the existing publication (or migrate to an explicit table list including: scorecards, scorecard_scores, profiles, friendships, friend_requests, custom_players, comments) before re-running this migration.';
  end if;
end $$;

-- =====================================================
-- B. Shared helpers
-- =====================================================
-- touch_updated_at + is_friend_of already exist in prod from
-- 001_initial.sql but we re-declare as `create or replace` for
-- parity with the new repo's expectations.

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- The legacy `is_friend_of(other_user_id uuid)` from old prod uses a
-- different parameter name than the new repo's version
-- (`target uuid`). Postgres rejects parameter renames via
-- CREATE OR REPLACE, so we DROP CASCADE here (the old
-- `scorecards_select` policy is collateral damage; section H
-- recreates it as `scorecards select self or friend`).
drop function if exists public.is_friend_of(uuid) cascade;

create or replace function public.is_friend_of(target uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.friendships
    where user_id = auth.uid()
      and friend_user_id = target
  )
$$;

revoke all on function public.is_friend_of(uuid) from public;
grant execute on function public.is_friend_of(uuid) to authenticated;

-- Session-scoped helper used by sections I.4 / I.5 / I.6 to do
-- the legacy → new participantKey translation in one place. Defined
-- in pg_temp so it auto-drops at session end; no public namespace
-- pollution. `immutable` enables index/expression caching during the
-- bulk UPDATEs.
--
-- The four input shapes plus their outputs:
--   "user"                        → "user:" || owner_uuid
--   "player-<uuid>"               → "user:" || uuid
--   "custom-player:<legacy-id>"   → "custom:" || md5(owner||':'||legacy)::uuid
--                                   (deterministic — same input always maps
--                                   to the same uuid, so the same value
--                                   shows up in scorecard_scores, participants,
--                                   player_ids, teams[].playerIds AND the
--                                   custom_players row we insert from it)
--   "<bare-uuid>"                 → "custom:" || legacy   (uuid copies through)
--   anything else                 → legacy  (passthrough, includes already-
--                                   prefixed user:/custom: keys for idempotency)

create or replace function pg_temp.rewrite_participant_key(legacy text, owner uuid)
returns text
language sql
immutable
as $$
  select case
    when legacy is null then null
    when legacy = 'user'
      then 'user:' || owner::text
    when legacy like 'player-%'
      then 'user:' || substring(legacy from 8)
    when legacy like 'custom-player:%'
      then 'custom:' ||
           (md5(owner::text || ':' || substring(legacy from 15)))::uuid::text
    when legacy ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then 'custom:' || legacy
    else legacy
  end;
$$;

-- =====================================================
-- C. Strip legacy demo-seed plumbing
-- =====================================================
-- Must drop the trigger first (depends on the function); the function
-- and the partial index then become safe to drop. Section K finally
-- drops the column itself after RLS / RPCs that touch profiles have
-- been refreshed.

drop trigger if exists profiles_auto_friend_demo_seeds on public.profiles;
drop function if exists public.auto_friend_demo_seeds();
drop index if exists public.profiles_demo_seed_idx;

-- =====================================================
-- D. New columns on existing scorecards
-- =====================================================
-- Added WITHOUT defaults so the backfill in section I has real work
-- to do on existing rows. Defaults + NOT NULL come back in section J
-- after the backfill lands.
--
-- NOTE: `teams` already exists in old prod (from the pre-squash
-- 006_scramble.sql) but is nullable without default — align it with
-- the new schema's `not null default '[]'::jsonb`. The default is
-- harmless to set up-front; the NOT NULL goes in J.

alter table public.scorecards
  add column if not exists course_id text;

alter table public.scorecards
  add column if not exists created_at timestamptz;

alter table public.scorecards
  alter column teams set default '[]'::jsonb;

-- =====================================================
-- E. New tables (don't exist in old prod)
-- =====================================================

-- ---- E.1 scorecard_scores --------------------------------------------
create table if not exists public.scorecard_scores (
  id            text        primary key,
  scorecard_id  text        not null references public.scorecards (id) on delete cascade,
  owner_user_id uuid        not null references auth.users (id) on delete cascade,
  scorer_id     text        not null,
  hole_number   integer     not null,
  strokes       integer     not null,
  updated_at    timestamptz not null default now(),
  constraint scorecard_scores_scorer_hole_unique
    unique (scorecard_id, scorer_id, hole_number)
);

create index if not exists scorecard_scores_owner_idx
  on public.scorecard_scores (owner_user_id);

create index if not exists scorecard_scores_scorecard_idx
  on public.scorecard_scores (scorecard_id);

-- BEFORE INSERT/UPDATE trigger: copy owner_user_id from the parent
-- scorecard if the client didn't set it; reject mismatches.
create or replace function public.scorecard_scores_fill_owner()
returns trigger
language plpgsql
as $$
declare
  parent_owner uuid;
begin
  select owner_user_id into parent_owner
    from public.scorecards
    where id = new.scorecard_id;

  if parent_owner is null then
    raise exception 'scorecard_scores: parent scorecard % not found', new.scorecard_id
      using errcode = '23503';
  end if;

  if new.owner_user_id is null then
    new.owner_user_id := parent_owner;
  elsif new.owner_user_id <> parent_owner then
    raise exception 'scorecard_scores: owner_user_id mismatch (% vs parent %)',
      new.owner_user_id, parent_owner
      using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists scorecard_scores_owner_trg on public.scorecard_scores;
create trigger scorecard_scores_owner_trg
  before insert or update on public.scorecard_scores
  for each row
  execute function public.scorecard_scores_fill_owner();

alter table public.scorecard_scores enable row level security;

drop policy if exists "scorecard_scores select self or friend" on public.scorecard_scores;
drop policy if exists "scorecard_scores insert own"            on public.scorecard_scores;
drop policy if exists "scorecard_scores update own"            on public.scorecard_scores;
drop policy if exists "scorecard_scores delete own"            on public.scorecard_scores;

create policy "scorecard_scores select self or friend" on public.scorecard_scores
  for select using (
    auth.uid() = owner_user_id
    or public.is_friend_of(owner_user_id)
  );
create policy "scorecard_scores insert own" on public.scorecard_scores
  for insert with check (auth.uid() = owner_user_id);
create policy "scorecard_scores update own" on public.scorecard_scores
  for update using (auth.uid() = owner_user_id)
  with check (auth.uid() = owner_user_id);
create policy "scorecard_scores delete own" on public.scorecard_scores
  for delete using (auth.uid() = owner_user_id);

-- ---- E.2 custom_players ----------------------------------------------
create table if not exists public.custom_players (
  id            uuid        primary key default gen_random_uuid(),
  owner_user_id uuid        not null references auth.users(id) on delete cascade,
  nickname      text        not null check (length(trim(nickname)) > 0),
  avatar_color  text        not null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz
);

create index if not exists custom_players_by_owner
  on public.custom_players(owner_user_id);

create index if not exists custom_players_owner_active_idx
  on public.custom_players(owner_user_id) where deleted_at is null;

alter table public.custom_players enable row level security;

drop policy if exists custom_players_select on public.custom_players;
drop policy if exists custom_players_insert on public.custom_players;
drop policy if exists custom_players_update on public.custom_players;
drop policy if exists custom_players_delete on public.custom_players;

create policy custom_players_select on public.custom_players
  for select to authenticated using (owner_user_id = auth.uid());
create policy custom_players_insert on public.custom_players
  for insert to authenticated with check (owner_user_id = auth.uid());
create policy custom_players_update on public.custom_players
  for update to authenticated
  using (owner_user_id = auth.uid())
  with check (owner_user_id = auth.uid());
create policy custom_players_delete on public.custom_players
  for delete to authenticated using (owner_user_id = auth.uid());

-- ---- E.3 comments ----------------------------------------------------
create table if not exists public.comments (
  id              text        primary key,
  round_id        text        not null references public.scorecards (id) on delete cascade,
  author_user_id  uuid        not null references auth.users (id) on delete cascade,
  body            text        not null check (char_length(body) between 1 and 1000),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz
);

create index if not exists comments_round_created_idx
  on public.comments (round_id, created_at);
create index if not exists comments_author_idx
  on public.comments (author_user_id);

alter table public.comments enable row level security;

drop policy if exists "comments select self or friend" on public.comments;
drop policy if exists "comments insert if visible"      on public.comments;
drop policy if exists "comments update own"             on public.comments;

create policy "comments select self or friend" on public.comments
  for select using (
    exists (
      select 1 from public.scorecards s
      where s.id = comments.round_id
        and (auth.uid() = s.owner_user_id or public.is_friend_of(s.owner_user_id))
    )
  );
create policy "comments insert if visible" on public.comments
  for insert with check (
    author_user_id = auth.uid()
    and exists (
      select 1 from public.scorecards s
      where s.id = comments.round_id
        and (auth.uid() = s.owner_user_id or public.is_friend_of(s.owner_user_id))
    )
  );
create policy "comments update own" on public.comments
  for update
  using (author_user_id = auth.uid())
  with check (author_user_id = auth.uid());

-- =====================================================
-- F. Friendships PK swap (compound → synthetic id uuid)
-- =====================================================
-- PowerSync requires a single-column `id` on every synced row. Old
-- prod's `friendships` table is keyed on the compound (user_id,
-- friend_user_id); we swap that to a synthetic `id uuid` PK and
-- preserve the original invariant with a UNIQUE constraint.
--
-- Each step below is independently idempotent so a re-run after a
-- partial failure picks up cleanly.

-- F.1: Add `id` column.
alter table public.friendships
  add column if not exists id uuid default gen_random_uuid();

-- F.2: Backfill any NULL ids (existing rows added before the default).
update public.friendships set id = gen_random_uuid() where id is null;

-- F.3: Make id NOT NULL.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name   = 'friendships'
      and column_name  = 'id'
      and is_nullable  = 'YES'
  ) then
    alter table public.friendships alter column id set not null;
  end if;
end $$;

-- F.4: Drop the old compound PK if the current PK isn't on (id).
do $$
declare
  pk_def text;
begin
  select pg_get_constraintdef(c.oid) into pk_def
    from pg_constraint c
   where c.conrelid = 'public.friendships'::regclass
     and c.contype  = 'p';
  if pk_def is not null and pk_def <> 'PRIMARY KEY (id)' then
    alter table public.friendships drop constraint if exists friendships_pkey;
  end if;
end $$;

-- F.5: Add the new PK on (id) if no PK currently exists.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.friendships'::regclass
      and contype  = 'p'
  ) then
    alter table public.friendships add primary key (id);
  end if;
end $$;

-- F.6: Add the UNIQUE constraint preserving the symmetric-two-rows
-- invariant. Sanity-check for duplicates first: the old compound PK
-- enforced uniqueness, so this should be a no-op assertion, but
-- defensive in case some replicate-from-dump path bypassed it.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.friendships'::regclass
      and conname  = 'friendships_user_friend_uniq'
  ) then
    if exists (
      select 1 from public.friendships
      group by user_id, friend_user_id
      having count(*) > 1
    ) then
      raise exception
        'friendships has duplicate (user_id, friend_user_id) pairs — cannot add UNIQUE constraint. Investigate and dedupe before re-running.';
    end if;
    alter table public.friendships
      add constraint friendships_user_friend_uniq unique (user_id, friend_user_id);
  end if;
end $$;

-- =====================================================
-- G. SECURITY DEFINER RPCs (complete_profile + friend graph)
-- =====================================================
-- All `create or replace`, so re-runs simply update the body. The
-- prod-existing `accept_friend_request` is replaced with the new
-- atomic accept-with-friendship-insert version.

create or replace function public.complete_profile(
  p_handle text,
  p_display_name text,
  p_avatar_color text
) returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  existing public.profiles%rowtype;
  inserted public.profiles%rowtype;
begin
  if me is null then
    raise exception 'not authenticated';
  end if;
  select * into existing from public.profiles where user_id = me;
  if found then
    return existing;
  end if;
  insert into public.profiles (user_id, handle, display_name, avatar_color)
    values (me, p_handle, p_display_name, p_avatar_color)
    returning * into inserted;
  return inserted;
end;
$$;

create or replace function public.send_friend_request(target_user_id uuid)
returns public.friend_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  reciprocal public.friend_requests%rowtype;
  inserted public.friend_requests%rowtype;
  already_friends boolean;
begin
  if me is null then raise exception 'not authenticated'; end if;
  if target_user_id = me then raise exception 'Cannot friend yourself'; end if;
  perform 1 from public.profiles where user_id = target_user_id;
  if not found then raise exception 'User not found'; end if;

  select exists (
    select 1 from public.friendships
    where user_id = me and friend_user_id = target_user_id
  ) into already_friends;
  if already_friends then raise exception 'Already friends'; end if;

  select * into reciprocal
    from public.friend_requests
    where from_user_id = target_user_id and to_user_id = me
      and status = 'pending'
    for update;
  if found then
    update public.friend_requests
      set status = 'accepted', updated_at = now()
      where id = reciprocal.id
      returning * into reciprocal;
    insert into public.friendships (user_id, friend_user_id)
      values (me, target_user_id) on conflict do nothing;
    insert into public.friendships (user_id, friend_user_id)
      values (target_user_id, me) on conflict do nothing;
    return reciprocal;
  end if;

  insert into public.friend_requests (from_user_id, to_user_id, status)
    values (me, target_user_id, 'pending')
    returning * into inserted;
  return inserted;
end;
$$;

create or replace function public.accept_friend_request(request_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  req public.friend_requests%rowtype;
begin
  if me is null then raise exception 'not authenticated'; end if;
  select * into req from public.friend_requests where id = request_id for update;
  if not found then raise exception 'Friend request not found'; end if;
  if req.to_user_id <> me then raise exception 'You are not the recipient'; end if;
  if req.status <> 'pending' then raise exception 'Friend request is no longer pending'; end if;

  update public.friend_requests
    set status = 'accepted', updated_at = now()
    where id = request_id;

  update public.friend_requests
    set status = 'accepted', updated_at = now()
    where from_user_id = me
      and to_user_id = req.from_user_id
      and status = 'pending';

  insert into public.friendships (user_id, friend_user_id)
    values (req.from_user_id, req.to_user_id) on conflict do nothing;
  insert into public.friendships (user_id, friend_user_id)
    values (req.to_user_id, req.from_user_id) on conflict do nothing;
end;
$$;

create or replace function public.decline_friend_request(request_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  req public.friend_requests%rowtype;
begin
  if me is null then raise exception 'not authenticated'; end if;
  select * into req from public.friend_requests where id = request_id;
  if not found then raise exception 'Friend request not found'; end if;
  if req.to_user_id <> me then raise exception 'You are not the recipient'; end if;
  update public.friend_requests
    set status = 'declined', updated_at = now()
    where id = request_id and status = 'pending';
end;
$$;

create or replace function public.cancel_friend_request(request_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  req public.friend_requests%rowtype;
begin
  if me is null then raise exception 'not authenticated'; end if;
  select * into req from public.friend_requests where id = request_id;
  if not found then raise exception 'Friend request not found'; end if;
  if req.from_user_id <> me then raise exception 'You are not the sender'; end if;
  update public.friend_requests
    set status = 'declined', updated_at = now()
    where id = request_id and status = 'pending';
end;
$$;

create or replace function public.unfriend(target_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
begin
  if me is null then raise exception 'not authenticated'; end if;
  if target_user_id = me then raise exception 'Cannot unfriend yourself'; end if;
  delete from public.friendships
    where (user_id = me and friend_user_id = target_user_id)
       or (user_id = target_user_id and friend_user_id = me);
  update public.friend_requests
    set status = 'declined', updated_at = now()
    where status = 'pending'
      and (
        (from_user_id = me and to_user_id = target_user_id)
        or
        (from_user_id = target_user_id and to_user_id = me)
      );
end;
$$;

revoke all on function public.complete_profile(text, text, text) from public;
revoke all on function public.send_friend_request(uuid)          from public;
revoke all on function public.accept_friend_request(uuid)        from public;
revoke all on function public.decline_friend_request(uuid)       from public;
revoke all on function public.cancel_friend_request(uuid)        from public;
revoke all on function public.unfriend(uuid)                     from public;

grant execute on function public.complete_profile(text, text, text) to authenticated;
grant execute on function public.send_friend_request(uuid)          to authenticated;
grant execute on function public.accept_friend_request(uuid)        to authenticated;
grant execute on function public.decline_friend_request(uuid)       to authenticated;
grant execute on function public.cancel_friend_request(uuid)        to authenticated;
grant execute on function public.unfriend(uuid)                     to authenticated;

-- =====================================================
-- H. RLS policy refresh
-- =====================================================
-- Replace the legacy direct-write policies on profiles +
-- friend_requests with the new write-via-RPC-only model. The legacy
-- scorecards policies (owner-only, no friend visibility) are
-- replaced with the friend-visible set.

-- ---- profiles --------------------------------------------------------
-- Drop the legacy direct-INSERT policy; INSERTs now flow through
-- complete_profile RPC.
drop policy if exists profiles_insert_self on public.profiles;
drop policy if exists profiles_select_all  on public.profiles;
drop policy if exists profiles_update_self on public.profiles;

create policy profiles_select_all on public.profiles
  for select to authenticated using (true);
create policy profiles_update_self on public.profiles
  for update to authenticated using (user_id = auth.uid());

-- ---- friend_requests -------------------------------------------------
-- Drop the legacy direct INSERT + UPDATE policies; both flows now
-- go through SECURITY DEFINER RPCs.
drop policy if exists friend_requests_insert_sender on public.friend_requests;
drop policy if exists friend_requests_update_either on public.friend_requests;
drop policy if exists friend_requests_select        on public.friend_requests;

create policy friend_requests_select on public.friend_requests
  for select to authenticated
  using (from_user_id = auth.uid() or to_user_id = auth.uid());

-- ---- friendships -----------------------------------------------------
drop policy if exists friendships_select on public.friendships;

create policy friendships_select on public.friendships
  for select to authenticated
  using (user_id = auth.uid() or friend_user_id = auth.uid());

-- ---- scorecards (owner-only → owner OR friend) -----------------------
drop policy if exists scorecards_select        on public.scorecards;
drop policy if exists scorecards_insert_owner  on public.scorecards;
drop policy if exists scorecards_update_owner  on public.scorecards;
drop policy if exists scorecards_delete_owner  on public.scorecards;
drop policy if exists "scorecards select self or friend" on public.scorecards;
drop policy if exists "scorecards insert own"            on public.scorecards;
drop policy if exists "scorecards update own"            on public.scorecards;
drop policy if exists "scorecards delete own"            on public.scorecards;
drop policy if exists "owned scorecards"                 on public.scorecards;

create policy "scorecards select self or friend" on public.scorecards
  for select using (
    auth.uid() = owner_user_id
    or public.is_friend_of(owner_user_id)
  );
create policy "scorecards insert own" on public.scorecards
  for insert with check (auth.uid() = owner_user_id);
create policy "scorecards update own" on public.scorecards
  for update using (auth.uid() = owner_user_id)
  with check (auth.uid() = owner_user_id);
create policy "scorecards delete own" on public.scorecards
  for delete using (auth.uid() = owner_user_id);

-- =====================================================
-- I. Data transforms
-- =====================================================
-- Every write here is idempotent: WHERE clauses + ON CONFLICT
-- guards mean re-running the section is a no-op after the first
-- successful pass. All key rewrites use
-- `pg_temp.rewrite_participant_key` so the same legacy input
-- produces the same new key everywhere (participants jsonb,
-- player_ids jsonb, teams[].playerIds jsonb, custom_players row,
-- and scorecard_scores.scorer_id).

-- ---- I.1 scorecards.course_id backfill -------------------------------
update public.scorecards
   set course_id = course_snapshot->>'id'
 where course_id is null
   and course_snapshot ? 'id'
   and (course_snapshot->>'id') is not null
   and (course_snapshot->>'id') <> '';

-- ---- I.2 scorecards.created_at backfill ------------------------------
-- Best proxy is `started_at` (when the round was created).
update public.scorecards
   set created_at = started_at
 where created_at is null;

-- ---- I.3 scorecards.teams backfill -----------------------------------
update public.scorecards
   set teams = '[]'::jsonb
 where teams is null;

-- ---- I.4 Populate custom_players (TWO sources) ----------------------
-- IMPORTANT ORDER NOTE: this section runs BEFORE the participantKey
-- rewrite (I.5) because source B reads from `participants` looking
-- for the legacy `custom-player:` prefix. After I.5 rewrites those
-- to `custom:<md5-uuid>`, source B's WHERE clause would find
-- nothing and we'd be left with orphaned `custom:<uuid>` participants
-- whose backing custom_players row was never inserted.
--
-- Source A: roster_players rows that are true custom players
-- (id is a valid uuid; linked_user_id is null; not the "user"
-- self-placeholder; not a friend-linked "player-..." entry).
insert into public.custom_players
  (id, owner_user_id, nickname, avatar_color, created_at, updated_at, deleted_at)
select
  rp.id::uuid,
  rp.owner_user_id,
  rp.nickname,
  coalesce(rp.color, '#999999'),
  rp.updated_at,
  rp.updated_at,
  null
from public.roster_players rp
where rp.id <> 'user'
  and rp.id not like 'player-%'
  and rp.linked_user_id is null
  and rp.id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
on conflict (id) do nothing;

-- Source B: legacy "custom-player:<id>" participants that don't have
-- a roster_players backing row. Without an entry in custom_players,
-- the new resolver would render these as "Player". The deterministic
-- md5-derived uuid here matches what `pg_temp.rewrite_participant_key`
-- produces in I.5 + I.6, so the rewritten `custom:<uuid>` keys point
-- at this row. Nickname / color come from the participant snapshot
-- (localDisplayName / localDisplayColor) that the old app already
-- carried.
insert into public.custom_players
  (id, owner_user_id, nickname, avatar_color, created_at, updated_at, deleted_at)
select distinct on (derived_id)
  derived_id,
  owner_user_id,
  nickname,
  avatar_color,
  created_at,
  updated_at,
  null
from (
  select
    (md5(s.owner_user_id::text || ':' || substring(p->>'participantKey' from 15)))::uuid as derived_id,
    s.owner_user_id,
    coalesce(nullif(trim(p->>'localDisplayName'), ''),  'Player')   as nickname,
    coalesce(nullif(trim(p->>'localDisplayColor'), ''), '#999999') as avatar_color,
    s.updated_at as created_at,
    s.updated_at as updated_at
  from public.scorecards s
  cross join lateral jsonb_array_elements(s.participants) as p
  where (p->>'participantKey') like 'custom-player:%'
) src
on conflict (id) do nothing;

-- ---- I.5 ParticipantKey rewrite (THREE jsonb surfaces) ---------------
-- The same legacy participantKey shape lives in three columns on
-- scorecards:
--   * participants[*].participantKey  — full participant records
--   * player_ids[*]                   — flat array of keys
--   * teams[*].playerIds[*]           — keys nested inside team rows
-- Each is rewritten with the same helper. WITH ORDINALITY preserves
-- input order so the rewritten jsonb arrays line up with the
-- originals.

-- I.5.a participants[*].participantKey
update public.scorecards s
   set participants = (
     select jsonb_agg(
       jsonb_set(
         p,
         '{participantKey}',
         to_jsonb(pg_temp.rewrite_participant_key(p->>'participantKey', s.owner_user_id))
       )
       order by ord
     )
     from jsonb_array_elements(s.participants) with ordinality as t(p, ord)
   )
 where jsonb_typeof(s.participants) = 'array'
   and exists (
     select 1 from jsonb_array_elements(s.participants) as p
     where pg_temp.rewrite_participant_key(p->>'participantKey', s.owner_user_id)
        <> (p->>'participantKey')
   );

-- I.5.b player_ids[*]
update public.scorecards s
   set player_ids = (
     select jsonb_agg(
       to_jsonb(pg_temp.rewrite_participant_key(pid #>> '{}', s.owner_user_id))
       order by ord
     )
     from jsonb_array_elements(s.player_ids) with ordinality as t(pid, ord)
   )
 where jsonb_typeof(s.player_ids) = 'array'
   and exists (
     select 1 from jsonb_array_elements(s.player_ids) as pid
     where pg_temp.rewrite_participant_key(pid #>> '{}', s.owner_user_id)
        <> (pid #>> '{}')
   );

-- I.5.c teams[*].playerIds[*]
update public.scorecards s
   set teams = (
     select jsonb_agg(
       jsonb_set(
         team,
         '{playerIds}',
         coalesce(
           (
             select jsonb_agg(
               to_jsonb(pg_temp.rewrite_participant_key(pid #>> '{}', s.owner_user_id))
               order by pord
             )
             from jsonb_array_elements(team->'playerIds') with ordinality as tp(pid, pord)
           ),
           '[]'::jsonb
         )
       )
       order by ord
     )
     from jsonb_array_elements(s.teams) with ordinality as t(team, ord)
   )
 where jsonb_typeof(s.teams) = 'array'
   and exists (
     select 1
     from jsonb_array_elements(s.teams) as team,
          jsonb_array_elements(team->'playerIds') as pid
     where pg_temp.rewrite_participant_key(pid #>> '{}', s.owner_user_id)
        <> (pid #>> '{}')
   );

-- ---- I.6 Fan out scorecards.scores → scorecard_scores ---------------
-- Each element of the jsonb array becomes one row in scorecard_scores.
-- scorer_id translation uses the same rewrite helper so a stroke-mode
-- "user" scorer maps to the same `user:<uuid>` as the participant
-- record. Team scorerIds (`team-N-<unix-ms>`) pass through unchanged
-- via the helper's else branch.
--
-- The unique constraint + ON CONFLICT DO NOTHING makes re-runs safe
-- once initial fan-out has landed; new strokes added to the legacy
-- jsonb between runs (shouldn't happen — the old app is offline
-- during cutover — but defensive) would be merged in on the next
-- run because they'd not conflict on the natural key.
insert into public.scorecard_scores
  (id, scorecard_id, owner_user_id, scorer_id, hole_number, strokes, updated_at)
select
  gen_random_uuid()::text,
  s.id,
  s.owner_user_id,
  pg_temp.rewrite_participant_key(score->>'scorerId', s.owner_user_id),
  (score->>'holeNumber')::integer,
  (score->>'strokes')::integer,
  s.updated_at
from public.scorecards s
cross join lateral jsonb_array_elements(s.scores) as score
where jsonb_typeof(s.scores)    = 'array'
  and (score->>'scorerId')   is not null
  and (score->>'holeNumber') is not null
  and (score->>'strokes')    is not null
on conflict (scorecard_id, scorer_id, hole_number) do nothing;

-- =====================================================
-- J. Tighten constraints (NOT NULL after backfill)
-- =====================================================

alter table public.scorecards
  alter column course_id  set not null,
  alter column created_at set not null,
  alter column created_at set default now(),
  alter column teams      set not null;

-- =====================================================
-- K. Drop profiles.is_demo_seed
-- =====================================================
-- Trigger + function + partial index were dropped in section C.
-- Column drop is now safe.

alter table public.profiles drop column if exists is_demo_seed;

-- =====================================================
-- L. Recreate post-008 indexes that aren't already in old prod
-- =====================================================
-- Old prod has its own scorecards / friend_requests indexes (from
-- 001_initial.sql), but missing a couple the new repo expects. Add
-- them so prod's query plans match staging's.

create index if not exists profiles_handle_prefix_idx
  on public.profiles (handle text_pattern_ops);

create index if not exists scorecards_owner_started_idx
  on public.scorecards (owner_user_id, started_at desc);

create unique index if not exists friend_requests_unique_pending
  on public.friend_requests (from_user_id, to_user_id)
  where status = 'pending';

create index if not exists friend_requests_to_user_idx
  on public.friend_requests (to_user_id, status);

create index if not exists friend_requests_from_user_idx
  on public.friend_requests (from_user_id, status);
