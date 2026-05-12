-- =============================================================================
-- Migration 013: scorecards.hole_range
-- =============================================================================
-- Apply via Dashboard -> SQL Editor -> paste -> Run.
--
-- Phase 2 of the tees / hole-range / enhanced-scorecard feature.
--
-- Adds a `hole_range` column to public.scorecards so a Round can record
-- which subset of the course's holes is in play. Default 'all' means
-- existing rows behave unchanged.
--
-- A CHECK constraint pins the value to the three allowed strings. The
-- per-participant teeId lives inside the existing participants jsonb;
-- no schema change for that one.
-- =============================================================================

alter table public.scorecards
  add column if not exists hole_range text not null default 'all';

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'scorecards_hole_range_check'
       and conrelid = 'public.scorecards'::regclass
  ) then
    alter table public.scorecards
      add constraint scorecards_hole_range_check
      check (hole_range in ('all', 'front9', 'back9'));
  end if;
end$$;
