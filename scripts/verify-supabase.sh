#!/usr/bin/env bash
# Checks a Supabase project (local or hosted) against what brandbid expects. See DEPLOYMENT.md section 3.
#
#   scripts/verify-supabase.sh <project-url> <anon-key>
#   SUPABASE_SERVICE_ROLE_KEY=... scripts/verify-supabase.sh <project-url> <anon-key>      # adds the deeper checks
#
# The anon key is public (it ships in the website), so passing it on the command line is fine. The service role key
# is a root password: it is read from the environment only, never printed, and never needed for the main checks.
# Exit code 0 = every check passed, 1 = at least one FAIL.
set -uo pipefail

URL="${1:-}"; ANON="${2:-}"; SERVICE="${SUPABASE_SERVICE_ROLE_KEY:-}"
[ -n "$URL" ] && [ -n "$ANON" ] || { echo "Usage: $0 <project-url> <anon-key>" >&2; exit 2; }
URL="${URL%/}"
pass=0; fail=0; warn=0
ok()   { echo "  PASS  $1"; pass=$((pass+1)); }
bad()  { echo "  FAIL  $1"; fail=$((fail+1)); }
note() { echo "  WARN  $1"; warn=$((warn+1)); }
info() { echo "  info  $1"; }

# Every database function that clients must NOT be able to call, with harmless arguments (made-up ids, so a function that
# IS callable runs, finds nothing, and does nothing: cleanup uses 100 years). Wrong argument NAMES would make the
# project answer "no such function" whether or not we have permission, so deep mode checks these payloads really work.
Z=00000000-0000-0000-0000-000000000000
PROBES=(
  "record_bid|{\"p_brand_id\":\"$Z\",\"p_payer_id\":\"$Z\",\"p_amount_cents\":1,\"p_processor\":\"verify\",\"p_processor_payment_id\":\"verify-probe\"}"
  "fund_waitlist|{\"p_brand_id\":\"$Z\"}"
  "approve_listing|{\"p_brand_id\":\"$Z\",\"p_admin_id\":\"$Z\"}"
  "reject_listing|{\"p_brand_id\":\"$Z\",\"p_admin_id\":\"$Z\",\"p_reason\":\"verify probe\"}"
  "admin_set_category|{\"p_brand_id\":\"$Z\",\"p_category_id\":1,\"p_admin_id\":\"$Z\"}"
  "admin_pending_listings|{}"
  "claim_price|{\"p_brand_id\":null,\"p_rank\":1}"
  "claim_price_ladder|{}"
  "leaderboard_all_time|{}"
  "leaderboard_today|{}"
  "brand_ranks|{\"p_brand_id\":\"$Z\"}"
  "brand_budget_summary|{\"p_brand_id\":\"$Z\"}"
  "category_counts|{}"
  "find_user_id_by_email|{\"p_email\":\"verify-probe@invalid.example\"}"
  "cleanup_stale_listings|{\"p_days\":36500}"
  "cycle_end|{\"p_link_created\":\"2026-01-01T00:00:00Z\",\"p_at\":\"2026-01-01T00:00:00Z\"}"
  "is_admin|{}"
  "is_brand_member|{\"p_brand_id\":\"$Z\"}"
)

CODE=""; BODY=""
# call <key> <method> <path> [json-body]   -> sets CODE and BODY
call() {
  local key=$1 method=$2 path=$3 data=${4:-} out
  if [ -n "$data" ]; then
    out=$(curl -s -m 20 -w $'\n%{http_code}' -X "$method" "$URL$path" -H "apikey: $key" -H "Authorization: Bearer $key" -H 'Content-Type: application/json' -d "$data" 2>/dev/null) || out=$'\n000'
  else
    out=$(curl -s -m 20 -w $'\n%{http_code}' -X "$method" "$URL$path" -H "apikey: $key" -H "Authorization: Bearer $key" 2>/dev/null) || out=$'\n000'
  fi
  CODE=${out##*$'\n'}; BODY=${out%$'\n'*}
}
json() { python3 -c "import sys,json
try:
    d=json.load(sys.stdin)
except Exception:
    print(''); sys.exit()
$1" 2>/dev/null; }

echo "Checking $URL"
echo
echo "Reachability"
# (The API root "/rest/v1/" lists the schema and is hidden from the anon key on hosted projects, so probe a public table.)
call "$ANON" GET "/rest/v1/categories?select=slug&limit=1"
if [ "$CODE" = "000" ]; then bad "cannot reach the project (wrong URL, or no internet)"; echo; echo "0 checks possible."; exit 1; fi
case "$CODE" in
  200) ok "the API answers" ;;
  401|403) bad "the API refused the anon key (HTTP $CODE): is it the right key for this project?" ;;
  *) bad "the API answered HTTP $CODE" ;;
