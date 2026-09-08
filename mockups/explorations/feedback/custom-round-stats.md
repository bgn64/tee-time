# Feedback: custom round stats

Branch: `bgn64/custom-round-stats`
Date: 2026-09-05

## Items

### F1 — Make every selected built-in stat available and visible

- Verbatim: "it seems like only some of the stats track. The default selected
  ones seem to work, but I think some of the other ones don't show up."
- Triage: clean
- Proposed mockup change: make the New Round selection-to-scoring contract
  explicit by showing a non-default mix of selected stats, then show that exact
  set on the Scoring screen. Add a Round Detail stats section so every tracked
  stat has a visible result after the round rather than limiting the summary to
  the default Fairways, Greens, and Putts.
- Decision: accepted as proposed
- Backend: none expected for existing built-in stats; confirm their current
  persistence and summary wiring during phase 4.

### F2 — Add reusable custom yes/no stats

- Verbatim: "Also, it would be nice if we could easily add custom stats to
  track. For now, we could scope to yes/no stats"
- Triage: needs-backend
- Proposed mockup change: add an **Add custom stat** affordance beside the New
  Round stat chips and a focused creation sheet with a stat-name field, a
  yes/no type indicator, and **Save & track**. Show saved examples such as
  **Two putts or less** and **Bogey GIR** among the selectable chips, on the
  per-hole Scoring screen, and in the Round Detail stats summary.
- Decision: accepted as proposed
- Backend: persistent custom-stat definitions and per-hole yes/no observations
  are expected to require schema/RPC/policy work; exact changes will be
  identified in phase 4 and require explicit approval before implementation.

### F3 — Leave room for integer custom stats later

- Verbatim: "but in the future we might also want to include integer stats."
- Triage: decline for this run (defer)
- Proposed mockup change: keep this iteration's creation flow explicitly scoped
  to yes/no stats, while avoiding UI language that implies yes/no is the only
  stat type the product can ever support.
- Decision: accepted as proposed
- Backend: none in this run; phase-4 data modeling for F2 should use an
  extensible type discriminator so integer stats can be added later without
  redefining existing custom stats.

## Notes

The example custom stats from the feedback are **Two putts or less** and
**Bogey GIR**, where Bogey GIR means reaching the green in regulation plus one
stroke.

Phase-2 decision accepted by the user on 2026-09-05. Integer custom stats are
intentionally deferred from this run; the design exposes yes/no as the current
type without presenting it as the permanent only type.

## Implementation

Backend work was explicitly approved on 2026-09-05.

- Added `021_custom_stat_definitions.sql`:
  - owner-scoped reusable `custom_stat_definitions` with binary/integer type
    discrimination and duplicate-name protection;
  - immutable `scorecards.custom_stat_definitions` snapshots so historical and
    friend-visible rounds retain custom labels and types;
  - friend-readable / owner-writable `scorecard_hole_details` policies;
  - updated `get_feed` output with the snapshot column.
- Existing `scorecard_hole_details.details` remains the per-hole value store;
  no new value table or write RPC was needed.
- New Round loads built-ins plus reusable custom definitions, creates yes/no
  definitions in an Aurora bottom sheet, auto-selects newly created stats, and
  snapshots selected custom definitions when the round starts.
- Scoring, hole detail, completion checks, Feed summaries, and Round Detail now
  resolve definitions from the built-in registry plus the round snapshot.
- Round Detail shows every selected stat for the owner/primary scorer. Feed
  stays compact by showing the first three entered selected stats rather than
  hard-coding Fairways, Greens, and Putts.
- Integer creation remains visibly disabled as **Coming later**, while the
  backend and runtime definition shape retain the type discriminator.

## Verification

- `npx tsc --noEmit` — exit 0.
- `npm run lint` — exit 0.
- Visual review in Edge:
  - New Round matches the approved selected-count and add-custom-stat flow.
  - The custom-stat sheet is phone-width on web and shows the name field,
    selected Yes / no type, deferred Integer type, and Save & track action.
  - Existing selected built-ins, including Penalties and Sand, render in
    per-hole scoring.
  - Round Detail renders the full tracked-stat grid rather than only FIR/GIR.

Migration 021 was not applied from this session because the local Supabase CLI
was not authenticated. Per user direction, the migration is shipped with the
code and will be exercised in the deployed environment.
