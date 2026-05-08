-- =============================================================================
-- Migration 005: friends-of-owner visibility for rounds and round_claims
-- =============================================================================
-- Apply via Dashboard -> SQL Editor -> paste -> Run.
--
-- Background:
--   Phase D + 002 + 004 made round visibility "owner OR participant with a
--   claim row." That meant a friend's solo round was invisible to you. The
--   Feed tab is much more useful when friends can see each other's rounds
--   regardless of participation -- and that's the visibility default we want.
--
-- This migration:
--   - Adds is_friend_of(uuid) and is_friend_of_round_owner(text) helpers
--     (SECURITY DEFINER to break RLS recursion against friendships).
--   - Extends rounds.SELECT to also allow friends of the owner.
--   - Extends round_claims.SELECT so the same friends can see claim chips.
--
-- Future granularity (private / friends / public) plugs in by adding a
-- rounds.visibility column and tightening the policy. Not done here.
-- =============================================================================


create or replace function public.is_friend_of(other_user_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.friendships
    where user_id = auth.uid() and friend_user_id = other_user_id
  );
$$;

revoke all on function public.is_friend_of(uuid) from public;
grant execute on function public.is_friend_of(uuid) to authenticated;


create or replace function public.is_friend_of_round_owner(p_round_id text)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.rounds r
    join public.friendships f on f.friend_user_id = r.owner_user_id
    where r.id = p_round_id
      and f.user_id = auth.uid()
  );
$$;

revoke all on function public.is_friend_of_round_owner(text) from public;
grant execute on function public.is_friend_of_round_owner(text) to authenticated;


-- Replace rounds SELECT policy.
drop policy if exists rounds_select_via_claim on public.rounds;
create policy rounds_select_via_claim on public.rounds
  for select to authenticated
  using (
    owner_user_id = auth.uid()
    or public.user_has_round_claim(rounds.id)
    or public.is_friend_of(rounds.owner_user_id)
  );


-- Replace round_claims SELECT policy.
drop policy if exists round_claims_select on public.round_claims;
create policy round_claims_select on public.round_claims
  for select to authenticated
  using (
    claimant_user_id = auth.uid()
    or public.user_owns_round(round_claims.round_id)
    or public.is_friend_of_round_owner(round_claims.round_id)
  );