# Feedback: custom-courses

Branch: `bgn64/custom-courses`
Date: 2026-06-23

## Items

The single feedback message bundles two capabilities with very different
feasibility, so it is logged as two items.

### F1 — Play courses not in the database via manual scorecard entry

- Verbatim: "I wish you could play courses not in the database by adding their
  scorecard information. ... though manual entry would be okay as well"
- Triage: needs-backend. The *UI* is clean — an "Add course" form that mirrors
  the Course-Detail scorecard layout plus the existing inline "Add custom player"
  precedent on New Round. But a custom course must be persisted and made usable
  in a round, which is backend work.
- Proposed mockup change: a new **ADD COURSE** screen (manual entry) — course
  name + location, an 18/9 holes toggle, an editable tee row (name + rating /
  slope), and an editable hole-by-hole scorecard grid (Hole / Par / Yds / Hcp,
  front + back) mirroring Course Detail, with a "Save course" button and a
  "Private to you" note. Entry point added on **SEARCH · COURSES**: a "＋ Add a
  course not in the catalog" row, plus a "Personal" tag example showing your
  added courses appear in search.
- Decision: accepted. Custom course is **personal/private** to the user (chosen
  over shared-catalog / suggest-to-catalog).
- Backend: required (phase-4 permission gate). Expected: persist a user-owned
  course + tee(s) + holes and let it be selected for a round; visibility scoped
  to the owner. Exact migrations/RPCs/policies to be enumerated in phase 4.

### F2 — Scan in scorecard info from a photo (OCR)

- Verbatim: "It would be nice if you could scan-in the scorecard info with
  pictures"
- Triage: needs-backend and larger — camera capture + a vision/OCR service + a
  review-and-correct step. OCR of arbitrary scorecards is unreliable, so a human
  review pass is mandatory.
