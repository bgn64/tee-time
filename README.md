# Tee Time operations handbook

Tee Time is a private Expo + React Native golf scoring app. This root README is the operator guide for developing, testing, deploying, and publishing the app.

For code structure and design notes, see the folder-level READMEs:

| Area | Docs |
|---|---|
| Routing and screens | `app/README.md` |
| Contexts, persistence, and sync | `state/README.md` |
| Shared UI/platform components | `components/README.md` |
| Database, RLS, tests, and data ops | `supabase/README.md` |
| One-off scripts | `scripts/README.md` |
| Mockups/design artifacts | `docs/README.md` |

## Current release model

| Surface | Audience | Deployment | Backend |
|---|---|---|---|
| Web production | Friends on iPhone/browser | Vercel production from `main` | Production Supabase |
| Web staging | Release smoke tests | Vercel preview from `staging` | Staging Supabase |
| Android preview | Owner/internal install | EAS `preview` APK | Production Supabase |
| Android production | Future store/release build | EAS `production` AAB | Production Supabase |
| Local dev | Development/testing | Expo dev server | Local Supabase via Docker or selected remote env |

Production access is invite-only:

- Supabase public signup is disabled.
- Email auth stays enabled for invite links and returning-user OTP sign-in.
- Google auth is disabled/removed from the release UI.
- Uninvited email OTP attempts should fail.

## Branch and deployment flow

| Branch/profile | Trigger | Expected result |
|---|---|---|
| `staging` | Push to GitHub | Vercel Preview deployment using staging Supabase env vars |
| `main` | Push/merge to GitHub | Vercel Production deployment using production Supabase env vars |
| EAS `preview` | `npx eas-cli@latest build --platform android --profile preview` | Installable Android APK |
| EAS `production` | `npx eas-cli@latest build --platform android --profile production` | Android App Bundle for future store submission |

Vercel is configured so only the intended branch lanes deploy. If this changes, keep the invariant that feature branches do not accidentally publish against production data.

## Required local setup

```powershell
npm install
```

Local `.env` is ignored by git. It may contain:

```text
EXPO_PUBLIC_SUPABASE_URL=<client Supabase URL for local Expo>
EXPO_PUBLIC_SUPABASE_ANON_KEY=<client anon/publishable key>
SUPABASE_URL=<admin/script target Supabase URL>
SUPABASE_SERVICE_ROLE_KEY=<service role key for scripts only>
```

Rules:

- `EXPO_PUBLIC_*` values are bundled into web/native clients and must only contain public client-safe values.
- `SUPABASE_SERVICE_ROLE_KEY` is for local scripts only. Never put it in Vercel, EAS, app code, or committed docs.
- `GOOGLE_MAPS_API_KEY` is currently unused. The in-app GPS rangefinder is hidden — the component code is kept for future re-enablement. Leave the key unset in `.env` / Vercel / EAS until the rangefinder ships again.

## Vercel environment variables

Set these in the existing Vercel project:

| Vercel environment | `EXPO_PUBLIC_SUPABASE_URL` | `EXPO_PUBLIC_SUPABASE_ANON_KEY` |
|---|---|---|
| Preview | Staging Supabase | Staging Supabase anon/publishable key |
| Production | Production Supabase | Production Supabase anon/publishable key |

Vercel web does not currently need a Google Maps key. The in-app GPS rangefinder is hidden in this release; component code remains for future re-enablement.

## Supabase environment setup

Use separate Supabase projects because free tier does not include branches:

| Project | Purpose |
|---|---|
| Production | Real user accounts, friends, rounds, and production course catalog |
| Staging | Preview deploy smoke tests and safe auth/data checks |
| Local Docker | Migration/RLS/function development and DB integration tests |

For both hosted projects:

1. Disable public signup.
2. Keep Email provider enabled.
3. Disable Google provider for the release flow.
4. Configure URL settings.

Production:

```text
Site URL: https://tee-time-two.vercel.app
Redirect URLs:
  https://*.vercel.app/**
  http://localhost:8081/**
```

Staging:

```text
Site URL: https://tee-time-git-staging-benjamin-galindo-navarro-s-projects.vercel.app
Redirect URLs:
  https://*.vercel.app/**
  http://localhost:8081/**
```

See `supabase/README.md` for migration, RLS, and data-copy workflows.

## Validation before publishing

Run these before a production web deploy or Android build:

```powershell
npx tsc --noEmit
npm test
```

For database/RLS changes:

```powershell
npx supabase start
npm run test:db
```

For web export checks:

```powershell
CI=1 EXPO_NO_TELEMETRY=1 npx expo export --platform web
```

