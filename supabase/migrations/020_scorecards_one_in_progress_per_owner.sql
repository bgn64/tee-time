-- =============================================================================
-- Migration 020: one in-progress scorecard per owner
-- =============================================================================
-- Apply via Dashboard -> SQL Editor -> paste -> Run.
--
-- Background:
--   The Score tab is intended to support exactly two round exits: Finish
--   (sets `completed_at`) and Abandon (deletes the row). Investigation
--   uncovered platform-level back-gestures (browser swipe on Android web,
--   iOS interactive pop, Android predictive back) that could leak the
--   user out of the locked scoring screen back to the round-config
--   screens. If the user re-configured and tapped "Start round" again,
--   the client created a *new* round id and the previous in-progress
--   `scorecards` row was orphaned — silently lingering in the DB with no
--   `completed_at` until the next `startRound` ran the 12-hour stale
--   sweep.
--
--   Two new client guards land alongside this migration:
--     - Route gates on players.tsx / format.tsx / new-course.tsx that
--       <Redirect> to /scoring while `currentRound` is set.
--     - `startRound` is now idempotent: a no-op when a round is already
--       live.
--   This migration is the data-layer companion: PostgreSQL itself will
--   refuse to keep a second in-progress scorecard for any owner.
--
-- What this migration does:
--   1. Cleanup. Per the operator's explicit confirmation (dev/staging,
--      no scorers mid-round), every existing in-progress row is deleted
--      so we can apply the new constraint without rewriting history. If
--      this migration is ever re-run in an environment where in-progress
--      rounds may be live, REVISIT the cleanup step before applying.
--   2. Add a partial unique index on `(owner_user_id) WHERE completed_at
--      IS NULL`. PostgreSQL semantics:
--        - Multiple completed rows per owner are allowed (every completed
--          round adds a row outside the predicate).
--        - At most ONE in-progress row per owner. A second insert with a
--          different id but `completed_at = NULL` raises 23505.
--      The client's existing upserts use `onConflict: 'id'` (the PK), so
--      the new index is invisible to legitimate same-row UPDATEs; it only
--      fires when a *second* in-progress row would be created.
--
-- Error-handling on the client side:
--   `state/writeQueue.ts` already classifies 23505 as a permanent error
--   → dead-letter + rollback. So a constraint violation does not produce
--   a retry storm; it surfaces via the existing toast/error path.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- 1. Cleanup (dev/staging only — see header note).
-- -----------------------------------------------------------------------------
delete from public.scorecards
where completed_at is null;

-- -----------------------------------------------------------------------------
-- 2. Enforce uniqueness going forward.
-- -----------------------------------------------------------------------------
drop index if exists public.scorecards_owner_in_progress_uniq;
create unique index scorecards_owner_in_progress_uniq
  on public.scorecards (owner_user_id)
  where completed_at is null;

commit;
