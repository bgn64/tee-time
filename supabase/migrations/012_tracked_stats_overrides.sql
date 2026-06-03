-- Migration 011 — per-(scorer, round) tracked-stats overrides.
--
-- The default tracked-stats set lives in the client
-- (`src/library/golf/achievementTags.ts`: Fairway / GIR / OB / Sand
-- trap, plus Whose shots on scramble). This table stores PER-SCORER
-- overrides for a given round so a scorer can opt-in or opt-out of
-- additional tags without changing anyone else's experience.
--
-- Storage convention (per Q5 decision):
--   * Row absent           → use defaults.
--   * Row with non-empty   → use the listed enabled_tags verbatim.
--   * Row with empty list  → scorer turned every tag off; track zero
--                            stats for that scorer on this round.
--
-- The `(scorecard_id, scorer_id)` natural key is enforced via UNIQUE
-- so we can upsert in place. `owner_user_id` is denormalized for
-- sync-rule scoping; a BEFORE INSERT/UPDATE trigger fills it from
-- the parent scorecards row and rejects mismatches.
--
-- Run once against your Supabase project after migrations 001
-- through 011 have been applied. Re-runs are idempotent (`if not
-- exists` on table/indexes, `drop … if exists` before each trigger
-- and policy, `create or replace` on the function) so a partial
-- apply can be retried safely.

-- =====================================================
-- Table
-- =====================================================

create table if not exists public.scorecard_tracked_stats (
  id text primary key,
  scorecard_id text not null references public.scorecards (id) on delete cascade,
  owner_user_id uuid not null references auth.users (id) on delete cascade,
  scorer_id text not null,
  enabled_tags jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now(),
  constraint scorecard_tracked_stats_unique_per_scorer
    unique (scorecard_id, scorer_id),
  constraint scorecard_tracked_stats_tags_is_array
    check (jsonb_typeof(enabled_tags) = 'array')
);

create index if not exists scorecard_tracked_stats_scorecard_idx
  on public.scorecard_tracked_stats (scorecard_id);

create index if not exists scorecard_tracked_stats_owner_idx
  on public.scorecard_tracked_stats (owner_user_id);

-- =====================================================
-- owner_user_id trigger
-- =====================================================

create or replace function public.scorecard_tracked_stats_fill_owner()
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
    raise exception 'scorecard_tracked_stats: parent scorecard % not found',
      new.scorecard_id
      using errcode = '23503';
  end if;

  if new.owner_user_id is null then
    new.owner_user_id := parent_owner;
  elsif new.owner_user_id <> parent_owner then
    raise exception 'scorecard_tracked_stats: owner_user_id mismatch (% vs parent %)',
      new.owner_user_id, parent_owner
      using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists scorecard_tracked_stats_owner_trg
  on public.scorecard_tracked_stats;

create trigger scorecard_tracked_stats_owner_trg
  before insert or update on public.scorecard_tracked_stats
  for each row
  execute function public.scorecard_tracked_stats_fill_owner();

drop trigger if exists scorecard_tracked_stats_touch_trg
  on public.scorecard_tracked_stats;

create trigger scorecard_tracked_stats_touch_trg
  before update on public.scorecard_tracked_stats
  for each row execute function public.touch_updated_at();

-- =====================================================
-- PowerSync publication
-- =====================================================
-- FOR ALL TABLES publication; new tables join automatically.

-- =====================================================
-- Row Level Security
-- =====================================================
-- Owner-only mutation. Friend READ visibility handled at the
-- sync-stream layer so a friend can see the override and compute
-- aggregates the same way the owner does.

alter table public.scorecard_tracked_stats enable row level security;

drop policy if exists "tracked stats in owned scorecards"
  on public.scorecard_tracked_stats;

create policy "tracked stats in owned scorecards"
  on public.scorecard_tracked_stats
  for ALL
  using (auth.uid() = owner_user_id)
  with check (auth.uid() = owner_user_id);
