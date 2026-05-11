-- =============================================================================
-- Migration 010: enrich_catalog_course also writes hole_count + total_par
-- =============================================================================
-- Apply via Dashboard -> SQL Editor -> paste -> Run.
--
-- Background:
--   The bulk-import populated `hole_count` and `total_par` from the
--   OpenGolfAPI CSV's `holes` and `par` columns. Both are derived
--   upstream from the same broken scorecard pipeline that mis-counts
--   per-hole entries. So a course like "Holmes Harbor" (real 18) was
--   ingested as hole_count=13, total_par=64-but-only-13-pars-filled.
--
--   Now that the client enriches a course's `holes` jsonb via the API
--   on first use, we can simultaneously correct the hole_count +
--   total_par. This migration extends the RPC's signature to accept
--   them and overwrite the bulk values (which are demonstrably wrong).
--
--   The previous 3-arg overload is dropped so all clients hit the new
--   5-arg version.
-- =============================================================================

drop function if exists public.enrich_catalog_course(text, jsonb, jsonb);

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

  -- Fill empty jsonb fields only. For hole_count + total_par we DO let
  -- enrichment overwrite the bulk-imported values: the bulk pipeline's
  -- numbers are derived from the same broken scorecard data, so any
  -- API-sourced value is strictly more trustworthy.
  update public.courses
    set holes      = coalesce(nullif(holes, '[]'::jsonb), p_holes),
        tees       = coalesce(nullif(tees,  '[]'::jsonb), p_tees),
        hole_count = coalesce(p_hole_count, hole_count),
        total_par  = coalesce(p_total_par,  total_par)
    where id = p_id
      and source = 'opengolf';
end;
$$;

revoke all on function public.enrich_catalog_course(text, jsonb, jsonb, int, int) from public;
grant execute on function public.enrich_catalog_course(text, jsonb, jsonb, int, int) to authenticated;
