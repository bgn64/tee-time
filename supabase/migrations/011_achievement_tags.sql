-- Migration 010 — per-(scorer, hole) achievement tags.
--
-- Adds the first net-new synced entity for the round-views
-- redesign: a tags array attached to each (scorecard, scorer, hole)
-- tuple. The list of available tag keys lives in the client
-- (`src/library/golf/achievementTags.ts`) so a new tag can ship
-- without a schema migration — this table just stores opaque
-- string arrays.
--
-- Shape mirrors `scorecard_scores` from migration 002:
--   * Composite natural key `(scorecard_id, scorer_id, hole_number)`
--     enforced via UNIQUE constraint. Upsert on (scorer, hole).
--   * `owner_user_id` denormalized for sync-rule scoping; a BEFORE
--     INSERT/UPDATE trigger fills it from the parent scorecards row
--     and rejects mismatches.
--   * `tags` is a jsonb array of opaque string keys (client owns the
--     vocabulary). Empty array means "scorer explicitly cleared all
--     tags"; absence of a row means "untapped from new" — both
--     render as zero tags on the UI but the storage distinction
--     lets us recompute aggregates without scanning every hole.
--
-- Run once against your Supabase project after migrations 001
-- through 010 have been applied.

-- =====================================================
-- Table
-- =====================================================

create table public.scorecard_achievement_tags (
  id text primary key,
  scorecard_id text not null references public.scorecards (id) on delete cascade,
  owner_user_id uuid not null references auth.users (id) on delete cascade,
  scorer_id text not null,
  hole_number integer not null check (hole_number between 1 and 36),
  tags jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now(),
  constraint scorecard_achievement_tags_unique_per_hole
    unique (scorecard_id, scorer_id, hole_number),
  constraint scorecard_achievement_tags_tags_is_array
    check (jsonb_typeof(tags) = 'array')
);

create index scorecard_achievement_tags_scorecard_idx
  on public.scorecard_achievement_tags (scorecard_id);

create index scorecard_achievement_tags_owner_idx
  on public.scorecard_achievement_tags (owner_user_id);

-- =====================================================
-- owner_user_id trigger
-- =====================================================
-- Same pattern as scorecard_scores_fill_owner (migration 002).

create or replace function public.scorecard_achievement_tags_fill_owner()
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
    raise exception 'scorecard_achievement_tags: parent scorecard % not found',
      new.scorecard_id
      using errcode = '23503';
  end if;

  if new.owner_user_id is null then
    new.owner_user_id := parent_owner;
  elsif new.owner_user_id <> parent_owner then
    raise exception 'scorecard_achievement_tags: owner_user_id mismatch (% vs parent %)',
      new.owner_user_id, parent_owner
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger scorecard_achievement_tags_owner_trg
  before insert or update on public.scorecard_achievement_tags
  for each row
  execute function public.scorecard_achievement_tags_fill_owner();

-- =====================================================
-- updated_at trigger
-- =====================================================
-- Reuse public.touch_updated_at (defined in migration 008).
-- Fires AFTER the fill_owner trigger because triggers on the same
-- event run in name-alphabetical order; "owner_trg" < "touch_trg".

create trigger scorecard_achievement_tags_touch_trg
  before update on public.scorecard_achievement_tags
  for each row execute function public.touch_updated_at();

-- =====================================================
-- PowerSync publication
-- =====================================================
-- FOR ALL TABLES publication; new tables join automatically.

-- =====================================================
-- Row Level Security
-- =====================================================
-- Owner-only SELECT/INSERT/UPDATE/DELETE; friend visibility is
-- handled at the sync-stream layer (own + friend variants in
-- powersync/sync-config.yaml), matching the scorecard_scores
-- pattern from migration 002.

alter table public.scorecard_achievement_tags enable row level security;

create policy "achievement tags in owned scorecards"
  on public.scorecard_achievement_tags
  for ALL
  using (auth.uid() = owner_user_id)
  with check (auth.uid() = owner_user_id);
