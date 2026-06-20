# Feedback: profile-handicap-detail

Branch: `bgn64/profile-handicap-detail`
Date: 2026-06-19

## Items

### F1 — Tapping handicap in profile does nothing

- Verbatim: "Nothing happens when I tap on my handicap in my profile"
- Triage: clean (UI) — backend to confirm in phase 4
- Proposed mockup change: Make the Handicap index profile tile visibly tappable
  (corner chevron) and add a new `Profile · Handicap` detail screen — index
  hero, a WHS explainer + the differential formula, the counting differentials
  (each showing the differential, the Adjusted Gross · Course Rating/Slope, and
  the date), the lowest-N average result strip, and a "Not counted" section that
  lists rounds excluded with a reason (no tee selected, course rating
  unavailable, 9-hole, etc.).
- Decision: accepted, then SCOPE CHANGED by the user — instead of just surfacing
  the existing simplified to-par calc, the user opted to compute an actual
  (approximate) World Handicap System index client-side, filtering to rounds that
  have the required data. ("Why is backend required? Why can't we just filter to
  eligible rounds e.g. ignore rounds where tees aren't selected, required data
  isn't available, etc"). Chosen fidelity: INCLUDE the net-double-bogey (ESC) cap
  where hole stroke index exists (higher fidelity, more exclusions).
- Backend: NONE (client-only). We compute differentials from data already on the
  round's course snapshot (tee `rating`/`slope`, per-hole par + stroke index) and
  the recorded scores. Rounds missing any required input are excluded with a
  reason rather than triggering schema/backfill work. Backend would only be
  needed LATER to improve coverage/fidelity (backfill course ratings, capture the
  played tee on stroke rounds, custom-course rating inputs) — explicitly out of
  scope for this run.

## Notes

- Only the Handicap tile becomes interactive for this run (user did not pick
  "make all four tiles tappable"). The other stat tiles stay non-interactive.
- No handicap-history UI: user asked to "Remove any elements of the mockup that
  imply backend to track historical handicap for now", so the trend chip is gone.
- Calc reality (found in phase 4): the existing `ProfileScreen.formatHandicapIndex`
  is NOT WHS — its "differential" is just the round's score relative to par
  (gross − par); `Tee.rating`/`slope` exist but are unused. This run REPLACES that
  with an approximate WHS index (below), which changes the displayed handicap
  app-wide (profile tile + the new detail screen).
- Chosen WHS v1 algorithm (client-only):
  - Differential = (113 ÷ Slope) × (Adjusted Gross − Course Rating).
  - Adjusted Gross caps each hole at net double bogey = par + 2 + strokes the
    player receives on that hole (needs per-hole stroke index + the player's
    Course Handicap, bootstrapped iteratively from a provisional index).
  - Index = average of the lowest 8 of the most recent 20 differentials, using
    the WHS reduced-rounds table when fewer than 20 are available (min 3 rounds
    to establish an index); NO ×0.96 (that's the retired pre-2020 factor).
  - Eligibility = stroke · full 18 · every hole scored · participant has a
    `teeId` whose tee carries `rating` + `slope` · per-hole stroke index present
    (so the ESC cap is computable). Anything missing → excluded with a reason.
  - Deliberately OMITTED for v1 (documented in-UI as "approximate"): soft cap /
    hard cap / Low-Handicap-Index anchor, PCC, and 9-hole differentials.
