/**
 * Course seed data.
 *
 * Empty since the v7 catalog import — courses now flow from the cloud
 * `courses` table (catalog rows ingested from OpenGolfAPI plus user-owned
 * customs). The local seed is kept as an empty array so that pre-cloud-
 * hydration renders show a clean state with no fake placeholder courses.
 *
 * Anonymous (signed-out) sessions therefore see an empty course list and
 * must sign in to access the catalog.
 */

import { Course } from '@/types/golf';

export const recentCourses: Course[] = [];
