-- brandbid schema. BUILD.md section 6, plus the gaps adopted in D35/D36/D37 (PHASES.md G1-G18).
-- All money columns are bigint cents. All timestamps are timestamptz (UTC).
-- Status columns use CHECK constraints, not enums: easier to extend with forward-only migrations.

set search_path = public, extensions;

-- ---------------------------------------------------------------- profiles
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  handle citext unique check (handle ~ '^[a-z0-9_]{3,20}$'),
  country char(2),
  is_admin boolean not null default false,
  status text not null default 'active' check (status in ('active', 'suspended', 'banned')),
  trust_score int not null default 0,
  promoter_terms_accepted_at timestamptz,
  leaderboard_public boolean not null default true,              -- G2
  phone_verified_at timestamptz,
  phone_hash text unique,                                         -- G16: one phone per account
  kyc_status text not null default 'none' check (kyc_status in ('none', 'pending', 'verified', 'rejected')),
  first_withdrawal_reviewed boolean not null default false,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- categories
create table categories (
  id serial primary key,
  slug text unique not null,
  name text not null,
  requires_review boolean not null default false                  -- G18: BUILD s8 manual-review categories
);

-- ---------------------------------------------------------------- brands
create table brands (
  id uuid primary key default gen_random_uuid(),
  slug citext unique not null check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name text not null,
  url text not null,
  description text,
  logo_path text,
  category_id int references categories(id),
  owner_id uuid not null references profiles(id),
  -- G4: 'draft' = created, not yet paid
  status text not null default 'draft'
    check (status in ('draft', 'pending_review', 'active', 'rejected', 'removed')),
  total_paid_cents bigint not null default 0 check (total_paid_cents >= 0),  -- drives all-time rank
  total_reached_at timestamptz,                                              -- G1: rank tie-break
  budget_cents bigint not null default 0 check (budget_cents >= 0),          -- cached; ledger is the truth
  rate_cents bigint not null check (rate_cents > 0),                         -- floor enforced in P2.10
  ads_enabled boolean not null default false,    -- off until the first bid funds a budget >= rate
  last_spend_at timestamptz,
  created_at timestamptz not null default now()
);

create table brand_members (
  brand_id uuid not null references brands(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'member')),
  primary key (brand_id, user_id)
);

-- ---------------------------------------------------------------- bids and budget
create table bids (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references brands(id),
  payer_id uuid not null references profiles(id),
  amount_cents bigint not null check (amount_cents > 0),
  revenue_cents bigint not null check (revenue_cents >= 0),
  budget_cents bigint not null check (budget_cents >= 0),
  processor text not null,
  processor_payment_id text unique not null,                                 -- idempotency key
  payer_email text,                                                          -- G11 (R9 signals)
  payment_fingerprint text,                                                  -- G11
  status text not null default 'succeeded' check (status in ('succeeded', 'refunded')),
  budget_refunded_cents bigint not null default 0,                           -- D37
  refunded_at timestamptz,                                                   -- G3
  refund_ref text,                                                           -- G3
  created_at timestamptz not null default now(),
  check (revenue_cents + budget_cents = amount_cents),
  check (budget_refunded_cents >= 0 and budget_refunded_cents <= budget_cents)
);

