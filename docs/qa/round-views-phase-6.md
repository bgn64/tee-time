# Phase 6 QA — Scramble shot attribution

**Prerequisites:** migration `012_shot_attributions.sql` deployed + sync streams `scorecard_shot_attributions` and `friend_scorecard_shot_attributions` deployed.

This phase is scramble-only. None of these checks fire on stroke rounds.

## ShotPicker (scoring Holes tab)

- [ ] Open a scramble round in the scoring screen, expand a team's Detail accordion: a "WHOSE SHOTS" label appears under the tag chips.
- [ ] Pill count matches the team's current stroke count for the focused hole (e.g. 3 strokes → 3 pills).
- [ ] Each pill shows a numbered circle (1, 2, 3) + dashed-border placeholder when no contributor is picked.
- [ ] Tap a pill → bottom sheet opens listing every team member with avatar + name.
- [ ] Pick a member → sheet dismisses; pill now shows that member's avatar + first name + caret.
- [ ] Re-tap a filled pill → sheet opens with the current pick check-marked; pick a different member to change.
- [ ] Increasing strokes (e.g. tap `+1` chip) grows the pill list. New pills are empty.
- [ ] Decreasing strokes shrinks the pill list. Surplus entries are truncated server-side on next write.

## ShotSequence (feed Holes tab)

- [ ] Read-only: scramble feed cards show one "SHOT N" pill per attributed contributor with avatar + first name + tiny connector between stops.
- [ ] No dropdown caret in read mode.
- [ ] Empty / unattributed slots are NOT rendered (read view doesn't show pending-UX placeholders).
- [ ] Switching focused team via the pill swaps the sequence to that team's attribution.
- [ ] Switching focused hole via the stepper swaps to that hole's sequence.
- [ ] No render at all when the focused (team, hole) has no contributors recorded.

## Tee-shot convention (per Q6 plan decision)

- [ ] First entry in the pill list = the tee shot.
- [ ] Verify by tapping `+1` on a fresh hole, picking member A for shot 1 — then Summary tab → "most tee shots" credits member A.

## Summary tab team contribution rows

- [ ] On a scramble round's Summary tab, each team's aggregate tiles are followed by up to two contribution lines:
  - "[First name] · most shots played · N"
  - "[First name] · most tee shots played · N"
- [ ] When the data is tied or absent, the corresponding line doesn't render (no `null` member, no "—" placeholder).
- [ ] Counts update live as the user picks shots on the Holes tab.

## Write durability

- [ ] Pick a member offline; the pill updates immediately (local-first).
- [ ] Reconnect; the row uploads on the next sync tick.
- [ ] Two devices same user: shot picks on device A appear on device B after sync.
- [ ] Friend device: sees the same sequence on the feed via `friend_scorecard_shot_attributions`.

## Drift handling

- [ ] After recording attributions on a hole, edit the team's score (e.g. drop from 4 to 3 strokes). Picker now shows 3 pills (4th entry truncated visually).
- [ ] Increasing strokes back up adds empty pills (new entries are blank, not auto-filled).
- [ ] The server-side row stores whatever the picker last wrote — drift is only visual, not persistent corruption.

## Gear-toggle interaction (Phase 5 compatibility)

- [ ] If "Whose shots" is disabled via the gear toggle, the WHOSE SHOTS section vanishes from the Detail accordion.
- [ ] Re-enabling "Whose shots" brings the section back without losing existing attribution data (server row stays).
- [ ] On stroke rounds the "Whose shots" filter chip never appears (per scramble-only flag in `ACHIEVEMENT_TAGS`).

## Regression sanity

- [ ] `expo lint` passes (0 errors / 0 warnings).
- [ ] `npx tsc --noEmit --skipLibCheck` passes (0 errors).
- [ ] Stroke rounds show no shot picker / sequence / contribution row anywhere.
- [ ] Score-chip entry on the scoring Holes tab still works for both stroke and scramble.
- [ ] Achievement tag entry (Phase 4) still works; gear filter (Phase 5) still works.

## Out of scope (noted)

- The plan called for `setScoreForRound` to also truncate / null-pad the attribution list in the same transaction. Instead, drift is handled at READ time by `ShotPicker` (normalise to `strokeCount` slots, pad with empties). This avoids touching `setScoreForRound` and keeps the per-feature hooks self-contained. Server storage stays whatever was last written; visual UX matches the current stroke count.
