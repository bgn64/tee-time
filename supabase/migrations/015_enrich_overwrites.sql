-- =============================================================================
-- Migration 015: enrich_catalog_course overwrites instead of fill-once
-- =============================================================================
-- Apply via Dashboard -> SQL Editor -> paste -> Run.
--
-- Background:
--   Migration 010 introduced enrich_catalog_course with fill-once semantics
--   on the `holes` and `tees` jsonb columns:
--
--     holes = coalesce(nullif(holes, '[]'::jsonb), p_holes),
--     tees  = coalesce(nullif(tees,  '[]'::jsonb), p_tees),
--
--   The intent was conservative: first client to enrich wins, don't let a
--   buggy client clobber good data. But this prevents legitimate upgrades.
--   Specifically, the bulk import (migration 008) populated `holes` with
--   skinny entries — `{ number, par, handicapIndex }` — but no per-hole
--   `yardages` object. When a client subsequently fetched
--   /v1/courses/:id/holes (which carries the per-hole yardages keyed by
--   lowercased tee_name), the RPC kept the old skinny array and threw the
--   new one away. The course appeared "enriched" (last_enriched_at
--   stamped) but the scorecard's tee-yardage rows had nothing to render.
--
--   This migration changes the semantics: whenever the caller supplies a
--   non-empty p_holes or p_tees, replace the existing column. We trust
--   the upstream OpenGolfAPI as authoritative and the buildHoles helper
--   on the client to validate shape before sending. The fill-once
--   safeguard is replaced by validation already in this function (par
--   range check, hole-count cap).
--
-- Data fix: reset last_enriched_at to NULL on every opengolf row that
-- has tees defined but no per-hole yardages on any hole. Those rows are
-- the ones that were enriched under the old fill-once semantics and
-- never picked up per-hole yardages. Setting last_enriched_at to NULL
-- causes ensureCourseScorecard to re-fetch on next selection (the
-- guard is `hasHoles && (hasTees || alreadyTried)` — alreadyTried
-- becomes false when last_enriched_at is null).
-- =============================================================================


-- Drop the previous version so all clients land on the replace-semantics one.
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

  -- v015 semantics: REPLACE the jsonb fields whenever the payload is
  -- non-empty. Drops the fill-once safeguard introduced in 010 — that
  -- behavior locked stale skinny holes in place on any course that was
  -- bulk-imported before per-hole yardages flowed through. Empty
  -- payload still falls back to the existing value (i.e. preserves
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

revoke all on function public.enrich_catalog_course(text, jsonb, jsonb, int, int) from public;
grant execute on function public.enrich_catalog_course(text, jsonb, jsonb, int, int) to authenticated;


-- One-time data fix: clear last_enriched_at on every opengolf row where
-- tees are present but no hole carries a yardages object. Those rows
-- went through the old fill-once RPC and got their per-hole yardages
-- silently dropped. Resetting the timestamp causes the client guard to
-- re-fetch on next selection; the new RPC semantics above will then
-- persist the per-hole data.
update public.courses
set last_enriched_at = null
where source = 'opengolf'
  and jsonb_array_length(tees) > 0
  and not exists (
    select 1
    from jsonb_array_elements(holes) h
    where h ? 'yardages'
      and jsonb_typeof(h->'yardages') = 'object'
      and (select count(*) from jsonb_object_keys(h->'yardages')) > 0
  );
