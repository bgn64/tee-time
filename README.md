# Welcome to your Expo app 👋

This is an [Expo](https://expo.dev) project created with [`create-expo-app`](https://www.npmjs.com/package/create-expo-app).

## Get started

1. Install dependencies

   ```bash
   npm install
   ```

2. Start the app

   ```bash
   npx expo start
   ```

In the output, you'll find options to open the app in a

- [development build](https://docs.expo.dev/develop/development-builds/introduction/)
- [Android emulator](https://docs.expo.dev/workflow/android-studio-emulator/)
- [iOS simulator](https://docs.expo.dev/workflow/ios-simulator/)
- [Expo Go](https://expo.dev/go), a limited sandbox for trying out app development with Expo

You can start developing by editing the files inside the **app** directory. This project uses [file-based routing](https://docs.expo.dev/router/introduction).

## Get a fresh project

When you're ready, run:

```bash
npm run reset-project
```

This command will move the starter code to the **app-example** directory and create a blank **app** directory where you can start developing.

### Other setup steps

- To set up ESLint for linting, run `npx expo lint`, or follow our guide on ["Using ESLint and Prettier"](https://docs.expo.dev/guides/using-eslint/)
- If you'd like to set up unit testing, follow our guide on ["Unit Testing with Jest"](https://docs.expo.dev/develop/unit-testing/)
- Learn more about the TypeScript setup in this template in our guide on ["Using TypeScript"](https://docs.expo.dev/guides/typescript/)

## Score tab — out-of-repo setup

The Score tab introduces two new synced tables (`scorecards`, `scorecard_scores`) plus a server-side trigger that denormalizes `owner_user_id` onto child rows. After pulling these changes you need to apply the new schema to your Supabase project and update the PowerSync sync rules — neither is run automatically by the app.

1. **Apply the SQL migration.** Open the Supabase dashboard → SQL editor and paste the contents of [`supabase/migrations/002_scorecards.sql`](./supabase/migrations/002_scorecards.sql). This creates the two new tables, the `scorecard_scores` owner-denorm trigger, the `auth.uid()` RLS policies, and `ALTER PUBLICATION powersync ADD TABLE …` so PowerSync can replicate them.
2. **Update the PowerSync sync rules.** Open the PowerSync dashboard → Sync Rules and replace the rules with the contents of [`sync-rules.yaml`](./sync-rules.yaml). The new file adds `scorecards` and `scorecard_scores` streams scoped to `owner_user_id = request.user_id()` so two devices signed in to the same account see the same in-progress round.
3. **Smoke-test cross-device sync.** Sign in on web and on a phone/simulator with the same magic-link OTP account. Start a round on one device, tap a score, and confirm the second device's `ReadOnlyScorecard` reflects the change within a couple of seconds. The current-hole position (`HoleNavBar`) intentionally stays per-device — only the scores sync.

## Friending — out-of-repo setup

The friending feature adds three new tables (`profiles`, `friend_requests`, `friendships`) plus six SECURITY DEFINER RPCs that own all the write paths. The friend graph **is** synced to clients via PowerSync — the Home incoming-requests banner is realtime, and the friends list is offline-available — but writes still flow through RPCs so multi-row invariants (e.g., "accepted FR ⇔ two friendship rows") can be enforced atomically.

Search-result profiles are NOT synced: handle search needs a server-side prefix index across the global user set, so the Search tab queries Supabase directly.

1. **Apply the SQL migration.** Open the Supabase dashboard → SQL editor and paste the contents of [`supabase/migrations/003_friends.sql`](./supabase/migrations/003_friends.sql). This creates the three tables, the partial unique index that prevents duplicate pending requests in one direction, the RLS read policies (no direct insert/update/delete — clients must go through RPCs), and the six RPCs (`complete_profile`, `send_friend_request`, `accept_friend_request`, `decline_friend_request`, `cancel_friend_request`, `unfriend`). Each RPC starts with an `auth.uid()` null guard and is granted EXECUTE only to `authenticated`. The `friendships` PK is a synthetic `id uuid` (with `UNIQUE (user_id, friend_user_id)` preserving the symmetric-two-rows invariant) — PowerSync requires a single-column `id` on every synced row.
2. **Redeploy the PowerSync sync rules.** Five new streams have been added to [`powersync/sync-config.yaml`](./powersync/sync-config.yaml): `own_profile`, `friend_profiles`, `requester_profiles`, `friendships`, and `friend_requests`. The three profile streams alias `user_id AS id` so PowerSync sees a usable local row key. Push the file with `powersync deploy sync-config` (or paste the YAML into the PowerSync dashboard → Sync Rules and Deploy). The `powersync` publication is already `FOR ALL TABLES`, so no `ALTER PUBLICATION` is needed for the new tables.
3. **Smoke-test the end-to-end flow** with two invited accounts on two browser windows:
   - A signs in, picks `@alice`. B signs in, picks `@bob`.
   - A opens the **Search** tab, types `bo`, taps Bob's row → profile shows `+ Add Friend`. Tap → flips to `Requested`.
   - B opens **Home** → sees the incoming-request banner appear **without refreshing** (this is the realtime check; PowerSync pushes the new row to B's open tab). Tap Confirm → banner clears, A's profile flips to `Friends ✓`.
   - B taps the `Friends ✓` pill → dropdown shows `Unfriend` → confirm → friendship deleted on both sides.
4. **Offline check.** With B's friends list populated, disconnect the network and reload the web app. The friends list and any pending FRs should still render — PowerSync's local SQLite holds them across reloads, and the RPC writes are deliberately not queued offline (they need server-side multi-row transactions).

## Custom players — out-of-repo setup

The Score-tab player picker replaces the old seeded roster with two
real sources: your **friends** (live via the existing
`friend_profiles` PowerSync stream) and **custom players** —
user-scoped roster of off-app people you play rounds with. Custom
players are created inline from the picker; each row has a 3-dot
menu offering soft-delete (the row stays synced so historic
scorecards keep rendering correctly).

`participantKey` switches to a prefixed format
(`user:{uid}` / `custom:{cid}`) so the same scorecard schema can
reference both kinds. The seeded ids on any in-flight pre-migration
rounds (e.g. `'player-you'`) still resolve via a legacy fallback.

1. **Apply the SQL migration.** Open the Supabase dashboard → SQL editor and paste the contents of [`supabase/migrations/004_custom_players.sql`](./supabase/migrations/004_custom_players.sql). This creates the `custom_players` table (owner-scoped via FK + RLS) with a `deleted_at` column for soft-delete. The picker filters `deleted_at IS NULL` locally; the scorecard participant resolver doesn't, so deleted players keep rendering on historic rounds.
2. **Redeploy the PowerSync sync rules.** The `custom_players` stream has been added to [`powersync/sync-config.yaml`](./powersync/sync-config.yaml). It returns ALL of the user's rows including soft-deleted ones (the picker / resolver split handles the filter locally). Push with `powersync deploy sync-config` (or paste into the dashboard → Sync Rules → Deploy).
3. **Smoke-test the end-to-end flow** with two accounts A (friends with B):
   - A opens the **Score** tab → picks a course → Players. Confirm "You" is pinned, B appears under FRIENDS, and the "+ Add new player" row is visible.
   - Type "Dad" into the search box. The "+ Add new player" row updates to `Add "Dad" as a new player`. Tap it. Confirm "Dad" appears under CUSTOM PLAYERS with a 3-dot menu on the right, and is selected.
   - Start the round with You + B + Dad. Confirm the scoring screen renders all three avatars / names correctly.
   - Tap a name in the Final-totals row of the read-only scorecard. For `user:` participants (You + B) the row should navigate to the profile screen.
   - Back on the players picker, tap the 3-dot menu on Dad → Delete → confirm. Confirm Dad disappears from the picker.
   - Open the in-flight round's scorecard — Dad should still render correctly there (live lookup hits the soft-deleted row).
4. **Unfriend / ex-friend check (online)**. After completing the round, have B unfriend A. Open the scorecard on A's device. B's name + avatar should still render correctly (the participant resolver's tier-2 direct fetch reads B's profile from Supabase since the `profiles_select_all` RLS allows it).
5. **Offline limitation**. The same scenario when offline → B falls back to "Player". Mitigation (a `scorecard_participants` retention sync stream) is deferred.

## You tab — no out-of-repo setup

The new **You tab** in the bottom nav renders the signed-in user's profile via the same `<ProfileScreen>` component used everywhere else (Search results, scorecard tap-to-profile, friends-list drill-ins). No new tables, RLS policies, or sync streams — everything is computed from rows already synced (`profiles`, `friendships`, `scorecards`).

The profile screen now shows:
- **Friends N** (tappable on your own profile → drills to `/(you)/friends`; hidden on others')
- **Rounds played** (own) / **Rounds together** (others) — both computed from completed scorecards in your local PowerSync DB.

Both counts have a known accuracy ceiling: they only see scorecards *you* own (`scorecards.owner_user_id = auth.user_id()`). A round another user created with you in it isn't synced to your device, so the count silently undercounts in that direction. Fix (broaden the `scorecards` sync rule to include rounds you appear in) is well-scoped and deferred.

### Navigation pattern — per-tab profile routes

Profiles are reachable from four tabs now (Home feed, Search, Score scorecard, You/friends list). Each tab gets its own `profile/[userId]` route; tapping a name from anywhere pushes onto the **current** tab's stack so tab context is preserved (Instagram / X convention). Switching tabs preserves each tab's exploration history; back always behaves predictably within the current tab.

## Home tab — Feed

The **Home tab** is the friend-rounds feed. Every friend's completed round appears chronologically; in-flight rounds (≥1 score written) pin to the top with a pulsing `● IN PROGRESS` pill and tick in real time as scores arrive.

### Deploy steps

Apply **migration 005** (`supabase/migrations/005_friend_scorecard_visibility.sql`) and deploy the updated **`powersync/sync-config.yaml`** (two new streams: `friend_scorecards`, `friend_scorecard_scores`). The migration is defense-in-depth — PowerSync sync rules read via the replication slot and bypass RLS, so the feed *works* without it; the migration just aligns the RLS surface with what the app exposes.

### How "live" works

`RoundContext.setCustomHoleScore` bumps `scorecards.updated_at` on every score tap (the parent scorecard row gets re-synced along with the score-row insert). The feed sorts live rounds by `scorecards.updated_at DESC` directly — no client-side aggregate query over score rows. Trade-off: every tap re-replicates the parent row (including its ~few-KB `course_snapshot`). For ≤ a handful of concurrent live rounds the cost is negligible; revisit with a denormalized `last_score_at` column if profiling ever shows it hurting on mobile data.

The card's "X ago" label on a live round shows the time **your device** last received an update for that round, not the scorer's timestamp. If you're offline, the label keeps ticking forward ("3m ago" → "1h ago" → "Yesterday") so it honestly reflects how stale your data is rather than implying freshness it can't guarantee. Completed rounds keep using `completedAt` since that's an immutable moment with real meaning.

### Participant snapshots for friend custom players

A friend's custom players (`custom:{uuid}` participants — e.g. "Dad") don't sync to your device because `custom_players` is scoped to `owner_user_id = me`. `RoundParticipant` now carries optional `localDisplayName` + `localDisplayColor` populated at `startRound` time. The participant resolver uses those snapshots as a fallback so friends see your nicknames in the feed even though they can't query your `custom_players` table.

### Known gaps

- **Sync volume per friend** scales linearly with their round count + per-cell score count, **plus** the parent scorecard row (with its course_snapshot) re-syncs on every tap. No time-window cap yet; very active friends could create noticeable initial-sync cost. Easy future improvement: scope `friend_scorecards` to the last N days.
- **No stale-live-round cutoff** — a friend who taps two scores then puts the phone down stays "live" in your feed until they complete or abandon the round. Old app used a 6-hour window.
- **Non-friend app users** in a friend's round resolve via online Supabase REST fetch; offline they render as "Player".

## Learn more

To learn more about developing your project with Expo, look at the following resources:

- [Expo documentation](https://docs.expo.dev/): Learn fundamentals, or go into advanced topics with our [guides](https://docs.expo.dev/guides).
- [Learn Expo tutorial](https://docs.expo.dev/tutorial/introduction/): Follow a step-by-step tutorial where you'll create a project that runs on Android, iOS, and the web.

## Join the community

Join our community of developers creating universal apps.

- [Expo on GitHub](https://github.com/expo/expo): View our open source platform and contribute.
- [Discord community](https://chat.expo.dev): Chat with Expo users and ask questions.
