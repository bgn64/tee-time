# Self-hosting on ZimaOS

Status: deployment tooling prepared; no server provisioning or production cutover
has been performed. Vercel and the hosted database remain unchanged.

## Architecture and prerequisites

- One Nginx frontend container serves the Expo static export and proxies the public
  API on a separate port. Website and API use separate HTTPS hostnames.
- The complete official Supabase Docker stack is fetched at commit
  `9b4a47c6dc6a82cec945fc38d59477970cbe8afa`, including its pinned Postgres 17 image.
  This is the production stack, not `supabase start`. Realtime, Storage, and Edge
  Functions are retained initially to avoid maintaining a fork of upstream wiring.
- Studio is available only through the loopback-bound administrative gateway.
  The public proxy allowlists API paths; it does not forward Studio's catch-all.
  No database/pooler ports are published.
- Invite-only, six-digit email codes are preserved using the existing
  [email template](../supabase/templates/magic-link.html). Configure real SMTP.
- The server needs Bash, Git, OpenSSL, SHA256 utilities, Docker, and Docker Compose
  **2.24.4+**. Host Node/npm are not required; builds and migrations run in containers.
  Docker access is effectively root access; keep it private.

The server has 8 GB RAM and approximately 123.5 GB free system disk at planning
time. Verify actual consumption during the trial. Image builds need more temporary
disk/memory than the idle website; do not impose an untested low database memory
limit.

## 1. Prepare the server

Verify SSH and `docker version`, `docker compose version`. Reserve the LAN IP.
Clone this repository into a source-code directory, check out the desired commit,
and run the commands below **in a Linux terminal on ZimaOS**, from the repo root.
Use `bash` explicitly; executable file permissions are not required.

```bash
# Confirm this is the correct persistent application-data location on your server.
export TEE_TIME_HOME=/DATA/AppData/tee-time
bash deploy/self-hosted/self-host.sh prepare
```

`prepare` downloads the pinned upstream checkout under
`$TEE_TIME_HOME/supabase`, creates a private `.env`, generates fresh secrets with
Supabase's official helper, and appends the app-specific
[environment template](../deploy/self-hosted/env.example). It does not start
containers, change DNS, or overwrite an existing `.env`. Do not run the key
generator again after importing data: rotating database/encryption keys requires
its own procedure.

Edit `$TEE_TIME_HOME/supabase/docker/.env` on the server:

- Set `SITE_URL` to the website HTTPS origin and `SUPABASE_PUBLIC_URL` to a
  different API HTTPS origin, neither with a trailing slash.
- Set `API_EXTERNAL_URL` to the API origin plus `/auth/v1`.
- Configure `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`,
  `SMTP_ADMIN_EMAIL`, and `SMTP_SENDER_NAME`; verify the sender with your provider.
- Keep generated keys/passwords. `ANON_KEY` is public and bundled into the
  frontend; `SERVICE_ROLE_KEY`, SMTP credentials, and database secrets are not.
- Keep the internal database host/port/database as `db` / `5432` / `postgres`.
- Quote SMTP passwords containing `$` or `#` with single quotes for Compose's
  dotenv parser. Do not source this file as shell code or put it in Git.

The appended settings override earlier defaults in the same `.env`; edit the
last occurrence. Do not enable additional Compose overlays in upstream's
`COMPOSE_FILE`: this deployment selects its two Compose files explicitly.
Treat the whole state directory as private, not just `.env`.

```bash
bash deploy/self-hosted/self-host.sh check
bash deploy/self-hosted/self-host.sh up
bash deploy/self-hosted/self-host.sh status
```

`check` verifies configuration and JWT signatures, not SMTP delivery or DNS.
`up` builds the frontend/tools and waits for container health checks.
Keep both the source checkout and the state directory; removing/replacing app
containers does not remove persistent data. Use
`bash deploy/self-hosted/self-host.sh stop` to stop the stack without removing
containers or volumes.

