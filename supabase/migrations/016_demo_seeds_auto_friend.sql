-- =============================================================================
-- Migration 016: demo-seed profiles + auto-friend trigger
-- =============================================================================
-- Apply via Dashboard -> SQL Editor -> paste -> Run.
--
-- Adds a flag to `profiles` identifying "demo seed" accounts (the pro-
-- player imposter accounts that ship populated rounds for testers to
-- see). Then installs an AFTER INSERT trigger that auto-creates
-- symmetric friendships between every newly-signed-up user and every
-- profile flagged as a demo seed. Skips the friendship for the demo
-- seeds themselves (they don't auto-friend each other on insertion).
--
-- The trigger is SECURITY DEFINER so it can bypass the friendships RLS
-- (normal inserts are gated to the request_friend RPC; this is a
-- different special case for demo bootstrapping).
--
-- Effect: any future Google sign-in (or magic-link sign-up) that
-- completes the profile-creation step lands in the app with the
-- demo seeds already in their friends list and visible in their feed.
-- =============================================================================


-- =============================================================================
-- 1. Schema: profiles.is_demo_seed flag
-- =============================================================================

alter table public.profiles
  add column if not exists is_demo_seed boolean not null default false;

create index if not exists profiles_demo_seed_idx
  on public.profiles (is_demo_seed)
  where is_demo_seed = true;


-- =============================================================================
-- 2. Trigger: auto-friend new users with every demo seed
-- =============================================================================

create or replace function public.auto_friend_demo_seeds()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Skip when the new row is itself a demo seed — we don't want pros
  -- auto-friending each other every time a new seed is inserted.
  if new.is_demo_seed then
    return new;
  end if;

  -- For every existing demo-seed profile, insert symmetric friendship
  -- rows. on conflict do nothing keeps the trigger idempotent in case
  -- of a retry / replay.
  insert into public.friendships (user_id, friend_user_id)
  select new.user_id, p.user_id
    from public.profiles p
    where p.is_demo_seed = true
      and p.user_id <> new.user_id
  on conflict (user_id, friend_user_id) do nothing;

  insert into public.friendships (user_id, friend_user_id)
  select p.user_id, new.user_id
    from public.profiles p
    where p.is_demo_seed = true
      and p.user_id <> new.user_id
  on conflict (user_id, friend_user_id) do nothing;

  return new;
end;
$$;

drop trigger if exists profiles_auto_friend_demo_seeds on public.profiles;
create trigger profiles_auto_friend_demo_seeds
after insert on public.profiles
for each row execute function public.auto_friend_demo_seeds();
