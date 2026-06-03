-- Migration 012 — per-(team, hole) shot attribution for scramble.
--
-- Adds the final net-new synced entity for the round-views redesign:
-- an ordered list of contributor participantKeys for each
-- (scorecard, team, hole) tuple. The list length is intended to
-- match the team's stroke count for that hole; renderers tolerate
-- drift (the list can be shorter or longer than the current stroke
-- count if scores are edited after attribution was recorded) by
-- truncating / padding at read time.
--
-- Only used by scramble rounds. Stroke rounds never write to this
-- table (every shot is attributed to the single scorer).
--
-- Shape mirrors `scorecard_achievement_tags` from migration 011:
--   * Composite natural key `(scorecard_id, team_id, hole_number)`
--     enforced via UNIQUE. Upsert on (team, hole).
--   * `owner_user_id` denormalized for sync-rule scoping; trigger
--     fills from parent scorecards row.
--   * `contributor_ids` is a jsonb array of participantKey strings
--     (`user:{uid}` / `custom:{cid}`). Order matters — the first
--     element is the tee shot per Q6 (plan.md §Phase 6 risks).
--
-- Run once against your Supabase project after migrations 001
-- through 012 have been applied. Re-runs are idempotent (`if not
-- exists` on table/indexes, `drop … if exists` before each trigger
-- and policy, `create or replace` on the function) so a partial
-- apply can be retried safely.

-- =====================================================
-- Table
-- =====================================================

create table if not exists public.scorecard_shot_attributions (
  id text primary key,
  scorecard_id text not null references public.scorecards (id) on delete cascade,
  owner_user_id uuid not null references auth.users (id) on delete cascade,
  team_id text not null,
  hole_number integer not null check (hole_number between 1 and 36),
  contributor_ids jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now(),
  constraint scorecard_shot_attributions_unique_per_hole
    unique (scorecard_id, team_id, hole_number),
  constraint scorecard_shot_attributions_contributors_is_array
    check (jsonb_typeof(contributor_ids) = 'array')
);

create index if not exists scorecard_shot_attributions_scorecard_idx
  on public.scorecard_shot_attributions (scorecard_id);

create index if not exists scorecard_shot_attributions_owner_idx
  on public.scorecard_shot_attributions (owner_user_id);

-- =====================================================
-- owner_user_id trigger
-- =====================================================

create or replace function public.scorecard_shot_attributions_fill_owner()
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
    raise exception 'scorecard_shot_attributions: parent scorecard % not found',
      new.scorecard_id
      using errcode = '23503';
  end if;

  if new.owner_user_id is null then
    new.owner_user_id := parent_owner;
  elsif new.owner_user_id <> parent_owner then
    raise exception 'scorecard_shot_attributions: owner_user_id mismatch (% vs parent %)',
      new.owner_user_id, parent_owner
      using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists scorecard_shot_attributions_owner_trg
  on public.scorecard_shot_attributions;

create trigger scorecard_shot_attributions_owner_trg
  before insert or update on public.scorecard_shot_attributions
  for each row
  execute function public.scorecard_shot_attributions_fill_owner();

drop trigger if exists scorecard_shot_attributions_touch_trg
  on public.scorecard_shot_attributions;

create trigger scorecard_shot_attributions_touch_trg
  before update on public.scorecard_shot_attributions
  for each row execute function public.touch_updated_at();

-- =====================================================
-- PowerSync publication
-- =====================================================
-- FOR ALL TABLES publication; auto-included.

-- =====================================================
-- Row Level Security
-- =====================================================

alter table public.scorecard_shot_attributions enable row level security;

drop policy if exists "shot attributions in owned scorecards"
  on public.scorecard_shot_attributions;

create policy "shot attributions in owned scorecards"
  on public.scorecard_shot_attributions
  for ALL
  using (auth.uid() = owner_user_id)
  with check (auth.uid() = owner_user_id);
