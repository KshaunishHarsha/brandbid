#!/usr/bin/env bash
# Build and deploy the web app to Cloudflare Workers for ONE environment. See /DEPLOYMENT.md.
#
#   scripts/deploy-cloudflare.sh staging|production [--dry-run]
#
# Why a script: NEXT_PUBLIC_* values are compiled INTO the build, so every environment needs its own build.
# If one is forgotten, Next silently falls back to a local .env.local and would ship localhost URLs.
# This script refuses to build unless every value is set and plausible, then checks the result.
set -euo pipefail

ENV_NAME="${1:-}"
MODE="${2:-}"
case "$ENV_NAME" in
  staging)    EXPECTED_SITE="https://staging.brandbid.wtf" ;;
  production) EXPECTED_SITE="https://brandbid.wtf" ;;
  *) echo "Usage: $0 staging|production [--dry-run]" >&2; exit 2 ;;
esac
if [ -n "$MODE" ] && [ "$MODE" != "--dry-run" ]; then echo "Unknown option: $MODE" >&2; exit 2; fi

cd "$(dirname "$0")/.."
fail() { echo "ERROR: $*" >&2; exit 1; }

# 1. Every build-time value must be set explicitly.
missing=()
for v in NEXT_PUBLIC_SITE_URL NEXT_PUBLIC_SUPABASE_URL NEXT_PUBLIC_SUPABASE_ANON_KEY NEXT_PUBLIC_TURNSTILE_SITE_KEY; do
  [ -n "${!v:-}" ] || missing+=("$v")
done
[ ${#missing[@]} -eq 0 ] || fail "missing build variables: ${missing[*]} (see DEPLOYMENT.md, section 'Build-time variables')"

# 2. They must match the environment being built (catches a staging/production mix-up).
[ "$NEXT_PUBLIC_SITE_URL" = "$EXPECTED_SITE" ] || fail "NEXT_PUBLIC_SITE_URL is '$NEXT_PUBLIC_SITE_URL' but $ENV_NAME must be '$EXPECTED_SITE'"
case "$NEXT_PUBLIC_SUPABASE_URL" in
  https://*) ;;
  *) fail "NEXT_PUBLIC_SUPABASE_URL must be an https:// URL (got '$NEXT_PUBLIC_SUPABASE_URL')" ;;
esac
case "$NEXT_PUBLIC_SUPABASE_URL" in
  *127.0.0.1*|*localhost*) fail "NEXT_PUBLIC_SUPABASE_URL points at a local Supabase" ;;
esac
[ -z "${PAYMENTS_MODE:-}" ] || fail "PAYMENTS_MODE must not be set for a deployed build (mock payments are refused in production)"

# 3. Optional values get an explicit default, so a stray .env.local can never fill them in.
export NEXT_PUBLIC_GOOGLE_AUTH="${NEXT_PUBLIC_GOOGLE_AUTH:-false}"
export NEXT_PUBLIC_SENTRY_DSN="${NEXT_PUBLIC_SENTRY_DSN:-}"
export NEXT_PUBLIC_POSTHOG_KEY="${NEXT_PUBLIC_POSTHOG_KEY:-}"
export NEXT_PUBLIC_POSTHOG_HOST="${NEXT_PUBLIC_POSTHOG_HOST:-https://us.i.posthog.com}"
export NEXT_PUBLIC_APP_ENV="$ENV_NAME"

echo "==> Building for $ENV_NAME ($NEXT_PUBLIC_SITE_URL)"
pnpm exec opennextjs-cloudflare build --env "$ENV_NAME"

# 4. Check what was actually compiled in.
grep -rqF "$NEXT_PUBLIC_SITE_URL" .open-next || fail "the build does not contain $NEXT_PUBLIC_SITE_URL"
grep -rqF "$NEXT_PUBLIC_SUPABASE_URL" .open-next || fail "the build does not contain the Supabase URL"
if grep -rqF "127.0.0.1:54321" .open-next; then fail "the build contains the local Supabase address (127.0.0.1:54321). A .env.local leaked in"; fi
echo "==> Build checks passed"

if [ "$MODE" = "--dry-run" ]; then
  echo "==> Dry run (nothing is uploaded)"
  pnpm exec wrangler deploy --dry-run --env "$ENV_NAME" --outdir ".wrangler/dry-run-$ENV_NAME"
else
  echo "==> Deploying to Cloudflare ($ENV_NAME)"
  pnpm exec opennextjs-cloudflare deploy --env "$ENV_NAME"
fi
