-- =============================================================================
-- Migration 006: round_participants redesign + merge flow
-- =============================================================================
-- Apply via Dashboard -> SQL Editor -> paste -> Run.
--
-- Background:
--   The original claims model treated each participant's "I was here" decision
--   as a binary status on a side table. The new model treats participants as
--   first-class citizens of a round, with score-edit rights gated by their
--   confirmation_status. Per-team scores in scramble are owned by the team's
--   confirmed members; cleanup happens automatically when the last member of
--   a team leaves.
--
-- Wiped in this migration:
--   round_claims                    (replaced by round_participants)
--   seed_scorer_claim trigger/fn    (replaced by seed_owner_participant)
--   cleanup_round_if_unclaimed      (replaced by participants_after_change)
--   leave_round / reclaim_round     (semantics changed; replaced)
--   user_has_round_claim            (no longer relevant)
--
-- Net additions:
--   round_participants              (one row per (round, scorer))
--   seed_owner_participant trigger
--   participants_after_change trigger (per-team cleanup, round cleanup,
--                                      player_user_ids recompute)
--   confirm_participation RPC
--   deny_participation RPC
--   leave_round RPC                 (new semantics)
--   update_score RPC                (centralized score edit-rights)
--   merge_unlinked_player RPC
--
-- Plus RLS policy refresh and removal of the auto-link block from
-- accept_friend_request.
--
-- This migration assumes the dev DB; existing rounds and claim rows will be
-- destroyed. There is no data migration logic.
-- =============================================================================


-- =============================================================================
-- 1. Drop obsolete artifacts
-- =============================================================================

-- Drop policies that reference round_claims OR the user_has_round_claim helper.
drop policy if exists round_claims_select on public.round_claims;
drop policy if exists round_claims_insert on public.round_claims;
drop policy if exists round_claims_insert_owner on public.round_claims;
drop policy if exists round_claims_update_claimant on public.round_claims;

-- The rounds SELECT policy from migrations 003/004/005 references
-- user_has_round_claim, so it must go before we can drop the function.
drop policy if exists rounds_select_via_claim on public.rounds;
drop policy if exists rounds_select_owner_or_participant on public.rounds;

-- Drop triggers that touch round_claims / rounds.
drop trigger if exists round_claims_cleanup on public.round_claims;
drop trigger if exists round_claims_touch_updated_at on public.round_claims;
drop trigger if exists rounds_seed_scorer_claim on public.rounds;

-- Drop trigger functions.
drop function if exists public.cleanup_round_if_unclaimed();
drop function if exists public.seed_scorer_claim();

-- Drop the claim helper used by RLS.
drop function if exists public.user_has_round_claim(text);

-- Drop now-obsolete RPCs (will be re-created with new semantics below).
drop function if exists public.leave_round(text);
drop function if exists public.reclaim_round(text);

-- Remove round_claims from the realtime publication before dropping.
do $$
begin
  if exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'round_claims'
  ) then
    alter publication supabase_realtime drop table public.round_claims;
  end if;
end $$;

-- Finally, drop the table.
drop table if exists public.round_claims;

-- Wipe any rounds left in the DB (dev mode; nothing to preserve and the
-- new participants table has no seed rows for them).
truncate public.rounds restart identity cascade;


-- =============================================================================
-- 2. round_participants
-- =============================================================================
create table public.round_participants (
  round_id            text        not null references public.rounds on delete cascade,
  participant_key     text        not null,
  linked_user_id      uuid                 references public.profiles on delete set null,
  confirmation_status text        not null check (confirmation_status in ('pending','confirmed')),
  display_name        text        not null,
  display_color       text,
  team_id             text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  primary key (round_id, participant_key)
);

-- A round can't have two participant rows pointing at the same linked user.
create unique index round_participants_unique_linked
  on public.round_participants (round_id, linked_user_id)
  where linked_user_id is not null;

create index round_participants_linked_idx
  on public.round_participants (linked_user_id, confirmation_status);

create index round_participants_team_idx
  on public.round_participants (round_id, team_id)
  where team_id is not null;

