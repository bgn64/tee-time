-- Five completed rounds exercise ordering, per-course deduplication, and the
-- three-row recent-course limit. The signed-in scorer is present in every row.

with round_fixtures(id, course_id, started_at, completed_at, relative_score) as (
  values
    ('local-round-fraserview-latest', 'opengolf:local-fraserview', '2026-09-08 14:00:00+00'::timestamptz, '2026-09-08 18:00:00+00'::timestamptz,  4),
    ('local-round-university',        'opengolf:local-university', '2026-09-07 13:00:00+00'::timestamptz, '2026-09-07 17:00:00+00'::timestamptz,  0),
    ('local-round-northlands',        'opengolf:local-northlands', '2026-09-06 12:00:00+00'::timestamptz, '2026-09-06 16:00:00+00'::timestamptz, -2),
    ('local-round-fraserview-older',  'opengolf:local-fraserview', '2026-09-05 14:00:00+00'::timestamptz, '2026-09-05 18:00:00+00'::timestamptz,  9),
    ('local-round-langara',           'opengolf:local-langara',    '2026-09-04 13:00:00+00'::timestamptz, '2026-09-04 17:00:00+00'::timestamptz,  6)
)
insert into public.scorecards (
  id,
  owner_user_id,
  course_id,
  course_snapshot,
  scoring_rule,
  hole_range,
  player_ids,
  participants,
  teams,
  enabled_stat_keys,
  tracked_scorer_ids,
  custom_stat_definitions,
  started_at,
  completed_at,
  created_at,
  updated_at
)
select
  fixture.id,
  '11111111-1111-4111-8111-111111111111',
  fixture.course_id,
  jsonb_build_object(
    'id', course.id,
    'name', course.name,
    'location', concat_ws(', ', course.city, course.state),
    'holes', course.holes,
    'tees', course.tees
  ),
  'stroke',
  'all',
  jsonb_build_array('user:11111111-1111-4111-8111-111111111111'),
  jsonb_build_array(
    jsonb_build_object(
      'participantKey', 'user:11111111-1111-4111-8111-111111111111',
      'teeId', 'blue'
    )
  ),
  '[]'::jsonb,
  '[]'::jsonb,
  '[]'::jsonb,
  '[]'::jsonb,
  fixture.started_at,
  fixture.completed_at,
  fixture.started_at,
  fixture.completed_at
from round_fixtures fixture
join public.courses course on course.id = fixture.course_id
on conflict (id) do update set
  course_id = excluded.course_id,
  course_snapshot = excluded.course_snapshot,
  player_ids = excluded.player_ids,
  participants = excluded.participants,
  started_at = excluded.started_at,
  completed_at = excluded.completed_at,
  updated_at = excluded.updated_at;

with round_fixtures(id, relative_score) as (
  values
    ('local-round-fraserview-latest',  4),
    ('local-round-university',         0),
    ('local-round-northlands',        -2),
    ('local-round-fraserview-older',   9),
    ('local-round-langara',            6)
),
score_rows as (
  select
    fixture.id as scorecard_id,
    fixture.relative_score,
    (hole->>'number')::integer as hole_number,
    (hole->>'par')::integer as par
  from round_fixtures fixture
  join public.scorecards scorecard on scorecard.id = fixture.id
  cross join lateral jsonb_array_elements(scorecard.course_snapshot->'holes') as hole
)
insert into public.scorecard_scores (
  id,
  scorecard_id,
  scorer_id,
  hole_number,
  strokes
)
select
  scorecard_id || '-h' || lpad(hole_number::text, 2, '0'),
  scorecard_id,
  'user:11111111-1111-4111-8111-111111111111',
  hole_number,
  par + case
    when relative_score > 0 and hole_number <= relative_score then 1
    when relative_score < 0 and hole_number <= abs(relative_score) then -1
    else 0
  end
from score_rows
on conflict (scorecard_id, scorer_id, hole_number) do update set
  strokes = excluded.strokes,
  updated_at = now();