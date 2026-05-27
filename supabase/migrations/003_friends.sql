-- Migration 003 — friending feature (profiles + friend_requests + friendships).
--
-- Adds the cloud-side schema for the new Search tab + profile pill UX:
--
--   * profiles: one row per authenticated user, created via the
--     complete_profile RPC on first sign-in. Auto-cascades from
--     auth.users on user delete.
--   * friend_requests: pending/accepted/declined/expired. Partial
--     unique index keeps at most one pending FR per (from, to) pair.
--     A new pending FR after a decline is permitted because the prior
--     row is no longer pending.
--   * friendships: symmetric two-row representation (each accepted
--     friendship inserts (a, b) AND (b, a)). Reads via simple
--     `user_id = me` filter; no greatest/least gymnastics needed.
--     The PK is a synthetic `id uuid` (not the compound pair) because
--     PowerSync requires every synced row to have a single-column `id`
--     it can use as the local SQLite PK. A `UNIQUE (user_id,
--     friend_user_id)` index preserves the symmetric-two-rows
--     invariant.
--
-- POWERSYNC NOTE:
--
--   All three tables are synced down to the client via the streams in
--   `powersync/sync-config.yaml` (own_profile / friend_profiles /
--   requester_profiles / friendships / friend_requests). Writes still
--   flow through the SECURITY DEFINER RPCs below — PowerSync handles
--   the read replication only. The `profiles` sync streams alias
--   `user_id AS id` because PowerSync uses `id` as the local row key.
--
-- WRITE PATH HARDENING:
--
--   ALL writes to friend_requests and friendships happen through
--   SECURITY DEFINER RPCs. Clients have NO insert/update/delete RLS
--   policies on those tables — only SELECT. This is required because
--   the integrity contract spans multiple rows:
--
--     * An accepted friend_request implies two friendships rows exist.
--     * A "send" can either insert a new pending OR auto-accept a
--       reciprocal pending from the other side (atomic).
--     * Status flips must be transitions; a sender flipping their own
--       outgoing request to 'accepted' would bypass the friendship
--       insert entirely if direct UPDATE were allowed.
--     * Unfriend must delete BOTH symmetric rows AND clear any pending
--       FRs between the pair (so a stale FR can't immediately
--       re-friend).
--
--   None of these invariants can be enforced by RLS alone.
--
-- All SECURITY DEFINER functions:
--   1. Guard `auth.uid() is null` as the first statement (defense in
--      depth — if EXECUTE somehow lands as anon, fail closed instead of
--      treating null as "any user").
--   2. Are REVOKEd from PUBLIC and GRANTed only to `authenticated`
--      (Postgres grants EXECUTE to PUBLIC by default).
--
-- Profile is referenced as the FK target (not auth.users directly) on
-- friend_requests and friendships so a relationship can only exist
-- between users who have completed profile setup. auth.users → profiles
-- still cascade-deletes transitively.
--
-- Run once against your Supabase project after migrations 001 + 002
-- have been applied. Idempotent re-runs are out of scope: drop the
-- tables + functions manually if you need to re-apply.

-- =====================================================
-- Tables
-- =====================================================

create table public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  handle text not null unique check (handle ~ '^[a-z][a-z0-9._]{2,19}$'),
  display_name text not null check (length(trim(display_name)) > 0),
  avatar_color text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Prefix-search-friendly index. handle is lowercase-enforced by the
-- CHECK constraint, so no lower() expression is needed; the LIKE
-- prefix operator pattern_ops index serves `handle LIKE 'x%'` and
-- `handle ILIKE 'x%'` (when the pattern is already lowercase).
create index profiles_handle_prefix_idx
  on public.profiles (handle text_pattern_ops);

create table public.friend_requests (
  id uuid primary key default gen_random_uuid(),
  from_user_id uuid not null references public.profiles(user_id) on delete cascade,
  to_user_id uuid not null references public.profiles(user_id) on delete cascade,
  status text not null check (status in ('pending', 'accepted', 'declined', 'expired')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (from_user_id <> to_user_id)
);

-- One pending FR per direction. Partial index so a declined row
-- doesn't block a future new pending row.
create unique index friend_requests_unique_pending
  on public.friend_requests (from_user_id, to_user_id)
  where status = 'pending';

-- Lookup index for "incoming FRs for me" + "outgoing FRs from me".
create index friend_requests_to_user_idx on public.friend_requests (to_user_id, status);
create index friend_requests_from_user_idx on public.friend_requests (from_user_id, status);

create table public.friendships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  friend_user_id uuid not null references public.profiles(user_id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_id, friend_user_id),
  check (user_id <> friend_user_id)
);

