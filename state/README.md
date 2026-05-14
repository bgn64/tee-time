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

## Persistence

`persistence.ts` wraps AsyncStorage helpers and key names. Persistence is intentionally granular so each context owns its own data.

Important keys:

- `tee-time:players`
- `tee-time:completed-rounds`
- `tee-time:current-round`
- `tee-time:theme-name`
- `tee-time:onboarding-primers`

Supabase auth session persistence is handled by `@supabase/supabase-js` using platform-appropriate storage from `supabaseClient.ts`.

## Auth state

`AccountContext` uses Supabase Auth and the `profiles` table.

Release behavior:

- Email OTP is the only user-facing sign-in method.
- `sendMagicCode` uses `shouldCreateUser: false`.
- New users must be invited/admin-created in Supabase first.
- A Supabase session without a `profiles` row sets `needsProfile = true`.
- `completeProfile` inserts a profile row and refreshes account state.

If `needsProfile` is true, root layout routes to `/sign-in` so the handle/display-name step can run.

## Scorecard sync

`GolfRoundContext` owns scorecard persistence.

- Completed and live scorecards are stored in Supabase `scorecards`.
- Realtime listens to `scorecards` changes and merges rows into local state.
- Owner-owned local rounds can be pushed to cloud after sign-in.
- Friend-visible scorecards are provided by RLS, not by client-side filtering alone.

## Social sync

`SocialContext` loads and listens to:

- `friendships`
- `friend_requests`
- `profiles` for friend/profile summaries

Friendships are symmetric rows in the database. The context keeps the current user's friend ids and request lists hydrated for banners, badges, and friend screens.

## Location and rangefinder

`LocationContext` uses `expo-location` for:

- Permission state.
- Course-distance sorting.
- High-accuracy foreground watch while the rangefinder is open.

Native Android rangefinder maps require a Google Maps key in native app config. Web currently renders a rangefinder placeholder.

## Conventions

- Contexts should expose domain operations, not raw implementation details.
- Log recoverable persistence/network errors with existing context patterns.
- Do not silently swallow Supabase write failures when user action depends on them.
- Keep type safety; avoid `any` casts for Supabase rows unless narrowing is impossible.
