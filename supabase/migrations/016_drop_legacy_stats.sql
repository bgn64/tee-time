-- Migration 016 — drop legacy per-hole stat tables.
--
-- The achievement-tags + tracked-stats system is being replaced by
-- a generic per-hole-details framework (migration 017 +
-- scorecards columns in 018). Staging is throwaway — no backfill.
--
-- Tables dropped:
--   * scorecard_achievement_tags  (migration 011)
--   * scorecard_tracked_stats     (migration 012)
--
-- The fill_owner functions get dropped via CASCADE because their
-- triggers were attached to these tables. Explicit DROP FUNCTION
-- lines below cover the case where the function survived (e.g.,
-- someone manually dropped the trigger without the function).
--
-- The shot-attributions table from migration 013 is intentionally
-- preserved — it stores per-(team, hole) ordered contributor lists
-- for scramble rounds, a "complex" stat that doesn't fit the
-- binary/integer generic shape.
--
-- Idempotent: every drop uses `if exists`. Re-runs are no-ops.

drop table if exists public.scorecard_achievement_tags cascade;
drop table if exists public.scorecard_tracked_stats cascade;

drop function if exists public.scorecard_achievement_tags_fill_owner() cascade;
drop function if exists public.scorecard_tracked_stats_fill_owner() cascade;
