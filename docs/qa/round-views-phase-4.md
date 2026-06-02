# Phase 4 QA — Per-hole achievement tags

**Prerequisites:** migration `010_achievement_tags.sql` deployed to Supabase + sync streams `scorecard_achievement_tags` and `friend_scorecard_achievement_tags` deployed. Without these, writes accumulate in the upload queue locally and never sync.

## Read mode (feed Holes tab)

- [ ] Round with zero tags ever recorded: body renders nothing (no "no tags" placeholder, no empty row).
- [ ] Round with tags on a specific hole: only the *tapped* tags render as static chips, grouped by "Did well" / "Hurt me" (groups omit their label in read mode, per mockup).
- [ ] Switching focused scorer via the pick pill updates the visible tags.
- [ ] Switching hole via the stepper updates the visible tags.
- [ ] On a scramble round, "Whose shots" tags don't appear in read mode (Phase 6 wires the shot picker UI).
- [ ] A friend's tags (synced via `friend_scorecard_achievement_tags`) appear on their round in the feed within one sync tick.

## Edit mode (scoring Holes tab Detail accordion)

- [ ] Each scorer's row has a "DETAIL ▸" toggle right-aligned below the chip row.
- [ ] Tap toggle → accordion opens, body shows "Did well" + "Hurt me" group labels with the four default tag chips per group (`Fairway`, `GIR` / `OB`, `Sand trap`).
- [ ] Tap an untapped chip → fills with the group's colour (green for did_well, accent-red for hurt_me) + prefix glyph (✓ / !).
- [ ] Tap a tapped chip → reverts to untapped (muted).
- [ ] Scramble round: a third group "Whose shots" renders with the "Whose shots" chip in the default set.
- [ ] Each toggle writes to local `scorecard_achievement_tags` immediately. PowerSync uploads asynchronously.

## Write durability

- [ ] Toggle a tag offline; the chip flips immediately (local-first).
- [ ] Reconnect; the row uploads on the next sync tick.
- [ ] Rapid double-tap on the same chip: only one toggle fires (in-flight ref guards re-entrancy).
- [ ] Two devices logged in as the same user: tag toggles on device A appear on device B after sync.
- [ ] Two devices: friend's device sees the round owner's tag toggles via `friend_scorecard_achievement_tags`.

## Default-set contents

- [ ] Stroke round: Default-on tags are exactly `Fairway`, `GIR`, `OB`, `Sand trap` (4 total).
- [ ] Scramble round: Default-on tags are `Fairway`, `GIR`, `OB`, `Sand trap`, `Whose shots` (5 total).
- [ ] Off-by-default tags (`≤ 2 putts`, `Sand save`, `Up & down`, `Penalty`) do NOT appear in the edit-mode accordion in Phase 4. Phase 5 lets users opt them in via the gear toggle.

## Storage convention

- [ ] First toggle on a (scorer, hole) creates a `scorecard_achievement_tags` row with that key in the `tags` array.
- [ ] Toggling that key off removes it from the array, leaving the row with `tags: []`. The row does NOT delete itself.
- [ ] Tapping a different key writes the row in place via UPDATE, not a fresh INSERT.

## Accordion state

- [ ] Accordion open/closed state is per-scorer, local to the current page mount.
- [ ] Navigating away (Summary → Holes → Summary) closes all accordions when returning (no persistence).
- [ ] Stepping to a new hole keeps each accordion's open state — only the inside content swaps.

## Regression sanity

- [ ] `expo lint` passes (0 errors / 0 warnings).
- [ ] `npx tsc --noEmit --skipLibCheck` passes (0 errors).
- [ ] Existing surfaces (Summary, Scorecard) still render correctly.
- [ ] Score-chip entry on the scoring Holes tab still works (chips update strokes via `scorecard_scores`).
