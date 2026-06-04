-- Migration 018 — per-round stat configuration on scorecards.
--
-- Adds the two columns that carry the round's stat-tracking
-- configuration, set at round creation and immutable thereafter:
--
--   * enabled_stat_keys  : jsonb array of stat key strings
--     (e.g. ['gir','fir','putts','ob']). Empty array = no stats
--     enabled for this round (Summary tile strip + per-hole input
--     section both render nothing in that case).
--
--   * tracked_scorer_ids : jsonb array of scorer_id strings the
--     enabled stats apply to. Empty array = nobody being tracked
--     (same UI consequence as empty enabled_stat_keys).
--
-- Both default to '[]' for backward compatibility with rounds
-- created before this migration.
--
-- Per-scorer override granularity is deliberately omitted from v1
-- (see plan.md). The "same stats for all selected scorers" model
-- is much simpler to store, render, and explain. If per-(scorer,
-- stat) granularity is needed later, a separate
-- scorecard_enabled_stats table can be layered on top
-- non-breakingly — the columns here become the round-level
-- fallback.
--
-- Idempotent: `add column if not exists` + named check constraints
-- conditionally added via DO blocks. Re-runs are no-ops.

alter table public.scorecards
  add column if not exists enabled_stat_keys jsonb not null default '[]'::jsonb,
  add column if not exists tracked_scorer_ids jsonb not null default '[]'::jsonb;

-- Check constraints — wrap in DO blocks so re-runs don't error on
-- the constraint already existing (ALTER TABLE ADD CONSTRAINT has
-- no IF NOT EXISTS in postgres).
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'scorecards_enabled_stat_keys_is_array'
  ) then
    alter table public.scorecards
      add constraint scorecards_enabled_stat_keys_is_array
      check (jsonb_typeof(enabled_stat_keys) = 'array');
  end if;
end$$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'scorecards_tracked_scorer_ids_is_array'
  ) then
    alter table public.scorecards
      add constraint scorecards_tracked_scorer_ids_is_array
      check (jsonb_typeof(tracked_scorer_ids) = 'array');
  end if;
end$$;
