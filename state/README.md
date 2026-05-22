# State and persistence

`state/` contains React Context providers for app-wide state, persistence, Supabase auth + per-account cloud sync, offline write queueing, onboarding, and location.

## Provider order

Providers are mounted in `app/_layout.tsx`:

```tsx
AppThemeProvider
  HeaderProvider
    AccountProvider
      PlayerProvider
        GolfRoundProvider
          SocialProvider
            LocationProvider
              OnboardingProvider
```

Do not reorder providers without checking hook dependencies between contexts.

## Context overview

| Context | File | Responsibility |
|---|---|---|
| Theme | `ThemeContext.tsx` | Active color palette and theme persistence |
| Header | `HeaderContext.tsx` | Persistent root header slots |
| Account | `AccountContext.tsx` | Supabase session, profile, invite-only OTP, sign-out, `refreshAccount` |
| Player | `PlayerContext.tsx` | Local roster, cloud roster sync, `refreshRoster` |
| Golf round | `GolfRoundContext.tsx` | Courses, current round, scorecard cloud sync, `refreshScorecards` |
| Social | `SocialContext.tsx` | Friends, friend requests, profile cache, `refreshFriendsAndRequests`, `refreshProfiles` |
| Location | `LocationContext.tsx` | Foreground location permission and rangefinder GPS watch |
| Onboarding | `OnboardingContext.tsx` | First-run account/location primer state |

## Hydration model

Each provider exposes `hydrated: boolean`. **Hydration is a one-way latch** — once a provider's `hydrated` flips to `true`, it never flips back to `false`. The splash gate in `app/_layout.tsx` uses `useSplashGate(...)` from `state/useSplashGate.ts`; once all providers have hydrated once, the gate stays open for the rest of the session even if a provider's underlying state churns.

Providers that do ongoing sync work expose a separate `syncing: boolean` (currently only `SocialContext`). Consumers that want "are we ready to render?" use `hydrated`; consumers that want "are we currently re-pulling from cloud?" use `syncing`.

This split was originally added to fix a navigator-unmount cascade: the splash gate would return `null` on any provider's `hydrated === false`, and `SocialContext` was inadvertently flipping `hydrated` back on every account-object-reference change (cosmetic profile edits, hourly `TOKEN_REFRESHED`). The latch + `syncing` split decouples "are we ready to render?" from "are we re-pulling right now?" so transient sync work never tears down navigation. See the May 2026 refactor for the full root-cause analysis.

## Persistence

`persistence.ts` wraps AsyncStorage helpers and key names. Persistence is intentionally granular so each context owns its own data.

Important keys:

- `tee-time:players`
- `tee-time:completed-rounds`
- `tee-time:current-round`
- `tee-time:theme-name`
- `tee-time:onboarding-primers`
- `tee-time:write-queue` (offline write queue — see below)

Supabase auth session persistence is handled by `@supabase/supabase-js` using platform-appropriate storage from `supabaseClient.ts`.

## Auth state

`AccountContext` uses Supabase Auth and the `profiles` table.

Release behavior:

- Email OTP is the only user-facing sign-in method.
- `sendMagicCode` uses `shouldCreateUser: false`.
- New users must be invited/admin-created in Supabase first.
- A Supabase session without a `profiles` row sets `needsProfile = true`.
- `completeProfile` inserts a profile row and refreshes account state.

`refreshFromSession` uses a `shallowEqualAccount` check and a functional `setAccount` updater so identical-payload session refreshes (e.g., `TOKEN_REFRESHED` every hour) preserve the `account` object reference. This dampens cascade re-renders across consumers. It is also exposed publicly as `refreshAccount` (called by the You-tab pull-to-refresh) and returns the standard `{ ok, error }` envelope; a per-refresh generation counter discards stale responses under overlapping pulls. Transient errors during refresh preserve the existing `account` — a pull-to-refresh that hits a 5xx must not log the user out.

If `needsProfile` is true, root layout routes to `/sign-in` so the handle/display-name step can run.

## Scorecard sync

`GolfRoundContext` owns scorecard persistence.

- Completed and in-progress scorecards are stored in Supabase `scorecards`.
- Owner-owned local rounds can be pushed to cloud after sign-in.
- Friend-visible scorecards are provided by RLS, not by client-side filtering alone.
- `refreshScorecards()` runs the cloud pull. It powers both the initial mount-time sync (gated by a per-account sentinel) and explicit pull-to-refresh on every cloud-backed screen (bypasses the sentinel). Race-safe: a per-refresh generation counter ensures only the latest in-flight response writes state, and the merge uses `setCloudRounds(prev => ...)` so a row inserted by a concurrent local mutation (e.g., a score tap committing during refresh) lands in `prev` and is preserved via the `snapshotIds` race-protection guard.

The app is **refresh-only** — no Postgres realtime subscription. Cross-device visibility (e.g., a friend completing a round on their phone) requires the viewer to pull-to-refresh (or manually press Refresh on desktop web). See the May 2026 migration to refresh-only for the rationale.

## Social sync

`SocialContext` loads:

- `friendships`
- `friend_requests`
- `profiles` for friend/profile summaries (lazy cache populated by `ensureProfilesCached`)

Friendships are symmetric rows in the database. The context keeps the current user's friend ids and request lists hydrated for banners, badges, and friend screens.

