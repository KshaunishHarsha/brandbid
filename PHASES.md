# PHASES.md — brandbid build plan

This file turns [BUILD.md §22](BUILD.md#22-build-phases-and-acceptance-criteria) into work packages (WPs) that can be built one at a time. Each WP says what to build, which BUILD.md sections cover it, what it depends on, which files it touches, how to test it, and when it counts as done.

**Precedence:** BUILD.md wins. This file says *how* and *in what order*. If the two disagree, BUILD.md is right and this file gets fixed. Items marked **[G#]** are gaps found while planning (see [Gaps and proposed additions](#gaps-and-proposed-additions)). Items marked **[Q#]** are waiting on a decision (see [Open questions](#open-questions)). Once a G or Q item is settled, it goes into the BUILD.md §3 decisions log.

**Progress** is tracked in [CLAUDE.md](CLAUDE.md#progress), not here. This file is the spec.

Last updated: 2026-10-24

---

## How to use this file (for agents)

1. Pick the first WP in CLAUDE.md's progress table that is `todo` and whose dependencies are all `done`.
2. Read that WP here, then read only the BUILD.md sections it links to.
3. Build it. Write the tests it lists. Money code always needs SQL tests (BUILD §5).
4. Check every item in its **Done when** list. Then set the WP to `done` in CLAUDE.md and add a one-line note on anything the next agent should know.
5. If a decision is missing, stop and ask. Don't invent product behaviour.

WP template: **Goal** · **Depends on** · **Refs** · **Build** · **Files** · **Tests** · **Done when**

---

## Phase map

```
Phase 1  Leaderboard            P1.1 → P1.12   brands pay, rank, get reviewed
Phase 2  Advertise (beta)       P2.1 → P2.14   promoters share, clicks qualify, earnings accrue (pending)
Phase 3  Money out              P3.0 → P3.13   settlement, fraud, withdrawals, refunds, reconciliation
Phase 4  Growth and scale       P4.1 → P4.8    public promoter boards, discovery, stronger fraud, scale
```

Dependency spine: `P1.1 → P1.2 → P1.3 → P1.5 → P1.6 → P1.7`. Everything else hangs off these.

---

# Phase 1 — Leaderboard

**Outcome:** a brand can be listed, paid for in test mode, reviewed, and ranked on the all-time and daily boards. Brand pages and a read-only brand dashboard exist. The whole schema (every table, including Phase 2–3 tables) is in place.

**Unblocked:** Razorpay (D29) and a $10 minimum bid (D30) are decided. Only P1.12 waits on accounts being created. Everything else can be built locally.

### P1.1 — Monorepo, tooling, CI

**Goal:** an empty but complete skeleton where `pnpm dev`, `pnpm test` and CI all work.
**Depends on:** nothing. **Refs:** BUILD §4 (repository layout), §5.

**Build**
- `git init`, `main` and `staging` branches. `.gitignore` (node, .env*, .next, supabase/.temp).
- pnpm workspaces: `apps/web`, `apps/worker`, `packages/db`, `packages/shared`, `packages/emails`. Root `tsconfig.base.json` with `strict: true` and `noUncheckedIndexedAccess: true`.
- `apps/web`: Next.js (App Router, current stable), Tailwind, the route groups from BUILD §4 as empty placeholders: `(public)`, `(dash)`, `admin`, `go/[code]`, `out/[click]`, `api/q`, `api/og/[code]`, `api/story/[code]`, `api/webhooks`.
- `apps/worker`: Node + TypeScript + pg-boss. Boots, connects to Postgres, registers no-op handlers for the six jobs in BUILD §4, and logs a heartbeat. pg-boss needs a **direct** Postgres connection (session mode). Supabase's transaction-mode pooler won't work.
- `packages/shared`: empty `money.ts`, `codes.ts`, `constants.ts`, `schemas.ts`, `channels.ts` with barrel export.
- `packages/db`: Supabase CLI init (`supabase/` config pointing migrations at `packages/db/migrations`), `functions/`, `tests/`, `types.ts` generation script.
- ESLint + Prettier, Vitest at root. Scripts: `dev`, `build`, `lint`, `typecheck`, `test`, `test:sql`, `db:reset`, `db:types`.
- `.env.example` listing every variable with a comment: Supabase URL/anon/service-role, `DATABASE_URL` (direct), `IP_PEPPER`, Turnstile keys, Upstash URL/token, Resend key, Sentry DSNs, PostHog key, `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`, `NEXT_PUBLIC_SITE_URL`.
- GitHub Actions CI on pull requests: install → lint → typecheck → unit tests → `supabase start` → apply migrations → SQL tests.
- Sentry SDK in web and worker. Wire DSNs through env and make sure a missing DSN doesn't crash local dev.

**Files:** root config, `apps/*/package.json`, `.github/workflows/ci.yml`, `.env.example`.
**Tests:** CI passes on an empty PR.
**Done when:**
- [ ] `pnpm i && supabase start && pnpm dev` runs web and worker locally.
- [ ] CI runs green.
- [ ] A test error thrown from web and from worker shows up in Sentry (staging DSN).

### P1.2 — Database schema, RLS, seeds

**Goal:** every table from BUILD §6 exists with constraints, indexes, RLS and seed data.
**Depends on:** P1.1. **Refs:** BUILD §6, §7, [G1–G5, G10–G12, G16].

**Build**
- Migration `0001_extensions.sql`: `citext`, `pgcrypto`.
- Migration `0002_schema.sql`: every table in BUILD §6, exactly as written, plus the proposed additions once approved:
  - [G1] `brands.total_reached_at timestamptz` (tie-break for rank).
  - [G2] `profiles.leaderboard_public boolean not null default true`.
  - [G3] `bids.refunded_at timestamptz`, `bids.refund_ref text`.
  - [G4] brand status `draft` (pre-payment).
  - [G5] `notification_outbox` table.
  - [G10] `member_signals` table (start collecting in Phase 2, used by R9).
  - [G11] `bids.payer_email text`, `bids.payment_fingerprint text`.
  - [G12] qualification signals on `visitors`: `qualified_ip_hash`, `qualified_fp_hash`, `qualified_active_ms int`, `qualified_interactions int`.
  - [G16] `profiles.phone_hash text unique`.
  - D36/D37 (already in BUILD §6): earnings `waitlisted`/`expired` statuses, nullable `cycle_ends_at`, `funded_at`; `bids.budget_refunded_cents` with its check; setting `waitlist_days=30`; partial index for waitlist order.
- Status and enum columns use `check (col in (...))` constraints, not Postgres enums. They're easier to extend in forward-only migrations.
- Migration `0003_indexes.sql`: the indexes listed in BUILD §6, plus `visitors (brand_id)`, `links (brand_id)`, `earnings (link_id, status)`, `promoter_ledger (promoter_id)`, `budget_ledger (brand_id)`, and `brands (status, total_paid_cents desc, total_reached_at asc)`, which replaces the plain all-time index.
- Migration `0004_rls.sql`: enable RLS on **every** table, with policies exactly per the BUILD §6 RLS table. Add a `public_profiles` view exposing `id, handle` only, and for active brands a `public_brands` view or policy. Helper SQL functions `is_brand_member(brand_id)` and `is_admin()` (`security definer`, `stable`).
- Trigger: on `auth.users` insert, create a `profiles` row.
- Trigger: block client updates to money/status columns on `brands` and `profiles`. RLS can't restrict individual columns, so use column-level `grant`s or a `before update` trigger that rejects changes to protected columns unless the role is `service_role`.
- Seed `0005_seed.sql`: `settings` (floor_cents=10, budget_share_bps=5000, min_withdrawal_cents=1000, claim_days=7, qualify_seconds=10, cycle_hours=24, stagnation_days=30, plus `min_bid_cents` once [Q2] is answered, plus fraud thresholds from BUILD §16 as JSON). Also seed `categories` (the list needs your input, see [Q12]) and the reserved-handle list (stored as a setting or a small table).
- `pnpm db:types` → `packages/db/types.ts`.

**Tests:** `packages/db/tests/rls.test.sql` checks that anon and authenticated roles can't read `clicks`/`visitors`/`visitor_keys`, can't write money columns, and that a promoter reads only their own earnings.
**Done when:**
- [x] `supabase db reset` applies all migrations cleanly.
- [x] RLS tests pass (01_rls, 02_constraints; mutation-checked by deliberately breaking 5 rules).
- [x] Types are generated and committed.

**Built (2026-10-25):** migrations `20261025000100`–`000500` (extensions, schema, indexes, rls, seed). Notes for later WPs: `brands.ads_enabled` defaults to **false** (D42); `public_profiles` view exposes handle; new tables/functions start with **no** client access, so each new migration must GRANT explicitly (the privilege-hygiene test in `02_constraints.sql` fails otherwise); `gen_random_uuid()` and `citext` work with `search_path = public, extensions`. Reserved handles live in `packages/shared` (`RESERVED_HANDLES`), not the DB.

### P1.3 — Shared package: money, codes, schemas

**Goal:** the shared helpers every later WP depends on.
**Depends on:** P1.1. **Refs:** BUILD §7.1, §11 (code format), §2 (glossary).

**Build**
- `money.ts`: a `Cents` branded type; `toCents(dollarsString)` (parses strings, never floats); `formatUSD(cents)`; `splitBid(amountCents, budgetShareBps) → { budgetCents, revenueCents }` using `floor`, mirroring BUILD §7.7 exactly; `assertCents` guard. No `number` math on dollars anywhere.
- `codes.ts`: `randomCode(len = 8)` exactly as in BUILD §11.
- `channels.ts`: `CHANNELS = ['story','linkedin','x','link'] as const`, plus the type.
- `constants.ts`: cookie name `bb_vid`, UTM keys, reserved handles, bot UA list (BUILD §13 step A3).
- `schemas.ts`: zod schemas for the handle (`^[a-z0-9_]{3,20}$`), the `/api/q` body, the listing form, and the rate input.
- `hash.ts`: `hmac(pepper, value)` using Web Crypto, so it runs on edge and Node alike.

**Tests (Vitest):** split rounding (odd cents, 1 cent, large values), `toCents` rejects floats/garbage, `randomCode` length and alphabet and distribution sanity (no modulo bias over 1M samples), handle regex, HMAC gives the same output on Node and edge.
**Done when:**
- [ ] 100% branch coverage on `money.ts` and `codes.ts`.

### P1.4 — Auth and profiles

**Goal:** sign in with Google or an email magic link; a profile row exists; sessions work in server components, route handlers and edge.
**Depends on:** P1.2. **Refs:** BUILD §4 (auth), §10 step 1, §20.

**Build**
- `@supabase/ssr` clients: browser, server component, route handler, middleware. Middleware refreshes the session cookie.
- `/signin` page: Google button plus a magic-link email form. Invisible Turnstile on the form, verified server-side before calling Supabase.
- Rate limit sign-in: 5 attempts per IP hash per 10 min (Upstash, `@upstash/ratelimit`).
- `/auth/callback` route; `next` return-to parameter (needed by the Advertise flow in P2.1). Only same-origin `next` values are allowed, to prevent open redirects.
- Server helpers: `getUser()`, `requireUser()`, `requireAdmin()`. `requireAdmin` also enforces sign-in within the last 12 h (BUILD §20) using the session's `auth_time` / last sign-in.
- Account menu, sign out.

**Tests:** unit tests for the return-to validation; Playwright: magic link sign-in through Supabase's local Inbucket mail server.
**Done when:**
- [ ] Both sign-in methods work locally and on staging.
- [ ] The profile row is created on first sign-in.
- [ ] The 6th attempt within 10 min is rate-limited.

### P1.5 — Payments in: checkout, webhook, `record_bid`

**Goal:** money comes in exactly once, split correctly.
**Depends on:** P1.2, P1.3. **Refs:** BUILD §7, §8 (claim price), §20 (webhooks), D29, D30.

**Build**
- `apps/web/lib/payments/`: a small `PaymentProcessor` interface (`createCheckout`, `verifyWebhook`, `parseEvent`, `refund(paymentId, amountCents)`) with a **Razorpay** implementation (D29). The interface keeps a processor swap cheap.
- Razorpay specifics: charge in **USD** (D21). Create a Razorpay Order server-side (`amount` in cents, `currency: 'USD'`, `notes: { brand_id, payer_id }`), then open Razorpay Checkout on the client. International cards must be activated on the Razorpay account; test mode works without that. Store `razorpay_payment_id` as `processor_payment_id`. Payer email and card fingerprint (if exposed) go into G11 columns. Confirm Razorpay's refund window and record it in BUILD.md, because §8 refunds depend on it.
- `POST /api/checkout` is built in **P1.6** with the listing flow, because it needs a signed-in user (P1.4). P1.5 delivers the processor's `createOrder` it will call. The route validates `amountCents >= min_bid_cents` (1000, D30), creates the order with `notes { brand_id, payer_id }`, and returns what Razorpay Checkout needs.
- Never trust the client-side Checkout success callback for money. It only shows a "processing" state. The bid is recorded **only** from the webhook.
- `POST /api/webhooks/razorpay`: verifies `X-Razorpay-Signature` (HMAC-SHA256 of the raw body with the webhook secret, constant-time compare). On `payment.captured` (or `order.paid`, pick one and ignore the other to avoid double handling), calls `record_bid` over a service-role RPC. Returns 200 on duplicates. Unknown events → 200 and ignore. Payment capture must be set to automatic in Razorpay settings.
- SQL `record_bid(p_brand_id, p_payer_id, p_amount_cents, p_processor, p_processor_payment_id, p_payer_email, p_payment_fingerprint)`, `security definer`, one transaction:
  1. `insert into bids ... on conflict (processor_payment_id) do nothing returning id`. If nothing was inserted, return (idempotent).
  2. Split per BUILD §7.7 using `settings.budget_share_bps`.
  3. `insert budget_ledger (+budget_cents, 'bid', bid_id)`.
  4. Lock and update the brand: `total_paid_cents += amount`, `total_reached_at = now()`, `budget_cents += budget`. If the status is `draft`, set it to `pending_review`.
  4b. Call `fund_waitlist(brand_id)` (D36). It pays waitlisted earnings in order and then sets `ads_enabled`.
  5. Enqueue the listing auto-check (P1.6) through `notification_outbox` or a pg-boss job for the first bid on a draft.
  6. [G5] Outbox "outbid" events for brands this bid pushed down a rank. These are only sent in Phase 3.
- `packages/db/functions/record_bid.sql` with a matching migration.
- SQL `fund_waitlist(p_brand_id)` exactly per BUILD §15 (waitlist). It's built here because `record_bid` calls it; until P2.8 creates waitlisted rows, it does nothing. Tests insert waitlisted rows directly.

**Tests (SQL, fund_waitlist):** funds in `created_at, id` order; stops at the head when the head doesn't fit, even if a later, cheaper entry would; writes one `visitor` ledger row per funded earning; sets `funded_at` and `cycle_ends_at`; `ads_enabled` stays false while any waitlist remains; never takes the budget below 0.
**Tests (SQL, record_bid):** the split is correct; a duplicate `processor_payment_id` is a no-op; `budget_cents` = ledger sum; `total_reached_at` updates; a draft becomes `pending_review`; an active brand stays active.
**Tests (unit):** webhook signature verify with a recorded Razorpay fixture (valid, tampered, wrong secret).
**Done when:**
- [x] A signed webhook end to end writes exactly one bid with the right split (verified against local Supabase with a signed fixture).
- [x] Replaying the webhook changes nothing.
- [ ] **Still to do with real Razorpay test keys (needs your account):** one real test-mode payment, and confirm the payment entity carries `notes`, `card_id` and `email` the way `parseEvent` assumes (the handler falls back to the order's notes if not).

**Built (2026-10-25):** migrations `000550` (function default-privilege fix) and `000600` (`cycle_end`, `fund_waitlist`, `record_bid`); `apps/web/lib/payments/{types,razorpay,webhook}.ts`; `/api/webhooks/razorpay`; `lib/supabase/admin.ts`; SQL tests `03_record_bid`; `pnpm test:concurrency` (100 parallel calls). D44: unrecordable payments are auto-refunded and audited. `check-listing` is not enqueued by `record_bid`: P1.6's worker job should poll for `pending_review` brands instead (add a `checked_at` column there).

### P1.6 — Brand listing flow

**Goal:** a signed-in user turns a URL into a paid, auto-checked listing.
**Depends on:** P1.4, P1.5. **Refs:** BUILD §8 (listing, policy), [G4].

**Build**
- `/list` page, step 1: enter a URL.
- `POST /api/brands/prefill`: fetches the URL server-side and returns title, meta description and OG image. **SSRF-safe:** https only; resolve DNS and reject private, loopback and link-local IPs; at most 3 redirects, each re-checked; 5 s timeout; 1 MB body cap; HTML only.
- Step 2 form: name, description (one-liner, length cap), logo (prefilled OG image, or upload), category. Logo goes to the Supabase Storage bucket `logos/` after resizing/validating type.
- Slug: from the name, lowercased, `[a-z0-9-]`, deduplicated with a suffix, not on the reserved list.
- On submit: server action creates the brand with `status='draft'` and `rate_cents = floor`, plus the `brand_members` owner row (BUILD §8.7).
- Step 3: amount picker. Shows "price to take rank N" for a few ranks (from P1.7's claim price function) plus a custom amount ≥ minimum bid. → `/api/checkout`.
- Return page `/list/done?brand=` polls the brand status ("payment received, under review" / "you're live at #N").
- Auto-check (worker job `check-listing`, enqueued by `record_bid`): URL resolves over HTTPS, domain not on the blocklist, name/description pass the banned-words list. Review categories (crypto, finance, health and supplements, gambling-adjacent) → stays `pending_review`. Otherwise → `active`. Blocklist and banned words live in `settings` so admins can edit them later.
- Cleanup: worker deletes `draft` brands older than 7 days with no bids.

**Tests:** unit tests for the SSRF guard (private IPs, redirect to a private IP, `http://`) and slug generation; Playwright: list → pay (test mode) → active on the board.
**Done when:**
- [ ] A non-review category goes live immediately after payment.
- [ ] A review category lands in the admin queue.
- [ ] A blocklisted domain is held.

### P1.7 — Leaderboards and claim price

**Goal:** the public boards, modelled on outbid.lol.
**Depends on:** P1.5. **Refs:** BUILD §9, §8 (claim price), D1, [Q3].

**Build**
- All-time: live query, `status='active'`, `order by total_paid_cents desc, total_reached_at asc`. Rank = row number.
- Daily: materialized view `daily_board` = sum of `bids.amount_cents` where `status='succeeded'`, `created_at >= today 00:00 UTC` [Q3], for active brands. Needs a unique index so it can `refresh materialized view concurrently`. The worker job `refresh-leaderboards` runs every minute, and `record_bid` triggers an immediate refresh through pg-boss.
- By category: all-time filtered by category.
- SQL `claim_price(p_brand_id uuid null, p_rank int) → bigint`: `(holder_total − my_total) + 100`, at least `min_bid_cents`. If `p_rank` is past the end of the board → `min_bid_cents`. If the brand already holds that rank or better → null.
- Design (Q8): my own take on outbid.lol's style. A dense, fast, text-first ranked list, Tailwind only, mobile-first, dark and light themes. Set up the design tokens (colours, type scale, spacing) in this WP; every later screen reuses them.
- Home page `/`: tabs for All-time / Today / categories; rows show rank, logo, name, one-liner, total paid, and a "take this spot for $X" button. **Advertise** button hidden behind a feature flag until Phase 2.
- ISR/revalidate: the board page revalidates every 30 s, or on demand after a bid.

**Tests (SQL):** tie-break by `total_reached_at`; claim price for rank 1, middle and past the end; a refunded bid is excluded from the daily board.
**Done when:**
- [ ] BUILD §22 Phase 1: "appear on both boards at the right rank" and "claim price for rank N is shown correctly" both verified.

### P1.8 — Brand page (listing mode)

**Goal:** `/b/[slug]` for organic visitors. Phase 2 adds promo mode.
**Depends on:** P1.7. **Refs:** BUILD §13 step B (layout), step D (`/out/b/{slug}`).

**Build**
- Server-rendered brand card: logo, name, description, rank (all-time and today), category, total paid, a large **Visit {brand}** button → `/out/b/{slug}`.
- "More in {category}" list below.
- `/out/b/[slug]` route: 302 to the brand URL with `utm_source=brandbid&utm_medium=listing`. Preserve existing query params on the brand URL.
- `generateMetadata`: OG/Twitter tags for the brand page itself.
- Inactive or removed brand → 404.

**Done when:**
- [ ] Page renders for active brands.
- [ ] The Visit button lands on the brand site with UTM tags.

### P1.9 — Admin panel v1: listing review

**Goal:** an admin can approve or reject listings, with a full refund on reject.
**Depends on:** P1.4, P1.6. **Refs:** BUILD §18, §8.6, [G3].

**Build**
- `/admin` layout guarded by `requireAdmin()` (admin + signed in within 12 h).
- Listing review queue: pending brands with URL preview, category, bids, owner. Actions: approve → `active`; edit category; reject (with a reason).
- [G3] SQL `reject_listing(p_brand_id, p_admin_id, p_reason)`: one transaction. Sets the brand to `rejected`; for every succeeded bid, sets `bids.status='refunded'` and `refunded_at`, writes `budget_ledger −bid.budget_cents reason 'refund'`, and subtracts from `total_paid_cents` and `budget_cents`; writes `audit_log`. Then the worker calls `processor.refund(payment_id, amount)` for each bid and stores `refund_ref`.
- Every admin action writes `audit_log`.
- Pull-forward from Phase 3: Resend setup and the two emails "listing approved" and "listing rejected (refunded)". A rejected payer needs to hear about their refund. [Q11]

**Tests (SQL):** reject reverses the ledger to 0 and `total_paid_cents` to 0; reject is idempotent.
**Done when:**
- [ ] Reject on staging triggers a test-mode refund.
- [ ] The brand disappears from the boards.

### P1.10 — Brand dashboard v1

**Goal:** brand owners see their rank, pay to rerank, and manage their listing.
**Depends on:** P1.7. **Refs:** BUILD §17 (brand dashboard), §8.

**Build**
- `/dash` lists the brands the user is a member of. `/dash/brands/[slug]` shows:
  - Rank all-time and today, and the price to move up one rank (`claim_price(brand, rank-1)`), with a **Pay to move up** button → checkout. This is the rerank path (D1, D19).
  - Budget (read-only): remaining, total added, owed to waitlisted visitors (D36). The pay button notes "your next $X of budget pays waitlisted visitors first". Rate shown read-only (editing comes in P2.10).
  - Bid history with dates, amounts, split and a receipt link (processor receipt URL).
  - Edit description and logo (RLS-allowed columns only).
- Status banner for `pending_review` and `rejected`.

**Done when:**
- [ ] An owner can rerank from the dashboard and see the new rank after the webhook.
- [ ] Non-members get a 404.

### P1.11 — Observability and analytics

**Goal:** you can see what's happening.
**Depends on:** P1.1. **Refs:** BUILD §4 (Sentry, PostHog).
**Build:** PostHog on web (pageviews plus listing funnel events: `list_started`, `list_prefilled`, `checkout_started`, `bid_succeeded`). Never used for money. Sentry source maps uploaded from the Cloudflare deploy step (use `@sentry/cloudflare` or the `@sentry/nextjs` Workers support; verify which works with the adapter). A worker heartbeat alert if no job ran for 10 min.
**Done when:**
- [ ] The listing funnel is visible in PostHog on staging.

### P1.12 — Environments and deploy pipeline

**Goal:** staging and production exist and deploy safely.
**Depends on:** P1.1, P1.2. **Refs:** BUILD §5. **Needs from you:** [Q7] none of the accounts exist yet. Create them before this WP, in this order:

1. Domain `brandbid.wtf` (D39). Note: `.wtf` is a normal, working TLD, but some email filters and corporate networks distrust unusual TLDs. Set up SPF, DKIM and DMARC for Resend properly and test deliverability early (P3.1).
2. GitHub repo (private) for this monorepo.
3. Supabase: org with 2 projects (`brandbid-staging`, `brandbid-prod`), same region (pick one close to most users; `ap-south-1` if India-first, `us-east-1` if global).
4. Cloudflare (D43): add the `brandbid.wtf` zone (point the registrar's nameservers at Cloudflare; Workers custom domains need the domain on Cloudflare DNS). Upgrade to the **Workers Paid** plan. Two Workers, `brandbid-staging` and `brandbid-prod`, with domains `staging.brandbid.wtf` and `brandbid.wtf`. Create an R2 bucket per environment for Next's incremental cache. A scoped API token for CI (Workers deploy only).
5. AWS (D40): an account with billing alerts and an IAM role for CI (GitHub OIDC, no long-lived keys). Per environment: an ECR repo, an ECS Fargate service for the worker (1 task, 0.25 vCPU / 0.5 GB to start, always on because pg-boss polls), secrets in Secrets Manager, logs in CloudWatch. Deploy from GitHub Actions: build the worker image, push to ECR, update the service. Infrastructure as code (Terraform or CDK, pick one in P1.12) so staging and production match. Use a region close to the Supabase one. The worker needs the Supabase **direct** connection string, so check the connection limits and whether Supabase's IPv4 add-on is needed (Fargate tasks in public subnets can reach IPv4 only if the DB endpoint is IPv4).
6. Razorpay: account with test keys now; KYC, international cards activation and live keys before launch.
7. Cloudflare Turnstile site (test keys work locally), Upstash Redis (one DB per environment), Resend (verify the sending domain), Sentry (web and worker projects), PostHog.

**Build**
- Supabase projects: staging and production. Cloudflare Workers `brandbid-staging` and `brandbid-prod` (wrangler environments), deployed from GitHub Actions; previews use the staging DB. AWS: worker staging and production ECS services (D40).
- CI: on merge to `staging` → `supabase db push` to staging → `opennextjs-cloudflare deploy --env staging`. On merge to `main` → push to production → deploy. Migrations run **before** the web deploy.
- **OpenNext adapter setup (D43):** add `@opennextjs/cloudflare` and `wrangler` to `apps/web`; `open-next.config.ts` (R2 incremental cache); `wrangler.jsonc` with `nodejs_compat`, a current `compatibility_date`, the assets binding, and `staging`/`production` environments; scripts `preview` (local Workers runtime) and `deploy`. Remove any `export const runtime = 'edge'` (the build fails on it). Check the compressed bundle size against the plan limit, and run `wrangler dev` against the local Supabase to confirm Supabase, Upstash and Turnstile calls work from the Workers runtime.
- Secrets set in each dashboard (Cloudflare Worker secrets for web). Confirm local/preview can never reach production (separate keys, no prod keys in preview env).

**Done when:**
- [ ] A PR → staging → main flow deploys a migration and a web change to both environments.

### Phase 1 exit (BUILD §22)
- [ ] A user can list a brand, pay in test mode, and appear on both boards at the right rank.
- [ ] Each bid writes the correct 50/50 split; the budget ledger sums to `budget_cents`.
- [ ] A repeated webhook doesn't create a second bid.
- [ ] Claim price for rank N is shown correctly.

---

# Phase 2 — Advertise (closed beta, no withdrawals)

**Outcome:** promoters get links, share them, and real clicks plus 10 active seconds create pending earnings drawn from brand budgets. Nothing settles and nothing is withdrawn yet.

**Decided:** no short domain at launch (D31), no `bb_vid` at `/go` for EU/EEA/UK (D32), email allowlist beta (D33).

### P2.1 — Promoter onboarding (steps 1–3)

**Goal:** tap Advertise, then within a minute you're on the share sheet.
**Depends on:** P1.4. **Refs:** BUILD §10 steps 1–3, D5, [Q6].

**Build**
- The **Advertise** button on board rows and brand pages, behind the beta flag.
- Flow: not signed in → `/signin?next=/b/{slug}?advertise=1` → profile step if `handle` or `promoter_terms_accepted_at` is missing → back to the brand with the share sheet open.
- `/onboarding/promoter`: handle (live availability check, regex, reserved list including brand slugs), country (prefilled from the `cf-ipcountry` header, editable, ISO list), terms checkbox linking to `/terms/promoter` (copy from BUILD §10 step 2). Saving it sets `promoter_terms_accepted_at`.
- Email verified check: `auth.users.email_confirmed_at` is not null. Google and magic link both set it, but check anyway.
- `/earn` landing page explaining the program, CTA into the same flow.
- Beta gate (D33): `settings.beta_allowlist` holds a JSON array of lowercase emails. Advertise shows only for allowlisted signed-in users, and `get_or_create_link` checks it too, so the gate holds server-side. Signed-out visitors see Advertise, and after sign-in a non-allowlisted user gets a "join the waitlist" screen (stores the email). Add a minimal `/admin/beta` screen to edit the list; the full settings editor comes in P3.8. Removing the gate later = setting `beta_allowlist` to `null` (meaning "open to all").
- [G10] Start writing `member_signals` (user_id, ip_hash, ua_hash, seen_at) on dashboard page loads for brand members. R9 in Phase 3 needs 30 days of history.

**Done when:**
- [ ] A new user goes from tapping Advertise to the share sheet in under a minute (timed).
- [ ] Taken and reserved handles are rejected.

### P2.2 — `get_or_create_link`

**Goal:** one stable link per promoter × brand × channel.
**Depends on:** P1.2, P1.3, P2.1. **Refs:** BUILD §11, D20.

**Build**
- SQL `get_or_create_link(p_promoter_id, p_brand_id, p_channel)`, following the three steps in BUILD §11. Raises a named error `self_promotion` if the promoter is a brand member, and `not_eligible` for status, email or terms problems.
- Code generation: SQL can't call the TS `randomCode`. Either (a) generate the code in a server action and pass it in, retrying up to 5 times on a code collision (recommended, because it keeps one code generator), or (b) write a matching base62 generator in SQL using `gen_random_bytes`. Pick (a).
- Server action `getShareLinks(brandId)` returns all four channel links (creating them lazily), as full URLs `https://brandbid.wtf/go/{code}` (D31, D39, no short domain). Build the URL from one helper `linkUrl(code)` in `shared`, so adding a short domain later changes one function.

**Tests (SQL):** existing link returned; brand member refused; suspended promoter refused; 2 parallel calls produce 1 row.
**Done when:**
- [ ] All tests pass.
- [ ] The share sheet shows the "You can't promote a brand you're part of." message for members.

### P2.3 — Share sheet

**Goal:** from tap to shared in under 20 s on all four channels.
**Depends on:** P2.2, P2.4. **Refs:** BUILD §12, D11.

**Build**
- A bottom sheet (mobile) or modal (desktop) with four options. Editable share text from the BUILD §12 template. If the user removes `#ad`, add it back on share. Disclosure can't be removed (D11).
- X: intent URL. LinkedIn: copy text, show a toast, open share-offsite. Plain link: copy. Story: download or Web Share the image (P2.4), copy the link, and show a first-time 3-step guide (remembered in localStorage).
- PostHog events per channel tap.

**Done when:**
- [ ] Each channel tested on iOS Safari, Android Chrome, desktop Chrome.

### P2.4 — OG preview and story images

**Goal:** previews that look good in feeds and chats.
**Depends on:** P1.8. **Refs:** BUILD §12 (story, link previews).

**Build**
- `/api/og/[code]` → 1200×630 PNG via `next/og`: logo, name, rank, "on brandbid". Bundle the fonts. **First step: verify `ImageResponse` runs on Workers via OpenNext** (wasm and font bundling are the usual trouble). If it doesn't, use Satori + `@resvg/resvg-wasm` directly.
- `/api/story/[code].png` → 1080×1920: logo, name, one-liner, rank, "on brandbid", "link in sticker" hint.
- Cache in Storage `story-cache/{brand_id}/{rank}-{logo_hash}.png`. The cache key changes when the rank or logo changes. CDN `Cache-Control: public, max-age=3600`.
- Broken or missing logo → fallback monogram.

**Done when:**
- [ ] Images render for brands with long names, missing logos, and transparent logos.

### P2.5 — `/go/[code]` redirect

**Goal:** count human clicks, skip previews, prefetches and bots, and redirect in under 100 ms.
**Depends on:** P1.3, P2.2, P2.4. **Refs:** BUILD §13 step A, §20, D31, D32.

**Build** (follow BUILD §13 A1–A9 in order)
- Plain route handler on the Node.js runtime (no `runtime = 'edge'`, D43). It runs at Cloudflare's edge anyway. Rate limit with Upstash (REST, works from Workers): 30/min per ip_hash. Over the limit, still redirect, but `ignored_reason='rate_limited'`.
- Code lookup: a module-level `Map` cache with 60 s TTL, then Supabase REST (service role) → `{ link_id, brand_id, slug, promoter_id, status, brand_status }`. Unknown, disabled, or inactive brand → 302 to `/`.
- Bot/preview detection: `isbot(ua)` OR our list → 200 HTML with OG/Twitter tags (BUILD §12). Not logged.
- `Sec-Purpose: prefetch` / `Purpose: prefetch` → 204.
- `bb_vid` cookie: read it if present. If absent, set a new 128-bit random value **unless** the country is in `CONSENT_COUNTRIES` (EU/EEA/UK, D32). Those visitors get no cookie at `/go`; matching uses IP+UA until the brand page sets `bb_vid` after consent (P2.7). An EU visitor who already consented has the cookie, and it's read normally.
- Hashes via `shared/hash.ts`. Country from `cf-ipcountry`; client IP from `cf-connecting-ip`.
- Session user id: read the Supabase auth cookie (same domain, brandbid.wtf, D31, D39) and verify the JWT locally (no network call) to get `viewer_user_id` for the self/member check.
- `click_id = crypto.randomUUID()`. **302** to `/b/{slug}?c={click_id}&l={code}` [G6].
- `getCloudflareContext().ctx.waitUntil(rpc('record_click', {...}))`. Failures go to Sentry. The visitor never waits.

**Tests (Vitest):** bot list classification (a fixture of real UA strings from each platform); prefetch → 204; the redirect is 302 and never 301; unknown code → `/`.
**Done when:**
- [ ] p95 under 100 ms measured from 3 regions on staging. If not, split `/go` into its own tiny Worker (route `brandbid.wtf/go/*`) and re-measure.
- [ ] Preview fetches from X, LinkedIn, WhatsApp, Slack, Discord and iMessage render cards and log no click.

### P2.6 — `record_click`

**Goal:** turn a raw click into a visitor and claim, following the attribution rules.
**Depends on:** P1.2. **Refs:** BUILD §13 step A9, §14 (attribution examples), D8, D16, D24.

**Build**
- SQL `record_click(p_click_id, p_link_id, p_brand_id, p_promoter_id, p_viewer_user_id, p_cookie_id, p_ip_hash, p_ua_hash, p_user_agent, p_country, p_referrer, p_rate_limited bool)`:
  1. `ignored_reason`: `self` if viewer = promoter; `brand_member` if the viewer is a member; `banned_promoter` if the promoter isn't active; `rate_limited` if flagged. Ignored clicks are inserted without a claim.
  2. Visitor match for this brand: `visitor_keys` on `cookie` hash, then `ipua` hash (`hmac(ip_hash||ua_hash)`). If none, create a visitor. Upsert any new keys pointing at the visitor (`on conflict do nothing`).
  3. Claim rule (BUILD §13 A9): set a claim if there's none, or if it expired and the visitor never qualified. `claim_rate_cents = brand.rate_cents` at this moment (D24).
  4. Insert the click with `visitor_id`.
  5. Idempotent on `click_id` (primary key), so retries are safe.
- Lock the visitor row (`for update`) during the claim decision, so two near-simultaneous clicks from different promoters don't both claim.

**Tests (SQL):** every row of the BUILD §14 attribution table, as named tests. Clock control: tests pass explicit timestamps, or the function takes an optional `p_now` used only in tests. Self and member clicks create no claims.
**Done when:**
- [ ] All attribution tests pass.

### P2.7 — Brand page promo mode and qualify script

**Goal:** a promo visitor sees whose link they came through, and the page measures 10 real active seconds.
**Depends on:** P1.8, P2.5. **Refs:** BUILD §13 step B, §20 (consent), [G6].

**Build**
- When `?c=` is present (valid UUID) and `?l=` resolves to a link for this brand, show the banner "You're here via **@handle** on brandbid". Respect `leaderboard_public`? No: the banner always shows the handle, because it's the promoter's own share.
- `qualify.ts` client module, per BUILD §13 B1–B7: invisible Turnstile; FingerprintJS (only with consent where required); an active-time counter that runs only while visible and only after the first interaction (`pointermove`, `pointerdown`, `scroll`, `touchstart`, `keydown`); fire once at ≥10 000 ms with `fetch('/api/q', { keepalive: true })`. Keep going after the tab is hidden and shown again.
- Consent banner for EU/EEA/UK (country header → `CONSENT_COUNTRIES` in `shared/constants.ts`). Accept → call `POST /api/consent` with the click ID. It sets `bb_vid` (same attributes as `/go`) and adds the cookie key to this click's visitor in `visitor_keys`, so later visits match. Fingerprinting is then allowed for `/api/q`. Decline → no cookie, no fingerprint; IP+UA only (D32). Store the choice in a separate `bb_consent` cookie so the banner doesn't come back.
- Strip `c` and `l` from the visible URL with `history.replaceState` after reading them, so a shared screenshot or copied URL doesn't carry the click ID.

**Tests:** unit-test the active-time counter with fake timers and visibility events; Playwright: a real 10 s session sends exactly one `/api/q` request, and an idle session sends none.
**Done when:**
- [ ] Banner shows the right handle.
- [ ] Idle or hidden tabs never qualify.

### P2.8 — `/api/q` and `qualify_visitor`

**Goal:** the money moment: safe under heavy concurrency, never paying twice, never overdrawing a budget.
**Depends on:** P2.6, P2.7. **Refs:** BUILD §14, §15 (cycles), §7, [G5, G12].

**Build**
- `/api/q` route (Node runtime): rate limit 10/min per ip_hash → zod → `active_ms >= 10000` → Turnstile siteverify → hashes from this request → `rpc('qualify_visitor', ...)`. **Always return 204.**
- SQL `qualify_visitor(p_click_id, p_fp_hash, p_cookie_id, p_ip_hash, p_ua_hash, p_active_ms, p_interactions)`, following BUILD §14 steps 1–7 exactly (step 6 is the D36 waitlist: when the budget can't cover the rate, **or** the brand already has a waitlist, insert a `waitlisted` earning and reserve nothing), plus:
  - Store [G12] `qualified_ip_hash / fp_hash / active_ms / interactions` on the visitor (needed by R1, R2 and R5).
  - `cycle_ends_at` per BUILD §15: `claim_link.created_at + interval '24 hours' * (floor(extract(epoch from now() - claim_link.created_at) / 86400) + 1)`. Read `cycle_hours` from settings.
  - "Queue email" → insert into `notification_outbox` [G5] with a dedupe key. Sending happens in Phase 3.
  - Lock order: visitor row first, then brand row, always in that order, to avoid deadlocks with `record_click`.
- [Risk] Step 1's IP/UA match can fail legitimately (mobile network switching between IPv4 and IPv6, or carrier NAT). Log the rejection reason to a counter (a `qualify_rejections` table or PostHog server event) so the false-reject rate can be measured in beta before tightening or loosening it.

**Tests (SQL):** every reject path; budget exactly equal to the rate (pays, then pauses); budget below the rate (waitlisted earning, no ledger row, pauses, outbox row); budget available but a waitlist exists (the new visitor is waitlisted behind it, no queue-jumping); a fingerprint seen on an already-qualified visitor rejects; `cycle_ends_at` math at cycle boundaries.
**Concurrency test** `packages/db/tests/concurrency.ts`: 1 000 parallel qualifications at one brand with budget for 300, spread across 5 promoters. Assert exactly 300 `pending` and 700 `waitlisted`; `budget_cents = 0` and never < 0; no visitor paid twice; every pending earning's `created_at` ≤ every waitlisted one's (strict order). Then record a bid that funds 200: assert the 200 **oldest** waitlisted become pending and 500 remain. Also run it with duplicate click IDs mixed in.
**Done when:**
- [ ] The concurrency test passes in CI.

### P2.9 — `/out/[click_id]`

**Goal:** a click-through to the brand site with UTM tags.
**Depends on:** P2.6. **Refs:** BUILD §13 step D.
**Build:** look up the click → set `outbound_at` if null → 302 to the brand URL plus `utm_source=brandbid&utm_medium=promoter&utm_campaign={handle}&utm_content={channel}`. Merge with existing params on the brand URL. Unknown click → fall back to `/out/b/{slug}` behaviour, or `/`.
**Done when:**
- [ ] UTM tags show in a test brand site's GA/Plausible (BUILD §22: "brands see brandbid traffic").

### P2.10 — Rate setting and pause state

**Goal:** brands set their per-visitor rate; the ads state is honest.
**Depends on:** P1.10. **Refs:** BUILD §8 (rate, pausing), D12, D22, D24.
**Build:**
- Rate input on the brand dashboard, defaulting to the floor, rejecting anything below the current floor. A DB trigger enforces `rate_cents >= settings.floor_cents` on update, so RLS-allowed client writes can't bypass it.
- Live estimate: "Your $X budget pays for about N visitors at this rate."
- Changing the rate updates `ads_enabled` (budget < rate → false).
- Copy explains that the change applies from the next claim click (D24).
**Done when:**
- [ ] Below-floor writes fail at the DB level.
- [ ] The estimate is correct.

### P2.11 — Promoter dashboard (no withdraw)

**Goal:** promoters see what their links do.
**Depends on:** P2.8. **Refs:** BUILD §17 (promoter), §15 (earnings view).
**Build:** `/dash/promoter`: pending total and waitlisted total (no "available" yet, but build the component for it), and per brand then channel: clicks, qualified visitors, qualification rate, pending earnings, waitlisted earnings with expiry date, current cycle end (countdown), brand budget status ("active" / "budget used up — new visitors are waitlisted"). Withdraw button shown disabled with "coming soon".
**Done when:**
- [ ] Numbers match direct SQL counts for a seeded dataset.

### P2.12 — Brand traffic stats

**Goal:** brands see what their budget bought.
**Depends on:** P2.8, P2.9. **Refs:** BUILD §17 (brand: traffic).
**Build:** clicks, qualified visitors and click-throughs by day, channel and country, for the last 30 days. Use SQL views or functions scoped by `is_brand_member`. Budget spent and estimated visitors left. Use the dataviz skill for the charts.
**Done when:**
- [ ] Charts match direct SQL counts.

### P2.13 — Seed and load data tooling

**Goal:** realistic local data and a click simulator for testing the pipeline.
**Depends on:** P2.6.
**Build:** `pnpm seed` creates brands, promoters, links, clicks and qualifications across days and channels. `scripts/simulate-clicks.ts` drives `/go` → `/api/q` against local or staging with Turnstile test keys.

### P2.14 — End-to-end and beta readiness

**Goal:** prove the Phase 2 loop.
**Depends on:** all of Phase 2. **Refs:** BUILD §5 (testing), §22 Phase 2.
**Build:** Playwright: sign up → profile → link → click (new browser context) → 10 s of activity → one pending earning at the claimed rate. Manual checklist: real shares on X, LinkedIn and WhatsApp and their preview cards.

### Phase 2 exit (BUILD §22)
- [ ] Sharing a link on X, LinkedIn and WhatsApp produces a correct preview and no counted click from the preview fetch.
- [ ] A real click + 10 active seconds produces exactly one pending earning at the claimed rate.
- [ ] Clicks by the promoter or brand members never create claims.
- [ ] The 1,000-parallel-qualification test never takes the budget below zero or pays a visitor twice.
- [ ] Every attribution example in BUILD §14 passes as an automated test.
- [ ] Brands see brandbid traffic with the UTM tags in their own analytics.

---

# Phase 3 — Money out

**Outcome:** earnings settle every cycle, fraud is caught before payout, promoters withdraw real money, stagnant budgets can be refunded, and the ledgers reconcile every night.

**Hard gate before any real payout:** P3.0 is done (BUILD §21 answered, terms and privacy published). Build P3.1–P3.11 in test mode while the gate is pending.

### P3.0 — Legal and provider gate
**Goal:** the decisions and legal checks every live-money step depends on. **Refs:** BUILD §21, §23.
**Output:** payout provider(s), KYC provider, phone provider, and the tax info to collect, all logged in BUILD §3. Terms (brand and promoter), privacy policy and refund policy drafted and reviewed (P3.12).

### P3.1 — Notifications infrastructure
**Depends on:** P2.8 (outbox exists). **Refs:** BUILD §19.
**Build:** `packages/emails` (React Email templates, one per row in BUILD §19). Worker `notify` job drains `notification_outbox` every minute: renders, sends via Resend, sets `sent_at`. Dedupe keys enforce "max once a day" and the daily digests (budget used up, refilled). Hourly admin digest; reconciliation failures sent immediately. Unsubscribe link for non-transactional emails.
**Done when:**
- [ ] Every BUILD §19 email can be triggered on staging and renders in Gmail and Outlook.

### P3.2 — Settlement
**Depends on:** P2.8, P3.3. **Refs:** BUILD §15 (cycles, settlement).
**Build:** SQL `settle_due_earnings()`. The worker `settle-cycles` runs every 5 min and selects pending earnings with `cycle_ends_at <= now()` grouped by link, using `for update skip locked` so overlapping runs are safe. It calls the fraud scorer (P3.3) for each group: no open flags → `available` and `settled_at` plus `promoter_ledger +amount 'earning'`; an open flag → `flagged`. Trust +1 per clean cycle (max +50). Outbox "earnings available". The same job expires waitlisted earnings older than `waitlist_days` (status `expired`, no money moves), and sends the "expiring in 3 days" digest (D36).
**Tests (SQL):** settles at exactly the cycle end and not one second before; a flagged group never becomes available; a re-run is a no-op; a waitlisted earning funded late settles at the end of its *funding* cycle; waitlisted entries expire at 30 days and not before.

### P3.3 — Fraud rules and trust score
**Depends on:** P2.8, [G10–G12]. **Refs:** BUILD §16.
**Build:** each rule R1–R6, R8 and R9 as a SQL function or query returning `(subject, score, details)`, with thresholds read from `settings`. Group score ≥ 50 → `fraud_flags` rows (status `open`). Below 50, record the history and adjust trust. Trust thresholds: < 0 means withdrawals are reviewed; < −30 means auto-suspend. R9 uses `member_signals`, the `bids` payer email and fingerprint, the email domain against the brand URL, and the payout account name.
**Tests:** a fixture dataset per rule that triggers it, plus a near-miss fixture that doesn't.

### P3.4 — Phone verification
**Depends on:** P3.0. **Refs:** BUILD §10 step 4.1, [G16].
**Build:** SMS OTP through the chosen provider. Store `phone_hash` (HMAC) unique, plus `phone_verified_at`. Rate limit OTP sends.

### P3.5 — Payout account, KYC, tax details
**Depends on:** P3.0, P3.4. **Refs:** BUILD §10 step 4.2–4.4.
**Build:** a provider adapter (like the payments one). Onboarding flow → `payout_accounts` (unique provider + external_id). KYC status from provider webhooks → `kyc_status`. Tax details per the CA's guidance, stored encrypted or kept with the provider (decided at P3.0).

### P3.6 — Withdrawals
**Depends on:** P3.2, P3.5. **Refs:** BUILD §15 (withdrawal), §7.9, D17, D26, D28.
**Build:** SQL `request_withdrawal(p_promoter_id)`: locks the promoter's ledger (advisory lock on promoter_id), checks balance ≥ min, no open withdrawal and status active, writes the withdrawal (whole balance) plus ledger −amount. Sets status `review` if it's the first withdrawal or trust < 0, otherwise `processing`. Worker `process-withdrawals` every 15 min sends to the provider, records `external_ref` and `fee_cents`, and marks `paid` on webhook or poll. Failure → `failed` plus ledger `+amount 'withdrawal_failed'` and a notification. UI: Withdraw button, payout setup redirect, history with fees.
**Tests (SQL):** concurrent double-tap creates one withdrawal; below minimum refused; negative balance refused.

### P3.7 — Reversal, clawback, ban
**Depends on:** P3.2. **Refs:** BUILD §15 (clawback), §16 (review outcomes), D27.
**Build:** SQL `reverse_earning(p_earning_id, p_reason, p_admin_id)`: earning → `reversed`; budget_ledger `+amount 'reversal'`; if the earning was available or withdrawn, `promoter_ledger −amount 'clawback'`; then `fund_waitlist(brand)`, so money recovered from fraud pays honest waitlisted promoters first (D36). A waitlisted earning found to be fraudulent is just set to `reversed`, with no money moving. `ban_promoter`: status `banned`, positive balance → `forfeit` row, links disabled.
**Tests (SQL):** clawback goes negative, then the next earnings bring it back to zero; reversing a pending earning only touches the budget.

### P3.8 — Admin panel v2
**Depends on:** P3.3, P3.6, P3.7. **Refs:** BUILD §18.
**Build:** fraud queue (flag, rule, score, related clicks and visitors, clear or confirm → `reverse_earning`); withdrawal review (approve → `processing`, hold); users (search, suspend, ban, ledgers, adjust trust); brands (search, remove, ledgers, disable ads); settings editor (floor, split, min withdrawal, claim days, cycle hours, thresholds). Raising the floor runs `apply_new_floor()`, which moves brands below it up and sends an outbox email. Reconciliation results screen. Everything audited.

### P3.9 — Budget refunds (D23)
**Depends on:** P3.2. **Refs:** BUILD §8 (refund).
**Build:** an eligibility function (`budget_cents > 0`, and `coalesce(last_spend_at, first_bid_at) <= now() − stagnation_days`). SQL `refund_budget(p_brand_id, p_requester)`: settle the brand's pending earnings first (call settlement scoped to the brand), then disable ads, insert a `budget_refunds` row, and write budget ledger −remaining 'refund'. **Only ad budget is refunded (D37):** the worker splits the refund across the most recent bids within the processor's refund window. Each bid gives back at most `budget_cents − budget_refunded_cents`, and `budget_refunded_cents` is incremented. Revenue is never returned. Example: a $100 bid ($50 budget) with $30 unspent → refund $30 against that bid; a later stagnation refund can return at most another $20 from it. If a bid is outside the window, mark it for manual handling and write `audit_log`. Brand dashboard button and eligibility notification. Rank unchanged.

### P3.10 — Reconciliation and data hygiene
**Depends on:** P3.2. **Refs:** BUILD §7 (invariants), §20 (privacy).
**Build:** the nightly `reconcile-ledgers` job checks every BUILD §7 invariant (cache = ledger sum, budget ≥ 0, one earning per visitor, earning = claim rate, split math per bid, promoter balance = ledger sum, no negative balance without a clawback, exactly one `visitor` ledger row per funded earning and none per waitlisted/expired one, no brand holding a fundable waitlist head, `budget_refunded_cents ≤ budget_cents`). Results go to a table plus the admin screen; failures alert immediately. A nightly UA-strip job nulls `clicks.user_agent` older than 90 days.

### P3.11 — Brand dashboard v2
**Depends on:** P3.9, P3.3. **Refs:** BUILD §17.
**Build:** refund button (when eligible); "Report suspicious traffic" → `fraud_flags`; team members invite by email (D34: Phase 3). New `brand_invites` table (brand_id, email, token hash, invited_by, expires_at, accepted_at). The owner invites, the invitee accepts after sign-in, and that creates a `brand_members` row (role `member`). Members can view stats and edit description/logo/rate. Only the owner can pay or request refunds. Members can't create links for the brand (existing self-promotion rule).

### P3.12 — Legal pages
**Build:** `/terms`, `/terms/promoter`, `/privacy`, `/refunds`, with the reviewed text from P3.0. Link them from the footer, the sign-up and listing checkout, and the promoter onboarding.

### P3.13 — Live money launch
**Build:** switch the processor and payout provider to live. Smallest live test withdrawal end to end. Monitor reconciliation for 7 clean days.

### Phase 3 exit (BUILD §22)
- [ ] Earnings move pending → available at the exact cycle end.
- [ ] Flagged earnings never become available without review.
- [ ] A test withdrawal reaches a real payout account (smallest live amount) and is marked paid.
- [ ] A clawback produces a negative balance that the next earnings recover.
- [ ] A stagnant brand can request and receive a refund; pending earnings are settled first.
- [ ] Nightly reconciliation runs clean for 7 days.

---

# Phase 4 — Growth and scale

| WP | What | Refs |
| --- | --- | --- |
| P4.1 | Public promoter leaderboards (week, all time): materialized views refreshed every 5 min, settled earnings only, `leaderboard_public=false` shown as "anonymous" | §9 |
| P4.2 | Discover brands for promoters: highest rate × remaining budget | §17 |
| P4.3 | Top promoters per brand on brand pages | §9 |
| P4.4 | R7 with an IP intelligence service (data-centre and VPN ranges) | §16, §23 |
| P4.5 | Evaluate Fingerprint Pro against measured duplicate leakage | §4 |
| P4.6 | Upstash Redis click queue between `/go` and the DB, batched worker writes (when sustained traffic passes about 50 clicks/s) | §13 |
| P4.7 | More payout rails | §23 |
| P4.8 | Fraud threshold tuning from real data; log every change in BUILD §3 | §16 |

---

## Gaps and proposed additions

Found while breaking BUILD.md into WPs. Each needs a BUILD.md §3 entry once approved. Unless you object, I'll build them as proposed.

| # | Gap | Proposed fix | WP |
| --- | --- | --- | --- |
| G1 | Rank tie-break "whoever reached that total first" has no column to sort on | `brands.total_reached_at`, set by `record_bid` | P1.2, P1.5 |
| G2 | Promoter leaderboard opt-out (§9) has no column | `profiles.leaderboard_public bool default true` | P1.2 |
| G3 | Rejected listings are refunded in full, but no function reverses a bid; `budget_refunds` only covers budget | `reject_listing()` function, plus `bids.refunded_at`, `bids.refund_ref` | P1.9 |
| G4 | The brand row must exist before payment, but there is no pre-payment status | Add brand status `draft`; clean up after 7 days | P1.6 |
| G5 | SQL functions "queue email", but there is no queue the SQL side can write to | `notification_outbox` table (kind, recipient, payload, dedupe_key unique, sent_at), drained by `notify` | P1.2, P3.1 |
| G6 | The brand page banner needs the handle, but the click row is written *after* the redirect (`waitUntil`), so the page can load before it exists | Redirect to `/b/{slug}?c={click_id}&l={code}`; look up the handle by link code | P2.5, P2.7 |
| G10 | R9 needs brand members' dashboard IP/fingerprint for 30 days; nothing records it | `member_signals` table; start logging in Phase 2 | P2.1, P3.3 |
| G11 | R9 needs the card or payment email of bids; `bids` doesn't store it | `bids.payer_email`, `bids.payment_fingerprint` | P1.2, P1.5 |
| G12 | R1, R2 and R5 need the qualification IP, fingerprint and active time; `/api/q` data isn't persisted | `visitors.qualified_ip_hash, qualified_fp_hash, qualified_active_ms, qualified_interactions` | P2.8 |
| G13 | The 90-day UA strip (§20) isn't in any phase | Nightly job in P3.10 | P3.10 |
| G16 | "One phone number per account" has no column | `profiles.phone_hash unique` | P3.4 |
| G18 | BUILD §8 names categories that need manual review, but `categories` had no way to say which | `categories.requires_review` (D42) | P1.2, P1.6 |
| G17 | Brand team invites (§17) are in no phase and have no table | `brand_invites` table, Phase 3 (D34) | P3.11 |

Risks to watch:
- **IP/UA match at qualification** (§14 step 1) can reject real people when mobile networks switch between IPv4 and IPv6. Measure the reject rate in beta (P2.8) before launch.
- **pg-boss on Supabase** needs the direct connection string, not the transaction pooler.
- **In-app browsers** (Instagram, LinkedIn) may block `navigator.share` with files and third-party Turnstile iframes. Test early in P2.3 and P2.7.

---

## Open questions

| # | Question | Status |
| --- | --- | --- |
| Q1 | Payment processor | **Decided:** Razorpay, behind an adapter (D29) |
| Q2 | Minimum bid amount | **Decided:** $10 (D30) |
| Q3 | Daily board timezone | **Default:** UTC, as BUILD assumes. Say if you want otherwise |
| Q4 | Short domain vs cookies | **Decided:** no short domain at launch; links are `brandbid.wtf/go/{code}` (D31, D39) |
| Q5 | EU cookie at `/go` | **Decided:** no `bb_vid` at `/go` for EU/EEA/UK; set after consent on the brand page (D32) |
| Q6 | Closed-beta gating | **Decided:** email allowlist in `settings` (D33) |
| Q7 | Accounts | **Open:** none exist yet. Checklist in P1.12. Blocks P1.12 only |
| Q8 | Design direction | **Decided:** my own take on outbid.lol's style (P1.7) |
| Q9 | Team invites phase | **Decided:** Phase 3 (D34) |
| Q11 | Listing approved/rejected emails in Phase 1 | **Default:** yes |
| Q12 | Category list for the seed | **Default:** I draft about 15 in P1.2; you edit |
| Q13 | Domain | **Decided:** `brandbid.wtf` (D39) |
| Q15 | AWS compute for the worker | **Default:** ECS Fargate, always-on, 1 task per environment (D40). Lambda doesn't suit pg-boss, which needs a long-running process |
| Q14 | Refund for a rejected listing | **Decided:** full amount (D38) |