esac

echo
echo "Migrations applied and public data readable (anon key)"
call "$ANON" GET "/rest/v1/categories?select=slug,requires_review"
n=$(echo "$BODY" | json 'print(len(d) if isinstance(d,list) else -1)')
r=$(echo "$BODY" | json 'print(sum(1 for c in d if c.get("requires_review")) if isinstance(d,list) else -1)')
[ "$CODE" = "200" ] && [ "$n" = "19" ] && ok "19 categories are seeded" || bad "expected 19 seeded categories, got '$n' (HTTP $CODE). Did 'supabase db push' run?"
[ "$r" = "4" ] && ok "4 categories need manual review (crypto, finance, health, gambling-adjacent)" || bad "expected 4 review categories, got '$r'"
call "$ANON" GET "/rest/v1/brands?select=slug&limit=1"
[ "$CODE" = "200" ] && ok "live brands are publicly readable" || bad "brands should be readable by anyone (HTTP $CODE)"
call "$ANON" GET "/rest/v1/public_profiles?select=handle&limit=1"
[ "$CODE" = "200" ] && ok "public_profiles view works" || bad "public_profiles view missing or blocked (HTTP $CODE)"

echo
echo "Outsiders are locked out of everything sensitive (anon key)"
for t in bids budget_ledger earnings promoter_ledger payout_accounts withdrawals clicks visitors visitor_keys links settings audit_log fraud_flags notification_outbox member_signals profiles brand_members budget_refunds; do
  call "$ANON" GET "/rest/v1/$t?select=*&limit=1"
  case "$CODE" in
    401|403) ok "table $t refuses anonymous reads" ;;
    200) [ "$BODY" = "[]" ] && note "table $t answers anonymous reads with no rows (row-level security filters it; fine if intended, but expected a refusal)" || bad "table $t LEAKS rows to anonymous users" ;;
    *) bad "table $t gave unexpected HTTP $CODE to an anonymous read" ;;
  esac
done
for t in brands categories bids settings; do
  call "$ANON" POST "/rest/v1/$t" '{}'
  case "$CODE" in 401|403) ok "table $t refuses anonymous writes" ;; *) bad "table $t answered an anonymous write with HTTP $CODE (must be refused)" ;; esac
done
for probe in "${PROBES[@]}"; do
  f=${probe%%|*}; a=${probe#*|}
  call "$ANON" POST "/rest/v1/rpc/$f" "$a"
  code_p=$(echo "$BODY" | json 'print(d.get("code","") if isinstance(d,dict) else "")')
  case "$CODE" in
    401|403) ok "function $f refuses anonymous callers" ;;
    404) ok "function $f is not visible to anonymous callers" ;;
    200|201|204) bad "function $f is CALLABLE by anonymous users and ran (money/admin functions must not be)" ;;
    400) [ "$code_p" = "P0001" ] && bad "function $f is CALLABLE by anonymous users (it ran and raised its own error)" || ok "function $f was refused (HTTP 400 $code_p)" ;;
    *) bad "function $f gave an unexpected HTTP $CODE to an anonymous caller" ;;
  esac
done

echo
echo "Sign-in settings"
call "$ANON" GET "/auth/v1/settings"
if [ "$CODE" = "200" ]; then
  email=$(echo "$BODY" | json 'print(d.get("external",{}).get("email"))')
  auto=$(echo "$BODY" | json 'print(d.get("mailer_autoconfirm"))')
  google=$(echo "$BODY" | json 'print(d.get("external",{}).get("google"))')
  [ "$email" = "True" ] && ok "email sign-in is enabled" || bad "email sign-in is disabled (Authentication > Providers > Email)"
  [ "$auto" = "False" ] && ok "email addresses must be confirmed (mailer_autoconfirm is off)" || bad "mailer_autoconfirm is ON: accounts would skip email verification (Authentication > Providers > Email > Confirm email)"
  [ "$google" = "True" ] && info "Google sign-in is enabled" || info "Google sign-in is not enabled (fine until the OAuth client exists)"