-- =====================================================
-- RLS — clients can only SELECT. ALL writes go through RPCs below.
-- =====================================================

alter table public.profiles enable row level security;
alter table public.friend_requests enable row level security;
alter table public.friendships enable row level security;

-- profiles: any authenticated user can read all (needed for search).
-- UPDATE is direct (own row only); INSERT happens via complete_profile RPC.
create policy profiles_select_all on public.profiles
  for select to authenticated using (true);
create policy profiles_update_self on public.profiles
  for update to authenticated using (user_id = auth.uid());
-- NB: no insert/delete policy. Insert via complete_profile RPC; delete
-- cascades from auth.users only.

-- friend_requests: visible to either party. NO direct insert/update/delete.
create policy friend_requests_select on public.friend_requests
  for select to authenticated
  using (from_user_id = auth.uid() or to_user_id = auth.uid());

-- friendships: read if either side is me. NO direct writes.
create policy friendships_select on public.friendships
  for select to authenticated
  using (user_id = auth.uid() or friend_user_id = auth.uid());

-- =====================================================
-- RPCs (SECURITY DEFINER)
-- =====================================================

-- complete_profile: creates the profile row for the calling user.
-- Returns the (new or existing) profile so the client can hydrate.
-- Idempotent: calling twice returns the existing row without raising.
create or replace function public.complete_profile(
  p_handle text,
  p_display_name text,
  p_avatar_color text
) returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  existing public.profiles%rowtype;
  inserted public.profiles%rowtype;
begin
  if me is null then
    raise exception 'not authenticated';
  end if;
  select * into existing from public.profiles where user_id = me;
  if found then
    return existing;
  end if;

  insert into public.profiles (user_id, handle, display_name, avatar_color)
    values (me, p_handle, p_display_name, p_avatar_color)
    returning * into inserted;
  return inserted;
end;
$$;

-- send_friend_request: validates target, auto-accepts a reciprocal
-- pending FR if one exists (turning it into a friendship rather than
-- creating an orphan pair), else inserts a new pending FR. Returns the
-- friend_request row that the caller should optimistically track.
create or replace function public.send_friend_request(target_user_id uuid)
returns public.friend_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  reciprocal public.friend_requests%rowtype;
  inserted public.friend_requests%rowtype;
  already_friends boolean;
begin
  if me is null then
    raise exception 'not authenticated';
  end if;
  if target_user_id = me then
    raise exception 'Cannot friend yourself';
  end if;
  -- Target must have a profile row. The FK to profiles enforces this on
  -- insert too, but a friendly error is nicer than a constraint violation.
  perform 1 from public.profiles where user_id = target_user_id;
  if not found then
    raise exception 'User not found';
  end if;

  select exists (
    select 1 from public.friendships
    where user_id = me and friend_user_id = target_user_id
  ) into already_friends;
  if already_friends then
    raise exception 'Already friends';
  end if;

  -- Did the target already send ME a pending FR? If so, accept it
  -- atomically rather than creating a new outgoing pending row.
  select * into reciprocal
    from public.friend_requests
    where from_user_id = target_user_id and to_user_id = me
      and status = 'pending'
    for update;
  if found then
    update public.friend_requests
      set status = 'accepted', updated_at = now()
      where id = reciprocal.id
      returning * into reciprocal;
    insert into public.friendships (user_id, friend_user_id)
      values (me, target_user_id) on conflict do nothing;
    insert into public.friendships (user_id, friend_user_id)
      values (target_user_id, me) on conflict do nothing;
    return reciprocal;
  end if;

  insert into public.friend_requests (from_user_id, to_user_id, status)
    values (me, target_user_id, 'pending')
    returning * into inserted;
  return inserted;
end;
$$;

