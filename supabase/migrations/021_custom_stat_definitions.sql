-- Migration 021 — reusable custom stat definitions.
--
-- User-created stat definitions are owner-scoped and reusable across rounds.
-- The first UI only creates binary (yes/no) definitions, while value_type is
-- deliberately extensible so integer definitions can be enabled later.
--
-- Selected custom definitions are also snapshotted onto scorecards. The
-- snapshot keeps historical labels stable and lets friends render a visible
-- round without receiving access to the owner's private definition library.
-- Per-hole values continue to live in scorecard_hole_details.details; no
-- storage change is needed because that JSONB object already accepts arbitrary
-- boolean and numeric stat keys.

create table if not exists public.custom_stat_definitions (
  id text primary key,
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  label text not null check (
    length(trim(label)) between 1 and 40
  ),
  value_type text not null check (
    value_type in ('binary', 'integer')
  ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists custom_stat_definitions_owner_idx
  on public.custom_stat_definitions(owner_user_id);

create unique index if not exists custom_stat_definitions_owner_label_active_idx
  on public.custom_stat_definitions(owner_user_id, lower(trim(label)))
  where deleted_at is null;

drop trigger if exists custom_stat_definitions_touch_trg
  on public.custom_stat_definitions;

create trigger custom_stat_definitions_touch_trg
  before update on public.custom_stat_definitions
  for each row execute function public.touch_updated_at();

alter table public.custom_stat_definitions enable row level security;

drop policy if exists custom_stat_definitions_select
  on public.custom_stat_definitions;
drop policy if exists custom_stat_definitions_insert
  on public.custom_stat_definitions;
drop policy if exists custom_stat_definitions_update
  on public.custom_stat_definitions;
drop policy if exists custom_stat_definitions_delete
  on public.custom_stat_definitions;

create policy custom_stat_definitions_select
  on public.custom_stat_definitions
  for select to authenticated
  using (owner_user_id = auth.uid());

create policy custom_stat_definitions_insert
  on public.custom_stat_definitions
  for insert to authenticated
  with check (owner_user_id = auth.uid());

create policy custom_stat_definitions_update
  on public.custom_stat_definitions
  for update to authenticated
  using (owner_user_id = auth.uid())
  with check (owner_user_id = auth.uid());

create policy custom_stat_definitions_delete
  on public.custom_stat_definitions
  for delete to authenticated
  using (owner_user_id = auth.uid());

alter table public.scorecards
  add column if not exists custom_stat_definitions jsonb
  not null default '[]'::jsonb;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'scorecards_custom_stat_definitions_is_array'
  ) then
    alter table public.scorecards
      add constraint scorecards_custom_stat_definitions_is_array
      check (jsonb_typeof(custom_stat_definitions) = 'array');
  end if;
end$$;

-- Per-hole stat values follow the same visibility contract as scorecards and
-- score rows: friends may read them, while only the owner may mutate them.
drop policy if exists "hole details in owned scorecards"
  on public.scorecard_hole_details;
drop policy if exists "scorecard_hole_details select self or friend"
  on public.scorecard_hole_details;
drop policy if exists "scorecard_hole_details insert own"
  on public.scorecard_hole_details;
drop policy if exists "scorecard_hole_details update own"
  on public.scorecard_hole_details;
drop policy if exists "scorecard_hole_details delete own"
  on public.scorecard_hole_details;

create policy "scorecard_hole_details select self or friend"
  on public.scorecard_hole_details
  for select using (
    auth.uid() = owner_user_id
    or public.is_friend_of(owner_user_id)
  );

create policy "scorecard_hole_details insert own"
  on public.scorecard_hole_details
  for insert with check (auth.uid() = owner_user_id);

create policy "scorecard_hole_details update own"
  on public.scorecard_hole_details
  for update using (auth.uid() = owner_user_id)
  with check (auth.uid() = owner_user_id);

create policy "scorecard_hole_details delete own"
  on public.scorecard_hole_details
  for delete using (auth.uid() = owner_user_id);

-- The result shape changes, so PostgreSQL requires dropping the old function
-- before recreating it with the snapshot column.
drop function if exists public.get_feed(int, timestamptz);

create function public.get_feed(
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
  custom_stat_definitions jsonb,
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
      sc.custom_stat_definitions,
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
    page.custom_stat_definitions,
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
