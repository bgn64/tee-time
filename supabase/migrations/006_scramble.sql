-- Migration 006 — scramble teams on scorecards.
--
-- Adds a `teams` jsonb column to `public.scorecards` so the Score tab
-- can persist scramble round configuration (one team per scoring unit,
-- with per-team color + name snapshot). The shape is:
--
--   [
--     { "id": "team-1-…", "name": "Red", "color": "#7cb342",
--       "playerIds": ["user:…", "custom:…"] },
--     ...
--   ]
--
-- Stroke rounds keep `teams = '[]'::jsonb` (the default), so existing
-- stroke flows don't have to opt in. The client reads/writes the column
-- as TEXT locally (PowerSync limitation); the upload connector
-- re-parses it before posting to Supabase via JSON_COLUMNS_BY_TABLE.
--
-- No RLS / sync-rule changes needed — `scorecards` + `friend_scorecards`
-- already replicate full rows, so the new column flows through to all
-- existing subscribers automatically.
--
-- Idempotent re-runs are out of scope: drop the column manually if you
-- need to re-apply.

alter table public.scorecards
  add column teams jsonb not null default '[]'::jsonb;