- Proposed mockup change: a **ADD COURSE · SCAN** screen (camera capture frame
  over a scorecard, a moving scan line, "Reading par, yards & handicap…"
  processing state, capture tips, Retake / Use photo) and a **ADD COURSE ·
  REVIEW** screen (the editable scorecard pre-filled from the scan, a "Scanned
  from photo — review & fix" banner, low-confidence cells flagged amber, "Looks
  good · Save course"). A "📷 Scan scorecard" CTA sits at the top of the ADD
  COURSE screen as the entry point.
- Decision: accepted **for the mockup design**. The user may drop the scan/OCR
  implementation at the phase-4 plan to simplify (ship manual entry first); the
  mockup depicts the full flow either way.
- Backend: required if implemented — image upload + a vision/OCR step
  (server-side model/service) + parsing into the structured scorecard. Decision
  on whether to build it deferred to phase 4.

## Implementation (phase 5)

Shipped F1 (manual entry) only; F2 (scan/OCR) deferred — the user chose
"Ship F1 (manual) now; add client-side scan as a follow-up." Client-side OCR is
feasible on web via Tesseract.js (WASM) but is best-effort on dense scorecards;
a vision-LLM path needs a backend proxy. **No migration / RPC / policy change** —
F1 inserts a `source='custom'` row through the existing `courses_modify_own` RLS
policy (migration 008).

Files:
- `src/library/golf/ids.ts` — `newCustomCourseId()` (`custom:<uuid>`, never
  `opengolf:`-prefixed so enrichment skips it) + `newTeeId()`.
- `src/types/golf.ts` — `Course.isCustom?`.
- `src/library/golf/useCourses.ts` — `SEARCH_FIELDS` now selects `source`;
  exported `SEARCH_FIELDS` + `CourseDbRow`; `mapDbCourseToCourse` sets `isCustom`.
- `src/library/golf/customCourses.ts` (new) — `createCustomCourse` (builds
  holes/tees jsonb, inserts, maps back) + `deleteCustomCourse`.
- `src/components/course/AddCourseForm.tsx` (new) — the editable form.
- `src/components/course/AddCourseRow.tsx` (new) — the "Add a course" entry.
- `src/app/(tabs)/(score)/new/add.tsx` + `(tabs)/(search)/course/add.tsx` (new) —
  route wrappers (one per tab group, so no cross-tab jump); registered in both
  `_layout.tsx` files.
- Entry points: `(score)/new/index.tsx`, `(search)/index.tsx` CoursesPane.
- Personal badge: `src/components/scoring/CourseRow.tsx`; badge + Remove on
  `(search)/course/[id].tsx`.

Sanctioned divergences from the approved mockup:
- No "Scan scorecard" CTA on the form (F2 deferred).
- Single tee (mockup's "Add another tee" omitted for this milestone).

## Verification (phase 5)

`npx tsc --noEmit` and `npm run lint` both exit 0. Visual + functional check in
Edge (localhost:8081), signed in:
1. New-round picker (`/new`) shows the dashed "＋ Add a course" entry. ✓
2. Add Course form (`/new/add`) matches the mockup: ⛳ name + 📍 location, 18/9
   toggle, White tee (rating/slope + colour swatches, selected = lime ring),
   editable Hole/Par/Yds/Hcp grid, live "Par" total, lime Save, "Private to you"
   note. ✓
3. Created "QA Custom Course" (9 holes, par 4·5·4·3·4·4·5·4·3 = 36): Save →
   Supabase INSERT under RLS succeeded; URL became `?courseId=custom%3A…` and the
   New round form showed it as the selected course. ✓ (real insert + round pick)
4. Search · Courses + the picker both list it as "QA Custom Course · PERSONAL ·
   par 36 · 1 tee" (RLS SELECT returns the owner's row; `isCustom` badge). ✓
5. Course detail via the in-app row tap loads (URL `/course/custom:…`, raw colon)
   with the PERSONAL badge, the White tee, the par-36 scorecard, and "Remove
   course". ✓ (An earlier "not found" was only from hand-typing a `%3A`-encoded
   URL — the in-app `router.push` path, shared with `opengolf:` colon-ids, works.)
6. Remove course → confirm dialog → delete under RLS; a fresh search then returns
   "No matches". ✓ (test course cleaned up)

## Notes

Full verbatim feedback (single message):

> I wish you could play courses not in the database by adding their scorecard
> information. It would be nice if you could scan-in the scorecard info with
> pictures, though manual entry would be okay as well

Phase-2 design decisions (confirmed with the user):
- Scope: design **both** manual entry (F1) and photo-scan (F2) in the mockup;
  possibly drop F2 at the phase-4 plan to simplify.
- Visibility: a custom course is **private to the creator** (only they can find
  and play it).

Mockup edits in `04-aurora-glass.html` (2026-06-23):
- Design-doc comment: eleven → twelve screens; added the Add Course description.
- **SEARCH · COURSES**: added a "＋ Add a course not in the catalog" entry row,
  and a "Pebble Hills Muni · Personal" example to show personal courses surface
  in search (4 matches). New `.tag` "Personal" badge.
- New **ADD COURSE** screen — manual entry form (scan CTA, name/location, 18/9
  toggle, editable tee row, editable Hole/Par/Yds/Hcp scorecard, Save, private
  note). Example: Sunset Ridge G.C., Bend OR, White tee 71.8/131, front nine
  entered (Out 36 · 3,240), back nine still blank (mid-entry state).
- New **ADD COURSE · SCAN** screen — capture frame (faux scorecard + corner
  guides + animated scan line), "Reading…" processing chip, scan tips,
  Retake / Use photo.
- New **ADD COURSE · REVIEW** screen — same editable scorecard pre-filled from
  the scan (par 72 · 6,462 yds), "Scanned from photo" banner, two low-confidence
  cells flagged amber (hole 8 & 13 yardage), "Looks good · Save course".
- New CSS section `/* add course (custom / scanned) */`: `.scan`, `.orline`,
  `.tin`, `.binp`, `.teed`/`.tedd`/`.tedot`, `.sgrid .ecell` (+ `.ph`/`.flag`),
  `.snote`, `.lockn`, `.capture`/`.paper`/`.pgrid`/`.cnr`/`.scanbar`, `.proc`,
  `.tips`, `.tag`. No existing tokens/classes repurposed.

Phase-4 callouts:
- F1 backend (needs explicit approval): how courses/tees/holes are stored, how a
  personal (owner-scoped) course is inserted and made selectable in New Round,
  and the RLS/visibility for owner-only courses.
- F2 backend (needs explicit approval, may be dropped): image upload + OCR/vision
  service + parser. Decide at phase 4 whether to implement or ship manual-only.
