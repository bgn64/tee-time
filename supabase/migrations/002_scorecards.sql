-- Migration 002 — scorecards + per-cell scorecard_scores.
--
-- Adds the cloud-side schema for the Score tab (live, multi-device sync
-- of in-progress + abandoned rounds). Designed to compose with the
-- PowerSync starter's existing generic upload connector:
--
--   * `id` is a client-generated text uuid (NOT GENERATED ALWAYS AS),
--     so SupabaseConnector.uploadData's `{ ...op.opData, id: op.id }`
--     pattern works unchanged.
--   * scorecards holds JSON-shaped snapshots (course, participants,
--     player_ids) as native jsonb. The client serializes them as TEXT
--     locally (PowerSync limitation) and re-parses them via the
--     upload connector's JSON_COLUMNS_BY_TABLE hook.
--   * scorecard_scores is one row per (scorecard, scorer, hole) so two
--     devices scoring the same round don't clobber each other on a
--     shared parent row. The natural key is enforced with a UNIQUE
--     constraint so the upload connector's `.upsert(record)` resolves
--     conflicts on insert.
--   * `owner_user_id` is denormalized onto scorecard_scores so the
--     PowerSync sync rule can scope rows by user without a join. A
--     BEFORE INSERT/UPDATE trigger copies the value from the parent
--     scorecards row and rejects mismatches — clients never set it.
--
-- Run once against your Supabase project after migration 001 has been
-- applied. Idempotent re-runs are out of scope: drop the publication
-- entry + the tables manually if you need to re-apply.

-- =====================================================
-- Tables
-- =====================================================

create table public.scorecards (
  id text primary key,
  owner_user_id uuid not null references auth.users (id) on delete cascade,
  course_id text not null,
  course_snapshot jsonb not null,
  scoring_rule text not null default 'stroke',
  hole_range text not null default 'all',
  player_ids jsonb not null default '[]'::jsonb,
  participants jsonb not null default '[]'::jsonb,
  started_at timestamptz not null default now(),
  completed_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index scorecards_owner_started_idx
  on public.scorecards (owner_user_id, started_at desc);

create table public.scorecard_scores (
  id text primary key,
  scorecard_id text not null references public.scorecards (id) on delete cascade,
  owner_user_id uuid not null references auth.users (id) on delete cascade,
  scorer_id text not null,
  hole_number integer not null,
  strokes integer not null,
  updated_at timestamptz not null default now(),
  constraint scorecard_scores_scorer_hole_unique
    unique (scorecard_id, scorer_id, hole_number)
);

create index scorecard_scores_owner_idx
  on public.scorecard_scores (owner_user_id);

create index scorecard_scores_scorecard_idx
  on public.scorecard_scores (scorecard_id);

-- =====================================================
-- owner_user_id trigger
-- =====================================================
-- Copy owner_user_id from the parent scorecards row on insert; reject
-- any update that tries to change it. Clients are expected to leave
-- the column null on inserts (PowerSync sends only what it knows about
-- locally; the trigger fills it in) but if a client does send it we
-- still validate that it matches the parent row.

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

create trigger scorecard_scores_owner_trg
  before insert or update on public.scorecard_scores
  for each row
  execute function public.scorecard_scores_fill_owner();

-- =====================================================
-- PowerSync publication
-- =====================================================
-- The `powersync` publication on this project is defined as FOR ALL
-- TABLES (the PowerSync getting-started default), so new tables join
-- it automatically the moment they're created. Explicit ADD TABLE
-- statements are rejected by Postgres in that mode (SQLSTATE 55000),
-- so we deliberately do nothing here. If you ever re-create the
-- publication with an explicit table list, re-introduce:
--   alter publication powersync add table public.scorecards;
--   alter publication powersync add table public.scorecard_scores;

-- =====================================================
-- Row Level Security
-- =====================================================
alter table public.scorecards enable row level security;
alter table public.scorecard_scores enable row level security;

create policy "owned scorecards" on public.scorecards for ALL using (
  auth.uid() = owner_user_id
) with check (
  auth.uid() = owner_user_id
);

create policy "scores in owned scorecards" on public.scorecard_scores for ALL using (
  auth.uid() = owner_user_id
) with check (
  auth.uid() = owner_user_id
);
