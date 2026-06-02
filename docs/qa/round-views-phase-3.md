# Phase 3 QA — HoleStepperCombo + Holes tab (read-only)

Run on web, iOS, Android. No backend changes this phase — purely visual + interaction reskin.

## Surfaces covered

- Feed card Holes tab (`RoundListCard` on `/`) — read-only viewer.
- Feed round detail Holes tab (`/(home)/round/[id]`) — read-only viewer.
- Scoring Holes tab (`/(score)/scoring`) — editing surface with stepper + per-scorer entry rows.
- Previous-round Holes tab (`/(score)/previous/[id]`) — read-only viewer.
- Previous-round edit Holes tab (`/(score)/previous/[id]/edit`) — editing surface.

## HoleStepperCombo

- [ ] Renders `‹ Hole N ▾ ›` as a single pill.
- [ ] Tap `‹` decrements to the previous in-range hole.
- [ ] Tap `›` increments to the next in-range hole.
- [ ] At the first in-range hole, `‹` is dim and disabled.
- [ ] At the last in-range hole, `›` is dim and disabled.
- [ ] No auto-advance when a score is entered (per mockup §6).
- [ ] Front 9 round: stepper only walks 1-9.
- [ ] Back 9 round: stepper only walks 10-18.

## HoleJumpSheet

- [ ] Centre tap on the stepper opens a bottom sheet from below.
- [ ] Sheet shows a 3-column grid with one cell per in-range hole.
- [ ] Each cell shows hole number on top + the active scorer's `<ScoreMark>` on bottom (or "—" if unscored).
- [ ] Active hole's cell has a filled green background (primary).
- [ ] Tap a cell → sheet dismisses and stepper updates to that hole.
- [ ] Drag handle visible at the top; tap scrim dismisses without picking.
- [ ] Front 9 round: grid has 9 cells; Back 9 round: 9 cells; All-18: 18 cells.
- [ ] Works identically on iOS, Android, and web (no platform fork).

## ScorerPickPill (read-only feed surfaces only)

- [ ] Renders the focused scorer's avatar cluster + first name + caret.
- [ ] Default focus on feed/detail is the round owner. Falls back to the first scorer if owner isn't on the scorecard.
- [ ] Tap opens a bottom sheet listing all scorers.
- [ ] Active scorer's row has a green check + tinted background.
- [ ] Tap a row → sheet dismisses and pill + body re-renders with the new scorer's data.
- [ ] Stroke round: one row per participant. Scramble round: one row per team.

## HoleContextSummary (the `.ph-summary` row)

- [ ] Renders the focused scorer's avatar cluster + first name on the left.
- [ ] Meta line shows: tee dot + "TeeName · NNN yds · Par P · Hcp H" (omits pieces that aren't known).
- [ ] Tee dot colour matches the scorer's tee colour from the scorecard (same `assignTeeColors` assignment).
- [ ] Right side: large `<ScoreMark>` + relative-to-par sub-label (`−1`, `E`, `+2`).
- [ ] Unscored holes render `—` placeholder + blank rel-text line.

## Holes tab body slot

- [ ] Feed surfaces: under the hole-context row, renders "Achievement tags coming soon" (Phase 4 fills this with `<AchievementTagRow>`).
- [ ] Scoring surface (editing): no placeholder — body is the existing `ScorerStack` with score-entry chips. Phase 4 replaces ScorerStack with per-scorer entry blocks that include the Detail accordion.

## Scoring surface (editing) Holes tab

- [ ] HoleStepperCombo at the top of the tab body (NOT pinned above the tabs).
- [ ] Stepping changes the focused hole and updates the score-chip rows below.
- [ ] Tap a score chip → updates the local state + writes to `scorecard_scores`.
- [ ] Tee picker (sheet) still opens from the tee pill on each scorer row.
- [ ] Custom score sheet still opens from the `✕` chip.

## Theme parity

- [ ] Light + dark modes both render the stepper, sheets, and hole-context row correctly.
- [ ] Active jump-sheet cell uses `primary` background; cell text colour switches to `cardBg` for legibility on the green tile.

## Regression sanity

- [ ] `expo lint` passes with 0 errors / 0 warnings.
- [ ] `npx tsc --noEmit --skipLibCheck` passes with 0 errors.
- [ ] `src/components/scoring/HoleNavBar.tsx` no longer exists. No imports anywhere reference it.
- [ ] `src/components/round/HolesTabPlaceholder.tsx` no longer exists.
- [ ] All five round-render surfaces render the new Holes tab body without errors.
