-- Migration 017 — per-(scorer, hole) generic details for a round.
--
-- Replaces the deprecated scorecard_achievement_tags (dropped in
-- migration 016). The new shape carries per-stat values as a JSONB
-- object keyed by stat_key, with values either boolean (binary
-- stats like GIR/FIR) or integer (count stats like OB/Putts).
-- Storage is intentionally open — the DB doesn't enforce which
-- stat_keys exist or which type they take; client-side
-- `src/library/golf/builtInStats.ts` is the source of truth for
-- built-in stat definitions and (later) user-defined custom stats.
--
-- Shape mirrors the post-fix idempotency pattern from 011-014:
--   * Composite natural key `(scorecard_id, scorer_id, hole_number)`
--     enforced via UNIQUE. Sparse — row created on first write for
--     that tuple.
--   * `owner_user_id` denormalized for sync-rule scoping; a BEFORE
--     INSERT/UPDATE trigger fills it from the parent scorecards row
--     and rejects mismatches.
--   * `details` is a JSONB object. Constraint enforces object shape
--     (not array, not scalar); per-key value validation lives in
--     the client. Absence of a key = unset for that stat on that
--     (scorer, hole) tuple.
--
-- Run once against your Supabase project after migration 016 has
-- been applied. Re-runs are idempotent (`if not exists` on
-- table/indexes, `drop … if exists` before each trigger and policy,
-- `create or replace` on the function).

-- =====================================================
-- Table
-- =====================================================

create table if not exists public.scorecard_hole_details (
  id text primary key,
  scorecard_id text not null references public.scorecards (id) on delete cascade,
  owner_user_id uuid not null references auth.users (id) on delete cascade,
  scorer_id text not null,
  hole_number integer not null check (hole_number between 1 and 36),
  details jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  constraint scorecard_hole_details_unique_per_hole
    unique (scorecard_id, scorer_id, hole_number),
  constraint scorecard_hole_details_is_object
    check (jsonb_typeof(details) = 'object')
);

create index if not exists scorecard_hole_details_scorecard_idx
  on public.scorecard_hole_details (scorecard_id);

create index if not exists scorecard_hole_details_owner_idx
  on public.scorecard_hole_details (owner_user_id);

-- =====================================================
-- owner_user_id trigger
-- =====================================================
-- Same pattern as scorecard_scores_fill_owner (migration 002).

create or replace function public.scorecard_hole_details_fill_owner()
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
    raise exception 'scorecard_hole_details: parent scorecard % not found',
      new.scorecard_id
      using errcode = '23503';
  end if;

  if new.owner_user_id is null then
    new.owner_user_id := parent_owner;
  elsif new.owner_user_id <> parent_owner then
    raise exception 'scorecard_hole_details: owner_user_id mismatch (% vs parent %)',
      new.owner_user_id, parent_owner
      using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists scorecard_hole_details_owner_trg
  on public.scorecard_hole_details;

create trigger scorecard_hole_details_owner_trg
  before insert or update on public.scorecard_hole_details
  for each row
  execute function public.scorecard_hole_details_fill_owner();

-- =====================================================
-- updated_at trigger
-- =====================================================
-- Reuse public.touch_updated_at (defined in migration 008).
-- Triggers on the same event run in name-alphabetical order;
-- "owner_trg" < "touch_trg" so owner fills before touch updates.

drop trigger if exists scorecard_hole_details_touch_trg
  on public.scorecard_hole_details;

create trigger scorecard_hole_details_touch_trg
  before update on public.scorecard_hole_details
  for each row execute function public.touch_updated_at();

-- =====================================================
-- PowerSync publication
-- =====================================================
-- FOR ALL TABLES publication; new tables join automatically.

-- =====================================================
-- Row Level Security
-- =====================================================
-- Owner-only at row level; friend visibility is handled at the
-- sync-stream layer (own + friend variants in
-- powersync/sync-config.yaml), matching the scorecard_scores
-- pattern from migration 002.

alter table public.scorecard_hole_details enable row level security;

drop policy if exists "hole details in owned scorecards"
  on public.scorecard_hole_details;

create policy "hole details in owned scorecards"
  on public.scorecard_hole_details
  for ALL
  using (auth.uid() = owner_user_id)
  with check (auth.uid() = owner_user_id);
