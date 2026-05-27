-- Migration 005 — friend visibility for scorecards + scorecard_scores.
--
-- Splits the existing FOR ALL owner-only RLS policies on
-- `scorecards` and `scorecard_scores` (created by migration 002)
-- into:
--
--   SELECT  — owner OR friend-of-owner (drives the friend feed
--             and any direct REST query for a friend's round)
--   INSERT  — owner-only
--   UPDATE  — owner-only
--   DELETE  — owner-only
--
-- The PowerSync sync rules for friend visibility
-- (`friend_scorecards`, `friend_scorecard_scores` in
-- `powersync/sync-config.yaml`) read via the replication slot,
-- which bypasses RLS — so the feed itself works without this
-- migration. Apply it anyway as defense in depth:
--
--   * Aligns the RLS surface with what the app exposes (any future
--     REST query / share link / web feed inherits the friend
--     visibility without surprise).
--   * Prevents PR reviewers tripping over "owner-only RLS but
--     friend-visible feed".
--
-- Run once against your Supabase project after migrations 001
-- through 004 have been applied. Idempotent re-runs are out of
-- scope: the `drop policy if exists` lines below are safe to
-- re-run, but the `create policy` lines are not.

-- =====================================================
-- is_friend_of helper
-- =====================================================
-- Reusable SECURITY DEFINER predicate. Encapsulates the friendship
-- lookup so the per-table SELECT policies stay terse and the
-- semantics ("is the calling user friends with this target user?")
-- live in one place.

create or replace function public.is_friend_of(target uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.friendships
    where user_id = auth.uid()
      and friend_user_id = target
  )
$$;

revoke execute on function public.is_friend_of(uuid) from public;
grant execute on function public.is_friend_of(uuid) to authenticated;

-- =====================================================
-- scorecards
-- =====================================================

drop policy if exists "owned scorecards" on public.scorecards;

create policy "scorecards select self or friend" on public.scorecards
  for select using (
    auth.uid() = owner_user_id
    or public.is_friend_of(owner_user_id)
  );

create policy "scorecards insert own" on public.scorecards
  for insert with check (auth.uid() = owner_user_id);

create policy "scorecards update own" on public.scorecards
  for update using (auth.uid() = owner_user_id)
  with check (auth.uid() = owner_user_id);

create policy "scorecards delete own" on public.scorecards
  for delete using (auth.uid() = owner_user_id);

-- =====================================================
-- scorecard_scores
-- =====================================================

drop policy if exists "scores in owned scorecards" on public.scorecard_scores;

create policy "scorecard_scores select self or friend" on public.scorecard_scores
  for select using (
    auth.uid() = owner_user_id
    or public.is_friend_of(owner_user_id)
  );

create policy "scorecard_scores insert own" on public.scorecard_scores
  for insert with check (auth.uid() = owner_user_id);

create policy "scorecard_scores update own" on public.scorecard_scores
  for update using (auth.uid() = owner_user_id)
  with check (auth.uid() = owner_user_id);

create policy "scorecard_scores delete own" on public.scorecard_scores
  for delete using (auth.uid() = owner_user_id);
