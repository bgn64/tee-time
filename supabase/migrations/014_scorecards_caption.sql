-- =============================================================================
-- Migration 014: scorecards.caption
-- =============================================================================
-- Apply via Dashboard -> SQL Editor -> paste -> Run.
--
-- Adds an optional user-authored caption to each scorecard. Used by the
-- redesigned Feed card to give rounds a social voice ("Birthday round
-- with Dad - sneaking in birdies on 13 and 17 made it!"). Optional;
-- existing scorecards default to NULL and the UI treats NULL as "no
-- caption row to render."
--
-- No RLS changes required: caption inherits the existing
-- owner-or-friend-of-owner SELECT policy on scorecards. Captions can
-- only be written by the owner (the existing update-owner policy).
-- =============================================================================

alter table public.scorecards
  add column if not exists caption text;
