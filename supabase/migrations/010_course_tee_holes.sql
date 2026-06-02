-- Migration 009 — course tee sets + tee-holes.
--
-- Phase 2 redesign of the round Scorecard tab requires per-tee
-- per-hole data (par, handicap_index, yardage) so different tee
-- sets on the same course can diverge on any of the three.
--
-- The OpenGolfAPI doesn't expose per-tee divergence today (verified
-- by direct inspection: `/v1/courses/:id/holes` returns scalar
-- `par` and `handicap_index` per hole). The `tee_id` field on hole
-- rows is always null in current data, suggesting future support is
-- possible but not live. So for the opengolf catalog these tables
-- will hold one tee-set row per (course, tee_name) with the same
-- scalar par+hcp written across every tee_set's holes. Custom
-- courses (custom-course editor is deferred) can opt into divergent
-- values.
--
-- ## Coexistence with `courses.tees` jsonb
--
-- Migration 008 already stores tee summary metadata in
-- `courses.tees` as jsonb. We are deliberately NOT migrating that
-- data into `course_tee_sets` in this phase. The renderer's
-- existing fallback (see `getHoleStats` in
-- `src/library/golf/teeGrouping.ts`) collapses tees without per-tee
-- hole rows into a single group using the scalar `Hole.par` /
-- `Hole.handicapIndex` values from the course snapshot. This keeps
-- in-flight rounds rendering correctly without any data migration.
--
-- Phase 2 ships the tables + RLS. Subsequent phases (or follow-up
-- work) can:
--   1. Extend `enrich_catalog_course` to populate `course_tee_sets`
--      + `course_tee_holes` for opengolf courses on first use.
--   2. Build a custom-course editor UI that writes divergent
--      per-tee par+hcp values.
--   3. Extend the course-detail Supabase REST query to LEFT JOIN
--      these tables and assemble `Course.tees[].holes`.
-- See plan.md §"Deferred / future work" + Phase 2 for the rationale.
--
-- Run once against your Supabase project after migrations 001
-- through 009 have been applied. Idempotent re-runs are safe
-- (every CREATE uses IF NOT EXISTS; every policy / trigger is
-- dropped before recreate) — Phase 2 of the round-views redesign
-- ships migration 010 with idempotency guards so a re-deploy
-- after a partial Phase 2 push doesn't fail on already-existing
-- tables.

-- =====================================================
-- Extensions
-- =====================================================
-- gen_random_uuid() lives in pgcrypto; Supabase enables it by
-- default, but be explicit so a re-applied schema works on a fresh
-- project.
create extension if not exists "pgcrypto";

-- =====================================================
-- Tables
-- =====================================================

create table if not exists public.course_tee_sets (
  id            uuid         not null default gen_random_uuid(),
  course_id     text         not null references public.courses (id) on delete cascade,
  name          text         not null,
  -- Optional canonical theme-token name ('teeBlue' / 'teeWhite' /
  -- 'teeRed' / 'teeGold' / 'teeFallback1'..'teeFallback6'). When
  -- null, the client hashes `id` to pick a fallback. See
  -- `src/library/golf/teeColor.ts`.
  color_token   text,
  slope         integer,
  rating        numeric(4, 1),
  total_yardage integer,
  sort_order    integer      not null default 0,
  created_at    timestamptz  not null default now(),
  updated_at    timestamptz  not null default now(),
  constraint course_tee_sets_pkey primary key (id),
  constraint course_tee_sets_course_name_unique unique (course_id, name),
  constraint course_tee_sets_color_token_check
    check (color_token is null or color_token in (
      'teeBlue', 'teeWhite', 'teeRed', 'teeGold',
      'teeFallback1', 'teeFallback2', 'teeFallback3',
      'teeFallback4', 'teeFallback5', 'teeFallback6'
    ))
);

create index if not exists course_tee_sets_course_idx
  on public.course_tee_sets (course_id);

