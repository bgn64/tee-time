-- Migration 019 — feed read RPC.
--
-- Adds a single server-side read endpoint for the Feed tab so the app can
-- replace the PowerSync local-SQLite projection with one Supabase RPC call.
--
-- Visibility intentionally mirrors the current local feed:
--   * friends' live + completed scorecards
--   * the caller's own completed scorecards
--   * NOT the caller's own in-progress scorecard (the Score tab owns that)
--
-- The function is SECURITY INVOKER so the SELECT policies from migrations
-- 003 + 005 continue to apply. The WHERE clause repeats the feed-specific
-- self-or-friend shape as defense in depth and to preserve the "own completed
-- only" rule, which is narrower than scorecards' RLS.

create or replace function public.get_feed(
  p_limit int default 20,
  p_before timestamptz default null
)
returns table (
  id text,
  owner_user_id uuid,
  course_id text,
  course_snapshot jsonb,
  scoring_rule text,
  hole_range text,
  player_ids jsonb,
  participants jsonb,
  teams jsonb,
  enabled_stat_keys jsonb,
  tracked_scorer_ids jsonb,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz,
  feed_bucket text,
  feed_sort_at timestamptz,
  is_own_round boolean,
  owner_handle text,
  owner_display_name text,
  owner_avatar_color text,
  scores jsonb
)
language sql
stable
security invoker
set search_path = public
as $$
  with me as (
    select auth.uid() as user_id
  ),
  visible_scorecards as (
    select
      sc.id,
      sc.owner_user_id,
      sc.course_id,
      sc.course_snapshot,
      sc.scoring_rule,
      sc.hole_range,
      sc.player_ids,
      sc.participants,
      sc.teams,
      sc.enabled_stat_keys,
      sc.tracked_scorer_ids,
      sc.started_at,
      sc.completed_at,
      sc.created_at,
      sc.updated_at,
      case
        when sc.completed_at is null then 'live'
        else 'completed'
      end as feed_bucket,
      case
        when sc.completed_at is null then coalesce(sc.updated_at, sc.started_at)
        else sc.completed_at
      end as feed_sort_at,
      (sc.owner_user_id = me.user_id) as is_own_round,
      pr.handle as owner_handle,
      pr.display_name as owner_display_name,
      pr.avatar_color as owner_avatar_color
    from public.scorecards sc
    join me on me.user_id is not null
    join public.profiles pr on pr.user_id = sc.owner_user_id
    where (
      sc.owner_user_id = me.user_id
      and sc.completed_at is not null
    )
    or exists (
      select 1
      from public.friendships f
      where f.user_id = me.user_id
        and f.friend_user_id = sc.owner_user_id
    )
  ),
  page as (
    select *
    from visible_scorecards
    where p_before is null
       or feed_sort_at < p_before
    order by feed_sort_at desc, id desc
    limit least(greatest(coalesce(p_limit, 20), 1), 100)
  )
  select
    page.id,
    page.owner_user_id,
    page.course_id,
    page.course_snapshot,
    page.scoring_rule,
    page.hole_range,
    page.player_ids,
    page.participants,
    page.teams,
    page.enabled_stat_keys,
    page.tracked_scorer_ids,
    page.started_at,
    page.completed_at,
    page.created_at,
    page.updated_at,
    page.feed_bucket,
    page.feed_sort_at,
    page.is_own_round,
    page.owner_handle,
    page.owner_display_name,
    page.owner_avatar_color,
    coalesce(score_rows.scores, '[]'::jsonb) as scores
  from page
  left join lateral (
    select jsonb_agg(
      jsonb_build_object(
        'scorer_id', ss.scorer_id,
        'hole_number', ss.hole_number,
        'strokes', ss.strokes
      )
      order by ss.hole_number, ss.scorer_id
    ) as scores
    from public.scorecard_scores ss
    where ss.scorecard_id = page.id
  ) score_rows on true
  order by page.feed_sort_at desc, page.id desc
$$;

revoke all on function public.get_feed(int, timestamptz) from public;
grant execute on function public.get_feed(int, timestamptz) to authenticated;
