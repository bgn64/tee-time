-- Fully enriched local catalog rows. They are playable without calling the
-- external OpenGolfAPI enrichment service.

with hole_layout(number, par, handicap_index, blue_yards) as (
  values
    (1,  4,  7, 410),
    (2,  4, 11, 385),
    (3,  3, 17, 175),
    (4,  5,  1, 535),
    (5,  4,  9, 400),
    (6,  3, 15, 185),
    (7,  5,  3, 550),
    (8,  4, 13, 370),
    (9,  4,  5, 425),
    (10, 4,  8, 405),
    (11, 4, 12, 380),
    (12, 3, 18, 165),
    (13, 5,  2, 545),
    (14, 4, 10, 395),
    (15, 3, 16, 180),
    (16, 5,  4, 560),
    (17, 4, 14, 375),
    (18, 4,  6, 430)
),
course_fixtures(id, name, city, state, yardage_adjust, slope, rating) as (
  values
    ('opengolf:local-fraserview', 'Fraserview Golf Course', 'Vancouver', 'BC',  0, 126, 71.8),
    ('opengolf:local-university', 'University Golf Club', 'Vancouver', 'BC',   15, 128, 72.1),
    ('opengolf:local-northlands', 'Northlands Golf Course', 'North Vancouver', 'BC', -10, 130, 72.4),
    ('opengolf:local-langara', 'Langara Golf Course', 'Vancouver', 'BC',      -20, 121, 70.9)
)
insert into public.courses (
  id,
  owner_user_id,
  source,
  name,
  city,
  state,
  country,
  course_type,
  hole_count,
  total_par,
  total_yardage,
  holes,
  tees,
  source_external_id,
  source_updated_at,
  last_enriched_at
)
select
  fixture.id,
  null,
  'opengolf',
  fixture.name,
  fixture.city,
  fixture.state,
  'Canada',
  'Public',
  18,
  72,
  (select sum(hole.blue_yards + fixture.yardage_adjust) from hole_layout hole),
  (
    select jsonb_agg(
      jsonb_build_object(
        'number', hole.number,
        'par', hole.par,
        'handicapIndex', hole.handicap_index,
        'yardages', jsonb_build_object('blue', hole.blue_yards + fixture.yardage_adjust)
      )
      order by hole.number
    )
    from hole_layout hole
  ),
  jsonb_build_array(
    jsonb_build_object(
      'id', 'blue',
      'name', 'Blue',
      'color', '#286b9f',
      'slope', fixture.slope,
      'rating', fixture.rating,
      'totalYardage', (
        select sum(hole.blue_yards + fixture.yardage_adjust) from hole_layout hole
      )
    )
  ),
  replace(fixture.id, 'opengolf:', ''),
  now(),
  now()
from course_fixtures fixture
on conflict (id) do update set
  name = excluded.name,
  city = excluded.city,
  state = excluded.state,
  country = excluded.country,
  course_type = excluded.course_type,
  hole_count = excluded.hole_count,
  total_par = excluded.total_par,
  total_yardage = excluded.total_yardage,
  holes = excluded.holes,
  tees = excluded.tees,
  source_updated_at = excluded.source_updated_at,
  last_enriched_at = excluded.last_enriched_at;