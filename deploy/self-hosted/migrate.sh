#!/bin/sh
set -eu

# Encode credentials here; no hosted-project linking or Docker socket is needed.
url=$(node -p '
  const e = process.env;
  "postgresql://postgres:" + encodeURIComponent(e.POSTGRES_PASSWORD) +
    "@" + e.POSTGRES_HOST + ":" + e.POSTGRES_PORT + "/" + e.POSTGRES_DB +
    "?sslmode=disable"
')
exec ./node_modules/.bin/supabase "$@" --db-url "$url"
