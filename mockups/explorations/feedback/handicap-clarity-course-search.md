# Feedback: handicap-clarity-course-search

Branch: `bgn64/handicap-clarity-course-search`
Date: 2026-06-20

## Items

### F1 — Handicap detail: index differs from the highlighted round's differential

- Verbatim: "The handicap screen shots one of four eligible rounds with the
  eligible highlighted one saying 23.7 or something and the handicap index for
  me saying 22.7 index. Unclear why the difference."
- Root cause: with only 4 eligible rounds the WHS reduced-rounds table counts
  the **lowest 1** differential and subtracts a fixed **−1.0** adjustment, so
  23.7 − 1.0 = 22.7. The calc is correct; the screen just never surfaces the
  adjustment, so the hero (22.7) appears to contradict the highlighted counting
  differential (23.7).
- Triage: clean (UI only).
- Proposed mockup change: replace the single "average of lowest N" summary strip
  with an explicit calculation breakdown — "Lowest 1 of 4 → 23.7",
  "Fewer-rounds adjustment → −1.0", "Handicap index → 22.7" (emphasized). Update
  the WHS explainer to call out the fewer-rounds counting + adjustment, and
  reframe the screen's example dataset (and the Profile handicap tile) to the
  real 4-eligible-round scenario so the adjustment is visible.
- Decision: accepted. User confirmed reframing the mockup to the 4-round / 22.7
  scenario (rather than keeping the generic 8-round example).
- Backend: none. The reduced-rounds table + adjustment already exist in the
  client calc; this is a display-only change.

### F2 — Searchable course catalog with full course info

- Verbatim: "It would be nice if there was a way to search the course catalog
  offered by the app so I can see full course info"
- Triage: clean (UI); data source to confirm in phase 4 (may be needs-backend).
- Proposed mockup change: add a segmented **People | Courses** toggle to the
  Search tab (rename the screen "Search"), add a **Search · Courses** state with
  course result rows (name · location · par · tee count), and a new **Course
  detail** screen with full info — hero (par + yardage + headline rating/slope),
  a Tees card (per-tee rating / slope / yardage), and a hole-by-hole scorecard
  (Hole / Par / Yds, front + back nine).
- Decision: accepted. User chose the Search-tab toggle + Course-detail screen
  (over a dedicated entry point or only enhancing the New Round picker).
- Backend: NONE (confirmed in phase 4). The course catalog already exists —
  `public.courses` (+ `course_tee_sets`/`course_tee_holes`) with trigram +
  lower() search indexes and authenticated SELECT on `opengolf` rows
  (migrations 008 / 010). Client hooks `useCoursesSearch(query)` and
  `useCourse(id)` already ship and are used by the New Round flow. The new
  Search·Courses + Course-detail screens reuse them verbatim. No migration /
  RPC / policy work.
- Enrichment: `useCourse(id)` auto-enriches an un-enriched catalog row on load
  (calls `enrichCatalogCourse()` → OpenGolfAPI live fetch + `enrich_catalog_course`
  RPC write-back; useCourses.ts:284-297) — the same on-demand enrichment the
  scoring course-picker triggers. So viewing a course in the new screen loads
  the full rich scorecard. Not surfaced as explicit UI (user: "Don't worry
  about making it explicit in the UI").
- Recents: the mockup's "Recently viewed" idle block is DROPPED (user chose an
  idle prompt over a client recents store). Mockup updated to match — the
  Search·Courses idle/empty state shows a prompt, not recents.

## Verification (phase 5)

Validated `npx tsc --noEmit` + `npm run lint` (both exit 0). Visually verified
in Edge against the mockup:

- F1 Handicap: explainer copy updated; the new breakdown card renders the
  fewer-rounds adjustment ("Lowest N of M" → low average, "Fewer-rounds
  adjustment" → −1.0, "Handicap index" → result in lime). Confirmed by
  temporarily forcing an index from the test account's single eligible round,
  then reverting the calc tweak (no logic change shipped).
- F2 Search: People|Courses toggle; Courses search returned matches; the new
  Course-detail screen rendered a previously un-enriched catalog row with full
  hero (par/yards/rating/slope), 5 tees with colored dots, and the hole-by-hole
  Hole/Par/Yds/Hcp scorecard — confirming `useCourse(id)` auto-enriches on view.

Implementation is UI-only; no `supabase/` changes.

## Notes

- F1 example numbers are internally consistent: differential =
  (113 ÷ Slope) × (AGS − Course Rating). Counting round Pebble Creek
  AGS 98 · 71.4/127 → (113/127)(98−71.4) = 23.7; the other three eligible rounds
  are higher (25.7 / 26.1 / 28.4); lowest 1 of 4 = 23.7; −1.0 adjustment → 22.7.
- F2 backend gate is the one open question for phase 4. Default to a UI-only
  solution if a searchable catalog already exists; otherwise surface the exact
  migration/RPC needed and get explicit approval.
- Mockup approved 2026-06-20 after one iteration: user asked to add a per-hole
  Hcp (stroke index) row to the Course-detail scorecard (now Hole / Par / Yds /
  Hcp, front + back nine). Proceeding to phase 4.
