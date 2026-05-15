# State and persistence

`state/` contains React Context providers for app-wide state, persistence, Supabase auth, sync, realtime subscriptions, onboarding, and location.

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
| Account | `AccountContext.tsx` | Supabase session, profile, invite-only OTP, sign-out |
| Player | `PlayerContext.tsx` | Local roster and player sync |
| Golf round | `GolfRoundContext.tsx` | Courses, current round, scorecards, realtime scorecard sync |
| Social | `SocialContext.tsx` | Friends, friend requests, profile cache, realtime social updates |
| Location | `LocationContext.tsx` | Foreground location permission and rangefinder GPS watch |
| Onboarding | `OnboardingContext.tsx` | First-run account/location primer state |

## Hydration model

Each provider exposes `hydrated: boolean`. **Hydration is a one-way latch** — once a provider's `hydrated` flips to `true`, it never flips back to `false`. The splash gate in `app/_layout.tsx` uses `useSplashGate(...)` from `state/useSplashGate.ts`; once all providers have hydrated once, the gate stays open for the rest of the session even if a provider's underlying state churns.

Providers that do ongoing sync work expose a separate `syncing: boolean` (currently only `SocialContext`). Consumers that want "are we ready to render?" use `hydrated`; consumers that want "are we currently re-pulling from cloud?" use `syncing`.

This split exists because the splash gate previously returned `null` on any provider's `hydrated === false`, and `SocialContext` was inadvertently flipping `hydrated` back on every account-object-reference change. That caused the navigator to remount and reset to its initial route during routine session activity (token refresh, avatar color tweak, etc.) — see the May 2026 refactor for the full root-cause analysis.

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

`refreshFromSession` uses a `shallowEqualAccount` check and a functional `setAccount` updater so identical-payload session refreshes (e.g., `TOKEN_REFRESHED` every hour) preserve the `account` object reference. This dampens cascade re-renders across consumers.

If `needsProfile` is true, root layout routes to `/sign-in` so the handle/display-name step can run.

## Scorecard sync

`GolfRoundContext` owns scorecard persistence.

- Completed and live scorecards are stored in Supabase `scorecards`.
- Realtime listens to `scorecards` changes and merges rows into local state.
- Owner-owned local rounds can be pushed to cloud after sign-in.
- Friend-visible scorecards are provided by RLS, not by client-side filtering alone.
- `refreshScorecards()` re-runs the initial cloud pull on demand (wired to pull-to-refresh on Feed). Race-safe: a per-refresh generation counter ensures only the latest in-flight response writes state, and the merge is by-id so a concurrent realtime INSERT can't be clobbered.

## Social sync

`SocialContext` loads and listens to:

- `friendships`
- `friend_requests`
- `profiles` for friend/profile summaries

Friendships are symmetric rows in the database. The context keeps the current user's friend ids and request lists hydrated for banners, badges, and friend screens.

The initial pull is keyed off `accountUserId` (the primitive) rather than the full `account` object so cosmetic profile updates (e.g., avatar color change) don't tear down the realtime channel and re-pull. The handler reads current `account` fields via a ref so outgoing-request rows always reflect the latest self-profile data.

`refreshFriendsAndRequests()` re-runs the initial pull on demand. The merge for friends/requests is authoritative (overwrite) — realtime events that arrive during the refresh gap are idempotent re-applications.

### Roster auto-create on friend accept

`PlayerContext.ensureRosterForFriend(profile)` is a single idempotent helper that creates-or-updates a roster row for a linked friend. It uses a deterministic id `player-${userId}` so concurrent call sites (accepter inline path + sender realtime path) can never produce duplicate rows. Cloud-side, a partial-unique index on `roster_players (owner_user_id, linked_user_id) WHERE linked_user_id IS NOT NULL` enforces the same invariant — see migration `018_roster_unique_linked_user.sql`.

The `FriendsScreen` (`app/(tabs)/(you)/friends/index.tsx`) never silently hides a friend: rows are rendered from local roster → `profileCache` → placeholder, in that order. The "No friends yet" empty state is keyed off `friends.length === 0`, never the rendered row count.

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
