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

## Scope

This is a local-development foundation, not an internet-ready deployment.
Docker/ZimaOS, HTTPS, production secrets, persistent mounts, backups, and
deployment hardening are a separate next phase. Do not expose the development
server publicly or use real credentials over untrusted HTTP networks.
