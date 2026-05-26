/**
 * Seed courses for the prototype.
 *
 * Two compact 18-hole layouts shipped in source so the Score tab has
 * something to pick from before we add a course catalog. Each course
 * carries 2-3 tee boxes with per-hole yardages keyed by tee id; the
 * ReadOnlyScorecard renders one yardage row per tee in play (longest
 * first).
 *
 * Course `id`s are stable string literals (NOT uuids) because they're
 * referenced by `Round.course.id` and the cloud `scorecards.course_id`
 * column. Seed data is local-only — the cloud `course_snapshot` jsonb
 * column on `scorecards` holds the captured-at-startRound copy so
 * scoring is unaffected by future seed edits.
 */

import type { Course, Hole } from '@/types/golf';

type SeedHole = {
  number: number;
  par: number;
  yardages: Record<string, number>;
};

function buildHoles(rows: SeedHole[]): Hole[] {
  return rows.map((h) => {
    const longest = Math.max(...Object.values(h.yardages));
    return {
      number: h.number,
      par: h.par,
      yardages: h.yardages,
      yardage: longest,
    };
  });
}

export const SEED_COURSES: Course[] = [
  {
    id: 'course-pine-ridge',
    name: 'Pine Ridge Golf Club',
    location: 'Bellingham, WA',
    tees: [
      { id: 'blue', name: 'Blue', color: 'blue', slope: 128, rating: 71.4, totalYardage: 6534 },
      { id: 'white', name: 'White', color: 'white', slope: 122, rating: 69.2, totalYardage: 6082 },
      { id: 'red', name: 'Red', color: 'red', slope: 117, rating: 66.8, totalYardage: 5340 },
    ],
    holes: buildHoles([
      { number: 1,  par: 4, yardages: { blue: 402, white: 378, red: 332 } },
      { number: 2,  par: 5, yardages: { blue: 528, white: 498, red: 442 } },
      { number: 3,  par: 3, yardages: { blue: 182, white: 162, red: 138 } },
      { number: 4,  par: 4, yardages: { blue: 388, white: 360, red: 308 } },
      { number: 5,  par: 4, yardages: { blue: 422, white: 396, red: 348 } },
      { number: 6,  par: 3, yardages: { blue: 162, white: 148, red: 118 } },
      { number: 7,  par: 5, yardages: { blue: 552, white: 512, red: 458 } },
      { number: 8,  par: 4, yardages: { blue: 398, white: 372, red: 322 } },
      { number: 9,  par: 4, yardages: { blue: 412, white: 384, red: 336 } },
      { number: 10, par: 4, yardages: { blue: 376, white: 352, red: 308 } },
      { number: 11, par: 5, yardages: { blue: 540, white: 506, red: 446 } },
      { number: 12, par: 3, yardages: { blue: 198, white: 172, red: 142 } },
      { number: 13, par: 4, yardages: { blue: 408, white: 382, red: 332 } },
      { number: 14, par: 4, yardages: { blue: 432, white: 402, red: 356 } },
      { number: 15, par: 3, yardages: { blue: 152, white: 138, red: 116 } },
      { number: 16, par: 5, yardages: { blue: 542, white: 510, red: 452 } },
      { number: 17, par: 4, yardages: { blue: 418, white: 388, red: 338 } },
      { number: 18, par: 4, yardages: { blue: 422, white: 392, red: 348 } },
    ]),
  },
  {
    id: 'course-harbor-links',
    name: 'Harbor Links Public',
    location: 'Tacoma, WA',
    tees: [
      { id: 'black', name: 'Black', color: 'black', slope: 132, rating: 72.1, totalYardage: 6712 },
      { id: 'white', name: 'White', color: 'white', slope: 124, rating: 70.0, totalYardage: 6280 },
    ],
    holes: buildHoles([
      { number: 1,  par: 4, yardages: { black: 412, white: 388 } },
      { number: 2,  par: 4, yardages: { black: 432, white: 402 } },
      { number: 3,  par: 5, yardages: { black: 562, white: 528 } },
      { number: 4,  par: 3, yardages: { black: 192, white: 168 } },
      { number: 5,  par: 4, yardages: { black: 406, white: 378 } },
      { number: 6,  par: 4, yardages: { black: 388, white: 362 } },
      { number: 7,  par: 5, yardages: { black: 548, white: 512 } },
      { number: 8,  par: 3, yardages: { black: 178, white: 152 } },
      { number: 9,  par: 4, yardages: { black: 422, white: 392 } },
      { number: 10, par: 4, yardages: { black: 398, white: 372 } },
      { number: 11, par: 3, yardages: { black: 168, white: 148 } },
      { number: 12, par: 5, yardages: { black: 572, white: 538 } },
      { number: 13, par: 4, yardages: { black: 432, white: 402 } },
      { number: 14, par: 4, yardages: { black: 416, white: 388 } },
      { number: 15, par: 3, yardages: { black: 208, white: 182 } },
      { number: 16, par: 5, yardages: { black: 528, white: 498 } },
      { number: 17, par: 4, yardages: { black: 418, white: 388 } },
      { number: 18, par: 4, yardages: { black: 434, white: 402 } },
    ]),
  },
];

export function findSeedCourse(id: string): Course | undefined {
  return SEED_COURSES.find((c) => c.id === id);
}
