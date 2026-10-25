# CLAUDE.md — brandbid agent context

Read this first. It's the short version of the project, so you only open the parts of BUILD.md your task needs.

## What brandbid is

A public pay-to-rank brand leaderboard (like outbid.lol) with a built-in promotion network.
- **Brands** pay to rank (a "bid"). Each bid is split 50% revenue / 50% into that brand's own ad **budget**.
- **Promoters** (signed-up users) tap **Advertise** and get a unique **link** per brand × **channel** (`story | linkedin | x | link`), then share it.
- A **visitor** who clicks a link, is new to that brand, and is active for 10 s on the brandbid brand page is a **qualified visitor**. The brand's **rate** (≥ $0.10 floor) moves from its budget to the promoter.
- Earnings settle in 24 h **cycles** per link and are withdrawable once settled (min $10).

## Source-of-truth order

1. [BUILD.md](BUILD.md): product decisions and exact behaviour. **Always wins.** Section 3 is the decisions log.
2. [PHASES.md](PHASES.md): work packages (WPs), build order, per-WP specs, gaps (G#), open questions (Q#).
3. This file: orientation, rules and progress.

If code disagrees with BUILD.md, the code is wrong. If you change behaviour, update BUILD.md (add a decisions-log row; never edit old rows).

## Stack (BUILD §4)

TypeScript strict · pnpm monorepo · Next.js App Router + Tailwind on Cloudflare Workers (OpenNext adapter, D43) · Supabase (Postgres, Auth with Google and magic link, Storage) · `/go/[code]` route (runs at the Cloudflare edge) · Node worker on AWS ECS Fargate with pg-boss (D40) · Turnstile · FingerprintJS · Upstash ratelimit · isbot · next/og · Resend · Sentry · PostHog · Vitest / SQL tests / Playwright.
Payments in: **Razorpay** (USD, behind `apps/web/lib/payments` adapter, D29). Payouts out: **TBD (Phase 3)**.
Domain: `brandbid.wtf` (D39). Links: `https://brandbid.wtf/go/{code}`, no short domain (D31). Min bid $10 (D30). Daily board resets 00:00 UTC.

## Repo layout

```
apps/web/        Next.js: (public) boards + /b/[slug], (dash), admin, go/[code], out/[click], api/{q,og,story,webhooks}
apps/worker/     pg-boss jobs: check-listing, cleanup, notify, process-refunds, settle-cycles, reconcile-ledgers (built); score-fraud, process-withdrawals, refresh-leaderboards (placeholders)
packages/db/     migrations/, tests/ (SQL tests), types.ts (generated)
packages/shared/ money, codes, hash, ssrf + safeFetch, utm, slug, listing-check, schemas (zod)
packages/payments/ processor adapter (Razorpay + mock) and refund rules; used by web and worker
packages/emails/ email templates (listing approved / rejected) and the Resend/Mailpit sender
```
Current state: Phase 1 is code-complete except for items that need accounts or keys (see the progress table). Phase 2 (promoters, links, clicks, earnings) has not started.

## Commands

Needs Node ≥ 24 (`.nvmrc`), pnpm 12, Docker running, Supabase CLI.

| Command | Does |
| --- | --- |
| `supabase start` | Local Postgres + Auth + Storage (Docker). Prints the anon and service-role keys for `.env` |
| `pnpm dev` | Web (localhost:3000) and worker together. Web alone: `pnpm --filter web dev` |
| `pnpm lint` · `pnpm typecheck` · `pnpm test` | Lint, TypeScript (web runs `next typegen` first), Vitest |
| `pnpm test:sql` | Runs `packages/db/tests/*.sql` against the local DB (uses `docker exec` if `psql` is missing) |
| `pnpm test:concurrency` | Fires parallel `record_bid` calls at the local DB |
| `pnpm test:worker` | Runs the worker job integration tests against the local DB (check-listing, cleanup, notify, process-refunds) with fake sites, mail and payments |
| `pnpm admin:grant <email>` | Makes an existing account an admin (local DB; on hosted Supabase run the UPDATE in the SQL editor) |
| `pnpm db:reset` | Re-applies all migrations and seeds |
| `pnpm db:types` | Regenerates `packages/db/types.ts` |
| `apps/web/scripts/deploy-cloudflare.sh staging\|production [--dry-run]` | Build + deploy the web app to Cloudflare for one environment. Full guide: [DEPLOYMENT.md](DEPLOYMENT.md) |
| `pnpm --filter web cf:build` | Builds the web app for Cloudflare Workers (OpenNext). Test it locally with `cd apps/web && cp .env.local .dev.vars && pnpm exec wrangler dev` (`.dev.vars` is git-ignored; delete it after) |

Copy `.env.example` to `apps/web/.env.local` and `apps/worker/.env`. `supabase/migrations` is a symlink to `packages/db/migrations`.

## Non-negotiable rules

- **Money is integer cents (`bigint`).** No floats anywhere in money code. Use `packages/shared/money.ts`.
- **Every money change goes through one SQL function, in one transaction, and writes a ledger row.** API routes never update money columns. The money functions are `record_bid`, `fund_waitlist`, `get_or_create_link`, `record_click`, `qualify_visitor`, `settle_due_earnings`, `request_withdrawal`, `reverse_earning`, `refund_budget` (plus `reject_listing`, G3).
- `brands.budget_cents` = the sum of `budget_ledger` and is never negative. Promoter balance = the sum of `promoter_ledger` (negative only through clawback).
- A visitor is paid at most once, ever (`earnings.visitor_id` unique). Earning amount = `visitors.claim_rate_cents`.
- **Budget is reserved at qualification, in strict DB order** (brand row lock). When it runs out, new qualified visitors are `waitlisted`, not lost; any budget increase calls `fund_waitlist` first, in order, no queue-jumping. Waitlist expires after 30 days (D36).
- **Stagnation refunds return ad budget only.** Each bid refunds at most its `budget_cents`; revenue is never refunded (D37). **Rejected listings are refunded in full** (D38), since they never went live.
- RLS is on for every table. The service-role key is used only in API routes, `/go` and the worker, and never reaches the browser.
- Webhooks verify signatures and are idempotent (`bids.processor_payment_id` unique).
- `/go` returns **302, never 301**; the visitor never waits on a DB write (`waitUntil`). Link-preview bots get OG HTML and are not counted. Prefetches get 204.
- **Server/DB time only** for the 10 s rule and cycle boundaries.
- Raw IPs are never stored; only `HMAC-SHA256(IP_PEPPER, …)`.
- Migrations are forward-only, in `packages/db/migrations`. Never edit a merged one. Regenerate `types.ts` after each.
- Any PR touching money code includes or updates SQL tests, and the 1 000-parallel concurrency test must pass.
- **Git: commit and push straight to `main` until v1 is live (D41).** No feature branches or PRs yet; CI runs on each push. Small commits per work package, message like `P1.2: schema, RLS, seeds`. Never force-push. The branch workflow starts at P1.12.
- **Keep `.gitignore` current; the repo is pushed to GitHub regularly.** Never commit secrets: `.env*` (except `.env.example`), keys, `*.pem`, Terraform state or `.tfvars`, database dumps, logs. When adding a new tool, framework or generated folder, update `.gitignore` in the same change and check with `git status` and `git check-ignore -v <file>` before committing. Never ignore real source: for example, `out/` is NOT a global ignore because `apps/web/app/out/[click]` is a route. A real secret that was ever committed must be rotated, not just deleted.
- Use the BUILD §2 glossary terms in code and UI (promoter, not "advertiser"; link, claim, cycle, settlement…).
- No ORM over money SQL, no client-side state library, no second database (BUILD §4).
- Qualification endpoint is `/api/q` (avoids ad blockers). It always returns 204.

## Agent workflow

1. Find the first `todo` WP below whose dependencies are `done` (or the one you were assigned).
2. Read its spec in PHASES.md and the BUILD.md sections it cites, nothing more unless needed.
3. Build, test, and check its **Done when** items.
4. Update the progress table: status, date, and a short note (gotchas, follow-ups). Keep notes to one line.
5. If you hit a missing decision, add it to PHASES.md → Open questions and ask. Don't guess product behaviour.

## Open decisions (summary; details in PHASES.md)

Still open: Razorpay test keys (finish P1.5/P1.6/P1.9); Google OAuth client (P1.4); Sentry and PostHog credentials (P1.1/P1.11); Resend key (real email); hosted Supabase projects (owner is setting them up, see DEPLOYMENT.md section 3); Cloudflare first deploy (friend); AWS worker (undecided).
Decided: D29–D50 in BUILD.md §3 (also brandbid.wtf and AWS Fargate worker) (Razorpay, $10 min bid, no short domain, EU cookie after consent, email-allowlist beta, team invites in Phase 3, gaps G1–G17 adopted). Design: my own take on outbid.lol's style.
Defaults in force unless you change them: daily board in UTC, listing emails in Phase 1, I draft the categories.

## Progress

Status values: `todo` · `wip` · `blocked (reason)` · `done`

| WP | Title | Status | Updated | Notes |
| --- | --- | --- | --- | --- |
| P1.1 | Monorepo, tooling, CI | wip | 2026-10-25 | Done and verified: lint, typecheck, tests, local Supabase, worker boot, CI green on GitHub. Left only: a Sentry test event (needs a Sentry DSN). `staging` branch is deferred to P1.12 (D41) |
| P1.2 | Schema, RLS, seeds | done | 2026-10-25 | 5 migrations; 3 SQL test files (smoke, RLS, constraints) mutation-checked. New tables/functions start with no client access: GRANT explicitly |
| P1.3 | Shared: money, codes, schemas | done | 2026-10-25 | 79 tests, 100% branch coverage on money.ts + codes.ts. Also hash.ts, constants (bots, consent countries, reserved handles), `linkUrl()` |
| P1.4 | Auth and profiles | wip | 2026-10-25 | Magic link done and tested against local Supabase + Mailpit. Left: Google OAuth client (wired, unverified), real Turnstile keys, hosted Supabase email template/SMTP, a browser test |
| P1.5 | Payments in, `record_bid` | wip | 2026-10-25 | SQL + webhook + adapter done and tested (SQL tests, 100-call concurrency test, 29 unit tests, real route vs local DB). Left: a real Razorpay test-mode payment (needs keys); `/api/checkout` moved to P1.6 |
| P1.6 | Brand listing flow | wip | 2026-10-25 | Done and tested end to end with mock payments: prefill (SSRF-safe), email-only checkout, webhook, worker auto-check + cleanup. Rank prices now done (P1.7 ladder). Left: real Razorpay widget (needs keys), browser click-through test, hosted `logos` bucket |
| P1.7 | Leaderboards, claim price | done | 2026-10-25 | SQL (live boards, claim_price, ladder) mutation-tested; home page with tabs/categories/take-prices; checkout ladder. Boards are uncached until P1.12. Not visually checked in a browser |
| P1.8 | Brand page (listing mode) | done | 2026-10-25 | `/b/[slug]` (live brands only, else 404), `/out/b/[slug]` UTM redirect, shared `addUtm` for P2.9. Not visually checked in a browser |
| P1.9 | Admin v1: listing review | done | 2026-10-25 | `/admin`, `/admin/listings`, approve/reject(full refund)/category with audit log; refunds issued immediately + worker retries; approve/reject emails via worker `notify`. Left: one real Razorpay test refund on staging (needs keys). First admin: `pnpm admin:grant <email>` |
| P1.10 | Brand dashboard v1 | done | 2026-10-25 | `/dash`, `/dash/brands/[slug]`: rank, pay to move up, budget from the ledger, payments, edit description/logo; members only (404 otherwise). Not verified: the browser-side payment widget and auto-refresh |
| P1.11 | Observability, analytics | wip | 2026-10-25 | PostHog pageviews and listing funnel events wired behind optional consent; real-job watchdog and Sentry cron check-ins added. Left: staging PostHog/Sentry credentials and live funnel/alert verification; source-map upload needs a private-map deploy design. |
| P1.12 | Environments, deploy | wip | 2026-10-25 | Cloudflare part handed to a separate person: see DEPLOYMENT.md. Staging Supabase (`brandbid-main`, ap-south-1) is set up: 15 migrations, logos bucket, core sign-in settings, checker 48/48. Left: Resend SMTP then email template (owner); production Supabase; Cloudflare first deploy (friend); AWS worker undecided; CI deploys; R2 page cache |
| P2.1 | Promoter onboarding | wip | 2026-10-25 | Advertise entry, verified-email and beta gate, waitlist/admin editor, promoter profile and terms, country/handle checks, member signals built locally. Left: live timed flow with configured auth and full share actions from P2.3. |
| P2.2 | Stable promoter links | wip | 2026-10-25 | Atomic SQL creation and server-side four-channel URLs built; existing link, self-promotion, suspension tested. Left: local concurrent-call test and hosted verified-user flow. |
| P2.3 | Share sheet | wip | 2026-10-25 | Responsive modal with editable disclosure-protected copy, X/LinkedIn/copy/story actions, first-use story guide and consented channel events built. Left: verify share behavior on iOS Safari, Android Chrome and desktop Chrome. |
| P2.4 | OG and story images | wip | 2026-10-25 | Open Graph and story-card routes, monogram fallback, rank/name/description, story cache built. Left: Cloudflare OpenNext runtime check, hosted Storage bucket, and visual cases. |
| P2.5 | `/go` redirect | wip | 2026-10-25 | Cached code lookup, bot/prefetch handling, privacy-aware cookie and hashes, local JWT verification, rate limiting and async click dispatch built. Left: hosted Worker secrets, regional latency and crawler checks. |
| P2.6 | `record_click` | wip | 2026-10-25 | SQL visitor matching, claim handling, ignored click reasons and idempotency built; local SQL covers live/expired claims, same-brand repeat rejection and per-brand uniqueness; full SQL fixture suite and P2.8 concurrency tests pass. Hosted share previews and analytics still need checks. |
| P2.7 | Brand page promo mode, qualify script | wip | 2026-10-25 | Attribution, consent flow, timer, FingerprintJS and Turnstile trigger built. Left: browser/staging checks after P2.8. |
| P2.8 | `/api/q`, `qualify_visitor` | wip | 2026-10-25 | SQL reject/budget/waitlist tests and 1,000-visitor concurrency/refill pass locally; web tests/typecheck pass. Left: CI after owner pushes local commits. |
| P2.9 | `/out/[click_id]` | wip | 2026-10-25 | No-store click-through redirects with brandbid/promoter/channel UTMs; unit tests pass. Left: confirm GA/Plausible attribution on staging. |
| P2.10 | Rate setting, pause state | done | 2026-10-25 | Dashboard rate editor with live estimate; server and DB floor checks; rate edits pause ads below budget or with waitlisted visitors and never enable non-active brands. Web route tests and local SQL trigger test pass. |
| P2.11 | Promoter dashboard | done | 2026-10-25 | `/dash/promoter` and protected SQL aggregate; raw SQL seeded counts, route mapping tests, and web typecheck pass. Withdrawals and available balance stay placeholders for later phases. |
| P2.12 | Brand traffic stats | done | 2026-10-25 | Member-checked aggregate and `/dash/brands/[slug]/traffic` charts; SQL seeded counts and authorization, mapping tests, and web typecheck pass. |
| P2.13 | Seed and simulator tooling | done | 2026-10-25 | Repeatable seed funds qualified visits in order and only creates waitlist entries after demo budget exhaustion; full local reconciliation passes. Simulator typechecks and rejects production. Local `/go` → `/api/q` run against a disposable funded fixture produced exactly one pending earning at the claimed rate; fixture data was removed. |
| P2.14 | E2E, beta readiness | wip | 2026-10-25 | Local `/go` → `/api/q` simulator produced one pending earning and its fixture data was removed; full 549-test unit suite, all SQL fixtures, concurrency, worker integrations and typechecks pass. Playwright sign-up flow, real social previews, hosted Turnstile and device checks remain. |
| P3.0 | Legal and provider gate | todo | | Needs CA |
| P3.1 | Notifications infra | wip | 2026-10-25 | Outbox worker, retry/backoff, Resend/Mailpit transports, and HTML/text templates for §19 exist; template tests and local outbid delivery pass. Event triggers arrive with their producing phases. Left: unsubscribe preferences and verified Resend/Gmail/Outlook checks (PHASES setup-dependent checks). |
| P3.2 | Settlement | wip | 2026-10-25 | SQL settlement function and five-minute worker schedule built; boundary, hold, expiry, notification, trust, repeat-run and concurrent-call checks pass locally. Keep wip until P3.3 trust policy gaps are resolved. |
| P3.3 | Fraud rules, trust | wip | 2026-10-25 | Service-role-only scoring and idempotent flag assessment for R1–R6, R8, available R9 signals; SQL fixture verifies triggers, near miss, threshold, history and ACLs. R7 needs Phase 4 IP intelligence. Trust change for sub-threshold scores and a brand billing-name signal need a documented policy/schema decision. |
| P3.4 | Phone verification | todo | | |
| P3.5 | Payout account, KYC, tax | todo | | |
| P3.6 | Withdrawals | wip | 2026-10-25 | Authenticated promoter request and history UI plus atomic service-only balance reservation implemented; phone/KYC/verified-account/minimum/open-request gates covered. First or negative-trust requests enter review. Actual provider send, webhook/poll, failure restoration and sandbox payout require P3.0/P3.5 provider setup. |
| P3.7 | Reversal, clawback, ban | done | 2026-10-25 | Admin-checked service functions reverse/reconcile budget, claw back credited earnings, fund the waitlist, and idempotently ban/forfeit; transactional SQL fixture covers pending/available/waitlisted reversals, recovery from negative balance, link disablement and positive-balance forfeiture. |
| P3.8 | Admin v2 | wip | 2026-10-25 | Fraud queue, user search/moderation, brand search/moderation, validated settings editor, P3.9 manual budget-refund queue, and withdrawal review/hold are built locally. Approval records a transition to processing only and does not send money; P3.6 provider setup and payout execution remain gated. Trust adjustments still need a policy decision. Migration 33 and SQL fixture 33 pass locally; route tests and web typecheck pass. |
| P3.9 | Budget refunds | wip | 2026-10-25 | Owner eligibility/request, atomic budget reservation, newest-first per-bid allocations, brand dashboard status, and audited admin manual-completion path built locally; SQL fixture and route tests pass. Missing/expired refund windows go to manual review. Razorpay test credentials, partial-refund enablement, and the account-specific refund window are required; automatic processor scheduling was blocked by approval review pending that setup and explicit authorization. |
| P3.10 | Reconciliation, data hygiene | wip | 2026-10-25 | Nightly worker reconciliation stores invariant findings, alerts through Sentry, and strips click user agents older than 90 days; admin history screen and rollback SQL fixture are built. A full local run passes after correcting the P2.13 demo seed's waitlist ordering. Sentry alert delivery needs P1.11 credentials. |
| P3.11 | Brand dashboard v2 | wip | 2026-10-25 | Brand members can submit a reasoned suspicious-traffic report; it is rate-limited, audited and reviewed in the admin fraud queue, where admins can clear it but cannot reverse an unrelated earning. Owner-only team invitations use hashed expiring tokens, invited-email matching, member-only access, and outbox token cleanup after delivery; local tests pass. Brand owners can request eligible budget refunds (P3.9). Production email delivery still needs verified Resend setup (P3.1). |
| P3.12 | Legal pages | todo | | |
| P3.13 | Live money launch | todo | | |
| P4.1 | Public promoter leaderboards | wip | 2026-10-25 | Weekly UTC and all-time settled earnings snapshots, five-minute concurrent refresh, anonymous opt-out display, and `/promoters` are built locally; SQL and loader/job tests pass. Hosted refresh and product review remain. |
| P4.2 | Discover brands | wip | 2026-10-25 | `/discover` lists active funded campaigns ranked by rate × remaining budget; SQL and loader tests pass locally. |
| P4.3 | Top promoters per brand | wip | 2026-10-25 | Live brand pages rank brand-specific settled earnings and honor promoter anonymity; SQL and loader tests pass locally. |
| P4.4–P4.8 | Growth and scale | wip | 2026-10-25 | P4.4 needs an IP intelligence provider; P4.5 needs Fingerprint Pro access and measured leakage baseline; P4.6 is conditional on sustained traffic near 50 clicks/s; P4.7 needs selected payout rails and provider setup; P4.8 needs representative fraud outcomes and approved tuning policy. See PHASES.md. |

## Gotchas log

_Append one line per hard-won lesson (date, what, why)._

- 2026-10-25: Never use `export const runtime = 'edge'` in route files: the OpenNext Cloudflare adapter fails the build on it (D43). Every Worker already runs at the edge. Also keep `cacheComponents` off in `next.config.ts` (`create-next-app` turns it on): it's untested with the adapter.
- 2026-10-25: Cloudflare headers: country is `cf-ipcountry`, client IP is `cf-connecting-ip`. Background work after responding is `getCloudflareContext().ctx.waitUntil(...)`.
- 2026-10-25: In Next route handlers use `NextResponse.redirect`, not `Response.redirect`. The latter has immutable headers and returns 500.
- 2026-10-25: Docker Desktop on an 8 GB Mac needs its memory limit lowered (~3 GB) to run the Supabase stack comfortably. `psql` isn't installed locally; `pnpm test:sql` falls back to `docker exec` into `supabase_db_brandbid`.
- 2026-10-25: After adding a migration, run `pnpm db:types` before writing code that uses the new columns/functions; otherwise `tsc` reports them as missing (stale generated types).
- 2026-10-25: Local payments: set `PAYMENTS_MODE=mock` in `apps/web/.env.local`. The listing wizard then shows a "Simulate paying" button that sends a correctly signed webhook through the real handler. Refused in production. Run a worker job now with `pnpm --filter worker run-once check-listing`.
- 2026-10-25: In rate-limited endpoints that create things, put strict limits and single-use bot checks AFTER validation, so typos don't burn attempts or Turnstile tokens.
- 2026-10-25: Vitest resolves the web app's `@/` alias via `vitest.config.ts`.
- 2026-10-25: `NEXT_PUBLIC_*` values are compiled into the Cloudflare build (tested), so staging and production need separate builds; runtime secrets are set with `wrangler secret`. Deploy only via `apps/web/scripts/deploy-cloudflare.sh`, which refuses to build with missing/local/mismatched values (a stray `.env.local` would otherwise fill gaps silently). Never set `PAYMENTS_MODE` for a deployed build.
- 2026-10-25: pnpm 12 fails `pnpm install --frozen-lockfile` (so CI) if a dependency has a build script that is not approved. After adding any dependency, run `pnpm install --frozen-lockfile` locally; if it reports `ERR_PNPM_IGNORED_BUILDS`, add the package to `allowBuilds` in `pnpm-workspace.yaml`. A plain `pnpm add` only warns, which hides the problem until CI.
- 2026-10-25: Built for Workers, `NODE_ENV` is `production`, so the rate limiter refuses to run without Upstash (fails closed, by design). For a local Workers test, expect `/api/auth/magic-link` to return 500 unless the Upstash vars are set.
- 2026-10-25: Auth: `middleware.ts` stays (not Next 16 `proxy.ts`) until the Cloudflare adapter's proxy support is verified. Magic links use the token-hash flow + a Continue button (`/auth/confirm` -> `POST /api/auth/verify`) so they work across browsers and email scanners can't burn them. Local email is in Mailpit at http://127.0.0.1:54324. `supabase/config.toml` raises `email_sent` for local only. Zod 4: put `.max()` before `.pipe(z.email())`.
- 2026-10-25: Membership checks use the USER's session (so RLS decides) and only then the service role (`getMemberBrand`). Test scripts that read mail by recipient must filter by subject: after a brand is approved the newest email is no longer the sign-in link.
- 2026-10-25: Migrations must write extension types with their schema (`extensions.citext`, never bare `citext`). A hosted migration session does not have `extensions` on its search_path, while every local database does, so the bug hides until the first hosted push (it broke migrations 8, 9 and 11). `packages/db/check-migrations.sh` (in `pnpm lint` and CI) fails on it.
- 2026-10-25: Hosted Supabase: `supabase db push --linked` needs no DB password (uses a temporary login role). The CLI prints errors as JSON lines, so never filter lines starting with `{` out of its output. `supabase config push` pushes everything the config declares, and the main `supabase/config.toml` holds local-only values (1 s email limit, MFA off, localhost URLs): push hosted settings only through `deploy/supabase/push-config.sh <env>`, which declares just the few that matter. Email templates can't be changed until custom SMTP is configured. The REST root `/rest/v1/` is hidden from the anon key on hosted projects.
- 2026-10-25: macOS `sed` silently ignores GNU-only forms such as `0,/re/s//x/`, so a "mutation" or edit using it does nothing and a test then passes for the wrong reason. Use `perl -0pi -e` for single replacements.
- 2026-10-25: SECURITY: no password may ever exist and "Confirm email" must be ON everywhere (D50). Supabase's public signup lets anyone register any email with a password; with guest checkout that is an account takeover (reproduced and fixed). A trigger on `auth.users` blanks `encrypted_password`; `scripts/verify-supabase.sh <url> <anon-key>` checks a project (also RLS, function grants, bucket). Run it after touching any Supabase setting. Local `supabase start` can time out on the optional Studio/log containers on an 8 GB Mac: just run it again.
- 2026-10-25: Money-moving worker jobs must use `FOR UPDATE SKIP LOCKED`: tested by removing it, two workers made 8 refund calls for 4 payments. psql does not expand `:'var'` in `-c` strings, send SQL on stdin. `\u2028` in a regex written through some tools becomes a literal line separator and breaks the regex: use `\p{Zl}\p{Zp}` with the `u` flag.
- 2026-10-25: Postgres gives every new function `EXECUTE` to PUBLIC. `ALTER DEFAULT PRIVILEGES IN SCHEMA public ... FROM public` does NOT remove that; migration `000550` uses the form without `IN SCHEMA`. The test in `02_constraints.sql` fails if a new function is callable by a client role. Money functions are `SECURITY INVOKER`, service role only.
- 2026-10-25: If `tsc` reports a stale error (e.g. a BigInt target error) after you changed `tsconfig.json`, delete `apps/web/tsconfig.tsbuildinfo`. Web targets ES2022 because shared code uses BigInt.
- 2026-10-25: pg-boss 12 exports `{ PgBoss }` (no default export) and needs `createQueue()` before `work()`/`schedule()`.
