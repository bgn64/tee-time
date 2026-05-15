-- =============================================================================
-- Migration 018: roster_players partial-unique on (owner_user_id, linked_user_id)
-- =============================================================================
-- Apply via Dashboard -> SQL Editor -> paste -> Run.
--
-- Background:
--   Until Phase 1.4 the client created roster rows for a newly accepted
--   friend in TWO places (`SocialContext.acceptIncomingRequest` on the
--   receiver, the realtime `friendships` INSERT handler on the sender),
--   each minting an id of the form `player-${userId}-${Date.now()}`. A
--   race between the two paths could produce two duplicate rows for the
--   same friend under one owner. With the new `ensureRosterForFriend`
--   helper the client now uses a deterministic id (`player-${userId}`),
--   and `cloudUpsertPlayer` uses `onConflict: 'owner_user_id,linked_user_id'`
--   for linked rows. This migration adds the matching server-side
--   guarantee.
--
-- Deploy order (matters):
--   1. Ship the client (`ensureRosterForFriend` + new `onConflict` clause)
--      to staging / production FIRST.
--   2. THEN apply this migration. Old clients without the new onConflict
--      clause would otherwise hit 23505 when retrying a roster upsert
--      under load.
--
-- What this migration does:
--   1. Deduplicate any existing `(owner_user_id, linked_user_id)` groups
--      with > 1 rows where `linked_user_id IS NOT NULL`. The keeper id is
--      chosen as the one with the most references across the owner's
--      `scorecards.player_ids` and `scorecards.participants` jsonb, tied
--      on oldest `updated_at`, tied on smallest `id`.
--   2. Rewrite scorecard references owned by the affected user: replace
--      loser ids with the keeper id inside `player_ids` (jsonb array of
--      strings) and `participants` (jsonb array of objects keyed by
--      `participantKey`). This preserves continuity of scoring history
--      after the dedupe.
--   3. Delete the loser rows.
--   4. Create a partial unique index
--      `roster_players_owner_linked_uniq` on
--      `(owner_user_id, linked_user_id) WHERE linked_user_id IS NOT NULL`.
--      Unlinked rows (local-only players) are unaffected.
--
-- Implementation note:
--   The table is small in production, so we run the whole migration
--   inside one transaction and use a plain `CREATE UNIQUE INDEX` (not
--   CONCURRENTLY). The PL/pgSQL loop body is verbose but easier to
--   follow / audit than a multi-CTE expression.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- 1. Dedupe + rewrite scorecard references.
-- -----------------------------------------------------------------------------
do $$
declare
  grp record;
  keeper_id text;
  loser_id  text;
  losers    text[];
begin
  for grp in
    select owner_user_id, linked_user_id
    from public.roster_players
    where linked_user_id is not null
    group by owner_user_id, linked_user_id
    having count(*) > 1
  loop
    -- Pick the keeper: most-referenced in this owner's scorecards, then
    -- oldest updated_at, then smallest id (lexicographic).
    select rp.id
      into keeper_id
    from public.roster_players rp
    left join lateral (
      select count(*) as refs
      from public.scorecards s
      where s.owner_user_id = grp.owner_user_id
        and (
          s.player_ids ? rp.id
          or exists (
            select 1 from jsonb_array_elements(s.participants) p
            where (p->>'participantKey') = rp.id
          )
        )
    ) c on true
    where rp.owner_user_id  = grp.owner_user_id
      and rp.linked_user_id = grp.linked_user_id
    order by coalesce(c.refs, 0) desc, rp.updated_at asc, rp.id asc
    limit 1;

    -- Gather the losers for this group.
    select coalesce(array_agg(id), '{}')::text[]
      into losers
    from public.roster_players
    where owner_user_id  = grp.owner_user_id
      and linked_user_id = grp.linked_user_id
      and id <> keeper_id;

    -- Rewrite each loser id to keeper_id in scorecards owned by this user.
    foreach loser_id in array losers loop
      -- player_ids: rewrite string entries equal to loser_id.
      update public.scorecards s
      set player_ids = (
        select coalesce(jsonb_agg(
          case when elt = to_jsonb(loser_id) then to_jsonb(keeper_id) else elt end
        ), '[]'::jsonb)
        from jsonb_array_elements(s.player_ids) elt
      )
      where s.owner_user_id = grp.owner_user_id
        and s.player_ids ? loser_id;

      -- participants: rewrite participantKey on entries that match loser_id.
      update public.scorecards s
      set participants = (
        select coalesce(jsonb_agg(
          case
            when (p->>'participantKey') = loser_id
              then jsonb_set(p, '{participantKey}', to_jsonb(keeper_id), true)
            else p
          end
        ), '[]'::jsonb)
        from jsonb_array_elements(s.participants) p
      )
      where s.owner_user_id = grp.owner_user_id
        and exists (
          select 1 from jsonb_array_elements(s.participants) p
          where (p->>'participantKey') = loser_id
        );
    end loop;

    -- Finally, drop the loser rows for this group.
    if array_length(losers, 1) > 0 then
      delete from public.roster_players
      where owner_user_id  = grp.owner_user_id
        and linked_user_id = grp.linked_user_id
        and id = any(losers);
    end if;
  end loop;
end $$;

-- -----------------------------------------------------------------------------
-- 2. Enforce uniqueness going forward.
-- -----------------------------------------------------------------------------
drop index if exists public.roster_players_owner_linked_uniq;
create unique index roster_players_owner_linked_uniq
  on public.roster_players (owner_user_id, linked_user_id)
  where linked_user_id is not null;

commit;
