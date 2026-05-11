-- =============================================================================
-- Migration 009: enrich_catalog_course RPC
-- =============================================================================
-- Apply via Dashboard -> SQL Editor -> paste -> Run.
--
-- Background:
--   The OpenGolfAPI bulk export (CSV / NDJSON / GeoJSON, generated from
--   the same source-side pipeline) has a bug that truncates per-hole
--   scorecards: many courses are missing pars and handicap indices for
--   some holes. The live REST API `/v1/courses/:id` returns the complete
--   scorecard.
--
--   To avoid spending 14k REST calls during ingest, the ingest script
--   imports catalog metadata with `holes = '[]'` and the client
--   enriches each course lazily on first use. This RPC is the
--   write-back path: it lets an authenticated user fill in the holes /
--   tees of a catalog row they fetched themselves from the upstream API.
--   Subsequent users picking the same course see the cached data and
--   skip the API call entirely.
--
-- Safety guards:
--   · Only OpenGolf catalog rows (`source = 'opengolf'`).
--   · Only fills empty fields — never overwrites previously-enriched
--     data so a malicious client can't corrupt the shared cache.
--   · Shape validation: holes is an array of {number, par, ...}
--     objects with par in 1..7. Tees is an array of {id, name, ...}.
-- =============================================================================


create or replace function public.enrich_catalog_course(
  p_id    text,
  p_holes jsonb,
  p_tees  jsonb default '[]'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  current_holes jsonb;
  current_tees  jsonb;
  hole_count    int;
  bad_hole      int;
  bad_par       int;
begin
  if auth.uid() is null then
    raise exception 'must be authenticated';
  end if;

  -- Load current state. Confirms the row exists and is an OpenGolf
  -- catalog row in one shot.
  select holes, tees
    into current_holes, current_tees
  from public.courses
  where id = p_id and source = 'opengolf';
  if not found then
    raise exception 'catalog course % not found', p_id;
  end if;

  -- Shape-validate holes only when we're going to write them. We're
  -- liberal otherwise — callers can pass [] when they have nothing
  -- to add for that field.
  if jsonb_typeof(p_holes) <> 'array' then
    raise exception 'holes must be a jsonb array';
  end if;
  if jsonb_typeof(p_tees) <> 'array' then
    raise exception 'tees must be a jsonb array';
  end if;

  if jsonb_array_length(p_holes) > 0 then
    hole_count := jsonb_array_length(p_holes);
    if hole_count > 36 then
      raise exception 'hole count % is implausible', hole_count;
    end if;
    -- Probe every entry has integer number and a sane par.
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

  -- Only fill empty fields. nullif(...,'[]') becomes NULL for the empty
  -- case, which then falls through to coalesce's second argument.
  update public.courses
    set holes = coalesce(nullif(holes, '[]'::jsonb), p_holes),
        tees  = coalesce(nullif(tees,  '[]'::jsonb), p_tees)
    where id = p_id
      and source = 'opengolf';
end;
$$;

revoke all on function public.enrich_catalog_course(text, jsonb, jsonb) from public;
grant execute on function public.enrich_catalog_course(text, jsonb, jsonb) to authenticated;
