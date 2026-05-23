-- =============================================================================
-- Tee Time — Supabase schema
-- =============================================================================
-- This file is the source of truth for the backend schema. Apply it to a
-- fresh Supabase project via Dashboard → SQL Editor → paste → Run.
-- Idempotent where reasonable; safe to re-apply most of it (CREATE TABLE IF
-- NOT EXISTS, CREATE POLICY guards via DROP-then-CREATE blocks at the
-- bottom).
--
-- Architecture overview:
--   profiles         — one row per signed-in user, holds handle + display name.
--   roster_players   — your private roster backup. Mirrors the local Player[].
--   courses          — your private custom-course backup.
--   rounds           — round-of-golf rows; visible to owner + linked-friend
--                      participants via RLS.
--   round_claims     — per-claimant claim status on a round.
--   friend_requests  — outgoing/incoming friendship offers.
--   friendships      — accepted, symmetric (two rows per pair).
--
-- All tables have RLS enabled. The "automatic RLS" setting in the project
-- dashboard ensures any future table inherits this default.
-- =============================================================================


-- =============================================================================
-- Helper: keep updated_at fresh on every row mutation.
-- =============================================================================
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;


-- =============================================================================
-- profiles
-- =============================================================================
create table if not exists public.profiles (
  user_id      uuid        primary key references auth.users on delete cascade,
  handle       text        not null,
  display_name text        not null,
  avatar_color text        not null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  -- Handles are case-insensitively unique; stored lowercase so handle-search
  -- can use plain equality.
  constraint profiles_handle_lowercase_check check (handle = lower(handle)),
  constraint profiles_handle_format_check check (handle ~ '^[a-z][a-z0-9._]{2,19}$')
);

create unique index if not exists profiles_handle_unique on public.profiles (handle);

drop trigger if exists profiles_touch_updated_at on public.profiles;
create trigger profiles_touch_updated_at
before update on public.profiles
for each row execute function public.touch_updated_at();

alter table public.profiles enable row level security;


