# Supabase

`supabase/` contains database migrations, local Supabase configuration, and database integration tests.

## Environments

| Environment | Purpose |
|---|---|
| Local Docker | Migration/RLS/RPC development and `npm run test:db` |
| Staging project | Vercel preview smoke tests and safe remote validation |
| Production project | Real users, friends, rounds, and production catalog data |

Free tier does not include Supabase branches, so staging is a separate project.

## Local development

```powershell
npx supabase start
npx supabase db reset
npm run test:db
```

`db reset` reapplies migrations from scratch and wipes local data.

## Migration workflow

1. Add SQL migration under `supabase/migrations/`.
2. Reset/test locally.
3. Link staging and push:
   ```powershell
   npx supabase link --project-ref <staging-ref>
   npx supabase db push
   ```
4. Smoke test Vercel staging preview.
5. Link production and push:
   ```powershell
   npx supabase link --project-ref <production-ref>
   npx supabase db push
   ```

Always verify the linked project before pushing. The CLI link is local repo state.

## Auth configuration

Hosted staging and production should both use:

- Public signup disabled.
- Email provider enabled.
- Google provider disabled for the release flow.
- Invite emails for onboarding.

Production URL settings:

```text
Site URL: https://tee-time-two.vercel.app
Redirect URLs:
  https://*.vercel.app/**
  http://localhost:8081/**
```

Staging URL settings:

```text
Site URL: https://tee-time-git-staging-benjamin-galindo-navarro-s-projects.vercel.app
Redirect URLs:
  https://*.vercel.app/**
  http://localhost:8081/**
```

## Data model summary

Core tables:

- `profiles` - app profile linked to `auth.users`.
- `roster_players` - user's private roster of people they golf with.
- `courses` - shared course catalog plus private custom courses.
- `scorecards` - owner-owned round/scorecard records.
- `friend_requests` - pending/accepted/declined friend request workflow.
- `friendships` - symmetric friend graph rows.

The current scorecard model is owner-centric:

- A scorecard belongs to its scorer.
- Only the owner edits/deletes it.
- RLS visibility is owner or friend-of-owner.
- Named participants do not receive edit rights or stats credit by being named.

## Course catalog

`courses.source` distinguishes row kind:

| Source | Meaning |
|---|---|
| `opengolf` | Global read-only catalog rows; `owner_user_id IS NULL` |
| `custom` | Private user-created rows; `owner_user_id` is set |

Catalog rows are ingested by `scripts/ingest-opengolf.ts` using the service role. Authenticated users can select catalog rows, but only service-role scripts should write them.

For staging, copy only safe catalog rows. Do not copy production user data:

- Do copy selected `courses` rows where `source = 'opengolf'`.
- Do not copy `profiles`, `friendships`, `friend_requests`, `scorecards`, or custom user courses unless explicitly needed.

## Tests

Database tests live under `supabase/tests/` and run against the local Supabase stack:

```powershell
npm run test:db
```

Covered areas include:

- RLS visibility.
- Owner CRUD happy paths.
- Non-owner write rejections.
- RPC behavior.
- Trigger/schema invariants.

Tests run serially because they share one local auth/database instance.

## Security notes

- RLS is the security boundary for client access.
- The anon/publishable key is public by design.
- Service-role keys bypass RLS and must never be used in client builds.
- Realtime publication choices should match user-visible data needs.
- Prefer migrations over dashboard-only schema changes.
