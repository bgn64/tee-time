-- =============================================================================
-- Migration 019: replace roster_players partial unique index with a plain
-- unique constraint
-- =============================================================================
-- Background
--   Migration 018 added a partial unique index on
--     (owner_user_id, linked_user_id) WHERE linked_user_id IS NOT NULL
--   to prevent duplicate roster rows for the same friend under one owner.
--   That index *correctly* enforces uniqueness at the DB layer, but
--   PostgREST's `?on_conflict=...` upsert parameter does NOT resolve
--   against partial unique indexes — it requires a full unique constraint
--   or non-partial unique index. As a result, the client's
--   `cloudUpsertPlayer(...)` calls with
--     onConflict: 'owner_user_id,linked_user_id'
--   were rejected with `400 Bad Request` ("there is no unique or
--   exclusion constraint matching the ON CONFLICT specification"), the
--   write queue dead-lettered the entry, and the user saw the toast
--   "Couldn't sync your last change" right after sign-in (when the
--   default-player auto-link side effect ran).
--
--   This migration drops the partial unique index and replaces it with a
--   plain UNIQUE constraint over the same two columns. PostgreSQL's
--   default NULLS DISTINCT semantics give us the same behavior we wanted:
--     * Multiple rows with linked_user_id = NULL are allowed (each NULL
--       is treated as distinct), so many unlinked local players per
--       owner remain supported.
--     * Two rows with the same non-null linked_user_id under the same
--       owner are rejected with 23505 — exactly the duplicate-friend
--       protection migration 018 was designed to add.
--   AND because it's a plain constraint, PostgREST will accept it as a
--   valid on_conflict target.
-- =============================================================================

begin;

drop index if exists public.roster_players_owner_linked_uniq;

alter table public.roster_players
  add constraint roster_players_owner_linked_uniq
  unique (owner_user_id, linked_user_id);

commit;
