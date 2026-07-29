# Feedback: opengolf-holes-parse

Branch: `bgn64/opengolf-holes-parse`
Date: 2026-07-28

## Items

### F1 — Scorecards no longer load for any course

- Verbatim: "Even though we used to be able to load score cards for all kinds of
  coures, now it doesn't seem to work for any courses and it is not transient.
  Can you try and figure out why?"
- Follow-up: "Note this issue existed before the cutover, so that is likely not
  the issue"
- Triage: clean (UI-only bug fix; no mockup change, no backend).
- Proposed mockup change: none — client-side data-parsing bug.
- Decision: accepted — implement as a code fix.
- Backend: none.

## Diagnosis (root cause)

Course scorecard data is populated by best-effort live enrichment from the
OpenGolfAPI (`courseEnrichment.ts`), not from the DB — the catalog stores holes
for only a handful of courses (8 of 14,023 in the pre-cutover dump), so
essentially every "load a scorecard" goes through the live API. The API's live
`/v1/courses/:id/holes` endpoint now keys each hole's number as **`number`**:

```json
{"holes":[{"number":1,"par":4,"handicap_index":1,"yardages":{"blue":314,"white":300}}, …]}
```

…but `buildHoles` only recognised `hole_number` / `hole`:

```js
const number = numOrUndef(obj.hole_number ?? obj.hole);   // never reads `number`
```

So every hole was skipped → `buildHoles` returned `[]` → enrichment bailed with
"OpenGolfAPI returned no scorecard for this course." for **every** course. And
because the `/holes` array was non-empty (just unparseable), the code never fell
back to the base course's par-only `scorecard` (which is keyed by `hole` and
*would* parse). This is upstream API contract drift, entirely client-side —
consistent with "used to work", "all courses", "not transient", and "predates
the cutover".

Confirmed against the live API (real id `df3ffa39-…`): base/tees/holes all
return HTTP 200 with good data; the `/holes` payload uses `number`.

## Fix (UI-only, `courseEnrichment.ts`)

1. Read `obj.hole_number ?? obj.hole ?? obj.number` for the hole number.
2. Parse the `/holes` payload first; if it yields **0** parsed holes, fall back
   to the base course `scorecard` — so a future field rename degrades to
   par-only rather than breaking entirely.

## Verification (phase 5)

Replicated the parse against the live API for a real course id: with the fix,
**18/18 holes parse**, all with per-tee yardages and handicap index, tees
Blue/White/Red — no fallback needed. `npx tsc --noEmit` and `npm run lint` both
exit 0.
