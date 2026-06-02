-- Migration 013 — round likes.
--
-- One row per (round, liker) — at most one like per user per round
-- enforced by a unique constraint. Hard-delete on toggle-off rather
-- than soft-delete: likes don't need a tombstone trail (no edit
-- history, no moderation surface), and dropping the row keeps the
-- count aggregate honest without extra `WHERE deleted_at IS NULL`
-- predicates everywhere.
--
-- Shape mirrors `scorecard_scores` from migration 002:
--
--   * `id` is a client-generated text uuid; PowerSync upload
--     connector's `{ ...op.opData, id: op.id }` pattern stays
--     unchanged.
--   * `owner_user_id` is denormalized for PowerSync sync-rule
--     scoping (no JOIN in the stream rule). A BEFORE INSERT/UPDATE
--     trigger copies it from the parent `scorecards` row and rejects
--     any update that tries to change it. Clients leave the column
--     null on inserts (PowerSync sends only what it knows about
--     locally; the trigger fills it in).
--   * Visibility predicate joins back through `scorecards` and
--     reuses the existing `public.is_friend_of(uuid)` helper from
--     migration 005, matching the comments table from migration 007.
--
-- Run once against your Supabase project after migrations 001
-- through 013 have been applied. Idempotent re-runs are out of
-- scope: drop the table manually if you need to re-apply.

-- =====================================================
-- Table
-- =====================================================

create table public.round_likes (
  id text primary key,
  round_id text not null references public.scorecards (id) on delete cascade,
  liker_user_id uuid not null references auth.users (id) on delete cascade,
  owner_user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint round_likes_unique_per_user
    unique (round_id, liker_user_id)
);

create index round_likes_round_idx
  on public.round_likes (round_id);

create index round_likes_owner_idx
  on public.round_likes (owner_user_id);

create index round_likes_liker_idx
  on public.round_likes (liker_user_id);

-- =====================================================
-- owner_user_id trigger
-- =====================================================
-- Copy owner_user_id from the parent scorecards row on insert;
-- reject any update that tries to change it. Same pattern as
-- `scorecard_scores_fill_owner` from migration 002.

create or replace function public.round_likes_fill_owner()
returns trigger
language plpgsql
as $$
declare
  parent_owner uuid;
begin
  select owner_user_id into parent_owner
    from public.scorecards
    where id = new.round_id;

  if parent_owner is null then
    raise exception 'round_likes: parent scorecard % not found', new.round_id
      using errcode = '23503';
  end if;

  if new.owner_user_id is null then
    new.owner_user_id := parent_owner;
  elsif new.owner_user_id <> parent_owner then
    raise exception 'round_likes: owner_user_id mismatch (% vs parent %)',
      new.owner_user_id, parent_owner
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger round_likes_owner_trg
  before insert or update on public.round_likes
  for each row
  execute function public.round_likes_fill_owner();

-- =====================================================
-- PowerSync publication
-- =====================================================
-- The `powersync` publication is FOR ALL TABLES; new tables join
-- automatically. See migration 002's note.

-- =====================================================
-- Row Level Security
-- =====================================================
alter table public.round_likes enable row level security;

-- SELECT — anyone who can see the parent scorecard can see its
-- likes. Same predicate as `comments select self or friend` from
-- migration 007 so visibility stays consistent across surfaces.
create policy "round_likes select self or friend" on public.round_likes
  for select using (
    exists (
      select 1
      from public.scorecards s
      where s.id = round_likes.round_id
        and (auth.uid() = s.owner_user_id or public.is_friend_of(s.owner_user_id))
    )
  );

-- INSERT — visible round AND the liker must be the calling user.
-- A viewer who lost visibility between buffering and upload sees
-- the row rejected; the PowerSync upload connector discards on a
-- 42501 (insufficient privilege) error.
create policy "round_likes insert if visible" on public.round_likes
  for insert with check (
    liker_user_id = auth.uid()
    and exists (
      select 1
      from public.scorecards s
      where s.id = round_likes.round_id
        and (auth.uid() = s.owner_user_id or public.is_friend_of(s.owner_user_id))
    )
  );

-- DELETE — liker-only. Other users (including the round owner)
-- cannot remove someone else's like. A user un-liking a round they
-- can no longer see is still allowed — the row is theirs.
create policy "round_likes delete own" on public.round_likes
  for delete using (liker_user_id = auth.uid());

-- No UPDATE policy — the row is immutable once inserted. Toggling
-- off is a DELETE; toggling on is an INSERT.
