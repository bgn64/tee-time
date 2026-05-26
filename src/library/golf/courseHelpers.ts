/**
 * Course / tee / yardage lookup helpers.
 *
 * Once a round exists, ALL course data reads go through the round's
 * captured `course_snapshot` (i.e. `round.course`) — never through
 * `data/courses.ts` directly. The seed module is only consulted on
 * the setup screens, where the user is choosing which course to
 * round-start with.
 */

import type { Course, Hole, HoleRange, Tee } from '@/types/golf';
import { holesInRange } from './scoring';

/** First tee on a course, or undefined if none defined. */
export function defaultTeeForCourse(course: Course): Tee | undefined {
  return course.tees?.[0];
}

/** Returns the tee that should be picked for a fresh participant. */
export function defaultTeeIdForCourse(course: Course): string | undefined {
  return defaultTeeForCourse(course)?.id;
}

/** Look up a hole by its 1-based number on a course. */
export function findHole(course: Course, holeNumber: number): Hole | undefined {
  return course.holes.find((h) => h.number === holeNumber);
}

/**
 * Pick the yardage value to display for a hole. Prefer the per-tee
 * yardage when both a `teeId` and a populated `Hole.yardages` map are
 * available; fall back to the single-tee `Hole.yardage`.
 */
export function yardageForHole(
  course: Course,
  holeNumber: number,
  teeId?: string
): number | undefined {
  const hole = findHole(course, holeNumber);
  if (!hole) return undefined;
  if (teeId && hole.yardages && hole.yardages[teeId] != null) {
    return hole.yardages[teeId];
  }
  return hole.yardage;
}

/** Sum of `par` over the active hole range. */
export function parForHoleRange(course: Course, range: HoleRange): number {
  return holesInRange(course.holes, range).reduce((sum, h) => sum + h.par, 0);
}

/** Sum of yardages for a tee over the active hole range. */
export function yardageForHoleRange(
  course: Course,
  range: HoleRange,
  teeId?: string
): number {
  return holesInRange(course.holes, range).reduce((sum, h) => {
    const y = teeId && h.yardages ? h.yardages[teeId] : h.yardage;
    return sum + (y ?? 0);
  }, 0);
}

/** Look up a tee by id on a course (case-sensitive). */
export function findTee(course: Course, teeId?: string): Tee | undefined {
  if (!teeId) return undefined;
  return course.tees?.find((t) => t.id === teeId);
}
