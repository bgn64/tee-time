-- =============================================================================
-- Migration 012: persist last_enriched_at on catalog courses
-- =============================================================================
-- Apply via Dashboard -> SQL Editor -> paste -> Run.
--
-- Background:
--   When a client fetches a catalog course's tees + holes from the
--   upstream OpenGolfAPI and writes them back via enrich_catalog_course,
--   we want every device thereafter to know "the fetch has been
--   attempted" so they don't repeat the upstream call (rate-limit budget
--   matters on the public API).
--
--   Today only the first device tracks `lastEnrichedAt` locally. Other
--   devices that pull the same catalog row see the populated holes but,
--   if the upstream had no tee data, an empty `tees` array — and that's
--   indistinguishable from "we haven't tried yet." They re-fetch
--   needlessly.
--
--   This migration adds a `last_enriched_at` column to public.courses
--   and updates the RPC to stamp it on every call. The client mapper
--   then reads it into `Course.lastEnrichedAt`, and the
--   ensureCourseScorecard guard short-circuits cleanly across all
--   devices.
-- =============================================================================

alter table public.courses
  add column if not exists last_enriched_at timestamptz;

-- Drop the previous 5-arg signature so all clients land on the
-- timestamp-stamping version.
drop function if exists public.enrich_catalog_course(text, jsonb, jsonb, int, int);

create or replace function public.enrich_catalog_course(
  p_id          text,
  p_holes       jsonb,
  p_tees        jsonb default '[]'::jsonb,
  p_hole_count  int   default null,
  p_total_par   int   default null
)
returns void
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

  -- Fill empty jsonb fields only (same fill-once semantics as 010).
  -- Stamp last_enriched_at on EVERY call so any caller can later see
  -- "we've tried this course" even when the upstream returned empty
  -- tees / empty holes.
  update public.courses
    set holes            = coalesce(nullif(holes, '[]'::jsonb), p_holes),
        tees             = coalesce(nullif(tees,  '[]'::jsonb), p_tees),
        hole_count       = coalesce(p_hole_count, hole_count),
        total_par        = coalesce(p_total_par,  total_par),
        last_enriched_at = now()
    where id = p_id
      and source = 'opengolf';
end;
$$;

revoke all on function public.enrich_catalog_course(text, jsonb, jsonb, int, int) from public;
grant execute on function public.enrich_catalog_course(text, jsonb, jsonb, int, int) to authenticated;
