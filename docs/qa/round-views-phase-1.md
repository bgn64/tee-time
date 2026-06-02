# Phase 1 QA — Card chrome + three-tab shell

Run these checks on **web** (`expo start --web`), **iOS simulator**, and **Android emulator** before merging Phase 1. Mark each row with the platform initial(s) where it passes (e.g. `W / iOS / A`). Flag anything that fails or looks off.

## Surfaces covered

- Home feed (`/` → `(home)/index.tsx`) — uses `RoundListCard`
- Feed round detail (`/(home)/round/[id]`) — uses `RoundDetailView` (read-only)
- Scoring screen (`/(score)/scoring`) — uses `RoundDetailView` with `isEditing`
- Previous round view (`/(score)/previous/[id]`) — uses `RoundDetailView` (read-only)
- Previous round edit (`/(score)/previous/[id]/edit`) — uses `RoundDetailView` with `isEditing`

## Editorial header

- [ ] Live round shows the green live strip at the top of the card and a small accent dot prefix in the top meta line.
- [ ] Completed round hides the live strip and the live dot.
- [ ] Course name (title) wraps to 2 lines max before truncating.
- [ ] Sub-line shows `Location · Format · N holes` (e.g. "Pebble Beach, CA · Stroke · 18 holes"). Format reflects the round's `scoringRule`.
- [ ] When `round.course.location` is empty, the sub-line collapses to `Format · N holes` cleanly (no leading dot).
- [ ] Top-line right side shows `formatRelativeTime` of `lastScoreAt` (live) or `completedAt` (done).

## Tabbed shell

- [ ] Every entry (feed scroll into the card, route navigation into detail) lands on the **Summary** tab. No persistence across navigation.
- [ ] All three tab labels render in small-caps with `0.4` letter spacing.
- [ ] Active segment shows the white card background with a subtle inset shadow; inactive segments show the chip background with muted-text label.
- [ ] Tapping a tab switches the body immediately (no flicker / no async swap).
- [ ] On RNW, no swipe gesture is recognised; segments respond only to clicks/taps.

## Summary tab

- [ ] Stroke round: one row per `playerIds` entry. Avatar (single), name, tee chip (when a tee is set), big hero score on the right.
- [ ] Scramble round: one row per team. Avatar cluster (two overlapping avatars), team name, tee chip (from the team's first member's tee), big hero score on the right.
- [ ] Hero score uses `primaryDark` colour by default; goes muted (`textBody`) when relative-to-par is exactly zero; reverts to `textTitle` when over par.
- [ ] `THRU N` sub-label shows for in-progress rounds when the scorer has scored at least one hole; "FINAL" sub-label shows on completed rounds; absent on brand-new rounds.
- [ ] Tapping anywhere on the Summary body in the FEED card pushes into the round detail route (i.e. `onOpen` fires).
- [ ] Tapping the Summary tab body in a DETAIL view (`RoundDetailView`) does NOT navigate — the Summary slot is not wrapped in a Pressable there.

## Scorecard tab

- [ ] Renders the existing `ReadOnlyScorecard` (Phase 2 will replace with `HorizontalScorecard`).
- [ ] Editing mode: tapping a hole cell still calls `onChangeCurrentHole`; tapping a participant avatar still pushes into the profile route.
- [ ] Read-only mode: tapping a cell is a no-op.

## Holes tab

- [ ] Feed card (read-only): renders the "Per-hole view coming soon" placeholder.
- [ ] Scoring screen (`isEditing=true`): renders `HoleNavBar` + `ScorerStack` with score-entry chips, identical to today's experience.
- [ ] Completed round view (no editing): renders the placeholder.
- [ ] Previous-round edit (`isEditing=true`): renders `HoleNavBar` + `ScorerStack` with chips.
- [ ] Score-chip entry, tee picker, custom score sheet, hole nav arrows all work as before.

## Action bar

- [ ] Two equal-width segments separated by a hairline divider above.
- [ ] Like icon: heart-outline (textTitle colour) when `liked=false`; filled heart (accent colour) when `liked=true`.
- [ ] Like label: "Like" / "Liked" / "N like(s)" / "N liked" based on count + state.
- [ ] Tapping Like is a no-op in Phase 1 (no handler wired); button does NOT crash. Phase 7 wires the real toggle.
- [ ] Comments icon: chatbubble-outline (textTitle colour).
- [ ] Comments label: "Comments" / "N comment(s)".
- [ ] Tapping Comments opens the bottom sheet over the card.

## Comments bottom sheet

- [ ] Slides up from the bottom with the system slide animation.
- [ ] Scrim darkens the background card; tapping the scrim dismisses.
- [ ] Drag handle visible at the top.
- [ ] Header shows "Comments · N" + a close X.
- [ ] Body mounts the existing `CommentsSection` (thread + composer).
- [ ] Composing a comment posts and the new row appears in the list.
- [ ] Editing / deleting an author-owned comment still works.
- [ ] On Android, hardware back dismisses the sheet (not the parent screen).
- [ ] Dismissing returns the parent card to its prior tab state (no reset).

## Visual / chrome

- [ ] Cards are edge-to-edge (no rounded outline border). Only a soft drop shadow lifts them off the page background.
- [ ] Card shadow is subtle in light mode (slight green tint); deeper / black in dark mode.
- [ ] Hairline dividers (between scorer rows in Summary, between action bar and card body) use the new `hairline` token, not `border` — they're noticeably lighter than the old card borders.

## Theme parity

- [ ] Light mode: all colours render per mockup (warm white card, green primary).
- [ ] Dark mode: all colours render per mockup (dark navy card, brighter lime primary). No green avatar overrides — avatars use the same hex in both modes.

## Regression sanity

- [ ] `expo lint` passes with 0 errors / 0 warnings.
- [ ] `npx tsc --noEmit` passes with 0 errors.
- [ ] No remaining imports of the deleted `RoundCardHeader.tsx`.
- [ ] No inline `CommentsSection` mounts outside `CommentsSheet`.
- [ ] Score-entry flow on the scoring screen still produces saves to `scorecard_scores` (verify with a manual edit + sync round-trip on staging).
