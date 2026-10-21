#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
trap 'printf "Self-hosting command failed at line %s; do not assume it completed.\n" "$LINENO" >&2' ERR

ROOT=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd -P)
STATE=${TEE_TIME_HOME:-/DATA/AppData/tee-time}
PIN=9b4a47c6dc6a82cec945fc38d59477970cbe8afa
PROJECT=tee-time-selfhost
SNAPSHOT_IMAGE=alpine:3.22.2
UPSTREAM=$STATE/supabase
export TEE_TIME_REPO=$ROOT
TEE_TIME_APP_REVISION=$(git -C "$ROOT" rev-parse --short=12 HEAD)
export TEE_TIME_APP_REVISION

fail() { printf '%s\n' "$*" >&2; exit 1; }
need() { command -v "$1" >/dev/null || fail "Required command not found: $1"; }

case "$STATE" in
  /*) ;;
  *) fail 'TEE_TIME_HOME must be an absolute Linux path.' ;;
esac
case "$STATE" in
  /|"$ROOT"|"$ROOT"/*) fail 'Keep TEE_TIME_HOME outside the source checkout and filesystem root.' ;;
esac

compose() {
  docker compose --project-name "$PROJECT" --project-directory "$UPSTREAM/docker" \
    --env-file "$UPSTREAM/docker/.env" \
    -f "$UPSTREAM/docker/docker-compose.yml" -f "$ROOT/deploy/self-hosted/compose.yaml" "$@"
}

require_stack() {
  [[ -f "$UPSTREAM/docker/.env" ]] || fail 'Run prepare first.'
  [[ $(git -C "$UPSTREAM" rev-parse HEAD) == "$PIN" ]] ||
    fail 'The upstream checkout does not match the pinned revision. Do not upgrade it implicitly.'
}

prepare() {
  need openssl
  mkdir -p -- "$STATE"
  if [[ ! -e "$UPSTREAM" ]]; then
    git clone --filter=blob:none --no-checkout --depth 1 https://github.com/supabase/supabase.git "$UPSTREAM"
    git -C "$UPSTREAM" sparse-checkout set docker
    git -C "$UPSTREAM" fetch --depth 1 origin "$PIN"
    git -C "$UPSTREAM" checkout --detach "$PIN"
  fi
  [[ $(git -C "$UPSTREAM" rev-parse HEAD) == "$PIN" ]] ||
    fail 'Existing Supabase checkout has a different revision; nothing was overwritten.'
  if [[ ! -e "$UPSTREAM/docker/.env" ]]; then
    cp -- "$UPSTREAM/docker/.env.example" "$UPSTREAM/docker/.env"
    (
      cd -- "$UPSTREAM/docker"
      sh utils/generate-keys.sh --update-env >/dev/null
      rm -- .env.old
    )
    cat "$ROOT/deploy/self-hosted/env.example" >> "$UPSTREAM/docker/.env"
  fi
  printf 'Prepared pinned Supabase. Edit %s/docker/.env, then run check.\n' "$UPSTREAM"
}

validate() {
  compose config --quiet
  compose run --rm --no-deps --entrypoint node tools deploy/self-hosted/validate-env.mjs
}

backup() (
  need sha256sum
  compose exec -T db test -s /var/lib/postgresql/data/PG_VERSION
  docker volume inspect "${PROJECT}_db-config" >/dev/null
  if ! docker image inspect "$SNAPSHOT_IMAGE" >/dev/null 2>&1; then
    printf 'Downloading the missing snapshot helper image before stopping services.\n'
    docker pull "$SNAPSHOT_IMAGE"
  fi
  mkdir -p -- "$STATE/backups"
  destination=$(mktemp -d "$STATE/backups/$(date -u +%Y%m%dT%H%M%SZ)-XXXXXXXX")
  printf '%s\n' "$PIN" > "$destination/supabase-revision"
  git -C "$ROOT" rev-parse HEAD > "$destination/app-revision"
  services=$(compose ps --services --status running)
  [[ -n "$services" ]] || fail 'No running services to back up.'
  mapfile -t running <<< "$services"
  trap 'result=$?; trap - EXIT; compose start --wait --wait-timeout 300 "${running[@]}" || exit 1; exit "$result"' EXIT
  compose stop --timeout 60 "${running[@]}"
  # Copy physical database files only while every writer is stopped.
  docker run --rm --network none \
    --mount "type=bind,src=$UPSTREAM/docker,dst=/source,readonly" \
    --mount "type=volume,src=${PROJECT}_db-config,dst=/db-config,readonly" \
    --mount "type=bind,src=$destination,dst=/backup" \
    "$SNAPSHOT_IMAGE" tar -czf /backup/snapshot.tar.gz -C /source .env volumes -C / db-config
  (
    cd -- "$destination"
    sha256sum snapshot.tar.gz supabase-revision app-revision > SHA256SUMS
    sha256sum --check SHA256SUMS
  )
  printf 'Cold backup saved to %s (contains secrets; copy off-device if desired).\n' "$destination"
)

restore_backup() {
  [[ $# == 2 && $2 == --fresh-instance ]] ||
    fail 'Usage: self-host.sh restore-backup BACKUP_DIRECTORY --fresh-instance'
  need sha256sum
  local source
  source=$(cd -- "$1" && pwd -P)
  (cd -- "$source" && sha256sum --check SHA256SUMS)
  [[ $(cat "$source/supabase-revision") == "$PIN" ]] ||
    fail 'Backup uses a different Supabase revision. Restore using the matching deployment source.'
  [[ -z $(compose ps --status running --quiet) ]] || fail 'Stop the stack before restoring.'
  docker volume create "${PROJECT}_db-config" >/dev/null
  docker run --rm --network none \
    --mount "type=bind,src=$UPSTREAM/docker,dst=/restore" \
    --mount "type=volume,src=${PROJECT}_db-config,dst=/restore/db-config" \
    --mount "type=bind,src=$source,dst=/backup,readonly" \
    "$SNAPSHOT_IMAGE" sh -eu -c '
      for directory in /restore/volumes/db/data /restore/volumes/storage /restore/db-config; do
        if [ -d "$directory" ] && [ -n "$(ls -A "$directory")" ]; then
          echo "Restore requires empty database, storage and db-config destinations." >&2
          exit 1
        fi
      done
      tar -xzf /backup/snapshot.tar.gz -C /restore
    '
  printf 'Snapshot restored; services remain stopped. Check .env permissions, then run up.\n'
}

restore_platform() {
  [[ $# == 2 && $2 == --fresh-instance ]] ||
    fail 'Usage: self-host.sh restore-platform EXPORT_DIRECTORY --fresh-instance'
  local source=$1 file fresh
  for file in roles.sql schema.sql data.sql history-schema.sql history-data.sql; do
    [[ -s "$source/$file" ]] || fail "Missing or empty export file: $file"
  done
  need sha256sum
  (cd -- "$source" && sha256sum --check SHA256SUMS)
  fresh=$(compose exec -T db psql -U postgres -d postgres -At -v ON_ERROR_STOP=1 \
    -c "SELECT to_regclass('public.scorecards') IS NULL AND NOT EXISTS (SELECT 1 FROM auth.users);")
  [[ "$fresh" == t ]] || fail 'Platform import requires a fresh target with no scorecards or users.'
  compose stop --timeout 60 web api-gw studio auth rest realtime storage imgproxy meta functions supavisor
  {
    cat "$source/roles.sql" "$source/schema.sql"
    printf '\nSET session_replication_role = replica;\n'
    cat "$source/data.sql"
    printf '\nSET session_replication_role = origin;\n'
    cat "$source/history-schema.sql" "$source/history-data.sql"
  } | compose exec -T db psql -U postgres -d postgres --single-transaction -v ON_ERROR_STOP=1
  printf 'Platform data and migration history imported; only the database remains running. Run up, then migrate to review pending migrations.\n'
}

usage() {
  cat <<'USAGE'
Usage: bash deploy/self-hosted/self-host.sh COMMAND
  prepare                                      Fetch pinned upstream and generate initial secrets
  check                                        Build tools and validate configuration
  up                                           Build frontend/tools and start the complete stack
  frontend                                     Rebuild/recreate only the frontend
  status                                       Show container status
  stop                                         Stop the stack without removing containers or data
  migrate [--apply]                             Preview migrations; --apply takes a cold backup first
  backup                                       Stop, snapshot, and restart running services
  restore-platform EXPORT_DIR --fresh-instance  Import hosted Supabase into a fresh initialized stack
  restore-backup BACKUP_DIR --fresh-instance    Restore a cold snapshot into empty persistent storage

TEE_TIME_HOME defaults to /DATA/AppData/tee-time, outside the source checkout.
All published ports bind to loopback. Use SSH forwarding or a host-side tunnel.
USAGE
}

[[ $# -gt 0 ]] || { usage; exit 0; }
command=$1
shift
case "$command" in
  prepare|check|up|frontend|status|stop|migrate|backup|restore-platform|restore-backup) ;;
  *) usage; fail "Unknown command: $command" ;;
esac
need git
need docker
version=$(docker compose version --short)
version=${version#v}
[[ $(printf '2.24.4\n%s\n' "$version" | sort -V | head -n 1) == 2.24.4 ]] ||
  fail 'Docker Compose 2.24.4 or newer is required for safe port overrides.'
docker info >/dev/null

if [[ "$command" == prepare ]]; then
  [[ $# == 0 ]] || fail 'prepare accepts no arguments.'
  prepare
  exit 0
fi
require_stack
case "$command" in
  restore-platform) restore_platform "$@" ;;
  restore-backup) restore_backup "$@" ;;
  migrate)
    [[ $# == 0 || ( $# == 1 && $1 == --apply ) ]] || fail 'Usage: self-host.sh migrate [--apply]'
    compose build tools
    validate
    compose run --rm --no-deps tools migration list
    compose run --rm --no-deps tools db push --dry-run
    if [[ $# == 1 ]]; then
      backup
      compose run --rm --no-deps tools db push --yes
    fi
    ;;
  *)
    [[ $# == 0 ]] || fail "$command accepts no arguments."
    case "$command" in
      check) compose build tools; validate ;;
      up) compose build web tools; validate; compose up -d --wait --wait-timeout 300 ;;
      frontend) compose build web tools; validate; compose up -d --no-deps --wait --wait-timeout 60 web ;;
      status) compose ps ;;
      stop) compose stop --timeout 60 ;;
      backup) backup ;;
    esac
    ;;
esac
