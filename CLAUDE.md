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

TypeScript strict · pnpm monorepo · Next.js App Router + Tailwind on Vercel · Supabase (Postgres, Auth with Google and magic link, Storage) · Vercel edge `/go/[code]` · Node worker on AWS ECS Fargate with pg-boss (D40) · Turnstile · FingerprintJS · Upstash ratelimit · isbot · @vercel/og · Resend · Sentry · PostHog · Vitest / SQL tests / Playwright.
Payments in: **Razorpay** (USD, behind `apps/web/lib/payments` adapter, D29). Payouts out: **TBD (Phase 3)**.
Domain: `brandbid.wtf` (D39). Links: `https://brandbid.wtf/go/{code}`, no short domain (D31). Min bid $10 (D30). Daily board resets 00:00 UTC.

## Repo layout

```
apps/web/        Next.js: (public) boards + /b/[slug], (dash), admin, go/[code], out/[click], api/{q,og,story,webhooks}
apps/worker/     pg-boss jobs: settle-cycles, score-fraud, process-withdrawals, refresh-leaderboards, reconcile-ledgers, notify
packages/db/     migrations/, functions/ (money SQL), tests/ (SQL tests), types.ts (generated)
packages/shared/ money.ts (cents), codes.ts, hash.ts, channels.ts, constants.ts, schemas.ts (zod)
packages/emails/ email templates
```
Current state: P1.1 scaffold exists (web with placeholder routes, worker skeleton, empty packages, CI file). No schema yet.

## Commands

Needs Node ≥ 24 (`.nvmrc`), pnpm 12, Docker running, Supabase CLI.

| Command | Does |
| --- | --- |
| `supabase start` | Local Postgres + Auth + Storage (Docker). Prints the anon and service-role keys for `.env` |
| `pnpm dev` | Web (localhost:3000) and worker together. Web alone: `pnpm --filter web dev` |
| `pnpm lint` · `pnpm typecheck` · `pnpm test` | Lint, TypeScript (web runs `next typegen` first), Vitest |
| `pnpm test:sql` | Runs `packages/db/tests/*.sql` against the local DB (needs `psql`) |
| `pnpm db:reset` | Re-applies all migrations and seeds |
| `pnpm db:types` | Regenerates `packages/db/types.ts` |

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

Still open: **Q7** none of the third-party accounts exist yet (checklist in PHASES.md P1.12).
Decided: D29–D40 in BUILD.md §3 (also brandbid.wtf and AWS Fargate worker) (Razorpay, $10 min bid, no short domain, EU cookie after consent, email-allowlist beta, team invites in Phase 3, gaps G1–G17 adopted). Design: my own take on outbid.lol's style.
Defaults in force unless you change them: daily board in UTC, listing emails in Phase 1, I draft the categories.

## Progress

Status values: `todo` · `wip` · `blocked (reason)` · `done`

| WP | Title | Status | Updated | Notes |
| --- | --- | --- | --- | --- |
| P1.1 | Monorepo, tooling, CI | wip | 2026-10-25 | Scaffold, lint, typecheck, web routes verified. Still to verify: `supabase start` + worker boot (Docker wasn't running), CI run on GitHub, Sentry event, `staging` branch |
| P1.2 | Schema, RLS, seeds | todo | | |
| P1.3 | Shared: money, codes, schemas | todo | | |
| P1.4 | Auth and profiles | todo | | |
| P1.5 | Payments in, `record_bid` | todo | | Razorpay test mode |
| P1.6 | Brand listing flow | todo | | |
| P1.7 | Leaderboards, claim price | todo | | |
| P1.8 | Brand page (listing mode) | todo | | |
| P1.9 | Admin v1: listing review | todo | | |
| P1.10 | Brand dashboard v1 | todo | | |
| P1.11 | Observability, analytics | todo | | |
| P1.12 | Environments, deploy | blocked (Q7: no accounts yet) | | |
| P2.1 | Promoter onboarding | todo | | |
| P2.2 | `get_or_create_link` | todo | | |
| P2.3 | Share sheet | todo | | |
| P2.4 | OG and story images | todo | | |
| P2.5 | `/go` edge redirect | todo | | |
| P2.6 | `record_click` | todo | | |
| P2.7 | Brand page promo mode, qualify script | todo | | |
| P2.8 | `/api/q`, `qualify_visitor` | todo | | |
| P2.9 | `/out/[click_id]` | todo | | |
| P2.10 | Rate setting, pause state | todo | | |
| P2.11 | Promoter dashboard | todo | | |
| P2.12 | Brand traffic stats | todo | | |
| P2.13 | Seed and simulator tooling | todo | | |
| P2.14 | E2E, beta readiness | todo | | |
| P3.0 | Legal and provider gate | todo | | Needs CA |
| P3.1 | Notifications infra | todo | | |
| P3.2 | Settlement | todo | | |
| P3.3 | Fraud rules, trust | todo | | |
| P3.4 | Phone verification | todo | | |
| P3.5 | Payout account, KYC, tax | todo | | |
| P3.6 | Withdrawals | todo | | |
| P3.7 | Reversal, clawback, ban | todo | | |
| P3.8 | Admin v2 | todo | | |
| P3.9 | Budget refunds | todo | | |
| P3.10 | Reconciliation, data hygiene | todo | | |
| P3.11 | Brand dashboard v2 | todo | | |
| P3.12 | Legal pages | todo | | |
| P3.13 | Live money launch | todo | | |
| P4.1–P4.8 | Growth and scale | todo | | See PHASES.md |

## Gotchas log

_Append one line per hard-won lesson (date, what, why)._

- 2026-10-25: `create-next-app` turns on `cacheComponents`, which forbids `export const runtime = 'edge'`. It's off in `next.config.ts` because `/go` must be an edge function. Don't turn it back on.
- 2026-10-25: In Next route handlers use `NextResponse.redirect`, not `Response.redirect`. The latter has immutable headers and returns 500.
- 2026-10-25: pg-boss 12 exports `{ PgBoss }` (no default export) and needs `createQueue()` before `work()`/`schedule()`.
