#!/usr/bin/env bash
# Guard for a bug that only shows up on a real (hosted) Supabase project: a migration session there does not have the
# `extensions` schema on its search_path, so an unqualified `citext` fails with "type citext does not exist". Local
# databases include `extensions`, so the problem hides until the first hosted push. Fails if any migration uses
# `citext` without the `extensions.` prefix (the CREATE EXTENSION line, and files that set their own search_path as the
# first statement, are exempt).
set -euo pipefail
cd "$(dirname "$0")/migrations"
bad=0
for f in *.sql; do
  # a file that begins by setting search_path to include extensions is allowed to use bare names
  if grep -qE '^set search_path *= *.*extensions' "$f"; then continue; fi
  hits=$(grep -nE '\bcitext\b' "$f" | grep -vE 'extensions\.citext|create extension' || true)
  if [ -n "$hits" ]; then echo "FAIL $f uses citext without the 'extensions.' prefix:"; echo "$hits" | sed 's/^/    /'; bad=1; fi
done
[ "$bad" -eq 0 ] && echo "ok: migrations qualify extension types" || { echo "Write extensions.citext. See packages/db/check-migrations.sh"; exit 1; }
