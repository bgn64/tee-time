-- =============================================================================
-- Migration 017: live-round scorecards
-- =============================================================================
-- Apply via Dashboard -> SQL Editor -> paste -> Run.
--
-- Adds the small set of fields needed to surface a friend's *in-progress*
-- scorecard at the top of the Feed as a live card.
--
-- Design notes:
--   - The `scorecards` table already has `completed_at` (nullable). The
--     existing `scorecards_select` RLS policy ("owner OR is_friend_of(
--     owner)") does not predicate on completion, so an in-progress row is
--     already visible to friends the moment it's inserted. No RLS change
--     is needed.
--   - The realtime publication on `scorecards` (from migration 001) keeps
--     working unchanged: every score-tap UPDATE is broadcast to subscribed
--     friend clients.
--
-- New columns:
--   is_live_shareable boolean default true
--     Per-round opt-out. The scorer can flip this off when starting a
--     round to hide it from the live strip while still syncing to their
--     own cloud history. Defaults to true so existing rows (all completed
--     and so invisible to the live filter anyway) remain unaffected.
--
--   last_score_at timestamptz
--     Distinct from `updated_at` (which moves on any UPDATE, including a
--     pure is_live_shareable toggle). Set by the client to now() on each
--     score-bearing upsert. The feed query uses it to filter out
--     abandoned tabs: "live rounds with activity in the last 6 hours".
--     Nullable; back-fills as soon as the scorer touches the row.
--
-- New index:
--   scorecards_live_idx — partial index on (owner_user_id, last_score_at
--     desc) where completed_at is null. Keeps the live-strip lookup cheap
--     even as the table grows, and ignores the much larger completed
--     fraction of the table.
-- =============================================================================


alter table public.scorecards
  add column if not exists is_live_shareable boolean not null default true;

alter table public.scorecards
  add column if not exists last_score_at timestamptz;

-- Drop and recreate so re-applying the migration after an iteration that
-- changed the index shape is harmless.
drop index if exists public.scorecards_live_idx;
create index scorecards_live_idx
  on public.scorecards (owner_user_id, last_score_at desc)
  where completed_at is null;
