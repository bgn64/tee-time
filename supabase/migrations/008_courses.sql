-- Migration 008 — courses catalog (opengolf + custom).
--
-- Ports the courses table, RLS policies, indexes, trigger, and
-- enrich_catalog_course RPC from the legacy app's 001_initial.sql.
-- The table holds two kinds of rows distinguished by the `source`
-- column:
--
--   * `source = 'opengolf'` — global read-only catalog rows ingested
--     by scripts/ingest-opengolf.ts under the service role.
--     owner_user_id is NULL.
--   * `source = 'custom'`   — private user-created rows.
--     owner_user_id is the creator and the only one who can SELECT
--     them. (Authenticated users can SELECT all opengolf rows.)
--
-- This migration is **idempotent** because it will be applied to two
-- different starting states:
--   1. The new app's staging Supabase project (no courses table yet).
--   2. The production Supabase project at cutover time (courses table
--      already present from the legacy app's 001_initial.sql, with
--      identical shape).
-- All CREATEs use IF NOT EXISTS / OR REPLACE; policies are dropped
-- and recreated; the publication ADD swallows the duplicate-object
-- exception.
--
-- Course access from the client is REST-only (supabase.from('courses')
-- queries). There is intentionally NO PowerSync sync stream for
-- courses — the dataset is too large to ship to every client, and
-- the round's captured `course_snapshot` already covers offline reads
-- for in-flight + completed rounds. If custom courses get added, a
-- separate scoped stream can sync them later.

-- =====================================================
-- Extensions + shared helper
-- =====================================================

create extension if not exists "pg_trgm";

-- Generic BEFORE UPDATE trigger function shared with future tables
-- that want updated_at maintained automatically. Idempotent: any
-- prior definition with this signature is replaced.
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- =====================================================
-- Table
-- =====================================================

create table if not exists public.courses (
  id                   text         not null,
  owner_user_id        uuid,
  source               text         not null,
  name                 text         not null,
  city                 text,
  state                text,
  country              text,
  address              text,
  postal_code          text,
  latitude             double precision,
  longitude            double precision,
  course_type          text,
  hole_count           integer      not null,
  total_par            integer,
  total_yardage        integer,
  year_built           integer,
  architect            text,
  phone                text,
  website              text,
  holes                jsonb        not null default '[]'::jsonb,
  tees                 jsonb        not null default '[]'::jsonb,
  source_external_id   text,
  source_updated_at    timestamptz,
  details              jsonb,
  created_at           timestamptz  not null default now(),
  updated_at           timestamptz  not null default now(),
  last_enriched_at     timestamptz,
  constraint courses_pkey primary key (id),
  constraint courses_source_check
    check (source = any (array['opengolf'::text, 'custom'::text])),
  constraint courses_owner_matches_source
    check (
      (source = 'opengolf' and owner_user_id is null)
      or
      (source = 'custom'   and owner_user_id is not null)
    )
);

-- FK to profiles(user_id) so deleting a profile cascades their custom
-- courses. Wrapped in DO block so a re-run against prod (where the FK
-- already exists with the same name) is a no-op.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname  = 'courses_owner_user_id_fkey'
      and conrelid = 'public.courses'::regclass
  ) then
    alter table public.courses
      add constraint courses_owner_user_id_fkey
      foreign key (owner_user_id)
      references public.profiles(user_id)
      on delete cascade;
  end if;
end $$;

-- =====================================================
-- Indexes
-- =====================================================

create index if not exists courses_source_idx
  on public.courses using btree (source);

create index if not exists courses_owner_idx
  on public.courses using btree (owner_user_id)
  where owner_user_id is not null;

create index if not exists courses_name_lower_idx
  on public.courses using btree (lower(name) text_pattern_ops);

create index if not exists courses_city_lower_idx
  on public.courses using btree (lower(city) text_pattern_ops)
  where city is not null;

create index if not exists courses_name_trgm_idx
  on public.courses using gin (name public.gin_trgm_ops);

-- =====================================================
-- updated_at trigger
-- =====================================================

