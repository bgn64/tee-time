# Phase 5 QA — Per-scorer gear toggle + Summary aggregates

**Prerequisites:** migration `011_tracked_stats_overrides.sql` deployed + sync streams `scorecard_tracked_stats` and `friend_scorecard_tracked_stats` deployed.

## Summary tab aggregates

- [ ] Each scorer row now shows a 4-tile aggregate strip below the avatar/score row: Fairways, GIR, OB, Sand.
- [ ] Tile values reflect the tags that have been tapped on each in-range hole for that scorer.
- [ ] FIR denominator excludes par-3 holes; GIR denominator includes all in-range holes that have a tag row.
- [ ] OB and Sand show raw counts (no denominator).
- [ ] Toggling a tag on the Holes tab updates the Summary aggregate within one render tick (PowerSync re-emits, hook re-derives).
- [ ] Friend's tags also feed the aggregates for friend rounds (verify via friend feed surface).
- [ ] Tiles for tags the scorer has disabled via the gear panel show `0` (or `0/0`) — they don't surface stale values from when the tag was enabled.

## Gear toggle inside ScoreEntryAccordion

- [ ] Expand any scorer's Detail accordion → a small sliders icon (Ionicons `options-outline`) appears in the top-right of the accordion body.
- [ ] Tap the gear → body swaps from tag-entry chips to a filter panel listing every available metric.
- [ ] Filter panel renders:
  - Did well group: Fairway, GIR, ≤ 2 putts, Sand save, Up & down
  - Hurt me group: OB, Sand trap, Penalty
  - Scramble only group (scramble rounds only): Whose shots
- [ ] Each filter chip shows the on / off state. Enabled chips render in the group's accent colour with the prefix glyph.
- [ ] Tap a filter chip → flips the on/off state and writes to `scorecard_tracked_stats` immediately.
- [ ] Tap the gear icon again → body returns to per-hole tag entry. The visible chips reflect the new enabled set.

## Storage convention

- [ ] Fresh scorer (no override row): tag-entry accordion shows the 4 default chips.
- [ ] After enabling "≤ 2 putts" via the gear panel: tag-entry accordion shows 5 chips. Override row exists with the new enabled list.
- [ ] After disabling all 4 defaults via the gear panel: tag-entry accordion shows 0 chips (truly empty). Override row exists with `enabled_tags: []`.
- [ ] Disabling all chips does NOT delete the row (intentional — distinct from "no override").

## Per-scorer scoping

- [ ] Two scorers in the same round: changing scorer A's enabled tags does NOT affect scorer B's accordion or aggregates.
- [ ] Override row's `(scorecard_id, scorer_id)` unique constraint enforces this server-side.

## Write durability

- [ ] Toggle a filter chip offline; flips immediately (local-first).
- [ ] Reconnect; the row uploads on the next sync tick. No duplicates.
- [ ] Two devices same user: filter changes on device A appear on device B after sync.
- [ ] Friend device: sees the override and computes aggregates with the same enabled set (via `friend_scorecard_tracked_stats`).

## Visual regression

- [ ] Aggregate tiles fit comfortably on a 390px-wide phone (4 tiles × ~85px = 340px, leaves margin for padding/gap).
- [ ] Light + dark mode both render correctly. Tile values use `textTitle`; labels use `textMuted`; backgrounds use `chipBg`.
- [ ] Gear icon active state has a subtle green-tinted background; inactive state has no background.

## Regression sanity

- [ ] `expo lint` passes (0 errors / 0 warnings).
- [ ] `npx tsc --noEmit --skipLibCheck` passes (0 errors).
- [ ] Per-hole tag entry (Phase 4) still works — toggling tag chips on a hole still flips them and persists.
- [ ] No regressions in Summary / Scorecard / Holes tab navigation.

## Deviation from plan (noted)

- The plan called for "extending `useScorecardStats`" but `useScorecardStats` is scoped to profile-level stats (rounds played, rounds together) — semantically different. Instead Phase 5 adds a new pure helper module `src/library/golf/aggregateStats.ts` (`computeScorerAggregates` + `filterAggregatesByEnabled`) that's consumed directly by `SummaryTabContent`. Same end-user behavior, cleaner separation.
