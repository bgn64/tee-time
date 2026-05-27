-- Migration 004 — custom_players (user-scoped roster of off-app players).
--
-- A "custom player" is someone the signed-in user plays rounds with
-- but who isn't (necessarily) a Supabase account holder — typically a
-- relative, an irregular partner, etc. The row is owned by the user
-- who created it; nobody else can read or write it.
--
-- Used by the Score-tab player picker as the second source alongside
-- the user's friend graph. Custom players can be scored for via the
-- standard scoring flow; once a round references a custom player,
-- their `id` lives in `scorecards.participants` as `custom:{id}`.
--
-- POWERSYNC NOTE:
--
--   Synced to the client via the `custom_players` stream in
--   `powersync/sync-config.yaml` (owner-scoped). The stream returns
--   ALL of the user's rows including soft-deleted ones — the picker
--   filters `WHERE deleted_at IS NULL` locally, but the participant
--   resolver intentionally does NOT, so historic scorecards keep
--   rendering the right nickname / avatar after a delete.
--
-- WRITE PATH:
--
--   Unlike the friending tables, custom_players has no multi-row
--   integrity contract. INSERT / UPDATE (rename, soft-delete) /
--   DELETE all go through PowerSync's CRUD upload queue, and the
--   RLS policies below enforce that you can only touch your own
--   rows. No SECURITY DEFINER RPCs needed.
--
--   The client-side soft-delete is an UPDATE setting `deleted_at`
--   and `updated_at`; a real DELETE is allowed by RLS but not
--   currently exposed in the UI.
--
-- Run once against your Supabase project after migrations 001 + 002
-- + 003 have been applied.

create table public.custom_players (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  nickname text not null check (length(trim(nickname)) > 0),
  avatar_color text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

-- Owner lookup index — used by the sync rule's `owner_user_id =
-- auth.user_id()` filter.
create index custom_players_by_owner
  on public.custom_players(owner_user_id);

-- Partial index for the picker's "active rows only" query path.
-- Picker runs `WHERE owner_user_id = ? AND deleted_at IS NULL`
-- locally; this index speeds up the same shape if it ever runs
-- server-side (e.g., from a future export job).
create index custom_players_owner_active_idx
  on public.custom_players(owner_user_id) where deleted_at is null;

-- =====================================================
-- RLS — owner-scoped CRUD.
-- =====================================================

alter table public.custom_players enable row level security;

create policy custom_players_select on public.custom_players
  for select to authenticated using (owner_user_id = auth.uid());

create policy custom_players_insert on public.custom_players
  for insert to authenticated with check (owner_user_id = auth.uid());

create policy custom_players_update on public.custom_players
  for update to authenticated
  using (owner_user_id = auth.uid())
  with check (owner_user_id = auth.uid());

-- DELETE is allowed by RLS for future-use (a "purge" UI). The client
-- today only soft-deletes via UPDATE deleted_at.
create policy custom_players_delete on public.custom_players
  for delete to authenticated using (owner_user_id = auth.uid());
