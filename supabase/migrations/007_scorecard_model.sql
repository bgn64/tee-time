-- =============================================================================
-- Migration 007: scorecard-owned scoring model (v7 redesign)
-- =============================================================================
-- Apply via Dashboard -> SQL Editor -> paste -> Run.
--
-- Background:
--   The v6 redesign in migration 006 treated rounds as shared artifacts:
--   every named participant got a `round_participants` row whose
--   confirmation_status drove blur, edit-rights, RLS visibility, and stats
--   credit. v7 collapses that to: **a scorecard belongs to its scorer.**
--   Other players named on it are informational; they get no edit-rights,
--   no stats credit, no confirm/deny, no blur. A future "import" feature
--   will let a named friend pull the scoreline onto their own account.
--
--   The `rounds` table is also renamed to `scorecards` to match the new
--   terminology in code and docs.
--
-- Wiped in this migration:
--   round_participants                   (replaced by inline jsonb on scorecards)
--   seed_owner_participant trigger/fn    (no participant rows to seed)
--   participants_after_change trigger/fn (no participant table)
--   user_can_see_round helper            (RLS simplified to owner-or-friend)
--   confirm_participation RPC            (no confirmations)
--   deny_participation RPC               (no denials)
--   leave_round RPC                      (only the scorer owns the card; they delete it)
--   update_score RPC                     (plain owner UPDATE under RLS)
--   merge_unlinked_player RPC            (no historical fanout)
--
-- Net additions:
--   scorecards (renamed from rounds, with new columns: round_id,
--               mentioned_user_ids, participants jsonb)
--   simplified owner-or-friend-of-owner SELECT policy
--
-- Dev DB only: existing scorecard data is truncated.
-- =============================================================================


-- =============================================================================
-- 1. Drop v6 artifacts
-- =============================================================================

-- Drop policies that reference the v6 helpers / tables.
drop policy if exists round_participants_select       on public.round_participants;
drop policy if exists round_participants_insert_owner on public.round_participants;
drop policy if exists rounds_select_via_claim         on public.rounds;
drop policy if exists rounds_select_owner_or_participant on public.rounds;
drop policy if exists rounds_select                   on public.rounds;
drop policy if exists rounds_insert_owner             on public.rounds;
drop policy if exists rounds_update_owner             on public.rounds;
drop policy if exists rounds_delete_owner             on public.rounds;

-- Drop v6 triggers.
drop trigger if exists round_participants_after_change   on public.round_participants;
drop trigger if exists round_participants_touch_updated_at on public.round_participants;
drop trigger if exists rounds_seed_owner_participant     on public.rounds;
drop trigger if exists rounds_touch_updated_at           on public.rounds;

-- Drop v6 trigger functions.
drop function if exists public.participants_after_change();
drop function if exists public.seed_owner_participant();

-- Drop v6 RPCs.
drop function if exists public.confirm_participation(text);
drop function if exists public.deny_participation(text);
drop function if exists public.leave_round(text);
drop function if exists public.update_score(text, text, int, int);
drop function if exists public.merge_unlinked_player(text, uuid);
drop function if exists public.user_can_see_round(text);
drop function if exists public.is_friend_of_round_owner(text);
drop function if exists public.user_owns_round(text);
drop function if exists public.user_has_round_claim(text);

-- Remove round_participants from the realtime publication before dropping.
do $$
begin
  if exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'round_participants'
  ) then
    alter publication supabase_realtime drop table public.round_participants;
  end if;
end $$;

drop table if exists public.round_participants;


-- =============================================================================
-- 2. Rename rounds -> scorecards and reshape
-- =============================================================================

-- Drop the v6 trigger before reshaping (recreated against the new table name).
-- Drop the column added by 006 that's now redundant.
alter table public.rounds drop column if exists owner_participant_key;
alter table public.rounds drop column if exists player_user_ids;

-- Wipe existing data (dev DB).
truncate public.rounds restart identity cascade;

-- Rename the table.
alter table public.rounds rename to scorecards;

-- Rename related indexes for clarity.
alter index if exists rounds_owner_idx        rename to scorecards_owner_idx;
alter index if exists rounds_participants_idx rename to scorecards_mentioned_idx;

-- Add new columns.
alter table public.scorecards
  add column if not exists round_id text,
  add column if not exists mentioned_user_ids uuid[] not null default '{}'::uuid[],
  add column if not exists participants jsonb not null default '[]'::jsonb;

-- Recreate the GIN index against the new column name. (rounds_participants_idx
-- was previously over `player_user_ids`; under the new schema that role is
-- played by `mentioned_user_ids`.)
drop index if exists scorecards_mentioned_idx;
create index scorecards_mentioned_idx
  on public.scorecards using gin (mentioned_user_ids);

-- Re-attach touch_updated_at against the new table.
create trigger scorecards_touch_updated_at
before update on public.scorecards
for each row execute function public.touch_updated_at();

-- Refresh realtime publication: drop the old name if present, add the new.
do $$
begin
  if exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'rounds'
  ) then
    alter publication supabase_realtime drop table public.rounds;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'scorecards'
  ) then
    alter publication supabase_realtime add table public.scorecards;
  end if;
end $$;


-- =============================================================================
-- 3. RLS policies (owner-or-friend-of-owner)
-- =============================================================================
alter table public.scorecards enable row level security;

drop policy if exists scorecards_select on public.scorecards;
create policy scorecards_select on public.scorecards
  for select to authenticated
  using (
    owner_user_id = auth.uid()
    or public.is_friend_of(owner_user_id)
  );

drop policy if exists scorecards_insert_owner on public.scorecards;
create policy scorecards_insert_owner on public.scorecards
  for insert to authenticated
  with check (owner_user_id = auth.uid());

drop policy if exists scorecards_update_owner on public.scorecards;
create policy scorecards_update_owner on public.scorecards
  for update to authenticated
  using (owner_user_id = auth.uid())
  with check (owner_user_id = auth.uid());

drop policy if exists scorecards_delete_owner on public.scorecards;
create policy scorecards_delete_owner on public.scorecards
  for delete to authenticated
  using (owner_user_id = auth.uid());
