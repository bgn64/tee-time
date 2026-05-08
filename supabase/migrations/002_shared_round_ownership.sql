-- =============================================================================
-- Migration 002: shared round ownership / "Delete from my history" semantics
-- =============================================================================
-- Apply via Dashboard -> SQL Editor -> paste -> Run.
--
-- Background:
--   The original schema treated rounds.owner_user_id as the sole authority
--   for the round's existence. That breaks when the *original scorer* wants
--   to delete the round but a *claimant friend* still has it in their
--   history -- deleting the row would yank the round out of their view too.
--
-- New model:
--   * owner_user_id stays as the *original scorer* (immutable, used for
--     edit-permission gating).
--   * Every participant -- including the scorer -- gets a row in
--     round_claims. The scorer's row is auto-created with status='claimed'
--     at round-completion time.
--   * A round is "alive" iff at least one round_claims row has
--     status='claimed'. When the last claimed claim flips away, the round
--     row is automatically deleted (cascading the remaining claims via FK).
--   * "Delete this round from my history" means: flip my claim to
--     'not-claimed'. If I was the last claimant, the cleanup trigger drops
--     the round entirely.
--   * "Re-claim" means flip my claim back to 'claimed'. Round reappears in
--     my list. (Backend supports it; UI lands in a follow-up.)
-- =============================================================================


-- 1. Round-claims cleanup trigger
create or replace function public.cleanup_round_if_unclaimed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_round_id text;
  any_claimed boolean;
begin
  target_round_id := old.round_id;

  select exists (
    select 1 from public.round_claims
    where round_id = target_round_id
      and status = 'claimed'
  ) into any_claimed;

  if not any_claimed then
    delete from public.rounds where id = target_round_id;
  end if;

  return null;
end;
$$;

drop trigger if exists round_claims_cleanup on public.round_claims;
create trigger round_claims_cleanup
after update of status or delete on public.round_claims
for each row execute function public.cleanup_round_if_unclaimed();


-- 2. Round-creation trigger to seed the scorer's claim row
create or replace function public.seed_scorer_claim()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.owner_user_id is not null then
    insert into public.round_claims (round_id, claimant_user_id, status)
      values (new.id, new.owner_user_id, 'claimed')
      on conflict (round_id, claimant_user_id) do nothing;
  end if;
  return null;
end;
$$;

drop trigger if exists rounds_seed_scorer_claim on public.rounds;
create trigger rounds_seed_scorer_claim
after insert on public.rounds
for each row execute function public.seed_scorer_claim();


-- 3. RLS update: rounds SELECT now requires a claim entry
drop policy if exists rounds_select_owner_or_participant on public.rounds;
create policy rounds_select_via_claim on public.rounds
  for select to authenticated
  using (
    exists (
      select 1 from public.round_claims c
      where c.round_id = rounds.id
        and c.claimant_user_id = auth.uid()
    )
  );


-- 4. Round_claims INSERT policy update
drop policy if exists round_claims_insert_owner on public.round_claims;
create policy round_claims_insert on public.round_claims
  for insert to authenticated
  with check (
    claimant_user_id = auth.uid()
    or exists (
      select 1 from public.rounds r
      where r.id = round_claims.round_id
        and r.owner_user_id = auth.uid()
    )
  );


-- 5. RPC: leave_round
create or replace function public.leave_round(target_round_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  caller uuid;
begin
  caller := auth.uid();
  if caller is null then
    raise exception 'must be authenticated';
  end if;

  if not exists (
    select 1 from public.round_claims
    where round_id = target_round_id and claimant_user_id = caller
  ) and not exists (
    select 1 from public.rounds
    where id = target_round_id and owner_user_id = caller
  ) then
    return;
  end if;

  insert into public.round_claims (round_id, claimant_user_id, status)
    values (target_round_id, caller, 'not-claimed')
    on conflict (round_id, claimant_user_id)
    do update set status = 'not-claimed';
end;
$$;

revoke all on function public.leave_round(text) from public;
grant execute on function public.leave_round(text) to authenticated;


-- 6. RPC: reclaim_round
create or replace function public.reclaim_round(target_round_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  caller uuid;
begin
  caller := auth.uid();
  if caller is null then
    raise exception 'must be authenticated';
  end if;

  if not exists (select 1 from public.rounds where id = target_round_id) then
    raise exception 'round no longer exists';
  end if;

  insert into public.round_claims (round_id, claimant_user_id, status)
    values (target_round_id, caller, 'claimed')
    on conflict (round_id, claimant_user_id)
    do update set status = 'claimed';
end;
$$;

revoke all on function public.reclaim_round(text) from public;
grant execute on function public.reclaim_round(text) to authenticated;
