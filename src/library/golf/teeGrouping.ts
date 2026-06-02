/**
 * Tee grouping + per-hole stats — pure helpers shared by the
 * horizontal scorecard and any future per-tee aggregate.
 *
 * `getHoleStats(tee, holeNumber, fallback)` resolves the
 * (par, handicapIndex, yardage) tuple for a single (tee, hole) cell
 * with the legacy fallback in place: if the tee carries no
 * per-hole row (or no row for this specific hole), we fall back to
 * the scalar `Hole.par` / `Hole.handicapIndex` / per-tee yardage map
 * on the course-level `Hole`. This keeps in-flight rounds (whose
 * `course_snapshot` predates the per-tee schema) rendering correctly.
 *
 * `groupTeesByParHcp(tees, holesInRange)` collapses runs of adjacent
 * tees that share par + handicapIndex across every in-range hole.
 * The grouping is contiguous (not set-based) so the visual rhythm
 * matches the mockup: per-group yardage rows stack first, then a
 * shared par row, then a shared hcp row, then the scorer rows for
 * that group. Cells that diverge from the prior group are flagged
 * so the renderer can tint them in the accent colour.
 */

import type { CourseTeeHole, Hole, Tee } from '@/types/golf';

export type HoleStats = {
  holeNumber: number;
  par: number;
  /** Handicap index for the hole (stroke-index), when known. */
  handicapIndex?: number;
  /** Per-tee yardage, when known. Undefined for unknown / no-data tees. */
  yardage?: number;
};

export type TeeGroupHoleStats = HoleStats & {
  /** True when this hole's par differs from the prior group's par. */
  parDivergent: boolean;
  /** True when this hole's hcp differs from the prior group's hcp. */
  hcpDivergent: boolean;
};

export type TeeGroup = {
  /** Stable composite key derived from the par+hcp signature. */
  key: string;
  /** Tees in the group, in input order. All share par+hcp across in-range holes. */
  tees: Tee[];
  /** Shared per-hole stats for the group (par, hcp, divergence flags). */
  holes: TeeGroupHoleStats[];
};

/**
 * Resolve par / handicap / yardage for a single (tee, hole) cell.
 *
 * Lookup precedence (per Phase 2 spec):
 *   1. `tee.holes[*].par` / `.handicapIndex` / `.yardage` for the
 *      matching `holeNumber` — wins when present.
 *   2. `fallback.par` (always present), `fallback.handicapIndex`
 *      (optional), and `fallback.yardages?.[tee.id]` ?? `fallback.yardage`
 *      for missing per-tee values.
 *
 * The function is pure and total: it always returns a numeric `par`
 * (falling back to `fallback.par`). Missing handicap / yardage are
 * left undefined so the renderer can decide whether to render a "—"
 * placeholder or hide the row.
 */
export function getHoleStats(
  tee: Tee,
  holeNumber: number,
  fallback: Hole
): HoleStats {
  const perTee: CourseTeeHole | undefined = tee.holes?.find(
    (h) => h.holeNumber === holeNumber
  );

  const par = perTee?.par ?? fallback.par;
  const handicapIndex = perTee?.handicapIndex ?? fallback.handicapIndex;
  const yardage =
    perTee?.yardage ?? fallback.yardages?.[tee.id] ?? fallback.yardage;

  return {
    holeNumber,
    par,
    handicapIndex,
    yardage,
  };
}

/**
 * Build a signature for a tee's (par, hcp) sequence across the
 * in-range holes. Two tees with matching signatures share a group.
 * The signature is a delimited string for cheap string-equality
 * comparison (faster + simpler than tuple-array comparison).
 */
function teeParHcpSignature(
  tee: Tee,
  holesInRange: readonly Hole[]
): string {
  const parts: string[] = [];
  for (const hole of holesInRange) {
    const stats = getHoleStats(tee, hole.number, hole);
    // Use ',' as the field separator and ';' between holes. Undefined
    // hcp is serialised as '_' so two tees with the same par sequence
    // but different "hcp known vs unknown" patterns don't merge.
    parts.push(`${stats.par},${stats.handicapIndex ?? '_'}`);
  }
  return parts.join(';');
}

/**
 * Group adjacent tees by matching par+hcp across the in-range holes.
 * Mirrors the mockup section 3 layout — the per-group renderer can
 * walk this list and emit yardage rows + a shared par row + a shared
 * hcp row + the scorer rows for that group.
 *
 * **Adjacency, not set membership:** if the input order is
 * `[Blue, White, Red]` and Blue+Red share par+hcp while White
 * differs, the result is three groups (Blue / White / Red), NOT two
 * (Blue+Red / White). The visual stack would put White's rows
 * between Blue's and Red's, so merging non-adjacent matches would
 * reorder the input — we deliberately don't.
 *
 * Divergence flags compare each group's per-hole par+hcp to the
 * **previous** group's. The first group has all flags false (no
 * prior group to diverge from). The renderer uses the flags to tint
 * the differing cells in the accent colour.
 */
export function groupTeesByParHcp(
  tees: readonly Tee[],
  holesInRange: readonly Hole[]
): TeeGroup[] {
  if (tees.length === 0) return [];

  const groups: TeeGroup[] = [];
  let currentTees: Tee[] = [];
  let currentSig = '';

  function flushGroup(): void {
    if (currentTees.length === 0) return;
    const head = currentTees[0];
    const prev = groups[groups.length - 1];
    const holeStats: TeeGroupHoleStats[] = holesInRange.map((hole) => {
      const stats = getHoleStats(head, hole.number, hole);
      const prevStats = prev?.holes.find((h) => h.holeNumber === hole.number);
      return {
        ...stats,
        parDivergent: prevStats != null && prevStats.par !== stats.par,
        hcpDivergent:
          prevStats != null &&
          (prevStats.handicapIndex ?? null) !== (stats.handicapIndex ?? null),
      };
    });
    groups.push({
      key: currentSig,
      tees: currentTees,
      holes: holeStats,
    });
    currentTees = [];
    currentSig = '';
  }

  for (const tee of tees) {
    const sig = teeParHcpSignature(tee, holesInRange);
    if (currentTees.length === 0) {
      currentSig = sig;
      currentTees.push(tee);
    } else if (sig === currentSig) {
      currentTees.push(tee);
    } else {
      flushGroup();
      currentSig = sig;
      currentTees.push(tee);
    }
  }
  flushGroup();

  return groups;
}
