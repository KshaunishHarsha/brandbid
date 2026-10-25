#!/usr/bin/env bash
# Runs every SQL test file in packages/db/tests against the local Supabase database.
# Uses host psql if present (CI), otherwise psql inside the local Supabase container.
set -euo pipefail
cd "$(dirname "$0")/../.."

DB_URL="${DATABASE_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"
CONTAINER="supabase_db_brandbid"

run_sql_file() {
  if command -v psql >/dev/null 2>&1; then
    psql "$DB_URL" -v ON_ERROR_STOP=1 -f "$1"
  else
    docker exec -i "$CONTAINER" psql -U postgres -d postgres -v ON_ERROR_STOP=1 < "$1"
  fi
}

shopt -s nullglob
files=(packages/db/tests/*.sql)
if [ ${#files[@]} -eq 0 ]; then echo "No SQL tests yet."; exit 0; fi
for f in "${files[@]}"; do
  echo "== $f"
  run_sql_file "$f"
done
