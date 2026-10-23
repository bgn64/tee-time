# Tee Time

A small Next.js/TypeScript household app with Better Auth email/password login,
SQLite-backed sessions, and a server-protected dashboard.

## Local setup

Use Node.js 22.18 or newer with native TypeScript stripping (tested on Node 25.6.1).
An actively supported Node LTS release is recommended for eventual hosting.
Run commands from the project directory.

1. Install dependencies with `npm ci` if they are not already installed.
2. Copy the environment example:

   ```powershell
   Copy-Item .env.example .env.local
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

   This uses Better Auth's migration API. It is repeatable and does not reset the
   database. Back up existing data before applying migrations after dependency upgrades.

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

   Open <http://localhost:3000>, select **Sign in**, and use your household account.
   `/dashboard` checks the session on the server before returning your details.
   Signing out revokes the session and returns to `/login`.

## Accounts and access

Public signup is disabled on the server, including direct API requests. Only the
local account command enables account creation in its own isolated auth instance.
No default account or password is shipped. There is no email verification,
password-reset email, or account-management UI yet. Use a password manager;
contact the household administrator for account issues.

Authentication is enforced on the dashboard itself, not merely through browser
redirects or a layout. Future private API endpoints and server actions must also
verify sessions and enforce ownership/permissions for the requested data.

## Data and environment

`DATABASE_PATH` defaults to `./data/tee-time.sqlite`, relative to the project
directory. Accounts and sessions survive app restarts. SQLite may also create
`-wal` and `-shm` sidecar files. Local data and environment files are excluded
from source control; `.env.example` contains no secret and is safe to share.

Keep the database on local disk. Use SQLite's backup facilities or stop all app
processes before copying the database for a consistent backup. Do not delete
the database to resolve a migration issue.

## Validation

```powershell
npm run lint
npx tsc --noEmit
npm run test:auth
npm run build
```

The auth test creates a temporary database, verifies repeatable migrations,
account creation, validation failures, persistence after reopening, signup
rejection, login, separate sessions, CSRF protection, and session revocation.
It does not alter household data.

For a browser check, visit `/dashboard` while signed out, try an incorrect
password, sign in successfully, refresh, sign out, and revisit `/dashboard`.
Private details must never be returned to a signed-out visitor.

## Container deployment (LAN or Tailscale)

Install Docker Engine with the Compose plugin on the server (or Docker Desktop
using Linux containers). Node.js is not required on the host. The multi-stage
image builds with Node 24 LTS, runs the standalone production server as a non-root
user, and retains the migration/account commands. Local environment files,
databases, and dependencies are excluded from the build context. Builds require
internet access for the base image, packages, and Google Fonts.

1. Copy `.env.container.example` to `.env.container` and generate a secret:

   ```text
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

   `APP_PORT` changes the host port; include it in `BETTER_AUTH_URL`. The auth URL
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
