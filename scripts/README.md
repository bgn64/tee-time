# Scripts

One-off and operational scripts. Not bundled in the app.

## `ingest-opengolf.ts`

Downloads the [OpenGolfAPI](https://courses.opengolfapi.org/) US bulk
course dataset and upserts every course into the `courses` table as
`source = 'opengolf'`, owner-less catalog rows.

### Prereqs

- Migration `008_course_catalog.sql` applied to the target Supabase
  project.
- A local `.env.local` file at the repo root with:

  ```
  SUPABASE_URL=https://<your-project>.supabase.co
  SUPABASE_SERVICE_ROLE_KEY=<service-role-jwt>
  ```

  **The service-role key bypasses RLS.** Never commit it; never ship it
  to clients.

### Usage

```bash
# Validate parsing without touching the database.
npx tsx scripts/ingest-opengolf.ts --dry-run

# Real run — upserts ~17k catalog rows.
npx tsx scripts/ingest-opengolf.ts
```

The script caches the downloaded CSV under `.cache/opengolf/` so re-runs
during dev don't re-download. Delete `.cache/opengolf/` to force a
fresh pull (e.g. weekly to pick up upstream edits).

### Idempotence

Catalog rows are keyed on `id = 'opengolf:<uuid>'`. Upserts merge by
`id`, so re-running picks up upstream updates without duplicating rows.
Custom courses (`source = 'custom'`) use a separate id namespace and
are untouched by this script.

### License + attribution

Source data is licensed under
[ODbL 1.0](https://opendatacommons.org/licenses/odbl/1-0/). The required
attribution string ("Course data from OpenGolfAPI, ODbL") is exported
from `lib/attribution.ts` and rendered in the app on the You → About
page and the course detail card.
