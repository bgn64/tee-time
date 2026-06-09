# Tee Time

A private Expo + React Native golf scoring app for a small friend group. Web (Vercel) is the primary surface; native Android is paused.

> **Migration status:** the client has been migrated **off PowerSync** to Supabase REST + [TanStack Query](https://tanstack.com/query) caching, with a persistent write outbox (`src/library/data/writeOutbox.ts`) for offline-resilient score entry. The PowerSync infrastructure (cloud service, replication slot) is no longer used by the app and is pending teardown — the planned follow-up is to drop it and move back to a smaller Supabase plan. The PowerSync-specific operations sections below are legacy and apply only until that teardown is done.

This README is the operations handbook. For per-area code structure see the folder-level docs (`src/app/`, `src/library/`, `src/components/`, `supabase/`, `scripts/`).

## Stack

| Layer | Choice |
|---|---|
| App framework | Expo 56 + Expo Router 56 (file-based routing under `src/app/`) |
| Data layer | Supabase REST via `@supabase/supabase-js`, cached with TanStack Query (`@tanstack/react-query`); offline-resilient score writes via a persistent AsyncStorage outbox (`src/library/data/writeOutbox.ts`) |
| Backend | Supabase (Postgres + auth + REST; RLS scopes every read to own + friend rows) |
| Web deploy | Vercel (auto-build on push to `main`) |
| DB deploy | GitHub Actions (`.github/workflows/deploy-production.yml`) — see [Deploy model](#deploy-model) |
| Course catalog | OpenGolfAPI bulk CSV (ingested via `scripts/ingest-opengolf.ts`) + lazy enrichment via `src/library/golf/courseEnrichment.ts` |

Supabase Postgres is the source of truth for everything users read in-app: `scorecards`, `scorecard_scores`, `profiles`, `friendships`, `friend_requests`, `custom_players`, `comments`, `round_likes`. The app reads them over REST (TanStack Query), with RLS scoping each query to the caller's own + friends' rows; reads refresh on demand / pull-to-refresh rather than live-syncing. The `courses` catalog is queried via Supabase REST and snapshots the picked course onto each new scorecard at `startRound` time.

## Current release model

| Surface | Audience | Deploy |
|---|---|---|
| Web production | Friend group | Vercel from `main` |
| Web "staging" | Manual sandbox / pre-merge feature branches | Vercel preview deploys per branch (no auto-promote) |
| Android | Paused | EAS configs deferred; old APK no longer compatible with the post-PowerSync schema |
| Local dev | This repo | `npm run web` against either local Supabase (`npx supabase start`) or staging |

Production access stays invite-only: Supabase public signup is disabled; magic-link email auth only; uninvited emails fail.

## Quick start (local)

```powershell
npm install
npx supabase start            # local Postgres + auth + studio (Docker required)
npm run web
```

Local `.env.local` (gitignored) needs at minimum:

```text
EXPO_PUBLIC_SUPABASE_URL=<staging URL OR http://127.0.0.1:54321 for local>
EXPO_PUBLIC_SUPABASE_ANON_KEY=<matching anon/publishable key>
```

`EXPO_PUBLIC_*` values are bundled into the client and must be safe to ship. Server-side scripts (`scripts/`) take `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` from a per-environment file passed via `--env`:

```powershell
npm run ingest:opengolf -- --env .staging.env
```

`.staging.env` and `.prod.env` are gitignored. Templates: copy from `.env.local.template` and fill in.

## Project layout

```
src/
  app/                  expo-router screens (file-based routing)
  components/           shared UI primitives (CourseRow, PlayerChip, ReadOnlyScorecard, etc.)
  library/
    golf/               domain logic (RoundContext, scoring, teams, course helpers, useCourses, courseEnrichment)
    powersync/          AppSchema + system (PowerSync wiring, KV storage adapter)
    social/             AccountContext, FriendsContext, profile cache
    supabase/           SupabaseConnector (upload connector for PowerSync CRUD)
    theme/              ThemeContext + semantic color tokens
    utils/              uuid, alert, etc.
  data/                 (intentionally empty — courses come from the DB now, not from seeds)
  types/                Course / Tee / Hole / RoundParticipant / etc.

supabase/
  migrations/           002_…009_… — applied in order by `supabase db push`
  tests/                (optional) Postgres-level RLS / RPC tests

powersync/
  cli.yaml              points at staging instance (used for local dev)
  service.yaml          staging service config (NOT deployed by CI — prod's service.yaml is owned by the PowerSync dashboard)
  sync-config.yaml      sync streams — deployed to prod by CI when this file changes

scripts/
  ingest-opengolf.ts    upserts OpenGolfAPI bulk CSV into the `courses` table
  validate-cutover.ts   one-off post-cutover validation (kept for posterity)

.github/workflows/
  deploy-production.yml  see [Deploy model](#deploy-model)

prod-backups/           (gitignored if you create this dir locally) snapshots of prod DB
```

## Branching + PR conventions

- `main` is the **only deployed branch**. Vercel + the GH Action both fire on every push to `main`.
- All changes land via PR. Branch protection on `main` requires PR + status checks.
- Feature branches: `feat/<short-name>`. Use `docs/<short-name>` for doc-only, `fix/<short-name>` for hotfixes.
- Staging-style validation = open the PR, use the Vercel preview URL to test, then merge.

## Deploy model

`.github/workflows/deploy-production.yml` runs on every push to `main` and has three jobs:

| Job | Trigger | What it does |
|---|---|---|
| `changes` | always | Probes which paths changed (uses `dorny/paths-filter@v3`); outputs `db` / `powersync` flags |
| `deploy-db` | `db` flag OR manual dispatch | `supabase link` → backup prod DB (uploaded as `prod-backup-<sha>` artifact, 30-day retention) → `supabase db push` |
| `deploy-powersync` | `powersync` flag OR manual dispatch | Generates a prod-targeting `.powersync-prod/` config dir (because the committed `powersync/cli.yaml` points at staging) → `powersync deploy sync-config --directory .powersync-prod` |

Vercel runs independently from the GH Action — it picks up the same push and rebuilds the web bundle.

Both deploy jobs bind to the `production` GitHub environment. Configure required reviewers there to add a manual approval step.

### Required GitHub secrets / variables

Settings → Secrets and variables → Actions:

| Type | Name | Scope |
|---|---|---|
| Secret | `SUPABASE_ACCESS_TOKEN` | Repository |
| Secret | `DB_PASSWORD` | `production` environment |
| Secret | `POWERSYNC_PS_ADMIN_TOKEN` | `production` environment |
| Variable | `PROJECT_ID` | `production` environment — production Supabase project ref |
| Variable | `POWERSYNC_PROD_INSTANCE_ID` | `production` environment |
| Variable | `POWERSYNC_PROD_PROJECT_ID` | `production` environment |
| Variable | `POWERSYNC_PROD_ORG_ID` | `production` environment |

### Required Vercel env vars

Vercel project → Settings → Environment Variables → Production scope:

- `EXPO_PUBLIC_SUPABASE_URL`
- `EXPO_PUBLIC_SUPABASE_ANON_KEY`
- `EXPO_PUBLIC_POWERSYNC_URL` (the prod PowerSync slot's URL)

## Schema migrations

1. Add SQL under `supabase/migrations/NNN_short_name.sql`. Number sequentially.
2. Test locally:
   ```powershell
   npx supabase db reset
   ```
   This wipes local Postgres and reapplies every migration in order.
3. Open PR → review → merge to `main`.
4. The `deploy-db` job runs `supabase db push --linked` against prod, with a pre-push backup artifact.

Migrations are **forward-only**. To undo a change, write a compensating migration (e.g. `010_revert_*.sql`). Don't edit applied migrations.

### Migration history note (one-time legacy artifact)

Prod was migrated from an older codebase in May 2026. To align history, `001` is marked as `reverted` in prod's `supabase_migrations.schema_migrations`, and `002` through `007` (which describe a from-scratch schema that prod doesn't need to re-apply) are marked `applied` via `supabase migration repair`. The actual cutover ran via `008_courses.sql` + `009_cutover_from_legacy.sql`. Migration 010 onwards behaves normally.

## PowerSync sync rules

The single source of truth is `powersync/sync-config.yaml`. Edit it, open a PR, merge to `main`. The `deploy-powersync` job pushes it to the prod slot via `powersync deploy sync-config`.

The `powersync/service.yaml` file in the repo is for **local / staging only**. The production slot's service config (DB connection, JWT auth) is owned by the PowerSync dashboard — adding it to CI would require shipping the prod DB password through env-var substitution, which is deferred. If you ever want to bring prod's service config into the repo, see [PowerSync CLI docs on multi-environment setups](https://docs.powersync.com/usage/tools/cli).

### Setup gotcha: Supabase auth

The prod PowerSync slot must have **Use Supabase auth** checked in the dashboard (= `client_auth.supabase: true` in service.yaml). Without it, every sync attempt fails with `PSYNC_S2101: Could not find an appropriate key in the keystore`. This is set per-slot, not per-project.

### Setup gotcha: `powersync_role`

The prod Supabase project must have a `powersync_role` user with replication + SELECT permissions. Run this once on prod via the dashboard SQL editor:

```sql
CREATE ROLE powersync_role
  WITH REPLICATION BYPASSRLS LOGIN PASSWORD '<random>';

GRANT USAGE  ON SCHEMA public TO powersync_role;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO powersync_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT ON TABLES TO powersync_role;
```

The chosen password goes into the PowerSync prod slot's data source config (`powersync_role` as username, the password you picked).

## Course catalog

`scripts/ingest-opengolf.ts` populates the `courses` table from the OpenGolfAPI US bulk CSV. ~14k catalog rows. Idempotent (upserts on `id`); same script runs against local / staging / prod.

```powershell
npm run ingest:opengolf -- --env .prod.env
```

The bulk CSV has known gaps in per-hole par/yardage data. The app handles this via **lazy enrichment**: when a user picks a catalog course that doesn't have `holes` populated, `useCourse(id)` automatically calls the OpenGolfAPI `/v1/courses/:id` endpoints and writes the enriched data back via the `enrich_catalog_course` RPC. See `src/library/golf/courseEnrichment.ts`.

Custom (user-created) courses use a different id namespace (`custom:<uuid>`) and never need enrichment.

## Backup / rollback

Every deploy that touches the DB uploads a `prod-backup-<sha>` artifact (schema.sql + data.sql, 30-day retention). Find them under the workflow run's Artifacts.

To restore from a backup:

```powershell
# 1. Download prod-backup-<sha> from the GH Actions run
# 2. Pipe through psql via Docker against prod (DANGER — full schema replace):
docker exec -i supabase_db_<local-instance> psql -U postgres "$PROD_DB_URL" < schema.sql
docker exec -i supabase_db_<local-instance> psql -U postgres "$PROD_DB_URL" < data.sql
```

In practice, prefer **forward fixes** (write a compensating migration) over restore. Only restore for catastrophic data loss.

## Common gotchas

- **Vercel 404 at root** — `vercel.json` is required. It declares `outputDirectory: dist`, sets the `expo export` build command, and adds SPA fallback rewrites. Without it, Expo Router routes 404 because Vercel's auto-detection doesn't add the SPA rewrites.
- **`powersync/cli.yaml` points at staging** — by design (for local dev). The prod GH Action generates a separate `.powersync-prod/cli.yaml` at deploy time so it doesn't matter.
- **`supabase db push` says "Remote migration versions not found in local"** — usually means a stale entry in `supabase_migrations.schema_migrations`. Use `supabase migration repair --status reverted <version>` to remove untracked entries.
- **`react-hooks/set-state-in-effect` ESLint failure** — React 19 strict rule. Don't call `setState` synchronously at the top of an effect; derive idle state from inputs instead. See `src/library/golf/useCourses.ts` for an example pattern.

## Validation before publishing

```powershell
npx tsc --noEmit
npm run lint
```

For schema changes, additionally reset local and reapply:

```powershell
npx supabase db reset
```

(There's no `npm test` yet — the Jest setup from the old repo wasn't ported. If you add tests later, hook them into the workflow as a status check.)
