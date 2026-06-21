# Feedback: scoring-tee-per-hole

Branch: `bgn64/scoring-tee-per-hole`
Date: 2026-06-21

## Items

### F1 — Scoring per-hole info uses the default tees, not the played tees

- Verbatim: "When scoring, the per-hole infomration reflects the default tees
  instead of the ones that the user is playing"
- Triage: clean (implementation bug; the mockup already depicts the correct
  behavior).
- Proposed mockup change: none structural. The Scoring **Hole** lens holehero
  already shows per-hole `Par / {yds} / Hcp` and the header names the played tee
  (`Blue 6,602y`), so the design already ties per-hole yardage to the played
  tee. Keep the mockup's per-hole yardages internally consistent with the played
  tee (the holehero's hole-13 `438 yds` matches the played-tee per-hole grid
  added for F2). The fix is in the app: index per-hole yardage by the round's
  selected tee, not the course's default tee.
- Decision: accepted as proposed (clean implementation bug; no mockup change).
- Backend: none expected. Phase-4 note: per-tee per-hole yardage already loads
  client-side (`Hole.yardages` keyed by `Tee.id`, confirmed in the
  `tee-view-and-stat-fixes` run); scoring just needs to read the round's tee.

### F2 — Show per-hole yardage + handicap on the scoring scorecard

- Verbatim: "it would be nice if the scoring scoercard showed per-hole yardage
  and handicap like the ones in serach for courses does"
- Triage: clean (UI only).
- Proposed mockup change: the Scoring **Card** lens hole-by-hole grid shows only
  `Hole / Par / Team`. Add `Yds` and `Hcp` rows (front + back nine) so it mirrors
  the Course-detail ("search for courses") scorecard `Hole / Par / Yds / Hcp`,
  with the played `Team` score row kept beneath. Order: Hole / Par / Yds / Hcp /
  Team. Yardages reflect the played tee (Blue, summing to 6,602); Hcp is the
  per-hole stroke index (tee-independent).
- Decision: accepted as proposed (clean, UI-only).
- Backend: none. Per-hole yardage (per tee) and per-hole handicap/stroke index
  are already available client-side — the Course-detail scorecard renders the
  same `Yds` + `Hcp` data (shipped in `handicap-clarity-course-search`). To be
  confirmed in phase 4.

## Verification (phase 5)

Implementation is UI-only — no `supabase/` changes. Validated
`npx tsc --noEmit` (exit 0) and `npm run lint` (exit 0).

- **F1 — `ScoringRoundView.tsx`.** The holehero now resolves per-hole
  yardage/Hcp from the round tee via `holeStatsForTee(roundTee, currentHole)`
  (→ `getHoleStats`), replacing the tee-agnostic `currentHole.yardage` /
  `.handicapIndex`. Also fixes the edit-round screen (shares this view).
- **F2 — `RoundScorecardGrid.tsx`.** Added `Yds` + `Hcp` rows after `Par` in
  each `NineGrid`, resolved from `scorers[0].tee` via `getHoleStats`. Rows hide
  when no in-range hole carries the data. Shared grid → both the scoring **Card
  lens** (`ScoringCardLens`) and **Round Detail** (`RoundDetailView`) update
  together; those are its only two consumers.

Visual verification in Edge (localhost:8081) against the mockup, on a Pebble
Beach (enriched) round played from the Blue tee:
1. F1 — Scoring Hole lens holehero: hole 1 `Par 4 · 378 yds · Hcp 6`, hole 2
   `Par 5 · 509 yds · Hcp 10` — per-hole Blue-tee yardage, changing per hole. ✓
2. F2 — Scoring Card lens "Round so far": grid renders `Hole / Par / Yds / Hcp`
   then scores; front Yds `378 509 397 333 189 498 107 416 483`, Hcp
   `6 10 12 16 14 2 18 4 8` (back nine likewise). Hole 1/2 match the holehero. ✓
3. F2 — Round Detail (`/round/[id]`): scorecard renders the same `Yds` + `Hcp`
   rows (verified on a Bellevue Blue-tee round). ✓
Test round discarded afterward.

## Notes

Both items are about the Scoring screen and are intertwined: F2 adds a visible
per-hole `Yds` row, and F1 requires that those yardages (and the Hole-lens
holehero's) reflect the round's played tee rather than the course default.

Mockup edits in `04-aurora-glass.html` (2026-06-21):

- **F2 — per-hole Yds + Hcp on the scoring grid.** Added `Yds` and `Hcp` rows
  (front + back nine) to the **SCORING · CARD LENS** hole-by-hole grid, in the
  order `Hole / Par / Yds / Hcp / Team`, mirroring the Course-detail scorecard.
  Per-hole Blue-tee yardages were authored to sum to the played-tee total in the
  header (Out 3,304 + In 3,298 = 6,602y); per-hole `Hcp` is a 1–18 stroke-index
  permutation. Hole 13's authored values (438 yds, Hcp 3) match the Hole-lens
  holehero so the screens agree.
- **Round Detail (extended on user request).** The user approved applying the
  same `Yds` + `Hcp` rows to the **ROUND DETAIL** scorecard grid (the round
  recap view shows the identical per-round scorecard) for visual consistency.
  Same authored values as the Card lens.
- **F1 — no structural mockup change.** The Hole-lens holehero already shows
  `Par / {yds} / Hcp` for the current hole and the header names the played tee;
  the design already depicts per-hole info tied to the played tee. Fix is in the
  app (Phase 5): index per-hole yardage by the round's selected tee.

Phase-4 callouts:
- F1: confirm the scoring screen has access to the round's selected `Tee.id` and
  indexes `Hole.yardages` by it (per-tee per-hole yardage already loads — see the
  `tee-view-and-stat-fixes` run).
- F2: confirm per-hole handicap/stroke index is available to the scoring +
  round-detail scorecards (the Course-detail scorecard already renders it).

