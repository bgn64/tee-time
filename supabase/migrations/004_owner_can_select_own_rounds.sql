-- =============================================================================
-- Migration 004: let owners SELECT their own rounds without claim bootstrap
-- =============================================================================
-- Apply via Dashboard -> SQL Editor -> paste -> Run.
--
-- Bug: when client does INSERT INTO rounds with returning (or postgrest
-- equivalent), the new row passes through the SELECT policy. The SELECT
-- policy requires a claim row exists, but the seed_scorer_claim trigger
-- creates that claim AFTER INSERT, so the policy evaluation sees no
-- claim and rejects with code 42501 ("new row violates row-level security
-- policy"). This blocks the entire round-push pipeline.
--
-- Fix: the owner can SELECT their own rounds unconditionally. Claimants
-- still need a claim row (unchanged). This doesn't open any new privacy
-- holes -- the owner already has insert/update/delete authority via the
-- per-policy owner predicate.
-- =============================================================================

drop policy if exists rounds_select_via_claim on public.rounds;
create policy rounds_select_via_claim on public.rounds
  for select to authenticated
  using (
    owner_user_id = auth.uid()
    or public.user_has_round_claim(rounds.id)
  );