-- =============================================================================
-- roster_players (private backup of the user's local roster)
-- =============================================================================
create table if not exists public.roster_players (
  owner_user_id  uuid not null references public.profiles on delete cascade,
  id             text not null,
  nickname       text not null,
  color          text,
  linked_user_id uuid references public.profiles on delete set null,
  updated_at     timestamptz not null default now(),
  primary key (owner_user_id, id)
);

drop trigger if exists roster_players_touch_updated_at on public.roster_players;
create trigger roster_players_touch_updated_at
before update on public.roster_players
for each row execute function public.touch_updated_at();

alter table public.roster_players enable row level security;


-- =============================================================================
-- courses (private backup of the user's custom courses)
-- =============================================================================
create table if not exists public.courses (
  owner_user_id uuid not null references public.profiles on delete cascade,
  id            text not null,
  name          text not null,
  location      text,
  holes         jsonb not null,
  source        text not null check (source in ('catalog','custom')),
  updated_at    timestamptz not null default now(),
  primary key (owner_user_id, id)
);

drop trigger if exists courses_touch_updated_at on public.courses;
create trigger courses_touch_updated_at
before update on public.courses
for each row execute function public.touch_updated_at();

alter table public.courses enable row level security;


-- =============================================================================
-- rounds
-- =============================================================================
create table if not exists public.rounds (
  id                  text not null primary key,
  owner_user_id       uuid not null references public.profiles on delete cascade,
  course_snapshot     jsonb not null,
  scoring_rule        text not null check (scoring_rule in ('stroke','scramble')),
  player_ids          jsonb not null,                          -- string[] of local Player.ids
  player_user_ids     uuid[] not null default '{}',            -- uuid[] of linked-friend participants (drives RLS visibility)
  teams               jsonb,                                   -- Team[] when scramble
  scores              jsonb not null default '[]'::jsonb,
  current_hole_number int  not null default 1,
  started_at          timestamptz not null,
  completed_at        timestamptz,
  updated_at          timestamptz not null default now()
);

create index if not exists rounds_owner_idx on public.rounds (owner_user_id, completed_at desc);
create index if not exists rounds_participants_idx on public.rounds using gin (player_user_ids);

drop trigger if exists rounds_touch_updated_at on public.rounds;
create trigger rounds_touch_updated_at
before update on public.rounds
for each row execute function public.touch_updated_at();

alter table public.rounds enable row level security;


-- =============================================================================
-- round_claims
-- =============================================================================
create table if not exists public.round_claims (
  round_id          text not null references public.rounds on delete cascade,
  claimant_user_id  uuid not null references public.profiles on delete cascade,
  status            text not null check (status in ('pending','claimed','not-claimed')),
  updated_at        timestamptz not null default now(),
  primary key (round_id, claimant_user_id)
);

create index if not exists round_claims_claimant_idx on public.round_claims (claimant_user_id, status);

drop trigger if exists round_claims_touch_updated_at on public.round_claims;
create trigger round_claims_touch_updated_at
before update on public.round_claims
for each row execute function public.touch_updated_at();

alter table public.round_claims enable row level security;


-- =============================================================================
-- friend_requests
-- =============================================================================
create table if not exists public.friend_requests (
  id                uuid primary key default gen_random_uuid(),
  from_user_id      uuid not null references public.profiles on delete cascade,
  to_user_id        uuid not null references public.profiles on delete cascade,
  status            text not null check (status in ('pending','accepted','declined','expired')),
  source_player_id  text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  -- A user can't friend themselves, and there can only be one pending request
  -- between any pair at a time.
  constraint friend_requests_no_self_check check (from_user_id <> to_user_id)
);

create unique index if not exists friend_requests_unique_pending
  on public.friend_requests (from_user_id, to_user_id)
  where status = 'pending';

create index if not exists friend_requests_to_idx on public.friend_requests (to_user_id, status);
create index if not exists friend_requests_from_idx on public.friend_requests (from_user_id, status);

drop trigger if exists friend_requests_touch_updated_at on public.friend_requests;
create trigger friend_requests_touch_updated_at
before update on public.friend_requests
for each row execute function public.touch_updated_at();

alter table public.friend_requests enable row level security;


-- =============================================================================
-- friendships (symmetric — two rows per friendship pair)
-- =============================================================================
create table if not exists public.friendships (
  user_id        uuid not null references public.profiles on delete cascade,
  friend_user_id uuid not null references public.profiles on delete cascade,
  created_at     timestamptz not null default now(),
  primary key (user_id, friend_user_id),
  constraint friendships_no_self_check check (user_id <> friend_user_id)
);

create index if not exists friendships_friend_idx on public.friendships (friend_user_id);

alter table public.friendships enable row level security;


-- =============================================================================
-- RLS policies
-- =============================================================================

-- profiles: every signed-in user can read every profile (so handle search
-- works); only the owner can insert / update.
drop policy if exists profiles_select_all on public.profiles;
create policy profiles_select_all on public.profiles
  for select to authenticated
  using (true);

drop policy if exists profiles_insert_self on public.profiles;
create policy profiles_insert_self on public.profiles
  for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self on public.profiles
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());


-- roster_players: full CRUD restricted to owner.
drop policy if exists roster_players_owner_all on public.roster_players;
create policy roster_players_owner_all on public.roster_players
  for all to authenticated
  using (owner_user_id = auth.uid())
  with check (owner_user_id = auth.uid());


-- courses: full CRUD restricted to owner.
drop policy if exists courses_owner_all on public.courses;
create policy courses_owner_all on public.courses
  for all to authenticated
  using (owner_user_id = auth.uid())
  with check (owner_user_id = auth.uid());


-- rounds:
--   SELECT — owner OR participant whose userId is in player_user_ids.
--   INSERT / UPDATE / DELETE — owner only.
drop policy if exists rounds_select_owner_or_participant on public.rounds;
create policy rounds_select_owner_or_participant on public.rounds
  for select to authenticated
  using (
    owner_user_id = auth.uid()
    or auth.uid() = any (player_user_ids)
  );

drop policy if exists rounds_insert_owner on public.rounds;
create policy rounds_insert_owner on public.rounds
  for insert to authenticated
  with check (owner_user_id = auth.uid());

drop policy if exists rounds_update_owner on public.rounds;
create policy rounds_update_owner on public.rounds
  for update to authenticated
  using (owner_user_id = auth.uid())
  with check (owner_user_id = auth.uid());

drop policy if exists rounds_delete_owner on public.rounds;
create policy rounds_delete_owner on public.rounds
  for delete to authenticated
  using (owner_user_id = auth.uid());


-- round_claims:
--   SELECT — round owner OR claimant.
--   INSERT — only the round owner can create claim entries (round-completion path).
--   UPDATE — only the claimant (their decision to make).
drop policy if exists round_claims_select on public.round_claims;
create policy round_claims_select on public.round_claims
  for select to authenticated
  using (
    claimant_user_id = auth.uid()
    or exists (
      select 1 from public.rounds r
      where r.id = round_claims.round_id
        and r.owner_user_id = auth.uid()
    )
  );

drop policy if exists round_claims_insert_owner on public.round_claims;
create policy round_claims_insert_owner on public.round_claims
  for insert to authenticated
  with check (
    exists (
      select 1 from public.rounds r
      where r.id = round_claims.round_id
        and r.owner_user_id = auth.uid()
    )
  );

drop policy if exists round_claims_update_claimant on public.round_claims;
create policy round_claims_update_claimant on public.round_claims
  for update to authenticated
  using (claimant_user_id = auth.uid())
  with check (claimant_user_id = auth.uid());


-- friend_requests:
--   SELECT — visible to both sides.
--   INSERT — only as the sender.
--   UPDATE — sender can cancel (set declined/expired); recipient can decide.
--   DELETE — disabled; we keep the row for history.
drop policy if exists friend_requests_select on public.friend_requests;
create policy friend_requests_select on public.friend_requests
  for select to authenticated
  using (from_user_id = auth.uid() or to_user_id = auth.uid());

drop policy if exists friend_requests_insert_sender on public.friend_requests;
create policy friend_requests_insert_sender on public.friend_requests
  for insert to authenticated
  with check (from_user_id = auth.uid() and status = 'pending');

drop policy if exists friend_requests_update_either on public.friend_requests;
create policy friend_requests_update_either on public.friend_requests
  for update to authenticated
  using (from_user_id = auth.uid() or to_user_id = auth.uid())
  with check (from_user_id = auth.uid() or to_user_id = auth.uid());


-- friendships:
--   SELECT — visible to both sides.
--   INSERT/DELETE — only via the accept_friend_request / unfriend RPCs below
--     which run as security definer. Direct writes are blocked by withholding
--     INSERT/DELETE policies.
drop policy if exists friendships_select on public.friendships;
create policy friendships_select on public.friendships
  for select to authenticated
  using (user_id = auth.uid() or friend_user_id = auth.uid());


-- =============================================================================
-- RPC: accept_friend_request
--   Atomically:
--     · marks the request 'accepted'
--     · inserts symmetric friendship rows
--     · optionally links the sender's `source_player_id` roster row when
--       the request was initiated by tapping an existing local player
--     · find-or-creates the sender's roster row for the new friend so
--       their player picker (which reads `roster_players`, not
--       `friendships`) surfaces the friend on the next refresh.
--   The receiver mints its own roster row optimistically via the
--   client-side `ensureRosterForFriend` helper for instant UX; the server
--   side leaves the receiver's roster untouched.
--   Runs with SECURITY DEFINER to bypass the friendships INSERT block but
--   re-checks that the caller is actually the recipient before doing anything.
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

revoke all on function public.accept_friend_request(uuid) from public;
grant execute on function public.accept_friend_request(uuid) to authenticated;


-- =============================================================================
-- Realtime — enable the realtime publication for the tables we want to
-- subscribe to from the client. Without this, Postgres CDC events don't get
-- broadcast.
-- =============================================================================
alter publication supabase_realtime add table public.profiles;
alter publication supabase_realtime add table public.roster_players;
alter publication supabase_realtime add table public.courses;
alter publication supabase_realtime add table public.rounds;
alter publication supabase_realtime add table public.round_claims;
alter publication supabase_realtime add table public.friend_requests;
alter publication supabase_realtime add table public.friendships;