create table budget_ledger (
  id bigserial primary key,
  brand_id uuid not null references brands(id),
  delta_cents bigint not null check (delta_cents <> 0),
  reason text not null check (reason in ('bid', 'visitor', 'reversal', 'refund')),
  bid_id uuid references bids(id),
  earning_id uuid,       -- FK added below, after earnings exists
  refund_id uuid,        -- FK added below, after budget_refunds exists
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- links, visitors, clicks
create table links (
  id uuid primary key default gen_random_uuid(),
  code text unique not null check (code ~ '^[0-9A-Za-z]{8}$'),
  promoter_id uuid not null references profiles(id),
  brand_id uuid not null references brands(id),
  channel text not null check (channel in ('story', 'linkedin', 'x', 'link')),
  status text not null default 'active' check (status in ('active', 'disabled')),
  created_at timestamptz not null default now(),
  unique (promoter_id, brand_id, channel)
);

create table visitors (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references brands(id),
  claim_link_id uuid references links(id),
  claim_promoter_id uuid references profiles(id),
  claim_click_id uuid,
  claim_rate_cents bigint check (claim_rate_cents is null or claim_rate_cents > 0),  -- D24
  claim_expires_at timestamptz,                                                      -- D16
  qualified_at timestamptz,
  qualified_click_id uuid,
  qualified_ip_hash text,                  -- G12 (rules R1, R2, R5)
  qualified_fp_hash text,                  -- G12
  qualified_active_ms int,                 -- G12
  qualified_interactions int,              -- G12
  created_at timestamptz not null default now()
);

-- Every identity signal seen for a visitor, per brand
create table visitor_keys (
  brand_id uuid not null references brands(id),
  key_type text not null check (key_type in ('cookie', 'fp', 'ipua')),
  key_hash text not null,                   -- HMAC-SHA256 with the server pepper
  visitor_id uuid not null references visitors(id),
  created_at timestamptz not null default now(),
  primary key (brand_id, key_type, key_hash)
);

create table clicks (
  id uuid primary key default gen_random_uuid(),
  link_id uuid not null references links(id),
  brand_id uuid not null references brands(id),
  promoter_id uuid not null references profiles(id),
  visitor_id uuid references visitors(id),
  cookie_id text,
  ip_hash text not null,
  ua_hash text not null,
  user_agent text,                          -- stripped after 90 days (P3.10)
  country char(2),
  referrer text,
  ignored_reason text
    check (ignored_reason is null or ignored_reason in ('self', 'brand_member', 'rate_limited', 'banned_promoter')),
  outbound_at timestamptz,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- earnings and promoter money
create table earnings (
  id uuid primary key default gen_random_uuid(),
  promoter_id uuid not null references profiles(id),
  brand_id uuid not null references brands(id),
  link_id uuid not null references links(id),
  visitor_id uuid unique not null references visitors(id),                   -- one payout per visitor, ever
  click_id uuid not null,
  amount_cents bigint not null check (amount_cents > 0),
  cycle_ends_at timestamptz,                                                 -- null while waitlisted (D36)
  status text not null default 'pending'
    check (status in ('waitlisted', 'pending', 'available', 'flagged', 'reversed', 'expired')),
  funded_at timestamptz,                                                     -- when budget was reserved
  settled_at timestamptz,
  created_at timestamptz not null default now(),
  -- Only waitlisted/expired earnings may lack a cycle; funded ones must have funded_at.
  check (status in ('waitlisted', 'expired') or (cycle_ends_at is not null and funded_at is not null))
);

alter table budget_ledger add constraint budget_ledger_earning_fk foreign key (earning_id) references earnings(id);

create table promoter_ledger (
  id bigserial primary key,
  promoter_id uuid not null references profiles(id),
  delta_cents bigint not null check (delta_cents <> 0),
  reason text not null check (reason in ('earning', 'withdrawal', 'withdrawal_failed', 'clawback', 'forfeit')),
  earning_id uuid references earnings(id),
  withdrawal_id uuid,    -- FK added below
  note text,
  created_at timestamptz not null default now()
);

create table payout_accounts (
  id uuid primary key default gen_random_uuid(),
  promoter_id uuid unique not null references profiles(id),                  -- one per promoter
  provider text not null,
  external_id text not null,
  account_name text,
  verified boolean not null default false,
  created_at timestamptz not null default now(),
  unique (provider, external_id)                                             -- same account can't be shared
);

create table withdrawals (
  id uuid primary key default gen_random_uuid(),
  promoter_id uuid not null references profiles(id),
  amount_cents bigint not null check (amount_cents >= 1000),
  fee_cents bigint,
  provider text not null,
  status text not null default 'requested'
    check (status in ('requested', 'review', 'processing', 'paid', 'failed')),
  external_ref text,
  created_at timestamptz not null default now(),
  paid_at timestamptz
);

alter table promoter_ledger add constraint promoter_ledger_withdrawal_fk foreign key (withdrawal_id) references withdrawals(id);

create table budget_refunds (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references brands(id),
  amount_cents bigint not null check (amount_cents > 0),
  status text not null default 'requested' check (status in ('requested', 'processing', 'done', 'failed')),
  processor_refund_ref text,
  requested_by uuid not null references profiles(id),
  created_at timestamptz not null default now(),
  done_at timestamptz
);

alter table budget_ledger add constraint budget_ledger_refund_fk foreign key (refund_id) references budget_refunds(id);

-- ---------------------------------------------------------------- fraud, settings, audit
create table fraud_flags (
  id uuid primary key default gen_random_uuid(),
  subject_type text not null check (subject_type in ('earning', 'link', 'promoter', 'visitor')),
  subject_id uuid not null,
  rule text not null,
  score int not null,
  details jsonb,
  status text not null default 'open' check (status in ('open', 'cleared', 'confirmed')),
  reviewed_by uuid references profiles(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

create table settings (
  key text primary key,
  value jsonb not null
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

-- ---------------------------------------------------------------- additions beyond BUILD s6
-- G5: SQL functions queue emails here; the worker's `notify` job drains it.
create table notification_outbox (
  id bigserial primary key,
  kind text not null,                       -- template name, e.g. 'budget_used_up'
  recipient_user_id uuid references profiles(id),
  recipient_email text,
  payload jsonb not null default '{}'::jsonb,
  dedupe_key text unique,                   -- e.g. 'budget_used_up:<brand>:<date>'
  send_after timestamptz not null default now(),
  sent_at timestamptz,
  attempts int not null default 0,
  last_error text,
  created_at timestamptz not null default now(),
  check (recipient_user_id is not null or recipient_email is not null)
);

-- G10: brand members' dashboard sessions, for self-promotion rule R9. Written from P2.1.
create table member_signals (
  id bigserial primary key,
  brand_id uuid not null references brands(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  ip_hash text not null,
  ua_hash text not null,
  fp_hash text,
  seen_at timestamptz not null default now()
);
