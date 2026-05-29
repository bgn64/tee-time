-- Migration 007 — round comments.
--
-- Adds a `comments` table that anyone with visibility on a scorecard
-- can read and write. Comments are intentionally tied to scorecard
-- visibility rather than a separate ACL: a viewer who can see the
-- round can see and contribute to its discussion. Soft-deleted via
-- a `deleted_at` tombstone so a deleted comment can be hidden
-- client-side without leaving holes in the sync stream's row PKs.
--
-- Shape mirrors the scorecards + scorecard_scores tables:
--
--   * `id` is a client-generated text uuid (NOT GENERATED ALWAYS),
--     consistent with the PowerSync upload connector's
--     `{ ...op.opData, id: op.id }` pattern.
--   * Foreign keys to `scorecards(id)` and `auth.users(id)` cascade
--     on delete so deleting a round or a user wipes the associated
--     comments.
--   * RLS visibility joins back to `scorecards` and reuses the
--     existing `public.is_friend_of(uuid)` helper from migration 005
--     so the read predicate stays in lockstep with the scorecards
--     `select self or friend` policy.
--
-- Run once against your Supabase project after migrations 001
-- through 006 have been applied. Idempotent re-runs are out of
-- scope: drop the table manually if you need to re-apply.

-- =====================================================
-- Table
-- =====================================================

create table public.comments (
  id text primary key,
  round_id text not null references public.scorecards (id) on delete cascade,
  author_user_id uuid not null references auth.users (id) on delete cascade,
  body text not null check (char_length(body) between 1 and 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz null
);

create index comments_round_created_idx
  on public.comments (round_id, created_at);

create index comments_author_idx
  on public.comments (author_user_id);

-- =====================================================
-- PowerSync publication
-- =====================================================
-- The `powersync` publication on this project is FOR ALL TABLES
-- (see migration 002's note), so new tables join automatically.
-- No explicit `alter publication powersync add table` needed.

-- =====================================================
-- Row Level Security
-- =====================================================
alter table public.comments enable row level security;

-- SELECT — anyone who can see the parent scorecard can see its
-- comments. Mirrors the existing
-- `scorecards select self or friend` policy from migration 005;
-- the predicate stays consistent because PowerSync's friend-of-owner
-- visibility rule lives in `public.is_friend_of(uuid)`.
create policy "comments select self or friend" on public.comments
  for select using (
    exists (
      select 1
      from public.scorecards s
      where s.id = comments.round_id
        and (auth.uid() = s.owner_user_id or public.is_friend_of(s.owner_user_id))
    )
  );

-- INSERT — same visibility predicate AND the author must be the
-- calling user. A viewer who has lost visibility between client
-- buffering the comment and the upload landing will see the row
-- rejected by RLS; the existing PowerSync upload connector
-- discards on a 42501 (insufficient privilege) error.
create policy "comments insert if visible" on public.comments
  for insert with check (
    author_user_id = auth.uid()
    and exists (
      select 1
      from public.scorecards s
      where s.id = comments.round_id
        and (auth.uid() = s.owner_user_id or public.is_friend_of(s.owner_user_id))
    )
  );

-- UPDATE — author-only. Covers both body edits and soft-deletes
-- (setting `deleted_at`). The owner cannot moderate other users'
-- comments in v1; that's a separate decision and can be added
-- later via an `OR auth.uid() = (select owner_user_id from
-- scorecards where id = comments.round_id)` branch.
create policy "comments update own" on public.comments
  for update
  using (author_user_id = auth.uid())
  with check (author_user_id = auth.uid());

-- No DELETE policy — hard delete is not exposed. Clients UPDATE
-- `deleted_at` to soft-delete, and the UI hides
-- `deleted_at IS NOT NULL` rows.