## Web release checklist

Staging smoke test from the Vercel `staging` preview URL:

1. Uninvited email sign-in fails.
2. Invite a user from staging Supabase.
3. Invite link lands on the staging preview URL.
4. New invited user reaches profile setup.
5. Profile creation succeeds.
6. Course search shows staging catalog rows.
7. Test scorecard/profile data appears only in staging.

### Navigation & sync regression checks

Added after the May 2026 navigation/sync refactor — verifies the two reported tester bugs and their cousins stay fixed:

8. **No bounce-to-Score on friend-request accept.** With an in-progress round, go to You tab → Friends → tap Confirm on an incoming friend request. The Friends screen must remain visible; `currentRound` must be preserved. Covers Bug 1 and its token-refresh / avatar-color cousins.
9. **Mutual friend visibility without restart.** From device A, send a friend request to user B. From device B, accept it. Without restarting either app, both A and B should see each other in their Friends list (not just the feed). Covers Bug 2 and the sender-side realtime miss.
10. **You tab re-tap pops to root.** Drill into You → Friends; tap the You tab icon; should land on the You profile screen. (Repeat for the Rounds tab → round detail → Rounds tab icon.) Score tab is intentionally unchanged.
11. **Pull-to-refresh actually re-pulls.** From the Feed, pull down to refresh. While the spinner is up, delete a row from the staging Supabase admin dashboard; the row should disappear from the feed (proves the refresh is now a real cloud re-pull, not a 600ms cosmetic spinner).
12. **Offline write recovery.** Open dev tools → Network → Offline. Tap a color swatch on the You tab (cosmetic profile change). The local UI updates. Re-enable the network. The change should sync to cloud on the next foreground transition or subsequent successful write (verify via staging Supabase admin).

Production release from `main`:

1. Confirm checks pass.
2. Merge/push to `main`.
3. Confirm Vercel production deploy is ready.
4. Invite real users from production Supabase.
5. Verify invite/profile/sign-out/sign-in flow.

## Android release checklist

Android identity:

```text
package: com.bgalindonavarro.teetime
versionCode: app.json expo.android.versionCode
runtimeVersion: appVersion policy
```

EAS env:

| EAS environment | Required variables |
|---|---|
| preview | `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY` |
| production | `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY` |

`GOOGLE_MAPS_API_KEY` is no longer required while the rangefinder UI is hidden. If you re-enable the rangefinder later, add the key back to both EAS environments.

Both EAS environments currently point at production Supabase because Android preview is the owner/internal real-use APK, not a staging web preview.

Build preview APK:

```powershell
npx eas-cli@latest build --platform android --profile preview
```

After installing the APK, smoke test:

1. Invite-only email sign-in.
2. Existing user OTP sign-in.
3. Course search.
4. Start/score/finish round.
5. Round sync to production Supabase.
6. Location permission prompt (course-nearby search still uses it).
7. Sign out and sign back in.

## EAS Update flow

EAS Update is configured with `runtimeVersion.policy = appVersion`.

Use OTA updates for JS/assets-only changes that do not require a native rebuild:

```powershell
npx eas-cli@latest update --branch preview --message "Describe preview update"
npx eas-cli@latest update --branch production --message "Describe production update"
```

Native rebuild required when changing:

- Native dependencies.
- Expo plugins.
- Android permissions/config.
- App icon/splash/native assets.
- `app.json` native fields.
- `runtimeVersion`/app version when intentionally cutting a new runtime.

## Database release flow

1. Create or edit SQL migrations under `supabase/migrations/`.
2. Reset/test locally:
   ```powershell
   npx supabase db reset
   npm run test:db
   ```
3. Apply to staging:
   ```powershell
   npx supabase link --project-ref <staging-ref>
   npx supabase db push
   ```
4. Smoke test Vercel preview.
5. Apply to production:
   ```powershell
   npx supabase link --project-ref <production-ref>
   npx supabase db push
   ```

Always verify which project is linked before `db push`.

## Rollback

| Surface | Rollback approach |
|---|---|
| Vercel web | Promote/redeploy a previous Vercel deployment |
| EAS Update | Republish a known-good update to the affected branch |
| Android native | Install a previous APK or ship a new fixed build |
| Supabase schema/data | Prefer forward fixes; write explicit reverse migrations only when safe |

## Friend onboarding notes

- Friends should use the invite email once.
- If a mobile mail app opens the invite in an in-app browser and does not reach profile setup, have them copy the invite link and open it directly in Safari/Chrome.
- Supabase default email may land in spam. For better deliverability later, configure custom SMTP with SPF/DKIM/DMARC.
