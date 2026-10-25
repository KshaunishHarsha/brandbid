#!/usr/bin/env bash
# Make an existing account an admin:   scripts/grant-admin.sh you@example.com
# Local database by default. The person must have signed in once so their account exists.
# Hosted Supabase: run the same UPDATE in the SQL editor instead (never put production credentials on a laptop for this).
set -euo pipefail
email="${1:-}"
[ -n "$email" ] || { echo "Usage: $0 <email>" >&2; exit 2; }

# The SQL goes in on stdin: psql only expands :'email' there, not in a -c string. The quoting makes the email a
# properly escaped literal, so odd characters in it cannot change the statement.
sql="update public.profiles set is_admin = true where id = (select id from auth.users where lower(email) = lower(:'email')) returning id;"
if command -v psql >/dev/null 2>&1; then
  out=$(printf '%s\n' "$sql" | psql "${DATABASE_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}" -v ON_ERROR_STOP=1 -v "email=$email" -Atq)
else
  out=$(printf '%s\n' "$sql" | docker exec -i supabase_db_brandbid psql -U postgres -d postgres -v ON_ERROR_STOP=1 -v "email=$email" -Atq)
fi
if [ -n "$out" ]; then echo "$email is now an admin."; else echo "No account with that email. Sign in once first, then run this again." >&2; exit 1; fi
