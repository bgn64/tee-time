-- =============================================================================
-- Migration 003: break RLS recursion between rounds and round_claims
-- =============================================================================
-- Apply via Dashboard -> SQL Editor -> paste -> Run.
--
-- The Migration 002 SELECT policy on `rounds` referenced `round_claims`,
-- and the existing SELECT policy on `round_claims` referenced `rounds`.
-- Postgres detects this as infinite recursion and aborts every read.
--
-- Fix: extract the cross-table membership checks into SECURITY DEFINER
-- functions that bypass RLS for the inner query, so the policy evaluation
-- terminates.
-- =============================================================================


create or replace function public.user_has_round_claim(p_round_id text)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.round_claims
    where round_claims.round_id = p_round_id
      and round_claims.claimant_user_id = auth.uid()
  );
$$;

revoke all on function public.user_has_round_claim(text) from public;
grant execute on function public.user_has_round_claim(text) to authenticated;


create or replace function public.user_owns_round(p_round_id text)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.rounds
    where rounds.id = p_round_id
      and rounds.owner_user_id = auth.uid()
  );
$$;

revoke all on function public.user_owns_round(text) from public;
grant execute on function public.user_owns_round(text) to authenticated;


-- Replace the recursion-triggering policies.

drop policy if exists rounds_select_via_claim on public.rounds;
create policy rounds_select_via_claim on public.rounds
  for select to authenticated
  using (public.user_has_round_claim(rounds.id));


drop policy if exists round_claims_select on public.round_claims;
create policy round_claims_select on public.round_claims
  for select to authenticated
  using (
    claimant_user_id = auth.uid()
    or public.user_owns_round(round_claims.round_id)
  );


drop policy if exists round_claims_insert on public.round_claims;
create policy round_claims_insert on public.round_claims
  for insert to authenticated
  with check (
    claimant_user_id = auth.uid()
    or public.user_owns_round(round_claims.round_id)
  );
