/**
 * Create / delete user-owned custom courses.
 *
 * A custom course is just a `public.courses` row with `source = 'custom'`
 * and `owner_user_id = auth.uid()`. The existing `courses_modify_own` RLS
 * policy (migration 008) lets the owner insert/delete it, and the SELECT
 * policy scopes it to the owner — so a custom course is private and needs
 * NO new migration. The client reads tee/hole data from the `holes` +
 * `tees` jsonb columns (see `useCourses.ts`), so we write those directly
 * rather than the normalized `course_tee_sets` / `course_tee_holes`
 * tables (which the client doesn't read today).
 *
 * Once created, the course flows through the same paths as a catalog
 * course: `useCoursesSearch` returns it (no `source` filter), `useCourse`
 * skips enrichment for its non-`opengolf:` id, and `startRound` snapshots
 * it into `scorecards.course_snapshot`.
 */

import { supabase } from '@/library/supabase/client';
import type { Course, Hole, Tee } from '@/types/golf';

import { newCustomCourseId, newTeeId } from './ids';
import { mapDbCourseToCourse, SEARCH_FIELDS, type CourseDbRow } from './useCourses';

/** One tee set on the new course. */
export type CustomTeeInput = {
  name: string;
  /** Canonical tee colour token (e.g. 'teeWhite'); optional. */
  colorToken?: string;
  rating?: number;
  slope?: number;
};

/** One hole's data, entered for the (single) tee. */
export type CustomHoleInput = {
  number: number;
  par: number;
  handicapIndex?: number;
  yardage?: number;
};

export type CreateCustomCourseInput = {
  name: string;
  location?: string;
  tee: CustomTeeInput;
  holes: CustomHoleInput[];
};

/**
 * Insert a private custom course owned by `ownerUserId` and return it in
 * the app-level `Course` shape. Throws on validation / RLS / network
 * failure.
 */
export async function createCustomCourse(
  input: CreateCustomCourseInput,
  ownerUserId: string
): Promise<Course> {
  const courseId = newCustomCourseId();
  const teeId = newTeeId();

  const totalYardage = input.holes.reduce((sum, h) => sum + (h.yardage ?? 0), 0);

  const tee: Tee = {
    id: teeId,
    name: input.tee.name.trim(),
    colorToken: input.tee.colorToken,
    rating: input.tee.rating,
    slope: input.tee.slope,
    totalYardage: totalYardage > 0 ? totalYardage : undefined,
  };

  const holes: Hole[] = input.holes.map((h) => ({
    number: h.number,
    par: h.par,
    handicapIndex: h.handicapIndex,
    yardages:
      h.yardage != null && h.yardage > 0 ? { [teeId]: h.yardage } : undefined,
    yardage: h.yardage != null && h.yardage > 0 ? h.yardage : undefined,
  }));

  const totalPar = input.holes.reduce((sum, h) => sum + h.par, 0);

  const row = {
    id: courseId,
    owner_user_id: ownerUserId,
    source: 'custom',
    name: input.name.trim(),
    city: input.location?.trim() ? input.location.trim() : null,
    hole_count: input.holes.length,
    total_par: totalPar > 0 ? totalPar : null,
    total_yardage: totalYardage > 0 ? totalYardage : null,
    holes,
    tees: [tee],
  };

  const { data, error } = await supabase
    .from('courses')
    .insert(row)
    .select(SEARCH_FIELDS)
    .single();

  if (error) throw new Error(error.message);
  return mapDbCourseToCourse(data as CourseDbRow);
}

/** Delete a custom course the signed-in user owns (RLS enforces ownership). */
export async function deleteCustomCourse(id: string): Promise<void> {
  const { error } = await supabase.from('courses').delete().eq('id', id);
  if (error) throw new Error(error.message);
}
