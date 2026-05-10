# Tee Time — implementation status & follow-ups

> Snapshot at the end of Path A's phases A-F, plus the v6 round-confirmation
> + merge redesign. Phase G (deployment) is the only remaining item from
> the original Path A plan; everything else listed below is *optional polish*
> or *future feature work* worth tracking so it doesn't fall through the
> cracks. Items marked **[OBSOLETED BY v6]** were superseded by migration
> 006 and the participant-based round model.

---

## Where we are

The app has been taken from a stub-only prototype to a real cloud-backed
multi-user product. Highlights:

- **Auth**: Magic-link OTP sign-in via Supabase. No password to remember.
- **Profile**: One-time handle picker on first sign-in. Avatar color
  generated and stable.
- **Cloud sync**: Roster, custom courses, completed rounds, and per-round
  claim entries all sync per-account via Supabase. Realtime subscriptions
  keep multiple devices in lockstep.
- **Friend graph**: Search by `@handle`, send friend request, accept RPC,
  symmetric friendships, auto-link of source roster row on accept.
- **Feed tab**: Chronological view of friends' completed rounds; tap-through
  to the read-only round detail; pull-to-refresh; three empty states.
- **Privacy model**: RLS enforces "owner OR participant OR friend-of-owner"
  visibility on rounds. Forward-compatible with future per-round visibility
  flags (private / friends / public).
- **Delete-from-my-history semantics**: A user can remove a round from
  their view; the round only fully disappears when the last claimant leaves.
  Backend supports `reclaim_round` for putting it back, though there's no
  UI for that yet.
- **Sign-out hygiene**: Local cloud-cached state clears on sign-out so a
  different account on the same device starts clean.

Five Supabase migrations in `supabase/migrations/` document the schema's
evolution; current end-state is captured by applying 001 through 005 in
order.

---

## What's left in Path A

### **Phase G — EAS Update + friend distribution** *(difficulty: low-med)*

The last item on the original plan. Wire up Expo's over-the-air update
mechanism so friends can install Expo Go (free, on the App Store / Play
Store), open a shared `expo.dev/...` URL, and run the app inside Expo Go
on their own phones.

Steps:
1. `npm install -g eas-cli`, `eas init`, `eas update:configure`.
2. Add `runtimeVersion` and `updates.url` to `app.config.ts`.
3. Publish first preview: `eas update --branch preview --message "..."`.
4. Share the resulting expo.dev URL.
5. Document install + open flow in `README.md` for friends.

Updates afterwards: same `eas update` command pushes a new bundle to all
Expo Go users automatically.

---

## Deferred follow-ups

These were noted during implementation but pushed downstream. Listed
roughly in order of "most likely to bite first" → "nice to have later."

### Friend-graph polish

#### 1. Unfriending / unlinking *(med)*

