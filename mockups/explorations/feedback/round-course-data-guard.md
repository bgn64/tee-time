# Feedback: round-course-data-guard

Branch: `bgn64/round-course-data-guard`
Date: 2026-07-28

## Items

### F1 — A round can start with no course scorecard data, then gets stuck

- Verbatim: "as a user, I seem to somehow have started a round at walter e hall
  memorial golf course with the full course data not loaded and now that is
  stuck as my current round but I can't score anything. Course data should have
  been populated and, if it wasn't for some weird reason, we shouldn't be able
  to start a round"
- Triage: clean (UI-only bug fix; no mockup change, no backend).
- Proposed mockup change: none — this is a logic/guard bug, not a visual design
  change.
- Decision: accepted — implement as a code fix.
- Backend: none. Catalog-course enrichment from OpenGolfAPI is intentionally
  best-effort/non-fatal (`courseEnrichment.ts`); the defect is entirely on the
  client.

## Diagnosis (root cause)

1. Catalog courses (`opengolf:` ids) store `holes: []` and are enriched lazily
   from the OpenGolfAPI live endpoints (`useCourse` → `enrichCatalogCourse`).
   Enrichment can fail (network error, or "OpenGolfAPI returned no scorecard for
   this course") and is explicitly non-fatal — on failure `useCourse` returns
   the **bare** course (`holes: []`) plus `error`.
2. `players.tsx` shows the error inline but leaves **Start round enabled**: both
   `handleStart` and `startDisabled` only check `!course` (object exists), never
   `course.holes.length`.
3. `RoundContext.startRound` has no holes guard either, so it snapshots a
   `course_snapshot` with empty `holes` onto the scorecard.
4. `scoring.tsx` computes `currentHole = round.course.holes.find(...)` → gets
   `undefined` for an empty course and does `if (!currentHole) return null;`
   **before** the JSX that mounts the header ⋯ "Abandon round" menu. The screen
   renders blank, and `new/index.tsx` redirects any escape attempt back to
   `/scoring` because a round is "in flight" → the user is trapped.

## Fix (UI-only)

- **Guard the start.** `players.tsx`: require `course.holes.length > 0` (and not
  loading/enriching) in `startDisabled` + `handleStart`, with a clear
  "no scorecard yet" hint. Defensive `throw` in `RoundContext.startRound` for an
  empty-holes course (shared safety net).
- **Make a holeless round escapable.** `scoring.tsx`: when the round has no
  playable hole, render a fallback that still exposes **Abandon round** instead
  of a blank screen — this also lets the reporting user recover their current
  stuck round from the UI (no manual DB edit).

## Verification (phase 5)

Implementation is UI-only — no `supabase/` changes. Validated
`npx tsc --noEmit` (exit 0) and `npm run lint` (exit 0).

- **Guard** — `RoundContext.startRound` throws if `course.holes` is empty
  (shared safety net). `players.tsx` derives `courseHasHoles`/`courseReady`;
  `handleStart` and `startDisabled` now require holes and block while the course
  is loading/enriching, and the Course field shows a "no scorecard data yet"
  hint when a loaded course has no holes.
- **Escape hatch** — `scoring.tsx` no longer `return null`s on an empty
  scorecard; it renders a "This round has no scorecard" state with an
  **Abandon round** button (+ confirm sheet), so a holeless round is always
  recoverable. This is what un-sticks the reporter's current Walter E Hall
  round.
- **Retry (transient failures)** — `useCourse` exposes a `retry()` that re-runs
  the fetch+enrichment for the same id (a successful retry writes back to the
  shared catalog row, fixing the course for everyone). `players.tsx` shows a
  "Try loading this course again" affordance when a selected course has an
  error / no holes, plus a "Loading course data…" state while it's in flight.

Functional check: reporter verifies against their live stuck round — reload the
Scoring screen → the Abandon fallback appears → Abandon returns to the hub; then
picking a course whose data fails to load leaves **Start round** disabled.

