# Scripts

One-off and operational scripts. Not bundled in the app.

Env vars come from `.env.local` (see `.env.example` at the repo root). All
scripts use the **service-role** Supabase key, which bypasses RLS. Never
commit it; never ship it to clients.

By default, `.env.local` should point at the **local Docker** Supabase
stack (`npx supabase start`). To run a script against staging, swap the
URL + keys in `.env.local` for that session — but think twice before
doing it, and never against production.

## `ingest-opengolf.ts` — catalog ingest

`npm run ingest:opengolf` (or `tsx scripts/ingest-opengolf.ts`)

Downloads the [OpenGolfAPI](https://courses.opengolfapi.org/) US bulk
course dataset and upserts every course into the `courses` table as
`source = 'opengolf'`, owner-less catalog rows. This is the **only**
supported way to populate the catalog — same script on every environment
(local, staging, prod) to keep them in sync.

Flags:

- `--dry-run` — parse + print stats, no DB writes.

Prereqs:

- Migration `008_course_catalog.sql` applied to the target project.
- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` in `.env.local`.

Idempotent: rows are keyed on `id = 'opengolf:<uuid>'` and upserted, so
re-running merges upstream updates without duplicates. Custom courses
(`source = 'custom'`) use a different id namespace and are untouched.

Caches the downloaded CSV under `.cache/opengolf/` so re-runs during dev
don't re-download. Delete the cache to force a fresh pull.

Attribution: source data is licensed
[ODbL 1.0](https://opendatacommons.org/licenses/odbl/1-0/). The required
attribution string lives in `lib/attribution.ts` and is rendered in the
app.

## `seed-test-users.ts` — dev login fixtures

`npm run seed:test-users` (or `npm run seed:test-users -- --reset`)

Seeds reusable test accounts (alice / bob / carol / dave) plus a full
friendship mesh between them. Pairs with the `DevAccountPicker`
component on the sign-in screen for one-click multi-account testing.

Flags:

- `--reset` — delete the auth.users rows for every test email first
  (cascade clears their profiles, friendships, roster, scorecards).

Prereqs:

- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` in `.env.local`.
- `PRODUCTION_PROJECT_ID` in `.env.local` (safety guard — the script
  refuses to run if `SUPABASE_URL` contains this ref).

Idempotent: re-running tops up missing accounts/friendships without
duplicating. These accounts are deliberately **not** marked
`is_demo_seed = true`, so they don't auto-friend real signups.
