# Tee Time

A mobile-first, private golf scoring app built with Next.js, TypeScript,
Better Auth, and SQLite. The approved **Signal** design uses dark slate panels,
cyan accents, and concise, functional controls throughout the authenticated app.

## Golf app

The root opens the protected dashboard; signed-out visitors go to sign-in.
The production app saves to SQLite, independently of the fictional preview.

- Individual stroke play and team scrambles, linked friends and guest players,
  individual tee choices, and optional per-hole statistics.
- Score any hole in any order, clear a score, and finish after any recorded hole.
  New rounds do not require a front/back/full-round declaration.
- Search the imported course catalog or create a personal scorecard. Catalog
  entries without hole details must be completed as a personal copy before play;
  par, tees, and yardages are never fabricated.
- Saved scorecards, history pagination, ordered scramble shot contributors,
  round notes, custom binary/integer statistics, and personal statistics.
- Private rounds by default, explicit Friends visibility, friend requests,
  comments, likes, and owner-controlled score editing.

### Saving and statistics

Scoring is **online-first**, not an offline-sync app. Changes are serialized and
only show Saved after the server acknowledges them. Failed or timed-out requests
retain the current tab's draft and offer Retry with the same mutation ID, so a
lost acknowledgment cannot double-apply a save. A stale version requires an
explicit reload/discard decision. Navigation is blocked while round edits are
unsaved, and leaving/reloading the page prompts a browser warning. Unacknowledged
drafts are not durable across browser termination; wait for Saved before leaving.

Blank scores mean unplayed, never zero. Relative totals only use scored holes
with known par. Full-round stroke averages are separated by hole count; partial
rounds and scrambles are excluded. Putts/FIR/GIR show recorded coverage, not
assumed zeroes or misses. Historical front/back-nine scope is retained for
completed rounds; reopening restores access to the full saved course snapshot.

### Design previews

Local development retains `/preview` (the approved Signal mock-up) and
`/preview/directions` (Sport, Field Notes, and Signal comparison screens).
These are public, fictional, memory-only demos; "Demo saved" is simulated.
They do not import or expose real golf data. The container build excludes both
preview routes and their fixtures.

The package feed used for development supplies Better Auth 1.7.10 rather than
the scaffold's unavailable 1.7.12. The dependency floor and lockfile were
regenerated with the available stable version; `npm run test:auth` validates
the existing authentication behavior.

## Local setup

Use Node.js 24 LTS with native TypeScript stripping (tested on Node 24.22.1).
Run commands from the project directory.

1. Install dependencies with `npm ci` if they are not already installed.
2. Copy the environment example:

   ```powershell
   Copy-Item .env.local.example .env.local
   node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"
   ```

   Paste the generated secret into `BETTER_AUTH_SECRET` in `.env.local`.
   Keep `BETTER_AUTH_URL=http://localhost:3000` without a trailing slash.
   Use the same hostname and port in your browser. Restart the app after changing
   environment configuration. Never share or commit the generated secret.

3. Initialize/update the schema:

   ```powershell
   npm run db:migrate
   ```

   This applies the Better Auth and golf schemas. It is repeatable and does not
   reset the database. Back up existing data before applying upgrades.

4. Create a household account:

   ```powershell
   npm run account:create
   ```

   Enter a name, email, and a password of 12-128 characters. Password input is
   masked and is not passed as a command argument. Repeat for additional accounts.
   The command needs an interactive terminal. Duplicate emails and invalid inputs
   are rejected; database errors are reported rather than ignored.

5. Start the app:

   ```powershell
   npm run dev
   ```

   Open <http://localhost:3000> and sign in with your household account.
   `/dashboard` checks the session before returning golf data.
   Signing out revokes the session and returns to `/login`.

## Accounts and access

Public signup is disabled on the server, including direct API requests. Only the
local account command enables account creation in its own isolated auth instance.
No default account or password is shipped. There is no email verification,
password-reset email, or password-management UI. Golf profiles and handles are
editable in the app. Use a password manager;
contact the household administrator for account issues.

Authentication is enforced on the dashboard and every golf API request.
Owners alone can change their scores, roster, personal courses, and definitions.
Friends can read only explicitly shared rounds while the friendship exists;
there are no public scorecard links. Removing a friendship removes access.
Comment authors and round owners can delete comments.

## Import the historical Supabase golf data

**Real account provisioning and import are explicit setup steps.** No Supabase
passwords, authentication tables, sessions, or provider identities are imported.
Create all three local accounts first using the interactive administrator
command, with the agreed account emails. Do not send passwords through chat.