create table if not exists public.course_tee_holes (
  tee_set_id     uuid         not null references public.course_tee_sets (id) on delete cascade,
  hole_number    integer      not null,
  par            integer      not null check (par between 1 and 7),
  handicap_index integer      check (handicap_index between 1 and 36),
  yardage        integer      check (yardage is null or yardage >= 0),
  created_at     timestamptz  not null default now(),
  updated_at     timestamptz  not null default now(),
  constraint course_tee_holes_pkey primary key (tee_set_id, hole_number),
  constraint course_tee_holes_hole_number_check
    check (hole_number between 1 and 36)
);

create index if not exists course_tee_holes_tee_set_idx
  on public.course_tee_holes (tee_set_id);

-- =====================================================
-- updated_at triggers
-- =====================================================
-- Reuse the generic public.touch_updated_at function defined in
-- migration 008.

drop trigger if exists course_tee_sets_touch_updated_at on public.course_tee_sets;
create trigger course_tee_sets_touch_updated_at
  before update on public.course_tee_sets
  for each row execute function public.touch_updated_at();

drop trigger if exists course_tee_holes_touch_updated_at on public.course_tee_holes;
create trigger course_tee_holes_touch_updated_at
  before update on public.course_tee_holes
  for each row execute function public.touch_updated_at();

-- =====================================================
-- PowerSync publication
-- =====================================================
-- Course data is REST-only on the client (see migration 008's
-- comment). New tables join the FOR ALL TABLES publication
-- automatically; no sync stream is added because clients fetch tee
-- data via the same course-detail REST query that hydrates the
-- course snapshot at round-start, not via a live local table.

-- =====================================================
-- Row Level Security
-- =====================================================
-- Mirrors the `courses` policies from migration 008: tee rows are
-- visible to any authenticated user when their parent course is
-- visible (opengolf is global, custom is owner-only). Writes are
-- gated to the owner of the parent custom course. Opengolf rows
-- are written by service-role flows (the upcoming extension to
-- `enrich_catalog_course`) which bypass RLS.

alter table public.course_tee_sets enable row level security;
alter table public.course_tee_holes enable row level security;

drop policy if exists course_tee_sets_select on public.course_tee_sets;
create policy course_tee_sets_select
  on public.course_tee_sets
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.courses c
      where c.id = course_tee_sets.course_id
        and (c.source = 'opengolf' or c.owner_user_id = auth.uid())
    )
  );

drop policy if exists course_tee_sets_modify_own on public.course_tee_sets;
create policy course_tee_sets_modify_own
  on public.course_tee_sets
  for all
  to authenticated
  using (
    exists (
      select 1
      from public.courses c
      where c.id = course_tee_sets.course_id
        and c.source = 'custom'
        and c.owner_user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.courses c
      where c.id = course_tee_sets.course_id
        and c.source = 'custom'
        and c.owner_user_id = auth.uid()
    )
  );

drop policy if exists course_tee_holes_select on public.course_tee_holes;
create policy course_tee_holes_select
  on public.course_tee_holes
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.course_tee_sets s
      join public.courses c on c.id = s.course_id
      where s.id = course_tee_holes.tee_set_id
        and (c.source = 'opengolf' or c.owner_user_id = auth.uid())
    )
  );

drop policy if exists course_tee_holes_modify_own on public.course_tee_holes;
create policy course_tee_holes_modify_own
  on public.course_tee_holes
  for all
  to authenticated
  using (
    exists (
      select 1
      from public.course_tee_sets s
      join public.courses c on c.id = s.course_id
      where s.id = course_tee_holes.tee_set_id
        and c.source = 'custom'
        and c.owner_user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.course_tee_sets s
      join public.courses c on c.id = s.course_id
      where s.id = course_tee_holes.tee_set_id
        and c.source = 'custom'
        and c.owner_user_id = auth.uid()
    )
  );
