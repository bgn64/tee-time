# Phase 7 QA — Round likes

Run these on **web** (`expo start --web`), **iOS simulator**, and **Android emulator** before merging. Mark each row with the platform initial(s) where it passes.

**Prerequisite:** migration `013_round_likes.sql` must be deployed to Supabase via `Deploy-Migrations.ps1`, and the new sync streams (`own_round_likes`, `friend_round_likes`) deployed via `Deploy-SyncStreams.ps1`. Without these, the Like button stays visually present but writes accumulate in the local upload queue and never sync.

## Like button visuals

- [ ] On a round with zero likes, the heart icon is the outline variant (`heart-outline`), label reads `Like`, colour is `textTitle`.
- [ ] Tapping flips to filled heart (`heart`) in accent colour, label reads `Liked`, count shows `1 liked`.
- [ ] Tapping again returns to outline + `Like` (or `Like` with count when others have liked).
- [ ] On a round with 3 other-user likes and the signed-in user has not liked: heart outline, label `3 likes`.
- [ ] On a round with 3 other-user likes + the signed-in user has liked: heart filled, label `4 liked`.
- [ ] Singular/plural label switches at count == 1 ("1 like" / "1 liked", "2 likes" / "2 liked").

## Toggle write path

- [ ] Tapping Like writes a row to local SQLite `round_likes` (verify with the dev tools: `SELECT * FROM round_likes WHERE round_id = ?`).
- [ ] PowerSync upload connector posts the row to Supabase within a few seconds.
- [ ] On a second device signed in as the same user, the like appears with no manual refresh (sync replay).
- [ ] On a second device signed in as a friend of the round owner, the like also appears (friend stream).
- [ ] Toggling off deletes the row locally and via PowerSync; the count drops on both devices.

## Rapid double-tap

- [ ] Tapping Like twice in quick succession only triggers one toggle (in-flight ref guards re-entrancy).
- [ ] If the unique constraint ever does fire server-side (race across two devices), the PowerSync upload connector discards on 23505 and the local row stays consistent on next sync.

## Offline behaviour

- [ ] Toggle Like with the device offline. Heart updates immediately (local-first).
- [ ] Reconnect; the toggle uploads on the next sync tick. No duplicate rows.
- [ ] Toggle on, toggle off, reconnect — both operations replay in order. Final state matches local state.

## Cross-friendship edge case

- [ ] User A likes user B's round. User A and B are friends.
- [ ] User A un-friends user B (via Friends tab).
- [ ] User A's local `round_likes` row for that round syncs out (PowerSync prune; the friend_round_likes stream no longer matches).
- [ ] On user A's device, the Like button reverts to "Like" / outline heart for that round. No error toast.
- [ ] On user B's device (the round owner), the count drops by one (user A's row was previously in `own_round_likes`; the row stays in Supabase but user A's local lost track of it).

Wait — actually the row stays in Supabase. The owner's `own_round_likes` stream is scoped by `scorecards.owner_user_id = auth.user_id()`, which still matches. So the owner B should STILL see the like from A. But A's local copy is gone. This is intentional — A can no longer "see" the round, so they don't see their own like either.

- [ ] Refine on test: confirm B's count is unchanged after A un-friends; A's button shows "not liked"; if A re-friends B, A's local count updates and `likedByMe` returns to true (the existing row in Supabase syncs back).

## RLS edge cases

- [ ] User A is NOT friends with user B. User A cannot see B's round, and the Like button is irrelevant (the round doesn't render in A's feed).
- [ ] Force-attempt: if A tries to manually POST a like for B's round (e.g. via curl), Supabase RLS rejects with 42501 (insufficient privilege). The PowerSync upload connector discards.
- [ ] Trying to insert with a mismatched `owner_user_id` is rejected by the `round_likes_owner_trg` trigger (23514). Clients always leave `owner_user_id` null on insert so this should never fire from the app.

## Visual regression

- [ ] Like + Comments segments stay equal-width even when the like count grows ("87 liked" doesn't overflow).
- [ ] Light + dark mode both show the heart and label colours correctly.
- [ ] The action bar's hairline divider above remains visible.

## Regression sanity

- [ ] `expo lint` passes with 0 errors / 0 warnings.
- [ ] `npx tsc --noEmit` passes with 0 errors.
- [ ] No existing surfaces broke — the Like button now actually works on every place the action bar renders (feed cards, feed-detail route, scoring screen, previous-round routes).