drop trigger if exists round_participants_touch_updated_at on public.round_participants;
create trigger round_participants_touch_updated_at
before update on public.round_participants
for each row execute function public.touch_updated_at();

alter table public.round_participants enable row level security;


-- =============================================================================
-- 3. Trigger: seed_owner_participant
--
-- When a round is INSERTed, automatically create a confirmed participant row
-- for the owner. The owner's participant_key is provided as a meta column on
-- rounds called `owner_participant_key` (text). If absent, we fall back to
-- the owner's user_id stringified.
-- =============================================================================

-- Add the helper column. Rounds inserted by the client should set this so
-- the participant row can echo the local Player.id used in rounds.scores.
alter table public.rounds
  add column if not exists owner_participant_key text;

create or replace function public.seed_owner_participant()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  key text;
  display text;
  color text;
  owner_team_id text;
begin
  if new.owner_user_id is null then
    return null;
  end if;

  key := coalesce(new.owner_participant_key, new.owner_user_id::text);

  -- Look up the owner's display_name and avatar_color from their profile so
  -- the snapshot is correct without requiring the client to thread it.
  select p.display_name, p.avatar_color
    into display, color
  from public.profiles p
  where p.user_id = new.owner_user_id;

  -- For scramble rounds, find the team whose playerIds contains the owner's
  -- participant key. Stroke rounds leave team_id NULL.
  select team->>'id'
    into owner_team_id
  from jsonb_array_elements(coalesce(new.teams, '[]'::jsonb)) team
  where team->'playerIds' @> to_jsonb(key);

  insert into public.round_participants (
    round_id, participant_key, linked_user_id,
    confirmation_status, display_name, display_color, team_id
  ) values (
    new.id, key, new.owner_user_id,
    'confirmed', coalesce(display, 'Scorer'), color, owner_team_id
  )
  on conflict (round_id, participant_key) do nothing;

  return null;
end;
$$;

drop trigger if exists rounds_seed_owner_participant on public.rounds;
create trigger rounds_seed_owner_participant
after insert on public.rounds
for each row execute function public.seed_owner_participant();


-- =============================================================================
-- 4. Trigger: participants_after_change
--
-- After any insert/update/delete on round_participants:
--   1. Per-team cleanup: for each team referenced in rounds.teams that no
--      longer has any participant row, remove the team from rounds.teams and
--      strip its score entries from rounds.scores.
--   2. Round cleanup: if no participant rows remain at all, delete the round.
--   3. Recompute rounds.player_user_ids from the remaining confirmed-linked
--      participant rows.
-- =============================================================================
create or replace function public.participants_after_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_round_id text;
  any_left boolean;
  remaining_team_ids text[];
  pruned_teams jsonb;
  pruned_scores jsonb;
  user_ids uuid[];
begin
  target_round_id := coalesce(new.round_id, old.round_id);

  if not exists (select 1 from public.rounds where id = target_round_id) then
    return null;
  end if;

  -- Per-team / score cleanup only fires on DELETE. INSERT and UPDATE keep
  -- the scores blob intact (avoids wiping freshly-uploaded participant
  -- scores during the brief window when only the owner's participant row
  -- exists between the seed_owner_participant trigger and the client's
  -- subsequent push of remaining participant rows).
  if tg_op = 'DELETE' then
    select coalesce(array_agg(distinct team_id), '{}')
        into remaining_team_ids
    from public.round_participants
    where round_id = target_round_id
        and team_id is not null;

    select coalesce(
        jsonb_agg(team)
          filter (where (team->>'id') = any (remaining_team_ids)),
        '[]'::jsonb
    )
        into pruned_teams
    from public.rounds r,
           jsonb_array_elements(coalesce(r.teams, '[]'::jsonb)) team
    where r.id = target_round_id;

    select coalesce(
        jsonb_agg(score)
          filter (
            where (score->>'scorerId') = any (
              select unnest(remaining_team_ids)
              union
              select participant_key from public.round_participants where round_id = target_round_id
            )
          ),
        '[]'::jsonb
    )
        into pruned_scores
    from public.rounds r,
           jsonb_array_elements(coalesce(r.scores, '[]'::jsonb)) score
    where r.id = target_round_id;

    update public.rounds
        set teams = case
                      when pruned_teams = '[]'::jsonb then null
                      else pruned_teams
                    end,
            scores = coalesce(pruned_scores, '[]'::jsonb)
        where id = target_round_id;
  end if;

  -- Round cleanup.
  select exists (
    select 1 from public.round_participants where round_id = target_round_id
  ) into any_left;

  if not any_left then
    delete from public.rounds where id = target_round_id;
    return null;
  end if;

  -- Recompute player_user_ids = confirmed linked participants.
  select coalesce(array_agg(distinct linked_user_id), '{}')
    into user_ids
  from public.round_participants
  where round_id = target_round_id
    and linked_user_id is not null
    and confirmation_status = 'confirmed';

  update public.rounds
    set player_user_ids = user_ids
    where id = target_round_id;

  return null;
