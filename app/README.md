# App routes

`app/` contains the Expo Router file-based route tree. Use this README when changing navigation, onboarding, auth entry points, or screen flow.

## Route model

Expo Router uses two key primitives:

- Parentheses groups like `(tabs)`, `(score)`, `(rounds)`, `(feed)`, and `(you)` create navigators without adding URL path segments.
- `_layout.tsx` files define stacks/tabs for all routes under them.

Current high-level tree:

```text
RootStack                          app/_layout.tsx
├── sign-in                        Email OTP/profile flow
├── onboarding                     First-run primers
└── (tabs)                         Bottom tab shell
    ├── (feed)                     Friend/live feed
    ├── (rounds)                   Completed round list/detail
    ├── (score)                    Course selection and scoring
    └── (you)                      Profile/settings/friends
```

## Root layout responsibilities

`app/_layout.tsx`:

1. Loads fonts and prevents the splash screen from hiding too early.
2. Mounts global providers in the required order.
3. Renders the persistent `AppHeader`.
4. Gates rendering until persisted contexts hydrate.
5. Routes first-run users through account/location onboarding.
6. Routes signed-in users without profiles to `/sign-in` so they can finish profile setup.

Provider order matters:

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

## Invite-only auth flow

Release auth is email-only and invite-only:

1. Admin sends Supabase invite email.
2. User opens invite link.
3. Supabase creates a web session.
4. `AccountContext` sees a session with no `profiles` row.
5. Root layout redirects to `/sign-in`.
6. Sign-in screen shows the handle/display-name step.
7. `completeProfile` inserts `profiles`.
8. User enters the app.

Returning users sign in through OTP. `sendMagicCode` sets `shouldCreateUser: false`, so uninvited emails cannot create accounts from the app.

## Onboarding primers

`app/onboarding/account.tsx` is a soft prompt to sign in. Its primary action navigates to `/sign-in` but does not mark account onboarding accepted. Account onboarding becomes accepted only after `AccountContext.account` exists.

`app/onboarding/location.tsx` is the shared permission primer for all flows. It requests foreground location permission and then drops users into the Score tab. The same location primer should be used whether a user arrived by invite or signs in later on a fresh device.

## Score flow

The Score tab walks through:

```text
Course Selection
  -> Player/format setup
  -> Scoring
  -> Finish/abandon
```

The active scoring screen is intentionally locked:

- `router.replace(...)` is used when entering scoring so the user cannot gesture back into setup.
- Android back is intercepted while scoring.
- Finish/abandon are the supported exits.

## Header slots

Screens do not use native navigator headers. They register content into the persistent root header via `useScreenHeader`.

```tsx
useScreenHeader({
  left: { kind: 'back', label: 'Course', onPress: () => router.back() },
  right: { kind: 'menu', onPress: () => setMenuOpen(true) },
});
```

## Route conventions

- Keep screens functional and hook-based.
- Import internal modules with `@/`, not long relative paths.
- Keep one route file responsible for one screen.
- Use route groups for organization without changing user-facing paths.
