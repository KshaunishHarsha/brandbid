# BUILD.md — brandbid

This is the single source of truth for building brandbid: what we decided, why, and exactly how each part is built. If code, a ticket, a chat, or the planning doc disagrees with this file, this file wins. Change it by pull request, and log every decision change in section 3.

Last updated: 2026-10-24

---

## Contents

1. [Product summary](#1-product-summary)
2. [Glossary](#2-glossary)
3. [Decisions log](#3-decisions-log)
4. [Tech stack and repository](#4-tech-stack-and-repository)
5. [Environments and dev process](#5-environments-and-dev-process)
6. [Data model](#6-data-model)
7. [Money rules and invariants](#7-money-rules-and-invariants)
8. [Brands: listing, pay-to-rank, rate, refunds](#8-brands-listing-pay-to-rank-rate-refunds)
9. [Leaderboards](#9-leaderboards)
10. [Promoter onboarding](#10-promoter-onboarding)
11. [Promo link generation](#11-promo-link-generation)
12. [Sharing](#12-sharing)
13. [Click tracking pipeline](#13-click-tracking-pipeline)
14. [Qualification and attribution](#14-qualification-and-attribution)
15. [Payout engine](#15-payout-engine)
16. [Fraud controls](#16-fraud-controls)
17. [Dashboards](#17-dashboards)
18. [Admin panel](#18-admin-panel)
19. [Notifications](#19-notifications)
20. [Security and privacy](#20-security-and-privacy)
21. [Legal and compliance checklist](#21-legal-and-compliance-checklist)
22. [Build phases and acceptance criteria](#22-build-phases-and-acceptance-criteria)
23. [Still to decide](#23-still-to-decide)

---

## 1. Product summary

brandbid is a public pay-to-rank brand leaderboard (modelled on outbid.lol) with a built-in promotion network.

- **Brands** pay to claim a rank. Every payment is split: 50% is brandbid revenue, 50% goes into that brand's own ad budget.
- **Promoters** (any signed-up user) tap **Advertise** on any brand, get a unique link, and share it to an Instagram story, LinkedIn, X, or anywhere else.
- **Visitors** who click a promo link land on the brand's page on brandbid. A visitor who is new to that brand and stays active for 10 seconds is a **qualified visitor**.
- **Each qualified visitor** moves the brand's per-visitor rate (set by the brand, at least $0.10) from the brand's budget to the promoter who brought them.
- **Earnings settle in 24-hour cycles** and are withdrawable as soon as a cycle settles. Links keep working until the brand's budget runs out.

Goals of the feature: give brands a reason to pay beyond rank, give the public a reason to share brandbid, and send traffic through brandbid itself.

---

## 2. Glossary

Use these terms in code, UI, and docs. Don't use synonyms.

| Term | Meaning |
| --- | --- |
| Brand | A listed product or company with a page and a rank |
| Brand owner | The user who listed the brand and pays for it. Brand members are other users on the brand's team |
| Bid | Any payment by a brand (first listing or rerank) |
| Budget | A brand's ad money. 50% of each bid. Stored in cents |
| Rate | Amount (cents) the brand pays per qualified visitor. Minimum is the floor |
| Floor | brandbid's minimum rate. Currently $0.10 |
| Promoter | A user who shares promo links and earns (called "advertiser" in early planning; the code says promoter) |
| Link | A promoter's unique short link for one brand and one channel |
| Channel | Where a link is meant to be shared: `story`, `linkedin`, `x`, `link` |
| Click | One human request to a link (bots and previews excluded) |
| Visitor | One person, as best we can identify them, per brand |
| Claim | A promoter's first-click credit on a visitor for a brand. Lasts 7 days |
| Qualified visitor | A visitor new to the brand who stayed 10 active seconds on the brand page |
| Earning | Money owed to a promoter for one qualified visitor |
| Cycle | A 24-hour window of a link, counted from the link's creation time |
| Settlement | End-of-cycle processing that turns pending earnings into available ones |
| Clawback | Recovering fraudulent earnings that were already withdrawn, from future earnings |
| Stagnation | A brand's budget paying for zero qualified visitors for 30 days in a row |
| Waitlist | Qualified visitors a brand couldn't pay for because its budget had run out. Paid in qualification order when budget returns; each entry expires after 30 days |

---

## 3. Decisions log

Every product decision, with the date it was made. To change one, add a new row that supersedes it; don't edit old rows.

| # | Date | Decision |
| --- | --- | --- |
| D1 | 2026-10-14 | Leaderboard works like outbid.lol: rank by total paid; pay more to rerank. All-time and daily boards. |
| D2 | 2026-10-14 | Each bid splits 50/50: revenue / brand budget. Split is configurable (tentative). |
| D3 | 2026-10-14 | Budgets are per brand. No shared pool. |
| D4 | 2026-10-14 | Budget is spent until it runs out. |
| D5 | 2026-10-14 | Promoters must sign up and verify email to get links. |
| D6 | 2026-10-14 | Promoters worldwide. |
| D7 | 2026-10-14 | No cap on brands per promoter or on earnings. |
| D8 | 2026-10-14 | Uniqueness is per brand. First link clicked gets the credit. |
| D9 | 2026-10-14 | Promo links land on a brandbid brand page with a "via @handle on brandbid" banner. |
| D10 | 2026-10-14 | brandbid operates as a sole proprietorship (see section 21). |
| D11 | 2026-10-14 | Shared posts must carry ad disclosure (#ad). |
| D12 | 2026-10-14 | Rate is a fixed amount per qualified visitor, set by the brand, at or above the floor. |
| D13 | 2026-10-14 | Public promoter leaderboard, ranked by earnings. |
| D14 | 2026-10-15 | Qualification = 10 active seconds on the brandbid brand page. No script on brand sites. |
| D15 | 2026-10-15 | Links work until the budget is used up and settle in 24-hour cycles. |
| D16 | 2026-10-15 | First-click claim is valid for 7 days. |
| D17 | 2026-10-15 | Earnings are withdrawable as soon as their cycle settles. No hold. |
| D18 | 2026-10-15 | Unspent budget never expires. |
| D19 | 2026-10-15 | No budget top-ups. Brands refill the budget only by paying for a rerank. |
| D20 | 2026-10-15 | Self-promotion is not allowed. |
| D21 | 2026-10-15 | All money in USD. |
| D22 | 2026-10-15 | Floor is $0.10 per qualified visitor. |
| D23 | 2026-10-15 | Brands can request a refund of unspent budget after 30 days of stagnation. Rank is unaffected. |
| D24 | 2026-10-15 | A rate change applies only to visitors who clicked after the change. |
| D25 | 2026-10-24 | Payout account, phone verification and KYC are collected at the first withdrawal, not at signup. |
| D26 | 2026-10-24 | Minimum withdrawal is $10. Payout provider fees are deducted from the withdrawal. |
| D27 | 2026-10-24 | Fraud found after withdrawal is clawed back from future earnings; the balance can go negative. |
| D28 | 2026-10-24 | A new account's first withdrawal is manually reviewed. |
| D29 | 2026-10-24 | Payment processor for bids is Razorpay (international cards, USD), behind a processor adapter. |
| D30 | 2026-10-24 | Minimum bid is $10. |
| D31 | 2026-10-24 | No short link domain at launch. Links are `brandbid.com/go/{code}`. Supersedes the short-domain plan in section 11. |
| D32 | 2026-10-24 | For EU/EEA/UK visitors `/go` sets no `bb_vid` cookie; matching uses IP+UA until the visitor consents on the brand page, which then sets the cookie. Clarifies section 13 step A5 against section 20. |
| D33 | 2026-10-24 | Phase 2 closed beta is gated by an email allowlist in `settings`, enforced in the UI and in `get_or_create_link`. |
| D34 | 2026-10-24 | Brand team invites ship in Phase 3. |
| D35 | 2026-10-24 | Schema and behaviour gaps G1–G17 in PHASES.md are adopted as proposed (tie-break column, draft status, `reject_listing`, notification outbox, fraud-signal columns, and the others). |
| D36 | 2026-10-24 | Budget exhaustion: budget is reserved at qualification in strict server order, and each paid visitor gets the full rate. Visitors who qualify after the budget runs out go on a **waitlist** instead of being counted unpaid. Whenever budget returns (a new bid or a fraud reversal), the waitlist is paid first, in qualification order. Waitlist entries expire after 30 days. Supersedes section 14 step 6 "can't be paid later either". |
| D37 | 2026-10-24 | Budget refunds (D23) return only ad budget. Each bid is refunded at most its own `budget_cents`; brandbid's revenue share is never refunded. |
| D38 | 2026-10-24 | A rejected listing (paid, never went live) is refunded the full amount, including brandbid's 50% share. This is separate from D37, which covers stagnation refunds of a live brand. |
| D39 | 2026-10-25 | The domain is `brandbid.wtf`. Replaces every `brandbid.com` in this file; links are `brandbid.wtf/go/{code}` (D31 otherwise unchanged). |
| D40 | 2026-10-25 | The background worker runs on AWS instead of Railway: ECS Fargate, one service per environment, pulling images from ECR (default; see PHASES.md P1.12). Supersedes the Railway choice in section 4. |
| D41 | 2026-10-25 | Until v1 is live, work is pushed directly to `main` (CI still runs on every push). The `staging` branch and the feature-branch → PR → `staging` → `main` flow in section 5 start when the deploy pipeline is built (P1.12). |
| D42 | 2026-10-25 | Schema additions from building P1.2: `categories.requires_review` drives the manual-review categories in section 8 (G18); `brands.ads_enabled` defaults to false and is switched on by the first bid; client roles get column-level grants only, and any future table or function starts with no client access. |
| D43 | 2026-10-25 | The web app is deployed on Cloudflare Workers through the OpenNext adapter (`@opennextjs/cloudflare`), not Vercel. The Node.js runtime is used; `runtime = 'edge'` is not supported by the adapter and must not appear in route files. Every Worker already runs at Cloudflare's edge, so `/go` needs no special runtime. Country comes from the `cf-ipcountry` header and client IP from `cf-connecting-ip`. The worker (AWS, D40) and database (Supabase) are unchanged. |
| D44 | 2026-10-25 | A successful payment that cannot be recorded (unknown or rejected brand, below the minimum bid, wrong currency, missing attribution, unknown payer) is refunded in full automatically and written to the audit log, never kept. Temporary failures return an error so the processor retries the webhook. |
| D45 | 2026-10-25 | Brands pay with an email-only checkout: no sign-in wall. The checkout asks for one email (typed twice); an account is created for it behind the scenes (or the existing account is used), and a magic link to the dashboard comes with the receipt. Signed-in users skip the field. Promoters still sign up and verify their email first (D5). Supersedes section 8 step 1 "User signs in". |
| D46 | 2026-10-25 | Sign-in methods from launch: Google and email magic link. Magic links use the token-hash flow so they work in a different browser than the one that requested them. |
| D47 | 2026-10-25 | The automatic listing check (`check-listing`) polls for freshly paid listings every minute instead of being enqueued by `record_bid`, so a missed trigger can never strand a paid listing. Held listings keep `status = pending_review` and record why in `brands.review_reason`. |

---

## 4. Tech stack and repository

### Stack

| Part | Choice | Notes |
| --- | --- | --- |
| Language | TypeScript everywhere | Strict mode on |
| Web app | Next.js (App Router), current stable | Deployed on Cloudflare Workers via OpenNext (D43). Use the Workers Paid plan: the bundle is ~2.4 MB gzipped today against the 3 MB free limit and will grow, and the free plan's 10 ms CPU per request is too tight for server rendering (check Cloudflare's current limits) |
| Styling | Tailwind CSS | |
| Database | Supabase Postgres | All money logic lives in SQL functions (section 7) |
| Auth | Supabase Auth | Google and email magic link |
| File storage | Supabase Storage | Brand logos, generated story images cache |
| Click redirect | Route `/go/[code]` in the web Worker (runs at Cloudflare's edge in every region) | Must respond fast worldwide. If it misses the 100 ms target it can be split into its own tiny Worker on the route `brandbid.wtf/go/*` without changing behaviour |
| Background jobs | Node worker on AWS (ECS Fargate), using pg-boss (a job queue that runs on Postgres) | Settlement, fraud scoring, withdrawals, leaderboards, reconciliation |
| Bot check | Cloudflare Turnstile (invisible) | Signup and qualification |
| Fingerprinting | FingerprintJS open source to start; Fingerprint Pro if duplicates slip through | Only with consent for EU visitors |
| Rate limiting | Upstash Redis + `@upstash/ratelimit` | On `/go`, `/api/q`, auth endpoints |
| Bot user agents | `isbot` package plus our own list (section 13) | |
| Images | `next/og` (Satori) | Link previews and story images. Must be verified on Workers first (P2.4); fallback is Satori + resvg-wasm used directly |
| Email | Resend | Templates in the repo |
| Errors | Sentry | Web and worker |
| Product analytics | PostHog | Funnels; never used for money decisions |
| Payments in | TBD (section 23) | Must support webhooks and partial refunds |
| Payouts out | TBD with CA (section 23) | |

### Repository layout

pnpm workspaces monorepo:

```
brandbid/
  apps/
    web/                 Next.js app (pages, API routes, /go redirect)
      app/
        (public)/        leaderboard, brand pages /b/[slug], promoter leaderboard
        (dash)/          brand dashboard, promoter dashboard
        admin/           admin panel
        go/[code]/       redirect (runs at the edge on Workers)
        out/[click]/     outbound redirect
        api/
          q/             qualification endpoint
          og/[code]/     link preview image
          story/[code]/  story image
          webhooks/      payment processor webhooks
    worker/              AWS Fargate worker (pg-boss jobs)
      jobs/
        settle-cycles.ts
        score-fraud.ts
        process-withdrawals.ts
        refresh-leaderboards.ts
        check-listing.ts
        cleanup.ts
        reconcile-ledgers.ts
        notify.ts
  packages/
    db/
      migrations/        SQL migrations (Supabase CLI)
      functions/         SQL functions (qualify_visitor, record_bid, ...)
      tests/             SQL tests for money functions
      types.ts           generated Supabase types
    shared/              money helpers (cents), constants, zod schemas, channel enums
    emails/              email templates
  BUILD.md
```

### Libraries we will not add without a decision log entry

An ORM on top of SQL functions for money, any client-side state library, any second database.

---

## 5. Environments and dev process

### Environments

| Env | Web | Database | Worker | Payments |
| --- | --- | --- | --- | --- |
| Local | `pnpm dev` | `supabase start` (Docker) | `pnpm --filter worker dev` | Processor test mode |
| Preview | Cloudflare preview version per deploy | Staging Supabase project | Not run | Test mode |
| Staging | Cloudflare Worker `brandbid-staging` | Staging Supabase project | AWS staging service | Test mode |
| Production | Cloudflare Worker `brandbid-prod` | Production Supabase project | AWS production service | Live |

- Never connect local or preview to production data.
- Secrets live in Cloudflare (Worker secrets), AWS (Secrets Manager) and Supabase dashboards. `.env.example` lists every variable with a comment; real `.env` files are never committed.

### Branching and releases

- **Until v1 is live (D41): commit and push directly to `main`.** The rest of this list applies from P1.12 onward.
- `main` is production. `staging` is staging.
- Work happens on short feature branches → pull request to `staging` → tested on staging → `staging` merged to `main`.
- Every pull request needs: passing CI, a description of what changed, and an update to this file if behaviour or a decision changed.

### Migrations

- All schema changes are SQL migration files in `packages/db/migrations`, created with the Supabase CLI.
- Migrations are forward-only. Never edit a merged migration; add a new one.
- CI applies migrations to staging on merge to `staging`, and to production on merge to `main`, before the web app deploys.
- Regenerate `packages/db/types.ts` after every migration.

### Testing

| Layer | Tool | Required for |
| --- | --- | --- |
| Unit | Vitest | Money helpers, bot detection, code generation, fraud rules |
| SQL | SQL test files run against a local database | Every money function: `record_bid`, `fund_waitlist`, `qualify_visitor`, `settle_cycle`, `request_withdrawal`, `refund_budget`, `clawback` |
| Concurrency | Script firing 1,000 parallel qualifications at one brand | Proves the budget never goes below zero, no visitor is paid twice, and the overflow is waitlisted in order |
| End to end | Playwright | Signup → link → click → wait 10 s → qualified → settle → withdraw (test mode) |

Rule: any pull request that touches money code must include or update SQL tests, and the concurrency test must pass.

### Definition of done

Feature works on staging, tests pass, errors reach Sentry, the relevant dashboard numbers are visible, and this file is updated.

---

## 6. Data model

All money columns are `bigint` cents. All timestamps are `timestamptz` in UTC. All tables have row-level security (RLS) on.

```sql
-- Users (extends auth.users)
create table profiles (
  id uuid primary key references auth.users(id),
  handle citext unique check (handle ~ '^[a-z0-9_]{3,20}$'),  -- shown publicly, 3-20 chars
  country char(2),
  is_admin boolean not null default false,
  status text not null default 'active',    -- active | suspended | banned
  trust_score int not null default 0,
  promoter_terms_accepted_at timestamptz,
  leaderboard_public boolean not null default true,  -- opt out of the public promoter board (section 9)
  phone_verified_at timestamptz,
  phone_hash text unique,                   -- HMAC of the phone number: one phone per account
  kyc_status text not null default 'none',  -- none | pending | verified | rejected
  first_withdrawal_reviewed boolean not null default false,
  created_at timestamptz not null default now()
);

create table categories (
  id serial primary key,
  slug text unique not null,
  name text not null,
  requires_review boolean not null default false  -- crypto, finance, health and supplements, gambling-adjacent (section 8)
);

create table brands (
  id uuid primary key default gen_random_uuid(),
  slug citext unique not null,
  name text not null,
  url text not null,
  description text,
  logo_path text,
  category_id int references categories(id),
  owner_id uuid not null references profiles(id),
  status text not null default 'draft',          -- draft (created, unpaid) | pending_review | active | rejected | removed
  total_paid_cents bigint not null default 0,    -- drives all-time rank
  total_reached_at timestamptz,                  -- when it reached that total: rank tie-break (earlier wins)
  budget_cents bigint not null default 0 check (budget_cents >= 0), -- cached; ledger is the truth
  rate_cents bigint not null,                    -- >= floor at time of setting
  ads_enabled boolean not null default false,    -- turned on by the first bid that funds budget >= rate
  last_spend_at timestamptz,
  created_at timestamptz not null default now()
);

create table brand_members (
  brand_id uuid references brands(id),
  user_id uuid references profiles(id),
  role text not null default 'member',           -- owner | member
  primary key (brand_id, user_id)
);

create table bids (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references brands(id),
  payer_id uuid not null references profiles(id),
  amount_cents bigint not null check (amount_cents > 0),
  revenue_cents bigint not null,
  budget_cents bigint not null,
  processor text not null,
  processor_payment_id text unique not null,     -- idempotency key
  payer_email text,                              -- fraud signal R9
  payment_fingerprint text,                      -- fraud signal R9 (card/payment fingerprint)
  refunded_at timestamptz,                       -- set when a rejected listing's bid is fully refunded (D38)
  refund_ref text,
  status text not null default 'succeeded',      -- succeeded | refunded
  budget_refunded_cents bigint not null default 0
    check (budget_refunded_cents <= budget_cents), -- stagnation refunds never touch revenue (D37)
  created_at timestamptz not null default now()
);

create table budget_ledger (
  id bigserial primary key,
  brand_id uuid not null references brands(id),
  delta_cents bigint not null,
  reason text not null,          -- bid | visitor | reversal | refund
  bid_id uuid references bids(id),
  earning_id uuid,
  refund_id uuid,
  created_at timestamptz not null default now()
);

create table links (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,                     -- 8-char base62
  promoter_id uuid not null references profiles(id),
  brand_id uuid not null references brands(id),
  channel text not null,                         -- story | linkedin | x | link
  status text not null default 'active',         -- active | disabled
  created_at timestamptz not null default now(),
  unique (promoter_id, brand_id, channel)
);

create table visitors (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references brands(id),
  claim_link_id uuid references links(id),
  claim_promoter_id uuid references profiles(id),
  claim_click_id uuid,
  claim_rate_cents bigint,                       -- brand rate at claim click (D24)
  claim_expires_at timestamptz,                  -- claim click + 7 days (D16)
  qualified_at timestamptz,
  qualified_click_id uuid,
  qualified_ip_hash text,                        -- signals saved at qualification for fraud rules R1, R2, R5
  qualified_fp_hash text,
  qualified_active_ms int,
  qualified_interactions int,
  created_at timestamptz not null default now()
);

-- Every identity signal we have seen for a visitor, per brand
create table visitor_keys (
  brand_id uuid not null,
  key_type text not null,        -- cookie | fp | ipua
  key_hash text not null,        -- HMAC-SHA256 with server secret
  visitor_id uuid not null references visitors(id),
  created_at timestamptz not null default now(),
  primary key (brand_id, key_type, key_hash)
);

create table clicks (
  id uuid primary key default gen_random_uuid(),
  link_id uuid not null references links(id),
  brand_id uuid not null,
  promoter_id uuid not null,
  visitor_id uuid references visitors(id),
  cookie_id text,
  ip_hash text not null,
  ua_hash text not null,
  user_agent text,
  country char(2),
  referrer text,
  ignored_reason text,           -- null | self | brand_member | rate_limited | banned_promoter
  outbound_at timestamptz,       -- set when visitor clicks through to brand site
  created_at timestamptz not null default now()
);

create table earnings (
  id uuid primary key default gen_random_uuid(),
  promoter_id uuid not null references profiles(id),
  brand_id uuid not null references brands(id),
  link_id uuid not null references links(id),
  visitor_id uuid unique not null references visitors(id),  -- one payout per visitor, ever
  click_id uuid not null,
  amount_cents bigint not null,
  cycle_ends_at timestamptz,               -- null while waitlisted; set when funded
  status text not null default 'pending',  -- waitlisted | pending | available | flagged | reversed | expired
  funded_at timestamptz,                   -- when budget was reserved (= created_at unless waitlisted first)
  settled_at timestamptz,
  created_at timestamptz not null default now()
);

-- Promoter balance = sum(delta_cents)
create table promoter_ledger (
  id bigserial primary key,
  promoter_id uuid not null references profiles(id),
  delta_cents bigint not null,
  reason text not null,          -- earning | withdrawal | withdrawal_failed | clawback | forfeit
  earning_id uuid,
  withdrawal_id uuid,
  note text,
  created_at timestamptz not null default now()
);

create table payout_accounts (
  id uuid primary key default gen_random_uuid(),
  promoter_id uuid unique not null references profiles(id),  -- one per promoter
  provider text not null,
  external_id text not null,
  account_name text,
  verified boolean not null default false,
  created_at timestamptz not null default now(),
  unique (provider, external_id)                               -- same account can't be shared
);

create table withdrawals (
  id uuid primary key default gen_random_uuid(),
  promoter_id uuid not null references profiles(id),
  amount_cents bigint not null check (amount_cents >= 1000),
  fee_cents bigint,
  provider text not null,
  status text not null default 'requested', -- requested | review | processing | paid | failed
  external_ref text,
  created_at timestamptz not null default now(),
  paid_at timestamptz
);

create table budget_refunds (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references brands(id),
  amount_cents bigint not null,
  status text not null default 'requested', -- requested | processing | done | failed
  processor_refund_ref text,
  requested_by uuid not null references profiles(id),
  created_at timestamptz not null default now(),
  done_at timestamptz
);

create table fraud_flags (
  id uuid primary key default gen_random_uuid(),
  subject_type text not null,    -- earning | link | promoter | visitor
  subject_id uuid not null,
  rule text not null,            -- rule code from section 16
  score int not null,
  details jsonb,
  status text not null default 'open',  -- open | cleared | confirmed
  reviewed_by uuid references profiles(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

create table settings (
  key text primary key,
  value jsonb not null
);
-- seed: floor_cents=10, budget_share_bps=5000, min_withdrawal_cents=1000,
--       claim_days=7, qualify_seconds=10, cycle_hours=24, stagnation_days=30,
--       waitlist_days=30

-- Emails queued by SQL functions; the worker's `notify` job sends them
create table notification_outbox (
  id bigserial primary key,
  kind text not null,                       -- template name
  recipient_user_id uuid references profiles(id),
  recipient_email text,
  payload jsonb not null default '{}'::jsonb,
  dedupe_key text unique,                   -- enforces "max once a day" and digests
  send_after timestamptz not null default now(),
  sent_at timestamptz,
  attempts int not null default 0,
  last_error text,
  created_at timestamptz not null default now()
);

-- Brand members' dashboard sessions, for self-promotion rule R9 (section 16)
create table member_signals (
  id bigserial primary key,
  brand_id uuid not null references brands(id),
  user_id uuid not null references profiles(id),
  ip_hash text not null,
  ua_hash text not null,
  fp_hash text,
  seen_at timestamptz not null default now()
);

create table audit_log (
  id bigserial primary key,
  actor_id uuid,
  action text not null,
  subject_type text,
  subject_id uuid,
  details jsonb,
  created_at timestamptz not null default now()
);
```

### Indexes that matter

- `clicks (link_id, created_at)`, `clicks (brand_id, created_at)`, `clicks (ip_hash, created_at)`
- `earnings (status, cycle_ends_at)` — settlement scans this
- `earnings (brand_id, created_at) where status = 'waitlisted'` — waitlist funding order
- `earnings (promoter_id, created_at)`, `earnings (brand_id, created_at)`
- `bids (created_at)` — daily board
- `brands (status, total_paid_cents desc)` — all-time board

### Row-level security summary

| Table | Who can read | Who can write |
| --- | --- | --- |
| profiles | Owner reads own row; the `public_profiles` view exposes id and handle only | Owner updates handle, country, leaderboard flag; status, trust, KYC, terms only by server |
| brands | Public for `active`; members see their own | Members edit description, logo, rate (column-level grants); status, money columns only by server |
| links | Promoter reads own | Server only (via `get_or_create_link`) |
| earnings, promoter_ledger | Promoter reads own | Server only |
| bids, budget_ledger | Brand members read own brand | Server only |
| payout_accounts, withdrawals, budget_refunds | Promoter reads own / brand members read own brand | Server only |
| fraud_flags, settings, audit_log, notification_outbox, member_signals | Admin | Server only |
| clicks, visitors, visitor_keys | Nobody from the client, admins included (the admin panel uses the server) | Server only |

"Server" means the service-role key, used only in API routes, the `/go` function and the worker. The service-role key never reaches the browser.

---

## 7. Money rules and invariants

These hold at all times. The nightly `reconcile-ledgers` job checks them and alerts on any violation.

1. All amounts are integer cents. No floats anywhere in money code. Use helpers from `packages/shared/money.ts`.
2. `brands.budget_cents` = sum of `budget_ledger.delta_cents` for that brand, and is never negative (database check constraint).
3. A promoter's balance = sum of `promoter_ledger.delta_cents`. It can be negative only because of clawback.
4. Every money change happens inside one SQL function in one transaction, and writes a ledger row. No API route ever updates a money column directly.
5. A visitor is paid at most once, ever (`earnings.visitor_id` is unique).
6. An earning's amount equals the visitor's `claim_rate_cents`.
7. Each bid: `budget_cents = floor(amount_cents × budget_share_bps / 10000)`, `revenue_cents = amount_cents − budget_cents`. Payment processor fees come out of revenue, not budget.
8. Webhook handlers are idempotent: `bids.processor_payment_id` is unique, so a repeated webhook does nothing.
9. Withdrawable amount = balance, and only if balance ≥ $10 and no withdrawal is already open.
10. Every earning in `pending`, `available`, `flagged` or `reversed` has exactly one `budget_ledger` row with reason `visitor`. `waitlisted` and `expired` earnings have none; no budget was ever reserved for them.
11. New budget pays the waitlist first. After any budget increase, either the brand has no waitlisted earnings, or its budget is less than the oldest waitlisted amount.
12. A bid's `budget_refunded_cents` never exceeds its `budget_cents` (D37).

### Money functions (all in `packages/db/functions`)

| Function | Does |
| --- | --- |
| `record_bid(payment)` | Inserts bid, splits it, adds budget ledger row, updates `total_paid_cents` and `budget_cents`, calls `fund_waitlist`, then turns `ads_enabled` on if budget ≥ rate |
| `fund_waitlist(brand_id)` | Section 15 (waitlist). Called inside every function that adds budget |
| `get_or_create_link(promoter, brand, channel)` | Section 11 |
| `record_click(...)` | Section 13 step A |
| `qualify_visitor(click_id, signals)` | Section 14 |
| `settle_due_earnings()` | Section 15 |
| `request_withdrawal(promoter)` | Section 15 |
| `reverse_earning(earning_id, reason)` | Section 16 |
| `refund_budget(brand_id, requester)` | Section 8 |

---

## 8. Brands: listing, pay-to-rank, rate, refunds

### Listing a brand

1. Visitor enters the brand URL. No sign-in (D45). Later, at checkout, they give one email (typed twice); signed-in users skip it.
2. Server fetches the page and pre-fills name, description and logo from its title, meta description and Open Graph image. The user edits them and picks a category.
3. User picks the amount (see "Claim price" below) and pays through the payment processor's hosted checkout.
4. The processor's webhook calls `record_bid`. The brand becomes `pending_review` with its bid recorded.
5. Automatic checks: URL resolves over HTTPS, domain isn't on the blocklist, name and description pass a banned-words list. Categories needing review (crypto, finance, health and supplements, gambling-adjacent) go to the admin queue; everything else goes `active` straight away.
6. Rejected listings are refunded in full.
7. The listing user becomes the brand owner, with a `brand_members` row of role `owner`.

### Listing policy (enforced at review)

No scams, adult content, gambling, weapons, or illegal products. Regulated financial or health products need manual review. We are paying the public to promote these brands, so the bar is higher than a plain directory.

### Claim price and reranking

- All-time rank = order by `total_paid_cents` desc, ties broken by whoever reached that total first.
- The price to take rank N = (current holder's total − your total) + $1. For a new brand, your total is 0.
- A brand can pay any amount at or above the minimum bid (TBD, section 23). Every payment adds to `total_paid_cents`.
- Each payment is a bid, split by D2. There are no other ways to add budget (D19).

### Setting the rate

- The brand dashboard has a rate field, defaulting to the floor ($0.10), and won't accept less than the current floor.
- Shows a live estimate: "Your $X budget pays for about N visitors at this rate."
- A change applies from the next claim click. Visitors already claimed keep `claim_rate_cents` (D24).
- If the floor is raised later, existing brands below it are moved up to the new floor and emailed.

### Pausing

- `ads_enabled` turns off automatically when the budget is below the rate, and on again after the next bid.
- Brands can't pause manually (keeps the promise to promoters). Revisit if brands ask.
- While paused, `/go` links still redirect and count clicks. Visitors who qualify go on the brand's waitlist (D36, section 15) and are paid in order when budget returns. Promoter dashboards show "budget used up — new visitors are waitlisted" on that brand.
- The brand dashboard shows how much is owed to waitlisted visitors, and that the next bid's budget pays them first.

### Refund of unspent budget (D23)

- **Eligible** when `budget_cents > 0` and the budget has paid for no qualified visitor for 30 days: `coalesce(last_spend_at, first bid date) <= now() − 30 days`.
- Brand owner requests it from the dashboard. `refund_budget` checks eligibility, sets `ads_enabled = false`, inserts a `budget_refunds` row and a negative budget ledger row for the full remaining amount.
- Pending earnings for that brand are settled before the refund amount is final, so promoters are paid first.
- The worker issues the refund through the payment processor against the brand's most recent bids (partial refunds), within the processor's refund window. If a bid is outside that window, the refund is handled manually by bank transfer and noted in the audit log.
- Rank and `total_paid_cents` do not change.
- Our share of the bids is not refunded (D37). The refund is split across bids newest first, and each bid gives back at most `budget_cents − budget_refunded_cents`. Only ad budget is ever returned.

---

## 9. Leaderboards

| Board | Ranking | Refresh |
| --- | --- | --- |
| All-time brands | `total_paid_cents` desc | Live query (indexed) |
| Today's brands | Sum of bid amounts since 00:00 UTC today | Materialized view, refreshed every minute and after each bid |
| Brands by category | All-time, filtered by category | Live query |
| Promoters this week | Sum of settled earnings (status `available`) since Monday 00:00 UTC | Materialized view, every 5 minutes |
| Promoters all time | Sum of settled earnings | Materialized view, every 5 minutes |
| Top promoters per brand | Settled earnings for that brand | Shown on the brand page |

- Promoter boards count settled earnings only, so faked traffic that gets flagged at settlement never shows up.
- A promoter row shows: handle, total earned, brands promoted, qualified visitors.
- Promoters can opt out of the public board in settings. They still appear as "anonymous".

---

## 10. Promoter onboarding

Onboarding starts when someone taps **Advertise** on a brand card or brand page. There is also an `/earn` landing page explaining the program, which leads into the same flow.

### Step 1: sign in

- Google sign-in or email magic link (Supabase Auth). Email must be verified before any link is created (D5).
- Turnstile runs invisibly on the sign-in form.
- Rate limit: 5 sign-in attempts per IP per 10 minutes.

### Step 2: promoter profile (one screen)

- **Handle:** 3–20 characters, `[a-z0-9_]`, unique, not on the reserved list (admin, brandbid, support, brand slugs…).
- **Country:** pre-filled from the request's location header, editable.
- **Promoter terms** checkbox. The terms say, in plain words:
  - Posts must be labelled as ads (#ad or the platform's paid-partnership label).
  - Only real people clicking counts. Bots, click farms, paid clicks, click-exchange groups and self-clicking void earnings and can get the account banned.
  - Earnings found to be fraudulent after withdrawal are taken from future earnings.
  - Promoters may not promote brands they own or work for.
  - brandbid's decision on traffic quality is final.
- Saves `promoter_terms_accepted_at`.

### Step 3: back to sharing

The user returns to the share sheet for the brand they tapped. The whole flow should take under a minute.

### Step 4: payout setup (at first withdrawal, D25)

Triggered the first time the promoter taps **Withdraw** with at least $10 available:

1. **Phone verification** by SMS one-time code (Supabase Auth phone, or a provider like Twilio Verify). One phone number per account.
2. **Payout account** with the chosen provider. Stored in `payout_accounts`. The same external account can't be linked to two promoters (unique constraint).
3. **Identity check (KYC)**: done by the payout provider when it supports it; otherwise through a KYC service (TBD). Sets `kyc_status`.
4. **Tax details** as the CA advises (for example PAN for Indian promoters, a tax form for US promoters).
5. The first withdrawal goes to manual review (D28).

### Self-promotion block

At step 3 and at every link creation, `get_or_create_link` refuses if the user is a member of that brand. The share sheet then shows: "You can't promote a brand you're part of."

---

## 11. Promo link generation

### Rules

- One link per promoter per brand per channel. Created the first time it's needed; afterwards the same link is returned, so stats stay in one place.
- The channel is part of the link record, not a query parameter, so it can't be edited or stripped.
- Links never expire. They stop paying when the brand's budget is used up and pay again after the next bid (D15).

### Code format

- 8 characters of base62 (`0-9A-Za-z`) from a cryptographically secure random source. About 218 trillion combinations, so codes can't be guessed or enumerated, and they reveal nothing about volume.
- Not derived from IDs, not sequential.
- On the rare unique-constraint collision, generate a new code and retry (up to 5 times).

```ts
// packages/shared/codes.ts
const ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
export function randomCode(len = 8): string {
  const bytes = crypto.getRandomValues(new Uint8Array(len * 2));
  let out = '';
  for (const b of bytes) {
    if (b < 248) out += ALPHABET[b % 62];  // 248 = 62*4, avoids modulo bias
    if (out.length === len) return out;
  }
  return randomCode(len); // extremely rare
}
```

### `get_or_create_link(promoter_id, brand_id, channel)`

1. Check: promoter status `active`, email verified, terms accepted; brand `active`; promoter not a brand member.
2. Select the existing link for (promoter, brand, channel). If found, return it.
3. Otherwise insert with a new code, `on conflict (promoter_id, brand_id, channel) do nothing`, then select. This makes two simultaneous taps safe.

### URL

- Short domain, for example `bbid.to/k7Qx2aPm` (domain TBD, section 23), pointing at the same Worker.
- Fallback that always works: `brandbid.wtf/go/k7Qx2aPm`.

---

## 12. Sharing

The **Advertise** sheet on each brand shows four options. Target: from tap to shared in under 20 seconds.

### Share text

Generated per brand, editable before sharing, always ends with the disclosure:

```
Check out {brand name}: {one-line description} {link} #ad
```

### X

- Opens `https://x.com/intent/post?text={encoded text}&url={encoded link}` in a new tab or the X app.
- Text is pre-filled with #ad.

### LinkedIn

- LinkedIn's share URL only takes a link: `https://www.linkedin.com/sharing/share-offsite/?url={encoded link}`.
- Before opening it, copy the suggested post text (with #ad) to the clipboard and show "Post text copied. Paste it into your LinkedIn post."

### Instagram story

Instagram has no web API for posting stories, so it's a guided flow:

1. Generate a 1080×1920 PNG story card at `/api/story/{code}.png` with `next/og`: brand logo, name, one-liner, rank, "on brandbid", and a short "link in sticker" hint. Cache it in Supabase Storage.
2. Copy the promoter's link to the clipboard.
3. On phones that support sharing files (`navigator.canShare({ files })`), open the native share sheet with the image; the promoter picks Instagram → Story. Otherwise download the image.
4. Show a three-step guide the first time: open Instagram → add the image to your story → add the Link sticker and paste.

### Plain link

Copies the link. Used for WhatsApp, Telegram, Reddit, newsletters, anywhere else.

### Link previews

When a link is pasted anywhere, the platform fetches it to build a preview. `/go` detects these fetchers (section 13) and returns a small HTML page with Open Graph and Twitter Card tags:

- Title: `{brand name} on brandbid`
- Description: the brand's one-liner
- Image: `/api/og/{code}` — 1200×630 card with logo, name, rank, "on brandbid"

This preview is what most people see in feeds and chats, so it's worth polishing.

---

## 13. Click tracking pipeline

Each step runs on a different URL, so every number is measured on our own servers. The visitor never waits on a database write.

```
promo link ──► A. /go/[code] ──► B. /b/[brand]?c={click_id} ──► C. /api/q (qualify)
                                         │
                                         └──► D. /out/[click_id] ──► brand site (with UTM)
                                                    E. worker settles cycles
```

### Step A — the click (`/go/[code]`, edge function, target < 100 ms)

1. **Rate limit** by IP hash: 30 requests per minute per IP to `/go`. Over the limit → still redirect, but mark `ignored_reason = rate_limited`.
2. **Look up the code.** In-memory cache per edge instance (60 s), then the database. Unknown or disabled code → 302 to the brandbid homepage.
3. **Detect link-preview fetchers and bots.** If the user agent matches `isbot` or our list — `Twitterbot`, `LinkedInBot`, `facebookexternalhit`, `Facebot`, `WhatsApp`, `Slackbot`, `TelegramBot`, `Discordbot`, `SkypeUriPreview`, `Pinterestbot`, `redditbot`, `Applebot`, `Googlebot`, `bingbot`, `Embedly` — return the Open Graph HTML from section 12 with status 200. **Not counted, not logged as a click.**
4. **Ignore prefetches.** If the request has `Sec-Purpose: prefetch` or `Purpose: prefetch`, return 204. Not counted.
5. **Read or set the visitor cookie** `bb_vid`: 128-bit random ID, first-party on brandbid.wtf, `HttpOnly; Secure; SameSite=Lax; Max-Age=31536000`.
6. **Build signals:**
   - `ip_hash = HMAC-SHA256(IP_PEPPER, ip)` — the raw IP (from the `cf-connecting-ip` header) is never stored.
   - `ua_hash = HMAC-SHA256(IP_PEPPER, user_agent)`
   - `country` from the `cf-ipcountry` header.
   - `referrer` from the `Referer` header (often empty from apps; that's fine).
7. **Create a click ID** (UUID) now, so the redirect doesn't wait for the database.
8. **Redirect with 302** (never 301 — browsers cache 301s, so repeat clicks would skip tracking) to `/b/{brand slug}?c={click_id}`.
9. **After responding** (`waitUntil`), call `record_click`:
   - If the visitor's session belongs to the promoter or a brand member → `ignored_reason = self` or `brand_member`. No claim.
   - Find the visitor for this brand by matching `visitor_keys` on cookie or IP+UA (fingerprint isn't available yet at this step). Create a visitor if none matches. Add any new keys.
   - **Claim rule (D8, D16):** if the visitor has no claim, or their claim has expired and they never qualified → set the claim to this link: `claim_promoter_id`, `claim_link_id`, `claim_click_id`, `claim_rate_cents = brand.rate_cents`, `claim_expires_at = now() + 7 days`. If they already have a live claim, leave it alone.
   - Insert the click row.

### Step B — the brand page (`/b/[slug]?c={click_id}`)

What the visitor sees:

- Banner at the top: "You're here via **@handle** on brandbid."
- The brand card: logo, name, description, rank, category, a large **Visit {brand}** button.
- Other brands in the same category below, so brandbid keeps some of the traffic.
- EU visitors: a consent banner (section 20).

What the page's script does (`apps/web/app/(public)/b/[slug]/qualify.ts`):

1. Runs only when the URL has `c` and the click ID looks valid.
2. Loads invisible Turnstile and gets a token.
3. If consent allows, computes a device fingerprint (FingerprintJS).
4. Counts **active time**: adds elapsed time only while `document.visibilityState === 'visible'`, and only after at least one human interaction (`pointermove`, `pointerdown`, `scroll`, `touchstart`, `keydown`).
5. When active time reaches 10 s, sends one request to `/api/q` with `{ click_id, turnstile_token, fingerprint, active_ms, interactions }`. Uses `fetch` with `keepalive: true`.
6. If the page is hidden before then, it keeps counting when the visitor comes back. If they leave for good, nothing is sent — they didn't qualify.
7. The endpoint is called `/api/q` on purpose. Ad blockers block URLs with words like "track", "beacon", "collect", "analytics".

### Step C — qualification (`/api/q`)

Covered in full in section 14.

### Step D — click-through to the brand site (`/out/[click_id]`)

- The **Visit** button links to `/out/{click_id}`.
- The route sets `clicks.outbound_at` (first time only) and 302s to the brand URL with UTM parameters added:
  `utm_source=brandbid&utm_medium=promoter&utm_campaign={handle}&utm_content={channel}`
- Brands then see brandbid traffic in their own analytics without installing anything.
- Click-through doesn't affect payment. It's shown to brands and used as a fraud signal (section 16).
- Visitors who reach the brand page without a click ID (organic traffic) get `/out/b/{slug}`, which redirects with `utm_medium=listing`.

### Step E — settlement

Covered in section 15.

### Things to know about the pipeline

- **In-app browsers.** Instagram, LinkedIn and X open links in their own browsers with their own cookies, separate from the visitor's normal browser. The same person can show up with a new cookie. That's why visitors are matched on several keys, not just the cookie.
- **Server time only.** The 10-second rule and every cycle boundary use database time. The browser's clock is never trusted.
- **Click volume.** Direct database writes are fine at launch. When clicks pass roughly 50 per second sustained, put an Upstash Redis queue between `/go` and the database and have the worker write in batches. Nothing else changes.

---

## 14. Qualification and attribution

### `/api/q` endpoint

1. Rate limit: 10 requests per minute per IP hash.
2. Validate input with zod. Reject if `active_ms < 10000`.
3. Verify the Turnstile token with Cloudflare's server-side check. Invalid → 204, nothing recorded.
4. Call `qualify_visitor(click_id, fingerprint_hash, cookie_id, ip_hash, ua_hash)`.
5. Always return 204, whatever the result, so the endpoint gives nothing away to someone probing it.

### `qualify_visitor` (one SQL function, one transaction)

```
1. Load the click. Reject if:
   - not found, or ignored_reason is set
   - now() - click.created_at < 10 seconds   (server time)
   - the click's request IP/UA hash doesn't match the one sending /api/q
2. Load the click's visitor. Add the fingerprint key (if given) to visitor_keys.
   If the fingerprint already belongs to a different visitor of this brand
   that has qualified → this person already counted: reject.
3. Reject if the visitor already qualified (qualified_at is not null).
4. Reject if the visitor has no live claim (claim_expires_at < now()).
   (Edge case: claim expired between click and qualify — no payment.)
5. Lock the brand row: SELECT ... FROM brands WHERE id = $1 FOR UPDATE.
6. If brand.budget_cents < visitor.claim_rate_cents, or the brand already has
   waitlisted earnings (so nobody jumps the queue):
      insert earnings (promoter = claim_promoter_id, link = claim_link_id,
        amount = claim_rate_cents, status 'waitlisted', cycle_ends_at null)
        -- no budget ledger row; nothing is reserved yet
      visitor.qualified_at = now(), qualified_click_id = click_id
      set brand.ads_enabled = false, queue "budget used up" email. Done.
      (D36: paid in order when budget returns — section 15, waitlist.)
7. Otherwise:
   - brand.budget_cents -= claim_rate_cents; brand.last_spend_at = now()
   - insert budget_ledger (-claim_rate_cents, reason 'visitor')
   - insert earnings (promoter = claim_promoter_id, link = claim_link_id,
       amount = claim_rate_cents, status 'pending', funded_at = now(),
       cycle_ends_at = end of the claim link's current cycle — see section 15)
   - visitor.qualified_at = now(), qualified_click_id = click_id
   - if remaining budget < rate: ads_enabled = false, queue email
```

Why this is safe:

- The row lock on the brand means thousands of simultaneous qualifications are processed one at a time for that brand, so the budget can't go below zero.
- `earnings.visitor_id` is unique, so the same visitor can't be paid twice even if two requests race.
- Fairness when the budget runs out (D36): the lock makes "who was first" exact, using database time. Everyone before the budget ran out is paid in full; everyone after waits in line in the same order. Nobody is paid a partial rate, and nobody loses a visitor because they arrived a second late.

### Attribution examples

| Situation | Who gets paid |
| --- | --- |
| Visitor clicks A's link, stays 10 s | A |
| Visitor clicks A's link, leaves after 3 s, clicks B's link 2 days later, stays 10 s | A (A's claim is still live) |
| Same, but B's click is 8 days later | B (A's claim expired; B's click started a new claim) |
| Visitor already qualified via A, later clicks B's link | Nobody. Already counted for this brand |
| Visitor qualified for brand X via A, then clicks C's link for brand Y | C, for brand Y (uniqueness is per brand) |
| Promoter clicks their own link | Nobody. Click ignored |
| A and B both bring visitors as the brand's budget runs out | Every visitor who qualified before the budget ran out is paid in full; the rest are waitlisted in qualification order and paid when budget returns |
| Visitor qualifies via A while the brand's budget is used up; the brand reranks 3 days later | A, from the waitlist, before any new visitor is paid |
| Same, but nobody refills for 31 days | Nobody. The waitlist entry expired |

---

## 15. Payout engine

### Cycles

- Each link has repeating 24-hour cycles starting from `links.created_at`: cycle *n* runs from `created_at + 24h × n` to `created_at + 24h × (n+1)`.
- An earning belongs to the cycle in which it was **funded** (budget reserved), using the **claim link**: `cycle_ends_at = claim_link.created_at + 24h × (floor((funded_at − claim_link.created_at) / 24h) + 1)`. For most earnings, funding happens at qualification. A waitlisted earning lands in the cycle in which the waitlist paid it.

### Waitlist (D36)

`fund_waitlist(brand_id)` runs inside the same transaction as anything that adds budget: `record_bid`, `reverse_earning` (money returned from fraud), and any admin credit.

```
1. Lock the brand row (FOR UPDATE).
2. Walk the brand's waitlisted earnings in order of created_at, id (FOR UPDATE):
   - if brand.budget_cents < earning.amount_cents: stop.
       (Strict order: a later, cheaper entry never jumps the head of the line.)
   - brand.budget_cents -= amount; last_spend_at = now()
   - insert budget_ledger (-amount, reason 'visitor', earning_id)
   - earning.status = 'pending', funded_at = now(),
     cycle_ends_at = end of the claim link's current cycle
3. ads_enabled = (no waitlisted earnings remain) and budget_cents >= rate_cents.
4. Queue a "waitlisted earnings funded" notification per promoter (daily digest).
```

- The amount is always the visitor's `claim_rate_cents` (D24), even if the brand has changed its rate since.
- Funded earnings go through normal settlement and the fraud rules (section 16), like any other.
- `settle-cycles` also expires waitlisted earnings older than `waitlist_days` (30): status `expired`, no money moves.
- Waitlisted earnings don't count toward balances or leaderboards. Dashboards show them separately as "waitlisted".

### Settlement (worker job `settle-cycles`, every 5 minutes)

1. Select pending earnings with `cycle_ends_at <= now()`, grouped by link.
2. Run the fraud rules from section 16 on each group.
3. Earnings with no open flags → status `available`, `settled_at = now()`, and a `promoter_ledger` row `+amount, reason 'earning'`.
4. Earnings with an open flag → status `flagged`; they wait for admin review (section 18).
5. Send a "your earnings are available" notification, at most once per promoter per day.

### Withdrawal (D17, D25, D26, D28)

1. Promoter taps **Withdraw**. Requirements: balance ≥ $10, no open withdrawal, account status `active`.
2. If payout setup isn't done → onboarding step 4 (section 10).
3. `request_withdrawal` writes the withdrawal row (whole balance) and a ledger row `−amount, reason 'withdrawal'`.
4. If this is the promoter's first withdrawal, or the promoter's trust score is below 0, status = `review` and it goes to the admin queue. Otherwise `processing`.
5. Worker job `process-withdrawals` (every 15 minutes) sends `processing` withdrawals to the payout provider's API, stores the provider's reference, and marks them `paid` when the provider confirms (webhook or polling).
6. Provider fees are recorded in `fee_cents` and shown to the promoter. The promoter receives amount minus fees.
7. A failed payout → status `failed`, ledger row `+amount, reason 'withdrawal_failed'`, promoter notified.

### Clawback (D27)

- If an earning is confirmed fraudulent after the promoter withdrew it: `reverse_earning` marks it `reversed`, adds the amount back to the brand's budget (ledger `reason 'reversal'`), and writes a promoter ledger row `−amount, reason 'clawback'`. The balance may go negative. It then calls `fund_waitlist`, so the returned money goes to waitlisted honest promoters first.
- A negative balance is recovered automatically from future earnings.
- Confirmed serious fraud → account `banned`, remaining positive balance forfeited (`reason 'forfeit'`).

### Promoter earnings view

Shows, per link and per channel: clicks, qualified visitors, pending (current cycle), available, withdrawn, and when the current cycle settles.

---

## 16. Fraud controls

Fraud decides whether brands trust us. The first layer must be live before any real payout.

### Prevention (at click and qualification time)

| Control | Where | Stops |
| --- | --- | --- |
| Preview fetchers and known bots not counted | `/go` step A | Fake clicks from link previews and crawlers |
| Prefetches ignored | `/go` step A | Browser preloading |
| Rate limits per IP | `/go`, `/api/q`, auth | Scripts |
| Self and brand-member clicks ignored | `record_click` | Self-clicking, self-promotion |
| Brand members can't create links | `get_or_create_link` | Self-promotion |
| Turnstile on qualification | `/api/q` | Headless browsers |
| Server-side 10 s check + active time + interaction | `/api/q`, `qualify_visitor` | Fake timers |
| Click and qualify must come from the same IP/UA | `qualify_visitor` | Replaying click IDs |
| Multi-key visitor matching (cookie, fingerprint, IP+UA) | `record_click`, `qualify_visitor` | Clearing cookies, switching browsers |
| One payout account and one phone per promoter | Payout setup | Multi-accounting |

### Detection rules (run at settlement)

Starting thresholds; tune them from real data and record changes in section 3.

| Code | Rule | Score |
| --- | --- | --- |
| R1 | One IP hash produced qualified visitors for 3+ different promoters in 24 h | 40 |
| R2 | One fingerprint appears in qualifications for 3+ promoters in 7 days | 50 |
| R3 | A link's qualified visitors this cycle are more than 5× the promoter's 7-day average and over 50 | 30 |
| R4 | Over 90% of a link's qualified visitors this cycle come from one country that isn't the promoter's | 20 |
| R5 | Active-time spread is unnaturally tight: standard deviation under 1 s across 20+ qualifications | 40 |
| R6 | Zero click-throughs to the brand site across 50+ qualified visitors | 30 |
| R7 | Most clicks come from data-centre or VPN IP ranges (needs an IP intelligence service, phase 4) | 40 |
| R8 | Account younger than 7 days earned more than $50 in one cycle | 25 |
| R9 | Self-promotion signals (below) | 60 |

An earning group with a total score of 50 or more is flagged and held for review. Below 50, the scores still add to the promoter's history and lower their trust score.

### Self-promotion signals (R9)

Flag when a promoter shares any of these with a brand they earn from:

- Email domain matches the brand's website domain.
- Payout account name matches the brand's billing name.
- Same device fingerprint or IP hash as the brand owner's or members' dashboard sessions in the last 30 days.
- Same card or payment email used for the brand's bids.

The real damage from self-promotion is a brand faking clicks to recover its 50%. The general fraud rules catch fake clicks; these signals are the second layer.

### Trust score

- Starts at 0. +1 per cycle settled with no flags (max +50). −10 per confirmed flag. −50 for a confirmed self-promotion.
- Below 0: every withdrawal is reviewed.
- Below −30: account suspended pending review.

### Review outcomes (admin)

- **Clear:** earnings become `available`; the flag is closed.
- **Confirm:** earnings `reversed`; budget refunded; clawback if already withdrawn; trust score lowered; optional ban.

---

## 17. Dashboards

### Promoter dashboard

- Balance: available, pending, waitlisted (with "paid when {brand} refills; expires {date}"), withdrawn to date, and any negative balance being recovered.
- Per link (grouped by brand, then channel): clicks, qualified visitors, qualification rate, earnings, current cycle end time, budget status of the brand ("active" or "budget used up").
- Withdraw button and withdrawal history with fees.
- Trust status in plain words ("Good standing" / "Withdrawals reviewed").
- Their rank on the promoter leaderboard.
- Discover: brands with the highest rates and remaining budgets, so promoters find what to share.

### Brand dashboard

- Rank (all-time and today) and the price to move up one rank.
- Budget: remaining, spent, estimated visitors left at current rate, and owed to waitlisted visitors (paid first from the next bid).
- Rate setting with the floor and the estimate (section 8).
- Traffic: clicks, qualified visitors, click-throughs to their site, by day, channel and country.
- Top promoters for the brand.
- Bids history and receipts.
- Refund button when eligible (section 8).
- Team members (invite by email).
- "Report suspicious traffic" button → creates a fraud flag for admin.

---

## 18. Admin panel

At `/admin`, only for `profiles.is_admin = true`. Every action writes to `audit_log`.

| Screen | Actions |
| --- | --- |
| Listing review queue | Approve, reject (auto-refund), edit category |
| Fraud queue | See the flag, rule, score, related clicks and visitors; clear or confirm |
| Withdrawal review | First withdrawals and low-trust withdrawals; approve or hold |
| Refund requests | Check, process manual ones |
| Users | Search, suspend, ban, view ledgers, adjust trust |
| Brands | Search, remove, view ledgers, disable ads |
| Settings | Floor, budget share, minimum withdrawal, claim days, cycle hours, fraud thresholds |
| Reconciliation | Last nightly run result, any invariant violations |

---

## 19. Notifications

Sent by email through Resend from the worker's `notify` job. Templates live in `packages/emails`.

| To | When |
| --- | --- |
| Promoter | Welcome after profile setup |
| Promoter | Earnings available (max once a day) |
| Promoter | Withdrawal paid / failed / under review |
| Promoter | Earnings flagged or reversed, with the reason category |
| Promoter | A brand they promote ran out of budget (daily digest) |
| Promoter | A brand they promoted refilled its budget, and any of their waitlisted earnings that got funded (daily digest) |
| Promoter | Waitlisted earnings expiring in 3 days (daily digest) |
| Brand | Listing approved / rejected |
| Brand | Someone outbid you for your rank |
| Brand | Budget below 10% |
| Brand | Budget used up (and later: N visitors waitlisted, $X owed) |
| Brand | Refund eligible (30 days of stagnation) / refund done |
| Admin | New items in review queues (hourly digest), reconciliation failures (immediately) |

---

## 20. Security and privacy

### Security

- RLS on every table (section 6). Service-role key only on the server and worker.
- Payment webhooks verify the processor's signature and are idempotent.
- All money changes go through SQL functions (section 7).
- Rate limits on public endpoints (sections 10, 13, 14).
- Admin actions require a recent sign-in (within 12 hours) and are logged.
- Secrets: `IP_PEPPER` (HMAC key for IP/UA/fingerprint hashes) is never rotated, because rotating it would break visitor matching; if it leaks, rotate and accept a one-time reset of uniqueness.
- Dependencies checked weekly (Dependabot or Renovate).

### Privacy

- Raw IP addresses are never stored; only HMAC hashes.
- Click rows keep the full user agent for 90 days, then a nightly job strips it and keeps only aggregates.
- Fingerprinting and the visitor cookie for EU/EEA/UK visitors only after consent. The consent banner appears on brand pages for those countries (from the location header). Without consent: no fingerprint; matching uses cookie and IP+UA only.
- Privacy policy covers: what we collect at click, why (fraud prevention and payment), retention, and that visitors can ask for deletion.
- India's DPDP Act and the EU's GDPR both apply; the CA or a lawyer should check the policy before launch.

---

## 21. Legal and compliance checklist

To work through with the CA (and a lawyer where noted) before phase 3 ships. This is a list of questions, not legal advice.

- [ ] Which payment processor will let a sole proprietor take international card payments for this model?
- [ ] Which payout rails are allowed and practical for paying individuals worldwide from India, and their foreign-exchange rules?
- [ ] For Indian promoters: is RazorpayX (UPI/bank) the right rail, and does TDS apply to promoter payouts?
- [ ] GST treatment of brand payments: domestic vs export of services.
- [ ] What tax information to collect from foreign promoters.
- [ ] Holding brand budgets and promoter balances: separate bank account, accounting treatment as liabilities, any rules on holding others' money.
- [ ] When to move from sole proprietorship to an LLP or private limited company.
- [ ] Terms of service for brands and promoters, and privacy policy (lawyer review).
- [ ] Ad disclosure requirements (ASCI in India, FTC in the US) reflected in the promoter terms and share text.
- [ ] Refund policy wording for D23.

---

## 22. Build phases and acceptance criteria

### Phase 1 — Leaderboard

Scope: repo and environments, schema (all tables), auth, brand listing flow, payment checkout and webhook, `record_bid`, all-time and daily boards, brand pages, listing review queue, brand dashboard (rank, bids, budget shown read-only).

Done when:
- [ ] A user can list a brand, pay in test mode, and appear on both boards at the right rank.
- [ ] Each bid writes the correct 50/50 split; the budget ledger sums to `budget_cents`.
- [ ] A repeated webhook doesn't create a second bid.
- [ ] Claim price for rank N is shown correctly.

### Phase 2 — Advertise (closed beta, no withdrawals)

Scope: promoter onboarding steps 1–3, `get_or_create_link`, share sheet (all four channels, story image, link previews), `/go`, brand page banner and qualify script, `/api/q`, `qualify_visitor`, `/out`, rate setting, promoter dashboard (without withdraw), brand traffic stats.

Done when:
- [ ] Sharing a link on X, LinkedIn and WhatsApp produces a correct preview and no counted click from the preview fetch.
- [ ] A real click + 10 active seconds produces exactly one pending earning at the claimed rate.
- [ ] Clicks by the promoter or brand members never create claims.
- [ ] The 1,000-parallel-qualification test never takes the budget below zero or pays a visitor twice.
- [ ] Every attribution example in section 14 passes as an automated test.
- [ ] Brands see brandbid traffic with the UTM tags in their own analytics.

### Phase 3 — Money out

Scope: settlement job, fraud rules R1–R6, R8, R9, trust score, onboarding step 4 (phone, payout account, KYC), withdrawals, first-withdrawal review, clawback, admin fraud and withdrawal queues, budget refunds, reconciliation job, notifications.

Gate before real payouts: section 21 checklist answered, terms and privacy policy published.

Done when:
- [ ] Earnings move pending → available at the exact cycle end.
- [ ] Flagged earnings never become available without review.
- [ ] A test withdrawal reaches a real payout account (smallest live amount) and is marked paid.
- [ ] A clawback produces a negative balance that the next earnings recover.
- [ ] A stagnant brand can request and receive a refund; pending earnings are settled first.
- [ ] Nightly reconciliation runs clean for 7 days.

### Phase 4 — Growth and scale

Scope: promoter leaderboards (public), "discover brands" for promoters, top promoters on brand pages, fraud rule R7 with an IP intelligence service, Fingerprint Pro if needed, Redis click queue if volume needs it, more payout rails, fraud threshold tuning.

---

## 23. Still to decide

| Item | Needed by | Notes |
| --- | --- | --- |
| Payment processor | Phase 1 | Must support international cards for a sole proprietor, webhooks, partial refunds |
| Minimum bid amount | Phase 1 | outbid.lol's daily board shows bids as low as $10 |
| Daily board timezone | Phase 1 | Document assumes UTC |
| Short link domain | Phase 2 | e.g. `bbid.to`; check availability |
| Payout provider(s) | Phase 3 | Decide with CA (section 21) |
| KYC provider (if payout provider doesn't do it) | Phase 3 | |
| Phone verification provider | Phase 3 | Supabase phone auth or Twilio Verify |
| Final budget split | Before public launch | Currently 50/50, tentative (D2) |
| IP intelligence service | Phase 4 | For rule R7 |