-- accept_friend_request: validates recipient = me and the row is still
-- pending, flips status to 'accepted', inserts both symmetric
-- friendship rows, and cleans up any reciprocal pending FR from me to
-- them (the race where we both sent simultaneously).
create or replace function public.accept_friend_request(request_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  req public.friend_requests%rowtype;
begin
  if me is null then
    raise exception 'not authenticated';
  end if;
  select * into req from public.friend_requests where id = request_id for update;
  if not found then
    raise exception 'Friend request not found';
  end if;
  if req.to_user_id <> me then
    raise exception 'You are not the recipient';
  end if;
  if req.status <> 'pending' then
    raise exception 'Friend request is no longer pending';
  end if;

  update public.friend_requests
    set status = 'accepted', updated_at = now()
    where id = request_id;

  -- Cleanup: if I had also sent THEM a pending FR (race), mark it
  -- accepted too so we don't leave a stale pending in the table.
  update public.friend_requests
    set status = 'accepted', updated_at = now()
    where from_user_id = me
      and to_user_id = req.from_user_id
      and status = 'pending';

  insert into public.friendships (user_id, friend_user_id)
    values (req.from_user_id, req.to_user_id) on conflict do nothing;
  insert into public.friendships (user_id, friend_user_id)
    values (req.to_user_id, req.from_user_id) on conflict do nothing;
end;
$$;

-- decline_friend_request: recipient marks an incoming pending FR as
-- 'declined'. No-op if already non-pending (e.g., sender cancelled
-- between the time you opened the banner and the time you tapped).
create or replace function public.decline_friend_request(request_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  req public.friend_requests%rowtype;
begin
  if me is null then
    raise exception 'not authenticated';
  end if;
  select * into req from public.friend_requests where id = request_id;
  if not found then
    raise exception 'Friend request not found';
  end if;
  if req.to_user_id <> me then
    raise exception 'You are not the recipient';
  end if;
  update public.friend_requests
    set status = 'declined', updated_at = now()
    where id = request_id and status = 'pending';
end;
$$;

-- cancel_friend_request: sender retracts their own outgoing pending FR.
-- Same `status = 'declined'` outcome as decline_friend_request — the
-- distinction is just which party may call it.
create or replace function public.cancel_friend_request(request_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  req public.friend_requests%rowtype;
begin
  if me is null then
    raise exception 'not authenticated';
  end if;
  select * into req from public.friend_requests where id = request_id;
  if not found then
    raise exception 'Friend request not found';
  end if;
  if req.from_user_id <> me then
    raise exception 'You are not the sender';
  end if;
  update public.friend_requests
    set status = 'declined', updated_at = now()
    where id = request_id and status = 'pending';
end;
$$;

-- unfriend: deletes both symmetric friendship rows AND marks any
-- pending FRs between the pair as 'declined' so a stale FR can't
-- immediately re-friend after a deliberate unfriend. Idempotent.
create or replace function public.unfriend(target_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
begin
  if me is null then
    raise exception 'not authenticated';
  end if;
  if target_user_id = me then
    raise exception 'Cannot unfriend yourself';
  end if;
  delete from public.friendships
    where (user_id = me and friend_user_id = target_user_id)
       or (user_id = target_user_id and friend_user_id = me);
  update public.friend_requests
    set status = 'declined', updated_at = now()
    where status = 'pending'
      and (
        (from_user_id = me and to_user_id = target_user_id)
        or
        (from_user_id = target_user_id and to_user_id = me)
      );
end;
$$;

-- =====================================================
-- Lock down RPC execution to `authenticated` only.
-- Postgres grants EXECUTE to PUBLIC by default; revoke first.
-- =====================================================
revoke all on function public.complete_profile(text, text, text) from public;
revoke all on function public.send_friend_request(uuid) from public;
revoke all on function public.accept_friend_request(uuid) from public;
revoke all on function public.decline_friend_request(uuid) from public;
revoke all on function public.cancel_friend_request(uuid) from public;
revoke all on function public.unfriend(uuid) from public;

grant execute on function public.complete_profile(text, text, text) to authenticated;
grant execute on function public.send_friend_request(uuid) to authenticated;
grant execute on function public.accept_friend_request(uuid) to authenticated;
grant execute on function public.decline_friend_request(uuid) to authenticated;
grant execute on function public.cancel_friend_request(uuid) to authenticated;
grant execute on function public.unfriend(uuid) to authenticated;
