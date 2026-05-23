-- =============================================================================
-- accept_friend_request: sender-side roster fan-out
-- =============================================================================
-- The player picker (`app/(tabs)/(score)/players.tsx`) reads from
-- `roster_players`, not `friendships`. Before this migration the sender of a
-- friend request (`from_user_id`) had no way to gain a `roster_players` row
-- for the new friend without explicit local action — friends would land in
-- `friends[]` on the next refresh, but the picker stayed empty.
--
-- This migration replaces `accept_friend_request` with the same body plus a
-- sender-side find-or-create that mirrors the client-side
-- `ensureRosterForFriend` helper (state/PlayerContext.tsx). The receiver
-- continues to mint their own row optimistically via that helper for
-- instant UX; nothing about that path changes.
--
-- Pair this with the client-side AppState 'active' re-pull in PlayerContext
-- so the sender's device picks up the new row without manual pull-to-
-- refresh.
--
-- The previously-aspirational `if source_player_id is not null` branch
-- (kept in schema.sql but absent from the deployed function) is also
-- restored here, hardened with NULL/dup guards so it can't violate the
-- (owner_user_id, linked_user_id) unique constraint when invoked.
-- =============================================================================

create or replace function public.accept_friend_request(request_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
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

  -- Symmetric friendship rows. ON CONFLICT DO NOTHING so a retried
  -- INSERT (not a full RPC re-run; the status guard above blocks that)
  -- doesn't error.
  insert into public.friendships (user_id, friend_user_id)
    values (req.from_user_id, req.to_user_id)
    on conflict do nothing;

  insert into public.friendships (user_id, friend_user_id)
    values (req.to_user_id, req.from_user_id)
    on conflict do nothing;

  -- Optional: when the sender initiated the request by tapping an
  -- existing unlinked local roster row, link that specific row to the
  -- new friend. Guarded so it can't violate the
  -- (owner_user_id, linked_user_id) unique constraint when the sender
  -- already has a linked row for this friend under a different id.
  if req.source_player_id is not null then
    update public.roster_players
      set linked_user_id = req.to_user_id
      where owner_user_id = req.from_user_id
        and id = req.source_player_id
        and linked_user_id is null
        and not exists (
          select 1 from public.roster_players r2
          where r2.owner_user_id = req.from_user_id
            and r2.linked_user_id = req.to_user_id
        );
  end if;

  -- Sender-side find-or-create using the deterministic id
  -- `player-${to_user_id}`. Mirrors `ensureRosterForFriend`:
  --   1. If a linked row for this friend already exists (under any id),
  --      leave it alone.
  --   2. Else if the deterministic-id row exists unlinked, link it.
  --   3. Else INSERT a new row.
  -- The two-step shape avoids a primary-key collision when the
  -- deterministic id already exists unlinked (rare but possible — id is
  -- client-controlled text and offline/legacy data could land there).
  update public.roster_players
    set linked_user_id = req.to_user_id
    where owner_user_id = req.from_user_id
      and id = 'player-' || req.to_user_id::text
      and linked_user_id is null
      and not exists (
        select 1 from public.roster_players r2
        where r2.owner_user_id = req.from_user_id
          and r2.linked_user_id = req.to_user_id
      );

  insert into public.roster_players (
    owner_user_id, id, nickname, color, linked_user_id
  )
  select
    req.from_user_id,
    'player-' || req.to_user_id::text,
    p.display_name,
    p.avatar_color,
    req.to_user_id
  from public.profiles p
  where p.user_id = req.to_user_id
    and not exists (
      select 1 from public.roster_players r2
      where r2.owner_user_id = req.from_user_id
        and (r2.linked_user_id = req.to_user_id
             or r2.id = 'player-' || req.to_user_id::text)
    );
end;
$$;