The initial pull is keyed off `accountUserId` (the primitive) rather than the full `account` object so cosmetic profile updates (e.g., avatar color change) don't re-fire the sync gate. The `refreshFriendsAndRequests` callback reads current `account` fields via a ref so outgoing-request rows always reflect the latest self-profile data without making the callback identity churn on every cosmetic edit.

Public refresh APIs:

- `refreshFriendsAndRequests()` — re-pulls friendships + pending friend_requests. The merge is authoritative (overwrite) — for refresh-only, there are no concurrent realtime events to coordinate with.
- `refreshProfiles(userIds)` — force-refreshes the matching `profileCache` entries so friends' display name / avatar color edits propagate without restarting the app. Returns the standard `{ ok, error }` envelope.
- `ensureProfilesCached(userIds, { force? })` — lazy prefetch; short-circuits on already-cached ids unless `{ force: true }`.

### Roster auto-create on friend accept

`PlayerContext.ensureRosterForFriend(profile)` is an idempotent helper that creates-or-updates a roster row for a linked friend. It uses a deterministic id `player-${userId}` so a stale-id retry from the offline write queue cannot mint a duplicate row. Cloud-side, a partial-unique index on `roster_players (owner_user_id, linked_user_id) WHERE linked_user_id IS NOT NULL` enforces the same invariant — see migration `018_roster_unique_linked_user.sql`.

Receiver-side (accepter): `acceptIncomingRequest` calls `ensureRosterForFriend` + `refreshScorecards` immediately after the RPC succeeds so the new friend and any backfilled rounds appear without a second action.

Sender-side: the sender device sees the new friendship only on their next pull-to-refresh. There is no push notification today.

The `FriendsScreen` (`app/(tabs)/(you)/friends/index.tsx`) never silently hides a friend: rows are rendered from local roster → `profileCache` → placeholder, in that order. The "No friends yet" empty state is keyed off `friends.length === 0`, never the rendered row count.

## Refresh affordances

Every cloud-backed screen exposes a pull-to-refresh gesture (mobile) plus a pinned Refresh button (desktop web — `RefreshControl` has no mouse gesture). Both call `useScreenRefresh([fn1, fn2, ...])` from `state/useScreenRefresh.ts`, which:

- Runs every supplied refresh fn in parallel.
- Short-circuits if a refresh is already in flight.
- Collapses any failure into a single combined toast ("Couldn't refresh. Check your connection and try again.").
- Flips `refreshing` back false in a `finally` so a throw can't strand the spinner.

The `<RefreshButton />` component (`components/RefreshButton.tsx`) is the single source of truth for the desktop-web button look + ActivityIndicator/icon swap. It renders nothing on native.

Per-screen refresh composition:

| Screen | Refresh sources |
|---|---|
| Feed | `refreshScorecards`, `refreshFriendsAndRequests` |
| Rounds list | `refreshScorecards` |
| Round detail | `refreshScorecards`, `refreshProfiles(round.mentionedUserIds + ownerUserId)` |
| Friends list | `refreshFriendsAndRequests`, `refreshProfiles(friends)` |
| You tab | `refreshAccount`, `refreshScorecards`, `refreshRoster` |

## Offline write queue

`state/writeQueue.ts` provides a singleton FIFO queue that wraps every cloud upsert/delete in `PlayerContext` and `GolfRoundContext`. The queue:

- **Coalesces** at enqueue: `upsert + upsert` keeps latest, `upsert + delete` drops both, `delete + upsert` keeps the upsert.
- **Classifies errors**: 5xx / 408 / 429 / 401 / network errors are transient; 403 / 404 / 422 / 23505 are permanent.
- **Retries** transient failures with exponential backoff up to 5 attempts; dead-letters after that.
- **Rolls back** the optimistic local state via a registered rollback handler when an entry dead-letters.
- **Replays** on: queue hydrate + account ready, AppState foreground transition, any subsequent successful direct write, or explicit `flushWriteQueue()`.
- **Persists** the queue to AsyncStorage under `tee-time:write-queue` so pending writes survive app crashes.

Dead-lettered entries log a `console.warn` (toast surfacing is a future polish item).

## Location and rangefinder

`LocationContext` uses `expo-location` for:

- Permission state.
- Course-distance sorting.
- High-accuracy foreground watch while the rangefinder is open.

Native Android rangefinder maps require a Google Maps key in native app config. Web currently renders a rangefinder placeholder.

## Id generation

New entities created locally use UUIDs via `lib/ids.ts` (`newRoundId`, `newPlayerId`, `newCourseId`), backed by `expo-crypto.randomUUID()`. The intentional exception is friend-linked roster rows, which use the deterministic `player-${userId}` id from `ensureRosterForFriend` so the DB unique index can prevent race-induced duplicates.

Existing rows with timestamp-style ids (`round-1234567890`, etc.) are not migrated — they remain valid; only new rows use UUIDs.

## Conventions

- Contexts should expose domain operations, not raw implementation details.
- Log recoverable persistence/network errors with existing context patterns.
- Do not silently swallow Supabase write failures when user action depends on them — funnel them through the offline write queue.
- Keep type safety; avoid `any` casts for Supabase rows unless narrowing is impossible.
- When adding a new context, decide whether it needs `syncing` separate from `hydrated` based on whether it does ongoing cloud work after initial hydration.