The ignored local `data/legacy-accounts.json` contains the approved mapping.
For a different installation, create a private JSON object mapping each legacy
profile UUID to the exact email of an existing local account:

```json
{
  "legacy-profile-uuid": "existing-account@example.com"
}
```

Each historical profile must map to a distinct account. Nicknames are never
used to guess ownership. From the project directory:

```powershell
npm run db:migrate
npm run golf:import -- --dump ".\db_cluster-12-10-2026@23-14-40.backup.gz" --mapping ".\data\legacy-accounts.json" --dry-run
npm run golf:import -- --dump ".\db_cluster-12-10-2026@23-14-40.backup.gz" --mapping ".\data\legacy-accounts.json"
```

The importer parses allowlisted golf COPY sections; it **never executes dump
SQL**. Dry-run validates the complete conversion and rolls back imported rows.
A real import first makes a consistent `.before-golf-<timestamp>.sqlite` backup.
Unresolved identities, orphaned records, conflicting scores, or unsupported
nonempty normalized tee tables fail explicitly, rolling back the import.
Retain the original compressed source and pre-import database backup privately.

The supplied source reconciles to 3 profiles, 14,023 catalog courses, 27 rounds,
425 canonical scores, 201 hole-detail rows, 19 stroke-attribution rows,
33 comments, and 5 likes. All 153 JSON score entries overlap normalized scores
after resolving explicit owner aliases; they are not additional scores.
Repeated/unassigned contributor positions, unknown values, soft-deletion
metadata, historical configurations, and original golf rows are preserved.
Imported credentials and infrastructure tables are excluded.

Import is transactional and source/mapping-fingerprinted. Repeating the same
import is a no-op, preserving subsequent edits; changing mappings for an
already imported source is rejected. Canonical scorecards are stored once,
with an additional server-only raw golf archive for source fidelity.

### Course data licensing