## 2. Public access and trial checks

All host ports bind to **127.0.0.1**, not the LAN. Defaults:

| Host destination | Purpose |
|---|---|
| `http://127.0.0.1:8088` | Static website |
| `http://127.0.0.1:8089` | Public API paths only |
| `http://127.0.0.1:8000` | Private gateway / password-protected Studio |

Configure a Cloudflare Tunnel with the website and API HTTPS hostnames mapped
to ports 8088 and 8089 respectively. Start with trial hostnames; do not move the
production domain yet. `cloudflared` must reach the host loopback: run it on the
host or, on Linux, in a container with host networking. An ordinary bridge-network
container's `localhost` is not the ZimaOS host. Configure the connector to restart
automatically. The tunnel token is a server secret, not a repository file.

No inbound router port forwarding is needed. Never publish port 8000 or the
ZimaOS dashboard through the tunnel. Bypass Cloudflare caching for the API
hostname. Use HTTPS, not a temporary HTTP production endpoint.

For private administration from PowerShell on your computer:

```powershell
ssh -L 8000:127.0.0.1:8000 -L 8088:127.0.0.1:8088 <user>@<server-LAN-IP>
```

Open `http://localhost:8000` for Studio using the generated dashboard credentials.
Port 8088 can be used to check static serving, but app login/API requests use the
HTTPS API hostname embedded at build time.

Before cutover, test:

- Website load, a direct nested URL, and reload of that nested URL.
- Email-code delivery and verification for an existing imported user; uninvited
  emails must not gain accounts. Verify six-digit codes, not only email links.
- Existing rounds, courses, friends, and profile; creating/editing a trial round.
- Public API `/` and `/project/default` return 404 (Studio is not exposed).
- User IDs and row counts match the export; RLS/RPC behavior works when signed in.

## 3. Export/import hosted Supabase

