-- =========================================================
-- 015_achievement_tags_object_shape.sql
--
-- Evolve `scorecard_achievement_tags.tags` from a per-hole
-- TagKey[] array to a per-tag 3-state map
-- `{ [TagKey]: 'yes' | 'no' }`.
--
-- Rationale: the client moved from a single-toggle model
-- (tap = "this happened") to a 3-state model (yes / no /
-- unset). Storing the explicit value per tag lets us
-- distinguish "didn't happen" from "not entered yet" — the
-- two cases were both represented as "untapped" before.
--
-- Backwards compat: the column stays `jsonb`. Legacy rows
-- (array form) keep working because the client reader
-- auto-detects array vs. object and normalises array entries
-- to {tag: 'yes'}. We don't bulk-rewrite the historical rows
-- here — they continue to render correctly under the new UI
-- and can be migrated lazily on the next write.
-- =========================================================

-- Drop the old "tags must be an array" constraint so the
-- new writes succeed.
alter table public.scorecard_achievement_tags
  drop constraint if exists scorecard_achievement_tags_tags_is_array;

-- Replace it with one that accepts EITHER shape during the
-- transition (and forever, since legacy data won't be
-- rewritten). The constraint also rules out scalars / nulls
-- inside the column so we don't accept malformed jsonb.
alter table public.scorecard_achievement_tags
  add constraint scorecard_achievement_tags_tags_shape
  check (jsonb_typeof(tags) in ('array', 'object'));

-- Sand-trap the default to the new object shape so any
-- INSERT that omits `tags` gets an empty object (consistent
-- with how the reader interprets `{}` = no values set).
alter table public.scorecard_achievement_tags
  alter column tags set default '{}'::jsonb;
