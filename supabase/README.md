# Supabase

`supabase/` contains database migrations, local Supabase configuration, and database integration tests.

## Environments

| Environment | Purpose |
|---|---|
| Local Docker | Migration/RLS/RPC development and `npm run test:db`. **Default for all local work.** |
| Staging project | Validated via the staging Vercel preview URL |
| Production project | Real users; only reached via the prod Vercel URL |

Free tier does not include Supabase branches, so staging is a separate project.

**Rule of thumb:** Metro = local Docker; browser = staging or prod via Vercel. The app is browser/PWA-first; native iOS/Android testing against hosted Supabase is out of scope.

## Local development

```powershell
npx supabase start
npx supabase db reset
npm run test:db
```

`db reset` reapplies migrations from scratch and wipes local data.

`.env.local` (gitignored — copy from `.env.example`) should point at the local Docker stack by default. The CLI prints the anon and service-role keys on first `supabase start` — copy them in. Never put staging or production service-role keys in `.env.local`; those live in GitHub Actions secrets.

## Migration workflow

**Schema changes only happen via migrations. Never via the Supabase Dashboard SQL editor on staging or production.** Drift is caught weekly by `.github/workflows/drift-check.yml`.

1. Branch from `staging`.
2. Add SQL migration under `supabase/migrations/`.
3. `npx supabase db reset` locally, then `npm run test:db`.
4. Open a PR into `staging`. CI runs `db start` + the db test suite.
5. Merge to `staging`. `.github/workflows/deploy-staging.yml` runs `supabase db push` against the staging project.
6. Validate the staging Vercel preview URL in a browser.
7. Open a PR `staging` → `main`. CI runs again.
8. Merge to `main`. `.github/workflows/deploy-production.yml` blocks on manual approval (the `production` GitHub Environment), then dumps the prod DB as a workflow artifact, then runs `supabase db push`.

No manual `supabase link` + `supabase db push` from a laptop. Operator overrides are possible via `workflow_dispatch` on either deploy workflow, but should be rare.

## Rollback playbook

Migrations are **forward-only**. To undo a change:

1. Write a new compensating migration (e.g. `021_revert_*.sql`) that reverses the bad one.
2. PR → `staging` → validate → `main`. Same flow as any other change.

For ad-hoc backups before a risky push (most cases are already covered by the prod deploy workflow's artifact):

```powershell
npx supabase link --project-ref <ref>
npx supabase db dump --linked          -f schema.sql
npx supabase db dump --linked --data-only -f data.sql
```

If a prod migration has wrecked things and you need the pre-push state, the most recent prod-deploy workflow run has a `prod-backup-<sha>` artifact retained for 30 days.

## Secrets

| Secret | Where it lives | Used by |
|---|---|---|
| `SUPABASE_ACCESS_TOKEN` (secret) | GitHub repo secret | All deploy/drift workflows |
| `PROJECT_ID` (variable), `DB_PASSWORD` (secret) | GitHub Environment `staging` | `deploy-staging.yml` |
| `PROJECT_ID` (variable), `DB_PASSWORD` (secret) | GitHub Environment `production` | `deploy-production.yml`, `drift-check.yml` |
| Local Docker anon/service-role keys | `.env.local` on operator laptop | Scripts under `scripts/`, db tests |

## Auth / URL configuration (still dashboard-managed)

Auth site URL and redirect URLs differ per environment, so they currently live in each project's Supabase dashboard. The same values are documented here as the source of truth — keep in sync.

Both staging and production should have:

- Public signup disabled.
- Email provider enabled.
- Google provider disabled (until we wire it back up).
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

> Future: moving these into `supabase/config.toml` and running `supabase config push` from the deploy workflows would put them under version control. That requires per-environment substitution (the URLs differ) and was deferred from the initial setup.

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

Catalog rows are ingested **only** by `scripts/ingest-opengolf.ts` using the service role — same script on every environment to keep them in sync. Authenticated users can select catalog rows, but only service-role scripts write them. Don't `pg_dump` catalog between environments and don't hand-write `INSERT`s in migrations.

For staging, never copy user data (`profiles`, `friendships`, `friend_requests`, `scorecards`, custom courses) from production. Use `npm run seed:test-users` to populate dev fixtures instead.

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

Tests run serially because they share one local auth/database instance. `.env.test` (gitignored) holds `SUPABASE_TEST_URL`, `SUPABASE_TEST_ANON_KEY`, `SUPABASE_TEST_SERVICE_ROLE_KEY` — copy from the `npx supabase start` output.

## Security notes

- RLS is the security boundary for client access.
- The anon/publishable key is public by design.
- Service-role keys bypass RLS and must never be used in client builds.
- Realtime publication choices should match user-visible data needs.
- Prefer migrations over dashboard-only schema changes (enforced by the weekly drift check).
