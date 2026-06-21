# Feedback: tee-view-and-stat-fixes

Branch: `bgn64/tee-view-and-stat-fixes`
Date: 2026-06-20

## Items

### F1 — View per-hole details for any tee, not just the default set

- Verbatim: "I cannot see per-hole details for all tees on a course. For UI and
  simplicity, I like having a default set of tees but there should be some way to
  view info for any tee."
- Triage: clean (UI only).
- Proposed mockup change: on Course Detail, make the Tees-card rows selectable —
  tapping a tee marks it active (lime highlight) and drives the Scorecard below:
  its per-hole **Yds** row and the "Scorecard · {tee} · par {n}" header update to
  the selected tee. Blue stays the default selection, so the "default set, but
  viewable for any tee" intent holds.
- Decision: accepted as proposed.
- Backend: none expected. Phase-4 note: confirm per-tee per-hole yardage exists
  (`course_tee_holes`); the catalog already stores multiple tee sets, so this
  should be UI-only.

### F2 — Round-tees bottom sheet is too transparent

- Verbatim: "The bottom sheet for selecting round tees is to transparent and
  makes it hard to see."
- Triage: clean (styling).
- Proposed mockup change: the mockup never depicted any sheet, so add a "New
  Round · Tees sheet" phone frame. Introduce an **opaque** sheet surface (a new
  `--sheet` token — dark, ~0.92 opacity, like the `.tabs` backdrop) instead of
  the see-through `--glass`, so the sheet is legible over the Aurora backdrop.
  The sheet lists tees (name · rating/slope · total yds) with a selected state,
  visually consistent with the Course-Detail Tees card.
- Decision: accepted as proposed.
- Backend: none. Pure styling/opacity change to the existing tee-picker sheet.

### F3 — Penalties and Sand stats can't be tracked when selected

- Verbatim: "I am unable to track Penalties and Sand when I select them as stats
  to track"
- Triage: clean (mockup); backend to confirm in phase 4.
- Proposed mockup change: New Round offers Penalties + Sand, but the Scoring
  per-hole "Stats · hole" row only shows Fairway/Green/Putts/**OB**, so an
  enabled stat never gets an input. Make the Scoring stats row reflect the
  enabled set → Fairway · Green · Putts · **Penalties** · **Sand** (Penalties and
  Sand are counts with steppers, like Putts), reconciling the mockup's "OB"
  toggle to "Penalties".
- Decision: accepted as proposed.
- Backend: TBD in phase 4. The visible symptom is a missing input UI (app bug),
  but per-hole storage for penalties/sand counts must be confirmed — if the
  schema lacks the columns this becomes needs-backend (gated for explicit
  approval before any migration).

## Verification (phase 5)

Implementation is UI-only — no `supabase/` changes. Validated
`npx tsc --noEmit` (exit 0) and `npm run lint` (exit 0).

- F1: Course Detail (`(search)/course/[id].tsx`) — Tees-card rows are now
  `Pressable`; selecting one drives the Scorecard (tee name + per-hole Yds +
  total) via `selectedTee`. Per-tee yardage already loads (enrichment keys
  `Hole.yardages` by `Tee.id`); the hero stays the headline tee.
- F2: `sheetBg` token (`rgba(12,16,23,0.97)`) added to `themes.ts`;
  `TeePickerSheet` sheet now paints `colors.sheetBg` (opaque) and the backdrop
  darkened to 0.5.
- F3: `builtInStats.ts` — added `sand` (integer, opt-in) and relabeled `ob`
  → "Penalties" (key unchanged → no migration). All stat consumers are
  registry-driven (`applicableStatsForHole`, `roundCompletion`), so Sand now
  renders/persists in scoring + summary. Storage open (017/018 checks are
  shape-only).

Visual verification completed in Edge (localhost:8081) against the mockup:
1. F1 — Search → Course Detail (Pebble Beach): tapping **Red** switched the
   highlighted tee (lime + ✓), the Scorecard header ("Red"), every per-hole Yds
   (hole 1 378→310), and the total (6,802→5,125 yds); the hero stayed the
   headline Blue tee. ✓
2. F2 — New Round → Tees: the "Tee for Round" sheet now renders on a solid
   opaque surface (Blue/White/Red/No-tee legible, no bleed-through). ✓
3. F3 — New Round → enabled Penalties + Sand (chips → ✓) → Start: Hole 1 Stats
   row showed GIR · FIR · putts · **penalties** · **sand**; tapping incremented
   `penalties`→1 (red "bad" tone) and `sand`→1 (neutral). Test round discarded
   afterward. ✓

## Notes

Mockup edits in `04-aurora-glass.html` (2026-06-20):

- **F1 — Course Detail tees → scorecard.** The Tees card rows are now selectable
  (`.trow.sel` lime highlight + ✓). A small inline script swaps the Scorecard's
  per-hole **Yds** rows, the "Scorecard · {tee} · par 72" header, and the total
  to the tapped tee. Blue is the default selection. Per-tee per-hole yardages are
  authored as `data-front`/`data-back` on each row (Black 7,075 / Blue 6,828 /
  White 6,120 / Red 5,197 — White's Tees-card total nudged 6,116→6,120 to match
  the authored holes). Par + Hcp are tee-independent and don't change.
- **F2 — Tees sheet.** New `--sheet` token (`rgba(12,16,23,.96)`, near-opaque)
  plus `.sheet`/`.dim`/`.grab` styles. Added a "NEW ROUND · TEES SHEET" frame: a
  dimmed New Round behind an opaque bottom sheet listing Torrey Pines tees
  (name · rating/slope · yds) with Blue selected. The New Round Tees field is
  lime-highlighted to show it's the field being edited.
- **F3 — Penalties + Sand.** New Round "Track stats" now shows all five enabled
  (Fairways/Greens/Putts/Penalties/Sand). The Scoring "Stats · hole" row now
  surfaces Fairway · Green · Putts · **Penalties** · **Sand** (the old "OB"
  toggle became "Penalties"; Sand added) so enabled stats get a per-hole input.

Phase-4 callouts:
- F1: confirm `course_tee_holes` exposes per-tee per-hole yardage to the client.
- F3: confirm per-hole storage supports penalties + sand counts; if the schema
  lacks columns this becomes needs-backend (gated for explicit approval).
- New `--sheet` token must be mirrored into `src/library/theme/themes.ts` when
  implementing F2.