else
  bad "could not read the auth settings (HTTP $CODE)"
fi

echo
echo "Logo storage"
call "$ANON" GET "/storage/v1/object/public/logos/__brandbid_probe__.png"
msg=$(echo "$BODY" | json 'print(d.get("message","") + " " + d.get("error",""))')
case "$msg" in
  *"Bucket not found"*|*"bucket not found"*) bad "the 'logos' bucket does not exist (Storage > New bucket: name logos, Public, 1 MB, png/jpeg/webp)" ;;
  *"not found"*|*"Not found"*|*"Object not found"*) ok "the public 'logos' bucket exists" ;;
  *) [ "$CODE" = "404" ] || [ "$CODE" = "400" ] && ok "the public 'logos' bucket answers like a public bucket (HTTP $CODE)" || bad "unexpected answer from the logos bucket (HTTP $CODE: $msg)" ;;
esac

if [ -n "$SERVICE" ]; then
  echo
  echo "Deeper checks (service role key from the environment)"
  call "$SERVICE" GET "/rest/v1/settings?select=key,value"
  val() { echo "$BODY" | json "print(next((str(s['value']) for s in d if s['key']=='$1'), ''))"; }
  if [ "$CODE" = "200" ]; then
    [ "$(val floor_cents)" = "10" ] && ok "settings: floor is 10 cents" || bad "settings: floor_cents is '$(val floor_cents)', expected 10"
    [ "$(val min_bid_cents)" = "1000" ] && ok "settings: minimum bid is 1000 cents" || bad "settings: min_bid_cents is '$(val min_bid_cents)', expected 1000"
    [ "$(val budget_share_bps)" = "5000" ] && ok "settings: 50% of each bid becomes ad budget" || bad "settings: budget_share_bps is '$(val budget_share_bps)', expected 5000"
    [ -n "$(val rank_step_cents)" ] && ok "settings: rank_step_cents present (latest migrations applied)" || bad "settings: rank_step_cents missing (migration 000800 not applied)"
  else bad "could not read settings with the service role key (HTTP $CODE). Wrong key?"; fi
  bad_probes=0
  for probe in "${PROBES[@]}"; do
    f=${probe%%|*}; a=${probe#*|}
    call "$SERVICE" POST "/rest/v1/rpc/$f" "$a"
    code_p=$(echo "$BODY" | json 'print(d.get("code","") if isinstance(d,dict) else "")')
    if [ "$CODE" = "200" ] || [ "$CODE" = "204" ] || { [ "$CODE" = "400" ] && [ "$code_p" = "P0001" ]; }; then :; else
      bad_probes=$((bad_probes+1)); bad "function $f is missing or its probe is out of date (service role got HTTP $CODE $code_p): migrations incomplete?"
    fi
  done
  [ "$bad_probes" -eq 0 ] && ok "all ${#PROBES[@]} protected functions exist, and the probes above really exercise them"
  call "$SERVICE" GET "/storage/v1/bucket"
  pub=$(echo "$BODY" | json 'b=[x for x in d if x.get("name")=="logos"]; print(("public" if b[0].get("public") else "PRIVATE") + ":" + str(b[0].get("file_size_limit")) if b else "missing")')
  case "$pub" in public:1048576) ok "bucket logos is public with a 1 MB limit" ;; missing) bad "bucket logos is missing" ;; *) bad "bucket logos is configured as '$pub', expected 'public:1048576'" ;; esac
else
  echo
  info "Skipping the deeper checks. To include them: SUPABASE_SERVICE_ROLE_KEY=<key> $0 <url> <anon-key>"
fi

echo
echo "Result: $pass passed, $fail failed, $warn warning(s)"
[ "$fail" -eq 0 ] && { echo "All good."; exit 0; } || { echo "Fix the FAIL lines above and run this again."; exit 1; }
