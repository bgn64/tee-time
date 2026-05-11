-- =============================================================================
-- Migration 008: course catalog (single-table catalog + custom courses)
-- =============================================================================
-- Apply via Dashboard -> SQL Editor -> paste -> Run.
--
-- Background:
--   Pre-008 the `courses` table only stored user-owned custom courses.
--   v7 ingests a real catalog (~17k US courses from OpenGolfAPI, ODbL).
--   The two coexist on a single table, distinguished by `source`:
--     · 'opengolf' rows are global, read-only by every authenticated user.
--       Inserts / updates / deletes flow through the service role only
--       (the ingest script).
--     · 'custom' rows are private to the owning user, full CRUD via RLS.
--
-- Dev DB only: existing custom course rows are truncated.
-- =============================================================================


-- =============================================================================
-- 1. Drop pre-008 artifacts
-- =============================================================================
drop policy if exists courses_owner_all on public.courses;
drop trigger if exists courses_touch_updated_at on public.courses;
drop table if exists public.courses;


-- =============================================================================
-- 2. courses (catalog + custom)
-- =============================================================================
create table public.courses (
  -- Prefixed id. For catalog: 'opengolf:<uuid>'. For custom: 'custom:<uuid>'.
  -- Keeps the namespaces from colliding even though they share one table.
  id                  text        primary key,
  owner_user_id       uuid        references public.profiles on delete cascade,
  source              text        not null check (source in ('opengolf','custom')),

  -- Identity / location
  name                text        not null,
  city                text,
  state               text,
  country             text,
  address             text,
  postal_code         text,
  latitude            double precision,
  longitude           double precision,

  -- Course basics
  course_type         text,
  hole_count          int         not null,
  total_par           int,
  total_yardage       int,
  year_built          int,
  architect           text,
  phone               text,
  website             text,

  -- Hole / tee jsonb. Schema-light to absorb future enrichment from
  -- /v1/courses/:id/tees and /v1/courses/:id/holes without a migration.
  --   holes: [{ number, par, handicap?, yardages?: { teeId: yards } }]
  --   tees:  [{ id, name, color?, slope?, rating?, totalYardage?, gender? }]
  holes               jsonb       not null default '[]'::jsonb,
  tees                jsonb       not null default '[]'::jsonb,

  -- Provenance
  source_external_id  text,
  source_updated_at   timestamptz,
  details             jsonb,

  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  -- Either it's catalog (no owner) or custom (has owner). Never both.
  constraint courses_owner_matches_source check (
    (source = 'opengolf' and owner_user_id is null) or
    (source = 'custom'   and owner_user_id is not null)
  )
);

-- Indexes
create index courses_owner_idx
  on public.courses (owner_user_id)
  where owner_user_id is not null;

create index courses_source_idx
  on public.courses (source);

-- Name + city lower-case prefix indexes for the in-app search bar.
create index courses_name_lower_idx
  on public.courses (lower(name) text_pattern_ops);
create index courses_city_lower_idx
  on public.courses (lower(city) text_pattern_ops)
  where city is not null;

-- Trigram index for fuzzy substring matches (e.g. searching "pebble" finds
-- "Pebble Beach Links" anywhere in the name). pg_trgm ships with Supabase.
create extension if not exists pg_trgm;
create index courses_name_trgm_idx
  on public.courses using gin (name gin_trgm_ops);

create trigger courses_touch_updated_at
before update on public.courses
for each row execute function public.touch_updated_at();

alter table public.courses enable row level security;


-- =============================================================================
-- 3. RLS
-- =============================================================================

-- SELECT: anyone signed in sees the global catalog + their own customs.
drop policy if exists courses_select on public.courses;
create policy courses_select on public.courses
  for select to authenticated
  using (
    source = 'opengolf'
    or owner_user_id = auth.uid()
  );

-- INSERT/UPDATE/DELETE: restricted to a user's own custom rows. Catalog
-- writes go through the service role (bypasses RLS) from the ingest
-- script — no policy needed.
drop policy if exists courses_modify_own on public.courses;
create policy courses_modify_own on public.courses
  for all to authenticated
  using (source = 'custom' and owner_user_id = auth.uid())
  with check (source = 'custom' and owner_user_id = auth.uid());


-- =============================================================================
-- 4. Realtime publication
-- =============================================================================
-- Catalog rows mutate rarely (re-imports); custom rows are user-private.
-- Re-add to the realtime publication so the courses table is monitored
-- the same way as in 001.
do $$
begin
  if exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'courses'
  ) then
    alter publication supabase_realtime drop table public.courses;
  end if;
  alter publication supabase_realtime add table public.courses;
end $$;