The imported catalog identifies its source as `opengolf`. Catalog screens
include attribution: **Contains data from OpenGolfAPI (opengolfapi.org)**,
plus OpenStreetMap contributor and license links.
[OpenGolfAPI data](https://github.com/opengolfapi/data) is licensed under
[ODbL 1.0](https://opendatacommons.org/licenses/odbl/1-0/).
Preserve attribution and review ODbL share-alike obligations before distributing
the catalog or a derived database. Private personal scoring data is separate
from the course catalog; do not publish the household database or source dump.

## Data and environment

`DATABASE_PATH` defaults to `./data/tee-time.sqlite`, relative to the project
directory. Accounts and sessions survive app restarts. SQLite may also create
`-wal` and `-shm` sidecar files. Local data and environment files are excluded
from source control; `.env.local.example` contains no secret and is safe to share.

Keep the database on local disk. Use SQLite's backup facilities or stop all app
processes before copying the database for a consistent backup. Do not delete
the database to resolve a migration issue.

## Validation

```powershell
npm run lint
npx next typegen
npx tsc --noEmit
node --test scripts\golf.test.mts scripts\preview.test.mts scripts\auth.test.mts
npm run build
```

The auth test creates a temporary database, verifies repeatable migrations,
account creation, validation failures, persistence after reopening, signup
rejection, login, separate sessions, CSRF protection, and session revocation.
It does not alter household data. Golf tests cover import reconciliation,
rollback, retry idempotency, version conflicts, permissions, statistics,
custom values, contributor ordering, and reopened-file persistence.
The real-backup test runs when the ignored source file exists locally and
skips when it is absent. There are currently 17 tests across the three suites.

Browser validation used disposable accounts and a separate imported database:
mobile widths 360/390/430 and desktop 1280, sign-in/out, rapid scoring,
network failure and retry, lost acknowledgments, stale-write reload, partial
finish, course/guest creation, comments, likes, and dialog focus containment.
This is not a claim of a complete accessibility audit.

For a browser check, visit `/dashboard` while signed out, try an incorrect
password, sign in successfully, refresh, sign out, and revisit `/dashboard`.
Private details must never be returned to a signed-out visitor.

## Container deployment (LAN or Tailscale)

Install Docker Engine with the Compose plugin on the server (or Docker Desktop
using Linux containers). Node.js is not required on the host. The multi-stage
image builds with Node 24 LTS, runs the standalone production server as a non-root
user, and retains the migration/account/import commands. Local environment files,
databases, and dependencies are excluded from the build context. Builds require
internet access for the base image, packages, and Google Fonts.
The dependency lockfile currently downloads packages from
`ms-feed-25.pkgs.visualstudio.com`; the Docker host must also be able to reach
that feed. Installation from a home network has not yet been verified.

1. Copy `.env.container.example` to `.env.container` and generate a secret:

   ```powershell
   Copy-Item .env.container.example .env.container
   docker run --rm node:24-bookworm-slim node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"
   ```

   Set `BETTER_AUTH_SECRET` to the result. Protect this file like a password.
   No real secret or household database is needed during the image build; its
   temporary auth configuration is not used by the running container.

2. Choose the listening address and browser URL in `.env.container`:

   - For a test on the Docker host, keep the localhost defaults.
   - For Tailscale-only access, set `APP_BIND_ADDRESS` to the server's Tailscale
     IPv4 address, and `BETTER_AUTH_URL` to `http://<tailscale-ip>:3000`.
   - For LAN access, use the server's LAN IPv4 address instead.

   `APP_PORT` changes the host port; include it in `BETTER_AUTH_URL`. For example,
   a local test on port 3001 needs both `APP_PORT=3001` and
   `BETTER_AUTH_URL=http://localhost:3001`. The auth URL
   must exactly match the origin you use in the browser, without a trailing slash.
   Use one consistent address on all devices; use the Tailscale address on the
   LAN too when accessing via Tailscale. Avoid `0.0.0.0` unless you intentionally
   want all host interfaces exposed. The selected address must exist when Docker
   starts the container.

   No public domain or internet-facing reverse proxy is needed. Keep router port
   forwarding disabled and restrict access with your host firewall and Tailscale
   policy. Tailscale encrypts the device-to-server connection; plain LAN HTTP does
   not encrypt passwords or session cookies. Use Tailscale or HTTPS for sign-in
   on untrusted networks. For optional Tailscale Serve HTTPS, keep the localhost
   binding and set the auth URL to the HTTPS origin supplied by Serve.

3. Build, initialize the database, and create an account:

   **Moving the already-migrated database?** Follow
   [Moving an existing database to the home server](#moving-an-existing-database-to-the-home-server)
   instead. Do not create replacement accounts or rerun the Supabase import.

   ```text
   docker compose --env-file .env.container build
   docker compose --env-file .env.container run --rm app npm run db:migrate
   docker compose --env-file .env.container run --rm app npm run account:create
   docker compose --env-file .env.container up -d
   docker compose --env-file .env.container ps
   ```

   Account creation needs an interactive terminal. Migrations are explicit rather
   than automatically modifying the schema on every restart. Do not start the
   server if migration fails. Open your configured URL, sign in, refresh, and sign
   out; check that `/dashboard` is inaccessible after signing out.

The `app-data` named volume holds SQLite and its WAL/SHM files on the server's
local disk. It survives rebuilds, container replacement, and `docker compose down`.
**Do not use `down -v`**, which deletes this volume. Existing development data is
not imported automatically. Keep this a single app instance.

For logs and an additional account while the server is running:

```text
docker compose --env-file .env.container logs --tail=100 app
docker compose --env-file .env.container exec app npm run account:create
```

The health check probes the login page. Docker restarts a crashed app, but a
health-check failure alone does not trigger a restart.

### Moving an existing database to the home server

Move a **consistent SQLite snapshot**, not the Git-ignored live database file
by itself. The database includes accounts/password hashes, golf data, and
sessions. It is sensitive: transfer it over an encrypted channel (for example
SCP over Tailscale) or encrypted removable storage. Never commit it, upload it
to a PR, or place it in `public`.

1. On the original computer, create a single-file snapshot with SQLite's online
   backup API. This includes committed WAL contents while the app is running.
   From PowerShell in the repository:

   ```powershell
   node --input-type=module -e 'import env from "@next/env"; import Database from "better-sqlite3"; import {existsSync} from "node:fs"; import {resolve} from "node:path"; env.loadEnvConfig(process.cwd()); const out=resolve("data\\tee-time-transfer.sqlite"); if(existsSync(out))throw Error("Snapshot already exists; choose a new filename."); const db=new Database(resolve(process.env.DATABASE_PATH||"data\\tee-time.sqlite"),{readonly:true,fileMustExist:true}); try{await db.backup(out);}finally{db.close();} console.log(out);'
   Get-FileHash .\data\tee-time-transfer.sqlite -Algorithm SHA256
   ```

   If a snapshot was already prepared for this move, use that file rather than
   rerunning the command. A snapshot contains data only as of its creation.
   Stop recording rounds on the old instance after the final export; the two
   databases do not synchronize. If you make more changes, create a new snapshot
   under a new filename and use that for the cutover.

2. Transfer `tee-time-transfer.sqlite` privately to a dedicated directory on the
   Docker host, and verify its SHA-256 matches the original. On Linux:

   ```sh
   sha256sum /absolute/private/golf-transfer/tee-time-transfer.sqlite
   ```

   The container's `node` user (UID 1000) must be able to read the file and
   traverse its directory. Grant access appropriately; do not make the backup
   world-readable. The original Supabase dump and legacy mapping are not needed
   when restoring this already-migrated snapshot.

3. Clone/pull the merged code on the Docker host. Configure `.env.container` as
   described above: use your home-server URL and bind address, and generate a
   new random `BETTER_AUTH_SECRET`. Existing account passwords remain valid;
   existing sessions must sign in again. Do not copy the development
   `DATABASE_PATH` or `localhost` auth URL into the server configuration.

4. Build and stop the app before restoring. The destination volume must contain
   **no database or WAL/SHM sidecars**. This command deliberately refuses to
   overwrite an existing database. If the server already has data, stop here
   and back it up before planning a replacement; do not delete the volume.

   Replace the bind-mount source below with the absolute private directory on
   your Docker host. These commands run from the cloned repository:

   ```text
   docker compose --env-file .env.container build
   docker compose --env-file .env.container stop app
   docker compose --env-file .env.container run --rm --no-deps -v "/absolute/private/golf-transfer:/restore:ro" app node -e "const fs=require('node:fs'); const p=process.env.DATABASE_PATH; if([p,p+'-wal',p+'-shm'].some(f=>fs.existsSync(f)))throw Error('Destination database or sidecars already exist; refusing to overwrite.'); fs.copyFileSync(process.argv[1],p,fs.constants.COPYFILE_EXCL); const Database=require('better-sqlite3'); const db=new Database(p,{readonly:true,fileMustExist:true}); try{if(db.pragma('quick_check',{simple:true})!=='ok'||db.pragma('foreign_key_check').length)throw Error('Restored database integrity check failed.'); console.log('Restored database verified.');}finally{db.close();}" /restore/tee-time-transfer.sqlite
   docker compose --env-file .env.container run --rm app npm run db:migrate
   docker compose --env-file .env.container up -d
   docker compose --env-file .env.container ps
   ```

   Stop if any command fails. Restore runs as the image's non-root user, so the
   copied database has the correct ownership inside the persistent `app-data`
   volume. The read-only bind mount is only attached to the restore command,
   not the running app. **Do not run account creation or the golf import again.**

5. Sign in with an existing account, inspect historical rounds, save a change,
   then restart/recreate the container without removing its volume and confirm
   the change persists. Check the health status and logs before treating the
   server as your primary instance. Keep the original snapshot as a private
   backup until the deployment and a restore have been verified.

### Import into the container

Provision all mapped accounts in the container's database first. Place only the
compressed backup and private mapping in a dedicated host import directory.
Mount that directory read-only for the import command; never bake it into the
image or put it in `public`. For example, replace `C:\private\golf-import` with
the absolute host path (a Linux path on a Linux server):

```text
docker compose --env-file .env.container run --rm -v "C:\private\golf-import:/import:ro" app npm run golf:import -- --dump /import/source.backup.gz --mapping /import/accounts.json --dry-run
docker compose --env-file .env.container run --rm -v "C:\private\golf-import:/import:ro" app npm run golf:import -- --dump /import/source.backup.gz --mapping /import/accounts.json
```

The consistent pre-import backup is created inside the persistent data volume.
Local development data is not automatically copied into that volume.

**Deployment validation:** the standalone production build and isolated server
have been exercised locally. Docker is not available in the development
environment, so image building, Compose health checks, volume recreation, and
the actual home-server deployment still require validation on a Docker host.

Before updating, stop the app and back up the **entire data directory** using the
server's Docker-volume backup tooling while no app or administrative command is
running. Keep a copy off the server and test restoring it. After backing up:

```text
docker compose --env-file .env.container stop app
docker compose --env-file .env.container build
docker compose --env-file .env.container run --rm app npm run db:migrate
docker compose --env-file .env.container up -d
docker compose --env-file .env.container ps
```

For a persistence check, create an account, run `docker compose --env-file
.env.container down`, bring it back with `up -d`, and confirm the same account
still signs in. After configuration changes, run `up -d` again to recreate the
container with the new environment.

## Scope

This is a personal-use app with a private-server container deployment, not an
internet-ready service. Public hosting and broader deployment hardening remain
out of scope. Do not expose the development server publicly or use real
credentials over untrusted HTTP networks.
