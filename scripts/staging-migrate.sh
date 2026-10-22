#!/bin/sh
# Apply migrations to the staging Supabase project with psql, one transaction per file.
# Run inside postgres:17.6-alpine with the repo mounted at /repo; see docs/STAGING.md in the merqo repo.
# No arguments: bootstrap every file in supabase/migrations (refused if the schema exists).
# With arguments: apply only those files (repo-relative paths), in the order given.
set -eu

SCHEMA=qkit

if [ -z "${STAGING_DB_URL:-}" ]; then
  echo "STAGING_DB_URL is not set." >&2
  exit 1
fi

cd /repo
psql_run() { psql "$STAGING_DB_URL" -X -q -v ON_ERROR_STOP=1 "$@"; }

if [ "$#" -eq 0 ]; then
  exists=$(psql_run -tA -c "select count(*) from pg_namespace where nspname = '$SCHEMA'")
  if [ "$exists" != "0" ]; then
    echo "Schema '$SCHEMA' already exists on this database. Bootstrap is for an empty staging project only." >&2
    exit 1
  fi
  set -- supabase/migrations/*.sql
fi

for f in "$@"; do
  echo "applying $f"
  psql_run --single-transaction -f "$f" >/dev/null
done
echo "done: $# file(s)"
