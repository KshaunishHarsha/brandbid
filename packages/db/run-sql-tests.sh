#!/usr/bin/env bash
# Runs every SQL test file in packages/db/tests against the local Supabase database.
set -euo pipefail
DB_URL="${DATABASE_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"
shopt -s nullglob
files=(packages/db/tests/*.sql)
if [ ${#files[@]} -eq 0 ]; then echo "No SQL tests yet."; exit 0; fi
for f in "${files[@]}"; do
  echo "== $f"
  psql "$DB_URL" -v ON_ERROR_STOP=1 -f "$f"
done
