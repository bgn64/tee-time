# Phase 2 QA — HorizontalScorecard + per-tee schema

Run these on **web** (`expo start --web`), **iOS simulator**, and **Android emulator** before merging.

**Prerequisites:**
- Migration `009_course_tee_holes.sql` deployed to Supabase via `Deploy-Migrations.ps1`. The new tables are unused by client code in Phase 2 (the renderer falls back to scalar `Hole.par` / `Hole.handicapIndex`) but the migration must run so the schema is ready for follow-up work (extending `enrich_catalog_course` + custom-course editor).
- No sync streams to deploy this phase (course data is REST-only).

## Surfaces covered

- Home feed (`/`) — Scorecard tab on `RoundListCard`
- Feed round detail (`/(home)/round/[id]`) — Scorecard tab on `RoundDetailView`
- Scoring screen (`/(score)/scoring`) — Scorecard tab on `RoundDetailView` (editing mode)
- Previous round view (`/(score)/previous/[id]`) — Scorecard tab on `RoundDetailView`
- Previous round edit (`/(score)/previous/[id]/edit`) — Scorecard tab on `RoundDetailView` (editing mode)

## Layout

- [ ] Hole numbers run left-to-right across the top header row.
- [ ] Each tee group renders in order: per-tee yardage rows (one per tee in the group), shared PAR row, shared HCP row, scorer rows for that group.
- [ ] Groups stack continuously — no dividers between groups (only the hairline between scorer rows).
- [ ] Leftmost label column is exactly `84px` wide. Tee names truncate cleanly when too long.
- [ ] Totals columns (OUT / IN / TOT) appear on the right, tinted with the `chipBg` colour.
- [ ] On phones, all-18-holes view requires horizontal scroll; Front 9 / Back 9 fit without scrolling.

## Tee grouping behaviour

- [ ] **1 tee in round (opengolf course)**: collapses to a single group; PAR + HCP rows render once; all scorers in one bucket.
- [ ] **2 tees, identical par+hcp**: groups merge; two yardage rows + shared PAR/HCP + all scorers' rows.
- [ ] **2 tees, divergent par on one hole**: splits into two groups; each group has its own PAR row; the divergent cell in the second group is tinted in the `divergent` (accent) colour.
- [ ] **3+ tees, mixed**: adjacent matching tees merge; non-adjacent matching tees do NOT merge (order is preserved).
- [ ] **Scorer with no tee set**: bucketed into the first tee group (no orphan rows).
- [ ] **Course with no tees at all** (typical opengolf in-flight round): synthesises a single "TEES" group using the scalar `Hole.par` / `Hole.handicapIndex`.

## USGA score marks

- [ ] **Eagle** (≤ par − 2): double-circle outline.
- [ ] **Birdie** (par − 1): single-circle outline.
- [ ] **Par**: plain (no outline).
- [ ] **Bogey** (par + 1): single-square outline.
- [ ] **Double bogey or worse** (≥ par + 2): double-square outline.
- [ ] No colour tinting on any score mark — outlines only. Stroke number is `textTitle` colour in all variants.
- [ ] Unscored holes render as "—" placeholder (muted).

## Front/Back/All pill

- [ ] Only renders on 18+ hole rounds. Hidden on 9-hole courses.
- [ ] Default selection matches `round.holeRange` on first mount.
- [ ] Switching range re-renders the scorecard with only the in-range holes + the matching totals (OUT for front9, IN for back9, OUT+IN for all).
- [ ] Pill state is local to the scorecard component — it does NOT mutate `round.holeRange` (which is the scoring contract).
- [ ] Pill dropdown opens as a centred modal popover with "All 18 / Front 9 / Back 9" options; current selection has a check mark.

## Tee colour assignment

- [ ] Canonical names (Blue / White / Red / Gold) map to fixed palette tokens regardless of position.
- [ ] Non-canonical names (e.g. "Senior", "Member") get a deterministic colour from the 6-slot fallback palette. Same tee renders the same colour across reloads.
- [ ] If two non-canonical tees hash to the same fallback slot, the second tee gets the next palette slot (no two tees in one round render the same colour, until you have > 4 non-canonical tees that exhaust the palette).
- [ ] Dark mode uses the dark-theme variants of every tee colour (verify in Settings → toggle theme).

## Per-tee data fallback (legacy rounds)

- [ ] In-flight rounds started before this phase render correctly — they have no `Tee.holes[]` per-tee rows, so the renderer falls back to the scalar `Hole.par` and `Hole.handicapIndex`. The scorecard collapses every tee into a single group.
- [ ] Completed rounds with old `course_snapshot` data render identically to in-flight legacy rounds.
- [ ] No console warnings about missing per-tee data.

## Editing mode (scoring + previous edit)

- [ ] Hole header cells are pressable; tapping a cell calls `onChangeCurrentHole(holeNumber)` (verify by watching the HoleNavBar / score chips in the Holes tab update).
- [ ] Scorer label avatars are still tappable for `user:` participants → push into the profile route (carried over from `ReadOnlyScorecard`).
- [ ] Score entry on the Holes tab updates the scorecard cells immediately (PowerSync local-first write → useQuery re-render).

## Regression sanity

- [ ] `expo lint` passes with 0 errors / 0 warnings.
- [ ] `npx tsc --noEmit --skipLibCheck` passes with 0 errors.
- [ ] `src/components/scoring/ReadOnlyScorecard.tsx` no longer exists. No imports anywhere reference it.
- [ ] All five round-render surfaces (feed card, feed detail, scoring screen, previous view, previous edit) render the new Scorecard tab body without errors.

## Out of scope (follow-up tasks)

- Custom-course editor that writes per-tee divergent par+hcp values via the new tables (deferred).
- Extending `enrich_catalog_course` RPC to populate `course_tee_sets` + `course_tee_holes` for opengolf courses on first use (deferred; the renderer's scalar fallback handles this).
- Extending the course-detail REST query (used by the format / players-pick / start-round flow) to LEFT JOIN the new tables and assemble `Course.tees[].holes` (deferred; current path reads `courses.tees` jsonb which works fine for opengolf).