Follow the official [platform restore guide](https://supabase.com/docs/guides/self-hosting/restore-from-platform).
Do not use a raw full `pg_dump` for the platform import: Supabase's CLI filters
managed internals and reserved roles. Storage files and deployed Edge Functions
are not transferred by a SQL dump; inventory the hosted project before proceeding.
Auth users are included, but SMTP/provider settings, API keys, and email templates
need separate configuration. Existing users must sign in again with the new keys.

On your Windows development computer, install project dependencies with `npm ci`
and run Docker Desktop. Retrieve the hosted **direct or session-pooler** connection
string (not the transaction pooler), percent-encode its password, and supply it
privately as the `SOURCE_DB_URL` environment variable. Then:

```powershell
.\deploy\self-hosted\export-platform.ps1
```

The script fails on any failed/empty export. It writes roles, schema, data, and
separate migration-history schema/data plus a Linux-compatible `SHA256SUMS` file into a new gitignored
directory under `prod-backups`. Protect exports as sensitive data; never commit
them. Transfer the complete export directory to the server over SSH.

Check source Postgres version and extensions in the hosted SQL editor:

```sql
SHOW server_version;
SELECT extname, extversion FROM pg_extension ORDER BY extname;
```

Enable matching non-default extensions on the fresh target before import. Do not
restore into an already-used target. After starting the fresh stack with `up`:

```bash
bash deploy/self-hosted/self-host.sh restore-platform /absolute/export-directory --fresh-instance
bash deploy/self-hosted/self-host.sh up
bash deploy/self-hosted/self-host.sh migrate
```

Import verifies export checksums, stops every service except Postgres, then restores in a single transaction
with errors fatal. Triggers are disabled only for data import, avoiding duplicate
profile creation or double encryption. A failed import leaves the other services
stopped. Investigate version/extension mismatches; do not ignore restore errors
or discard meaningful tables/columns to force success.

Migration history is restored separately because the default CLI dump omits
`supabase_migrations`. Review the resulting migration list. Do not blanket-mark
migrations applied, replay all migrations over the imported schema, or import
development seeds.

Use a copied dataset for the trial. The final export must be restored into another
**fresh target**, not over the trial's modified database. Preserve/move aside the
trial state and use an empty db-config volume or a separate Docker host for the
final import; do not delete a volume containing the only copy of useful data.

## 4. Routine manual updates

Fetch/check out the desired reviewed app commit on the server. Keep the source
checkout clean so the image's commit tag accurately identifies its contents.
Do not upgrade Supabase at the same time.

```bash
# If migrations changed: review first, then explicitly apply.
bash deploy/self-hosted/self-host.sh migrate
bash deploy/self-hosted/self-host.sh migrate --apply

# Deploy the matching frontend.
bash deploy/self-hosted/self-host.sh frontend
```

`migrate --apply` requires a successful cold backup before pushing pending
migrations. No development seeds or hosted-project linking are used. Backend
services are not recreated by `frontend`; its image contains only static output,
Nginx, and the public email template. Public environment values are build-time
settings, so changing the API URL/key requires rebuilding.

## 5. Backups and recovery

```bash
bash deploy/self-hosted/self-host.sh backup
```

This intentionally takes downtime: stop all running services, snapshot database
files, uploaded files, upstream volume configuration, `.env`, and the `db-config`
encryption-key volume, then restart only the previously running services. It
includes checksums and Supabase/app revision metadata. A checksum validates file
integrity, **not** recoverability; a real restore test is still needed. If restart
fails, the command reports failure even if an archive was written.

Backups live in `$TEE_TIME_HOME/backups`; they contain private data and secrets,
are **not encrypted**, and are not automatically copied off-server or pruned.
Restrict filesystem access, monitor disk space, and encrypt before placing a copy
in third-party storage. Configure a server-side schedule for this command if
desired; its execution user needs Docker access and the same `TEE_TIME_HOME`.

For recovery on a fresh Docker host with an empty state directory and no existing
`tee-time-selfhost_db-config` volume, check out the saved app revision, run
`prepare`, copy the complete backup directory onto that host, then:

```bash
bash deploy/self-hosted/self-host.sh restore-backup /absolute/backup-directory --fresh-instance
bash deploy/self-hosted/self-host.sh up
```

Restore rejects nonempty database, Storage, or db-config destinations; it never
deletes existing data. Use matching Supabase revision and CPU architecture for
these physical snapshots. If the original deployment UID differs, an administrator
must restore ownership/read access to `.env` without making it publicly readable.
Retest login and existing round data after recovery. Database downgrades and
restoring into a newer Postgres major version require a separate migration plan.

## 6. Final cutover and accepted risk

1. Verify trial behavior, SMTP, public/private routing, and source/target counts.
2. Pause writes on the hosted app and drain the app's offline write outbox while
   still connected to hosted Supabase. Close old tabs/devices to prevent writes to
   the old backend after the final export.
3. Take a final hosted export and preserve it separately from the server.
4. Import into a fresh home target, validate history/data, and rebuild using the
   production website/API HTTPS origins. Update `SITE_URL`/`API_EXTERNAL_URL`.
5. Move the production website DNS/tunnel routing from Vercel to ZimaOS. Check
   sign-in, existing data, and a new write through the public production domain.
6. Explicitly disable the hosted database deployment workflow and Vercel
   integration. Until then, merging source changes still deploys to the cloud.
   Restrict access to the old frontend, including its `vercel.app` URLs: disabling
   automatic builds alone does not prevent writes through an existing deployment.

The home instance is authoritative after cutover. Keep hosted Supabase frozen as
a pre-cutover fallback; it does not receive later home writes. The owner accepts
loss of newly entered data if the server and its local backups fail. Off-site
backups and RAID are not cutover prerequisites. RAID would improve availability,
not replace versioned backups.

Reverting DNS to Vercel can recover the pre-cutover app/data, **not** newer home
writes. A frontend rollback can use the previous app commit, but a database
migration cannot generally be undone by rolling back its container.
