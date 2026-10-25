#!/usr/bin/env bash
# Runs every SQL test file in packages/db/tests against the local Supabase database.
# Compatibility wrapper. The root test:sql command uses the cross-platform Node runner.
set -euo pipefail
cd "$(dirname "$0")/../.."
node packages/db/run-sql-tests.mjs