end;
$$;

drop trigger if exists round_participants_after_change on public.round_participants;
create trigger round_participants_after_change
after insert or update or delete on public.round_participants
for each row execute function public.participants_after_change();


-- =============================================================================
-- 5. RPC: confirm_participation
-- =============================================================================
create or replace function public.confirm_participation(p_round_id text)
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

  update public.round_participants
    set confirmation_status = 'confirmed'
    where round_id = p_round_id
      and linked_user_id = caller
      and confirmation_status = 'pending';

  if not found then
    raise exception 'no pending participation row for this user on round %', p_round_id;
  end if;
end;
$$;

revoke all on function public.confirm_participation(text) from public;
grant execute on function public.confirm_participation(text) to authenticated;


-- =============================================================================
-- 6. RPC: deny_participation
-- =============================================================================
create or replace function public.deny_participation(p_round_id text)
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

  delete from public.round_participants
    where round_id = p_round_id
      and linked_user_id = caller
      and confirmation_status = 'pending';

  if not found then
    raise exception 'no pending participation row for this user on round %', p_round_id;
  end if;
end;
$$;

revoke all on function public.deny_participation(text) from public;
grant execute on function public.deny_participation(text) to authenticated;


-- =============================================================================
-- 7. RPC: leave_round
--
-- Caller leaves the round. Two cases:
--
--   A) Caller is the round owner.
--      - Cascade-delete the owner's own row, every unlinked row, and every
--        pending linked row (all of which were authored by the owner). After
--        the cascade, if any confirmed linked participant remains, transfer
--        ownership to the earliest one. Otherwise the participants_after_change
--        trigger will drop the round.
--
--   B) Caller is a confirmed linked participant.
--      - Hard-delete the caller's own row. Trigger handles team/round cleanup.
--
-- Anything else (no participation row, pending linked but not the owner) is a
-- no-op for backwards-friendliness.
-- =============================================================================
create or replace function public.leave_round(p_round_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  caller uuid;
  is_owner boolean;
  new_owner uuid;
  new_owner_key text;
begin
  caller := auth.uid();
  if caller is null then
    raise exception 'must be authenticated';
  end if;

  select (owner_user_id = caller)
    into is_owner
  from public.rounds
  where id = p_round_id;

  if is_owner is null then
    -- Round doesn't exist; treat as no-op.
    return;
  end if;

  if is_owner then
    -- Determine the successor owner FIRST: earliest confirmed linked
    -- participant other than the caller.
    select linked_user_id, participant_key
      into new_owner, new_owner_key
    from public.round_participants
    where round_id = p_round_id
      and linked_user_id is not null
      and linked_user_id <> caller
      and confirmation_status = 'confirmed'
    order by created_at asc
    limit 1;

    if new_owner is not null then
      -- Transfer ownership BEFORE deleting any rows so every subsequent
      -- realtime UPDATE on this round (including the trigger's player_user_ids
      -- recompute) carries the new owner_user_id. This avoids a brief window
      -- on the leaving user's client where the round still looks owned by
      -- them and gets re-injected by the rounds UPDATE realtime event.
      update public.rounds
        set owner_user_id = new_owner,
            owner_participant_key = new_owner_key
        where id = p_round_id;
    end if;

    -- Cascade-delete unlinked rows, pending linked rows, and the caller's
    -- own row. The participants_after_change trigger fires per row and
    -- recomputes player_user_ids using the already-correct ownership.
    delete from public.round_participants
      where round_id = p_round_id
        and (
          linked_user_id is null
          or confirmation_status = 'pending'
          or linked_user_id = caller
        );

    -- If no successor existed, the round is now participant-less; the
    -- trigger should have dropped it. Belt-and-suspenders sweep:
    if new_owner is null then
      delete from public.rounds where id = p_round_id;
    end if;

    return;
  end if;

  -- Non-owner case: only allow confirmed linked participants to leave; other
  -- callers are silently ignored.
  delete from public.round_participants
    where round_id = p_round_id
      and linked_user_id = caller
      and confirmation_status = 'confirmed';
end;
$$;

revoke all on function public.leave_round(text) from public;
grant execute on function public.leave_round(text) to authenticated;


-- =============================================================================
-- 8. RPC: update_score
--
-- Centralized score-edit RPC. Replaces direct UPDATEs on rounds.scores by
-- the client. Edit rights rules:
--
--   Stroke rounds (scorer_id = participant_key):
--     · linked + confirmed + auth.uid() = linked_user_id  → allow
--     · linked + pending   + auth.uid() = round.owner     → allow
--     · unlinked           + auth.uid() = round.owner     → allow
--
--   Scramble rounds (scorer_id = team_id):
--     · ANY team member is confirmed-linked + auth.uid() = that linked_user_id
--       → allow
--     · NO team member confirmed AND auth.uid() = round.owner → allow
--
--   Otherwise → exception.
-- =============================================================================
create or replace function public.update_score(
  p_round_id   text,
  p_scorer_id  text,
  p_hole       int,
  p_strokes    int
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  caller uuid;
  rule text;
  owner uuid;
  rp public.round_participants;
  any_team_confirmed boolean;
  caller_in_team boolean;
  next_scores jsonb;
  found_score boolean;
begin
  caller := auth.uid();
  if caller is null then
    raise exception 'must be authenticated';
  end if;

  if p_strokes < 1 then
    raise exception 'strokes must be >= 1';
  end if;

  select scoring_rule, owner_user_id
    into rule, owner
  from public.rounds
  where id = p_round_id;

  if rule is null then
    raise exception 'round % not found', p_round_id;
  end if;

  if rule = 'stroke' then
    select * into rp
    from public.round_participants
    where round_id = p_round_id and participant_key = p_scorer_id;

    if rp is null then
      raise exception 'no participant for scorer % on round %', p_scorer_id, p_round_id;
    end if;

    if rp.linked_user_id is not null
       and rp.confirmation_status = 'confirmed'
       and rp.linked_user_id = caller then
      -- ok
      null;
    elsif rp.linked_user_id is not null
          and rp.confirmation_status = 'pending'
          and owner = caller then
      -- ok
      null;
    elsif rp.linked_user_id is null and owner = caller then
      -- ok
      null;
    else
      raise exception 'not authorized to edit this scoreline';
    end if;
  elsif rule = 'scramble' then
    -- Verify scorer_id corresponds to a real team with at least one participant.
    if not exists (
      select 1 from public.round_participants
      where round_id = p_round_id and team_id = p_scorer_id
    ) then
      raise exception 'no participants for team % on round %', p_scorer_id, p_round_id;
    end if;

    select exists (
      select 1 from public.round_participants
      where round_id = p_round_id
        and team_id = p_scorer_id
        and linked_user_id is not null
        and confirmation_status = 'confirmed'
    ) into any_team_confirmed;

    if any_team_confirmed then
      select exists (
        select 1 from public.round_participants
        where round_id = p_round_id
          and team_id = p_scorer_id
          and confirmation_status = 'confirmed'
          and linked_user_id = caller
      ) into caller_in_team;

      if not caller_in_team then
        raise exception 'not authorized to edit this team''s score';
      end if;
    else
      if owner <> caller then
        raise exception 'not authorized to edit this team''s score';
      end if;
    end if;
  else
    raise exception 'unknown scoring rule: %', rule;
  end if;

  -- Upsert the (scorerId, holeNumber) entry inside rounds.scores jsonb.
  select coalesce(
           jsonb_agg(
             case
               when (s->>'scorerId') = p_scorer_id and (s->>'holeNumber')::int = p_hole
                 then jsonb_build_object(
                   'scorerId', p_scorer_id,
                   'holeNumber', p_hole,
                   'strokes', p_strokes
                 )
               else s
             end
           ),
           '[]'::jsonb
         ),
         bool_or(
           (s->>'scorerId') = p_scorer_id and (s->>'holeNumber')::int = p_hole
         )
    into next_scores, found_score
  from public.rounds r
  cross join lateral jsonb_array_elements(coalesce(r.scores, '[]'::jsonb)) s
  where r.id = p_round_id;

  if next_scores is null then
    next_scores := '[]'::jsonb;
  end if;

  if not coalesce(found_score, false) then
    next_scores := next_scores || jsonb_build_array(
      jsonb_build_object(
        'scorerId', p_scorer_id,
        'holeNumber', p_hole,
        'strokes', p_strokes
      )
    );
  end if;

  update public.rounds
    set scores = next_scores
    where id = p_round_id;
end;
$$;

revoke all on function public.update_score(text, text, int, int) from public;
grant execute on function public.update_score(text, text, int, int) to authenticated;


-- =============================================================================
-- 9. RPC: merge_unlinked_player
--
-- Merge an unlinked roster entry into a friend's user account. All
-- round_participants rows in caller-owned rounds with participant_key = the
-- unlinked id get linked_user_id assigned and confirmation_status flipped
-- back to 'pending' so the friend can confirm or deny each round.
--
-- Errors out if any round would end up with two rows pointing at the same
-- linked user (uniqueness conflict).
-- =============================================================================
create or replace function public.merge_unlinked_player(
  p_unlinked_local_id text,
  p_friend_user_id    uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  caller uuid;
  conflict_round text;
  friend_name text;
  friend_color text;
begin
  caller := auth.uid();
  if caller is null then
    raise exception 'must be authenticated';
  end if;

  if p_friend_user_id = caller then
    raise exception 'cannot merge into yourself';
  end if;

  -- Verify friendship.
  if not exists (
    select 1 from public.friendships
    where user_id = caller and friend_user_id = p_friend_user_id
  ) then
    raise exception 'must be friends to merge';
  end if;

  -- Verify the unlinked roster entry exists and is owned by caller.
  if not exists (
    select 1 from public.roster_players
    where owner_user_id = caller
      and id = p_unlinked_local_id
      and linked_user_id is null
  ) then
    raise exception 'unlinked roster entry % not found', p_unlinked_local_id;
  end if;

  -- Detect uniqueness conflicts: any caller-owned round that has both
  -- a participant_key = unlinked id AND another row with linked_user_id =
  -- friend_user_id.
  select rp.round_id
    into conflict_round
  from public.round_participants rp
  join public.rounds r on r.id = rp.round_id
  where r.owner_user_id = caller
    and rp.participant_key = p_unlinked_local_id
    and exists (
      select 1 from public.round_participants rp2
      where rp2.round_id = rp.round_id
        and rp2.linked_user_id = p_friend_user_id
    )
  limit 1;

  if conflict_round is not null then
    raise exception 'merge would create a duplicate participant on round %', conflict_round;
  end if;

  -- Pull the friend's profile to overwrite the participant snapshot. The
  -- merged participant rows render with the friend's identity going forward
  -- on every device, replacing whatever nickname/color the caller had given
  -- the unlinked entry.
  select display_name, avatar_color
    into friend_name, friend_color
  from public.profiles
  where user_id = p_friend_user_id;

  -- Perform the merge.
  update public.round_participants rp
    set linked_user_id      = p_friend_user_id,
        confirmation_status = 'pending',
        display_name        = coalesce(friend_name, rp.display_name),
        display_color       = coalesce(friend_color, rp.display_color)
  from public.rounds r
  where rp.round_id = r.id
    and r.owner_user_id = caller
    and rp.participant_key = p_unlinked_local_id;

  -- Drop the unlinked roster row.
  delete from public.roster_players
    where owner_user_id = caller and id = p_unlinked_local_id;
end;
$$;

revoke all on function public.merge_unlinked_player(text, uuid) from public;
grant execute on function public.merge_unlinked_player(text, uuid) to authenticated;


-- =============================================================================
-- 10. RLS policies
-- =============================================================================

-- A helper for "is the caller part of the round's friend graph?" — i.e.,
-- friends with the owner OR friends with any confirmed linked participant.
create or replace function public.user_can_see_round(p_round_id text)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.rounds r
    where r.id = p_round_id
      and (
        r.owner_user_id = auth.uid()
        or auth.uid() = any (r.player_user_ids)
        or public.is_friend_of(r.owner_user_id)
        or exists (
          select 1
          from public.friendships f
          where f.user_id = auth.uid()
            and f.friend_user_id = any (r.player_user_ids)
        )
      )
  );
$$;

revoke all on function public.user_can_see_round(text) from public;
grant execute on function public.user_can_see_round(text) to authenticated;


-- rounds: SELECT policy. Inlined (no recursive helper call) so it works
-- even when postgres doesn't have BYPASSRLS — newer Supabase project tiers
-- don't grant superuser to postgres, which means SECURITY DEFINER functions
-- still hit RLS and a helper that re-queries `rounds` would recurse through
-- this policy and fail.
drop policy if exists rounds_select_via_claim on public.rounds;
drop policy if exists rounds_select_owner_or_participant on public.rounds;
drop policy if exists rounds_select on public.rounds;
create policy rounds_select on public.rounds
  for select to authenticated
  using (
    owner_user_id = auth.uid()
    or auth.uid() = any (player_user_ids)
    or public.is_friend_of(owner_user_id)
    or exists (
      select 1 from public.friendships f
      where f.user_id = auth.uid()
        and f.friend_user_id = any (rounds.player_user_ids)
    )
  );


-- round_participants: SELECT by anyone who can see the round; INSERT only by
-- the round owner; UPDATE / DELETE entirely blocked at the policy level
-- (must flow through RPCs).
drop policy if exists round_participants_select on public.round_participants;
create policy round_participants_select on public.round_participants
  for select to authenticated
  using (public.user_can_see_round(round_participants.round_id));

drop policy if exists round_participants_insert_owner on public.round_participants;
create policy round_participants_insert_owner on public.round_participants
  for insert to authenticated
  with check (
    exists (
      select 1 from public.rounds r
      where r.id = round_participants.round_id
        and r.owner_user_id = auth.uid()
    )
  );

-- (No UPDATE or DELETE policies — denied by default with RLS enabled.)


-- =============================================================================
-- 11. accept_friend_request: drop the auto-link side effect
-- =============================================================================
create or replace function public.accept_friend_request(request_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  req public.friend_requests;
begin
  select * into req from public.friend_requests where id = request_id;

  if req is null then
    raise exception 'friend_request % not found', request_id;
  end if;

  if req.to_user_id <> auth.uid() then
    raise exception 'only the recipient may accept a friend request';
  end if;

  if req.status <> 'pending' then
    raise exception 'friend_request is not pending (status=%)', req.status;
  end if;

  update public.friend_requests
    set status = 'accepted'
    where id = request_id;

  insert into public.friendships (user_id, friend_user_id)
    values (req.from_user_id, req.to_user_id)
    on conflict do nothing;

  insert into public.friendships (user_id, friend_user_id)
    values (req.to_user_id, req.from_user_id)
    on conflict do nothing;
end;
$$;


-- =============================================================================
-- 12. Realtime: add round_participants to the publication.
-- =============================================================================
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'round_participants'
  ) then
    alter publication supabase_realtime add table public.round_participants;
  end if;
end $$;