There's no UI to remove a friendship. Today an unfriend would mean: delete
both symmetric `friendships` rows + clear the `linked_user_id` on the
roster Player on both sides. Without it:
- You can't remove someone you accidentally friended
- Stale friendship rows can build up
- Roster Players accumulate `linked_user_id` references to people you're
  no longer friends with (this currently breaks search, hidden by our
  Phase E patch — see follow-up #3)

We also haven't decided behavior for shared rounds when an unfriend
happens. The plan doc's lean: shared rounds stay claimed on both sides;
unfriending just severs future visibility.

#### 2. Cancel outgoing friend request *(low)*

If you send a request and want to take it back, no UI. Backend supports
it (you'd `update friend_requests set status='declined' where id=...` as
the sender — RLS allows it). Just needs a button on the People-tab roster
detail when the row shows REQUEST PENDING.

#### 3. Stale roster `linked_user_id` after unfriend *(low)*

Search currently doesn't filter out people whose `userId` matches a roster
Player (we removed that filter in Phase E because the link could be
stale). Once unfriending lands, we should also clear the
`linked_user_id` on the matching roster Player. Then search can re-add
the linkedUserIds filter for cleanliness.

#### 4. Roster rename *(low)*

You can't rename a roster Player from the UI. Backend supports it: the
`linkPlayer`/local mutation pattern is there. Adding a tap-to-edit on
the People-tab person detail would be small.

#### 5. Roster merge *(med)* **[OBSOLETED BY v6]**

Replaced by the unlinked → friend merge flow under the v6 redesign.
`merge_unlinked_player` RPC fans out per-round confirmation requests to
the friend; the unlinked roster row is hard-deleted on success. Uniqueness
violations on a round are surfaced as an error.

#### 6. Add roster entry from People tab *(low)*

Currently the only path to add a Player to your roster is during the
Score flow's "Who's playing" screen via the bottom sheet. Adding a "+"
button on the People tab → roster segment would let users build their
roster proactively.

#### 7. Auto-create roster entry from typed name during scoring *(low)*

The Score flow's player picker has a "+ Create" path. It works. But it
could be friendlier: if you type a name that doesn't match any existing
roster entry, auto-create on continue rather than requiring a separate
"create" tap. Marginal UX win.

### Round flow polish

#### 8. Round editing + re-claim flip *(med-high)* **[OBSOLETED BY v6]**

Replaced by the v6 confirm/deny model: linked-friend participants explicitly
confirm their participation; once confirmed, they own edit rights on their
own scoreline. The round detail screen now supports per-hole editing via
`HoleEditSheet` and the `update_score` RPC. No claim-flip-on-edit needed.

#### 9. Unclaimed-rounds sub-view in Rounds tab *(med)* **[OBSOLETED BY v6]**

Replaced by the Pending drawer-link in the Rounds tab plus the
`/(rounds)/pending` drilldown screen. Inline Confirm / Deny buttons; a
banner above the round detail also surfaces the same actions for pending
participants.

#### 10. Round-detail claim chips don't currently show owner status *(low)*

The "FRIEND CLAIMS" strip on the round detail shows a chip per
participant in the `claims` map but not the owner. With the new
seed-scorer-claim trigger, the owner has a claim row too — but it's
auto-`'claimed'` and not really a "decision pending." For most readers
that's fine; might want an explicit "Scored by X" line somewhere.

#### 11. Live in-progress round visibility *(high)*

Currently only completed rounds sync. A friend mid-round is invisible —
their `currentRound` is local-only and not pushed. Adding live-tracking
would let the Feed show "Mike is playing Pebble Beach — through 7"
with a real-time score. Significant work: schema change to push
in-progress rounds, opt-in/out toggle (some users won't want it),
realtime updates as scores come in, hold/abandon edge cases.

#### 12. Round visibility levels (private / friends / public) *(med)*

The plan's natural next step. Add `visibility` column to `rounds`
(default `'friends'`). Tighten the SELECT policy. Add a UI toggle on
round completion: "share this with: just me / friends / anyone." Lets
people opt out of the social default for rounds where their score isn't
flattering.

### Auth + account

#### 13. Account deletion cascading *(med-high)*

If a user wants to delete their account: what happens to friends' history
referencing them? Plan: delete `auth.users` cascades to `profiles` cascades
to most things. But friends' rounds reference the deleted user via
`player_user_ids` and `round_claims.claimant_user_id`. We'd want:
- Rounds stay (each remaining friend already accepted)
- Roster entries that referenced them revert to UNCLAIMED
- Cached `displayName` persists in friends' historical view
- Profile row gone; handle freed up

Needs deletion RPC + cleanup triggers + careful design before any real
user attempts it.

#### 14. Apple Sign In + App Store distribution *(high)*

Deferred indefinitely because you don't want the $99/yr Apple Dev fee.
If you ever want to ship on the App Store: pay the fee, configure Apple
Sign In as a third provider in `AccountContext.signIn`, follow Apple's
"if you support Google you must support Apple" rule, submit through
App Store Connect. Half-day of code; weeks of review limbo.

#### 15. Update profile (handle, displayName) *(low-med)*

You can't change your handle or display name after picking. Backend
supports it (UPDATE policy on profiles allows the owner). Just needs UI
on the Account screen + a uniqueness check on handle changes.

#### 16. Magic-link email customization *(low)*

The OTP email currently uses Supabase's default sender and a basic
template you customized in the dashboard. For polish: branded subject
line, custom from-address (requires a custom SMTP provider — Resend or
similar; Supabase free tier doesn't allow custom from), dark/light
templates.

#### 17. Anonymous-mode adoption surprise *(low)*

If you sign out, score a round anonymously, then sign back in, that
round joins your account's history. For solo-user-on-their-own-phone
this is the right behavior. For "hand the phone to a friend who scores
a casual round" this is wrong. Mitigations: prompt on sign-in, or per-
session anonymous flag. Defer until someone hits it.

### Distribution + ops

#### 18. Tests *(med)*

Long deferred. Pure-function unit tests (handle regex, score formatters,
relative-time formatting) are a 30-minute investment with permanent
value. Context-level tests (sign-in state machine, completeRound
seeds correct claims, leave_round flips status) catch invariant
regressions. End-to-end (Maestro) is fancy but adds maintenance cost
and is overkill until friends start testing.

Recommended starting point: jest + `@testing-library/react-native`, write
~10 unit tests covering the helpers, see if the muscle memory builds.

#### 19. Push notifications *(high)*

Today, users only see new rounds / friend requests when they open the
app. Push notifications would change that. Implementation requires
moving off Expo Go (since Expo Go's push token is shared) onto dev
builds, configuring APNs (iOS) and FCM (Android) credentials,
server-side push fan-out triggered by realtime database events. Real
infra. Defer until you're ready to go past Expo Go distribution.

#### 20. Cross-device sign-in conflict prompt *(low)*

The plan originally called for a "merge prompt" when an existing-account
user signs in on a device that already has local data. We skipped it in
favor of silent merge. If real users start sharing devices it could
matter. The clear-on-sign-out we shipped covers the most common case.

### Feed + social polish

#### 21. Likes / reactions on feed cards *(med)*

Tapping a heart on a round card to react. New `round_reactions` table,
RLS allowing reactions to round-visible-to-user, realtime sub on the
table. Aggregation view ("3 friends liked this") on the feed card.

#### 22. Comments on feed cards *(med)*

Same shape as likes but with text. UI surface is heavier (typing,
threading, mentions). Schema is straightforward.

#### 23. Round-detail visibility for non-friends-non-participants *(low)*

If you deep-link into a round you can no longer see (friendship
removed, etc.), the round-detail shows "Round not found." Could be
friendlier: "you no longer have access to this round."

#### 24. Reverse-direction discovery *(med — growth flow)*

When a brand-new user signs up, the backend can check if any existing
roster entries' nicknames match their displayName. If so, prompt them
post-signup with "Ben might know you — send a friend request?" Growth
lever; defer until growth is a priority.

#### 25. Avatar photo upload *(med)*

Today avatars are a colored circle with the first letter of the
display name. Photo upload requires Supabase Storage configuration,
image-pick UI on the account screen, image-resize before upload, and
all the privacy implications of profile photos. Real lift; defer until
a user actually asks for it.

#### 26. Friend-request expiry *(low-med)*

Plan called for pending requests to expire after 14 days, claims after
30 days. Today they sit forever. Implementation: `pg_cron` job that
flips status to `'expired'` for old rows. Or: don't expire in the DB,
just hide them from the UI past a threshold. Defer.

#### 27. Re-request cooldown after decline *(low)*

If someone declines your friend request, you can re-send immediately
today. Plan suggested a 30-day cooldown. Implementation: a CHECK
constraint or trigger that rejects new pending requests if a recent
declined one exists between the same pair.

### Smaller niggles

#### 28. Pull-to-refresh on Feed doesn't actually re-pull *(low)*

The current implementation just shows a spinner for 600ms and ends. The
realtime subscription is doing the actual work. To make pull-to-refresh
*meaningful* (covers websocket-dropped cases), we'd expose a public
`refreshRounds()` from `GolfRoundContext` that re-runs the initial
sync. Trivial.

#### 29. Feed card "with you" line edge case *(low)*

When friends-of-owner visibility delivers a friend's round in which you
*didn't* participate, the "with you, X" line on the feed card just
shows "with X" (we filter `if (meIsParticipant) push 'you'`). That's
correct, but there's currently no "with X" rendered if the round is
solo (no other participants). Solo friend rounds render a card with
just the participant strip and no "with" line. Probably fine; could
add "(solo)" or similar.

#### 30. Realtime subscription survives app backgrounding poorly *(low)*

Anecdotally during testing: Expo Go pauses websockets when the app is
backgrounded for a long time. The reconnect-on-foreground works but
events that happened while backgrounded aren't replayed. The
initial-pull-on-mount mitigates this; pull-to-refresh as #28 makes it
explicit.

#### 31. RoundContext stub leftover: `ownerId` on local Round *(low)*

The local Round shape has `ownerId` (a local Player.id) that gets
populated from cloud's `owner_user_id` via a roster lookup. If a friend
becomes unlinked or you don't have them in your roster yet, ownerId
ends up undefined. Feed renders "A friend" as fallback. We could add
a backstop: when an unlinked-friend round arrives, auto-create or
auto-link the roster entry. Today there's no automatic mechanism
beyond what `acceptIncomingRequest` does.

#### 32. Bulk-claim sheet effectively unreachable *(low)* **[OBSOLETED BY v6]**

Removed. The v6 redesign drops auto-link-on-friend-accept and the
`BulkClaimSheet` component entirely. Friend acceptance now only inserts
a roster entry for the new friend; merging unlinked history is a
deliberate user action.

---

## How to read this list

- **low** = an afternoon's work, mostly UI plumbing
- **med** = a day or two, possibly a schema migration, but no fundamental
  unknowns
- **high** = real engineering effort, possibly external dependencies
  (Apple, APNs, etc.) or significant design pre-work

If you're picking next, the **medium-cost / high-value** clusters are
roughly:

- **Round editing + unclaimed sub-view** (#8 + #9) — completes the round
  lifecycle
- **Unfriending + roster cleanup** (#1 + #3 + #4 + #5) — completes the
  friend-graph lifecycle
- **Feed reactions** (#21) — first social-engagement feature

The **low-cost / high-quality-of-life** items are #2, #6, #7, #15, #28.

The **deferred-indefinitely** items: #14 (Apple Sign In), #19 (push),
#25 (avatar uploads). These are real features but each carries a
disproportionate operational burden. Only tackle when the value clearly
exceeds that burden.
