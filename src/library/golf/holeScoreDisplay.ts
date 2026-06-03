/**
 * holeScoreDisplay — shared formatter for the per-hole hero column
 * on the Holes tab. Both surfaces (viewing + scoring) call this so
 * the column reads identically.
 *
 * Format ("Option B" from the iteration mockup):
 *   - Big number  = strokes relative to par (e.g. "−2", "E", "+1")
 *   - Small sub   = absolute strokes count ("3 STROKES" / "PAR 4")
 *
 * Tone is derived from the relative-to-par so the cell colours match
 * the rest of the app (over par = neutral, under par = primary, even
 * = body). When no strokes have been entered, the column shows a
 * dash and a contextual "PAR N" hint so the column never collapses.
 */

export type HoleScoreDisplay = {
  scoreText: string;
  /** Optional sub-label printed underneath the hero number. */
  scoreSub?: string;
  /** Drives the colour palette in `ScorerSummaryRow`. */
  tone: 'over' | 'under' | 'even';
};

export function holeScoreDisplay(
  strokes: number | null | undefined,
  par: number
): HoleScoreDisplay {
  if (strokes == null) {
    return {
      scoreText: '—',
      scoreSub: par > 0 ? `PAR ${par}` : undefined,
      tone: 'even',
    };
  }
  const rel = strokes - par;
  const scoreText =
    rel === 0 ? 'E' : rel > 0 ? `+${rel}` : `\u2212${Math.abs(rel)}`;
  const tone: 'over' | 'under' | 'even' =
    rel === 0 ? 'even' : rel > 0 ? 'over' : 'under';
  const strokeWord = strokes === 1 ? 'STROKE' : 'STROKES';
  return {
    scoreText,
    scoreSub: `${strokes} ${strokeWord}`,
    tone,
  };
}