drop trigger if exists courses_touch_updated_at on public.courses;
create trigger courses_touch_updated_at
  before update on public.courses
  for each row execute function public.touch_updated_at();

-- =====================================================
-- RLS
-- =====================================================

alter table public.courses enable row level security;

drop policy if exists courses_select       on public.courses;
drop policy if exists courses_modify_own   on public.courses;

create policy courses_select
  on public.courses
  for select
  to authenticated
  using (
    source = 'opengolf'
    or owner_user_id = auth.uid()
  );

-- INSERT / UPDATE / DELETE for the owner's own custom rows only.
-- opengolf rows are written by service-role scripts (which bypass RLS).
create policy courses_modify_own
  on public.courses
  for all
  to authenticated
  using (
    source = 'custom' and owner_user_id = auth.uid()
  )
  with check (
    source = 'custom' and owner_user_id = auth.uid()
  );

-- =====================================================
-- enrich_catalog_course RPC
-- =====================================================
-- Lets the app on-demand enrich a sparsely-populated catalog row
-- with per-hole/tee detail it scrapes/scores after the fact. Wrapped
-- in SECURITY DEFINER + tight argument validation so authenticated
-- users can mutate the global catalog only through this controlled
-- path.

create or replace function public.enrich_catalog_course(
  p_id          text,
  p_holes       jsonb,
  p_tees        jsonb    default '[]'::jsonb,
  p_hole_count  integer  default null,
  p_total_par   integer  default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  hole_count_local int;
  bad_hole         int;
  bad_par          int;
begin
  if auth.uid() is null then
    raise exception 'must be authenticated';
  end if;

  if not exists (
    select 1 from public.courses where id = p_id and source = 'opengolf'
  ) then
    raise exception 'catalog course % not found', p_id;
  end if;

  if jsonb_typeof(p_holes) <> 'array' then
    raise exception 'holes must be a jsonb array';
  end if;
  if jsonb_typeof(p_tees) <> 'array' then
    raise exception 'tees must be a jsonb array';
  end if;

  if jsonb_array_length(p_holes) > 0 then
    hole_count_local := jsonb_array_length(p_holes);
    if hole_count_local > 36 then
      raise exception 'hole count % is implausible', hole_count_local;
    end if;
    select (h->>'number')::int, (h->>'par')::int
      into bad_hole, bad_par
    from jsonb_array_elements(p_holes) h
    where (h->>'number') is null
       or (h->>'par') is null
       or (h->>'par')::int < 1
       or (h->>'par')::int > 7
    limit 1;
    if bad_hole is not null then
      raise exception 'invalid hole entry (number=%, par=%)', bad_hole, bad_par;
    end if;
  end if;

  if p_hole_count is not null and (p_hole_count < 1 or p_hole_count > 36) then
    raise exception 'hole_count % is implausible', p_hole_count;
  end if;
  if p_total_par is not null and (p_total_par < 9 or p_total_par > 200) then
    raise exception 'total_par % is implausible', p_total_par;
  end if;

  -- REPLACE the jsonb fields whenever the payload is non-empty.
  -- Empty payload falls back to the existing value (i.e. preserves
  -- whatever's there rather than zeroing it).
  update public.courses
    set holes            = case
                             when jsonb_array_length(p_holes) > 0 then p_holes
                             else holes
                           end,
        tees             = case
                             when jsonb_array_length(p_tees)  > 0 then p_tees
                             else tees
                           end,
        hole_count       = coalesce(p_hole_count, hole_count),
        total_par        = coalesce(p_total_par,  total_par),
        last_enriched_at = now()
    where id = p_id
      and source = 'opengolf';
end;
$$;

grant execute on function public.enrich_catalog_course(text, jsonb, jsonb, integer, integer)
  to authenticated;

-- =====================================================
-- Realtime publication
-- =====================================================
-- The legacy app added courses to `supabase_realtime`. Keep that
-- behavior for parity (no PowerSync stream — see header comment).
-- Wrapped in exception block so re-runs against prod (where the
-- table is already in the publication) are a no-op.

do $$
begin
  alter publication supabase_realtime add table public.courses;
exception when duplicate_object then
  null;
end $$;
