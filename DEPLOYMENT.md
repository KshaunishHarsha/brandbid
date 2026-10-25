# Deployment

How brandbid is deployed. Three parts, owned by different people:

| Part | What runs there | Who | Status |
| --- | --- | --- | --- |
| **Cloudflare** | The web app (pages, API routes, `/go` redirect) as a Cloudflare Worker | Cloudflare person (section 2) | Ready to deploy |
| **Supabase** | Database, auth, file storage | Project owner (section 3) | Owner is setting up |
| **AWS** | The background worker (settlement, listing checks, emails) | To be decided | Not decided yet (section 4) |

If you are here to set up **Cloudflare**, read section 1 for the picture, then follow section 2. You do not need to touch Supabase or AWS, but you will need a few values from the project owner (section 2.1).

Nothing here is deployed yet. The repo is built and tested locally; **the first real deploy is yours**, so please note anything that does not match this document and it will get fixed. Section 2.14 says exactly what has and has not been tested.

---

## 1. The picture

```
 visitors ─────►  Cloudflare Worker  ──────►  Supabase (Postgres, Auth, Storage)
 (brandbid.wtf)   web app + /go redirect              ▲
                       │                              │
                       ├─► Upstash Redis (rate limits)│
                       ├─► Turnstile (bot check)      │
                       └─◄ Razorpay webhooks          │
                                                      │
                          AWS worker (later) ─────────┘   jobs: settle, check listings, email
```

Two environments, each its own Worker with its own database and its own keys:

| | Staging | Production |
| --- | --- | --- |
| Worker name | `brandbid-staging` | `brandbid-prod` |
| URL | `https://staging.brandbid.wtf` | `https://brandbid.wtf` |
| Supabase project | `brandbid-staging` | `brandbid-prod` |
| Razorpay | test mode keys | live keys |
| Deploy command | `scripts/deploy-cloudflare.sh staging` | `scripts/deploy-cloudflare.sh production` |

**Never share keys, the database or `IP_PEPPER` between the two.** Always deploy staging first and check it.

---

## 2. Cloudflare (web app)

### 2.1 What you need before starting

**You create these (in Cloudflare and around it):**

- [ ] A Cloudflare account on the **Workers Paid** plan (about $5/month). The app is ~2.5 MB compressed against a 3 MB limit on the free plan, and the free plan's 10 ms CPU limit per request is too tight for server-rendered pages. Check Cloudflare's current limits if in doubt.
- [ ] The domain `brandbid.wtf` added as a site (section 2.3).
- [ ] A **Turnstile** widget per environment (section 2.4).
- [ ] An **Upstash Redis** database per environment (section 2.5).
- [ ] A machine with **Node 24** (the repo's `.nvmrc`) and **pnpm 12** (`npm install -g pnpm@12.15.0`) and the GitHub repo `KshaunishHarsha/brandbid` (you have been added as a collaborator; accept the GitHub invitation email first).

**You get these from the project owner** (please send them through a password manager or similar, never in chat or in git):

| Value | Used for | Per environment? |
| --- | --- | --- |
| Supabase project URL | build variable | yes |
| Supabase anon (publishable) key | build variable | yes |
| Supabase **service role** key | Worker secret. Full database access. | yes |
| Razorpay key id, key secret, webhook secret | Worker secrets | yes (test keys for staging, live for production) |
| Sentry DSN (optional, can be empty for now) | build variable | optional |

You generate **`IP_PEPPER`** yourself, once per environment: `openssl rand -hex 32`. Keep it in the password manager. **Never rotate it** (changing it makes every returning visitor look new and breaks fraud checks). Staging and production must be different.

### 2.2 Get the code and log in

```bash
git clone https://github.com/KshaunishHarsha/brandbid.git
cd brandbid
npm install -g pnpm@12.15.0      # if you do not have pnpm 12 yet
pnpm install --frozen-lockfile
cd apps/web
pnpm exec wrangler login            # opens a browser. For CI later, use CLOUDFLARE_API_TOKEN + CLOUDFLARE_ACCOUNT_ID instead
pnpm exec wrangler whoami           # check it is the right account
```

If `pnpm install` stops with `ERR_PNPM_IGNORED_BUILDS`, tell the project owner: a new dependency needs approving in `pnpm-workspace.yaml`.

### 2.3 Domain and DNS

1. In Cloudflare: **Add a site** → `brandbid.wtf` (the Free plan is fine for the zone itself).
2. At the domain registrar, change the nameservers to the two Cloudflare gives you. Wait until the site shows **Active**.
3. **SSL/TLS** → mode **Full (strict)**; turn on **Always Use HTTPS**; set minimum TLS 1.2.
4. **Do not create DNS records for `brandbid.wtf` or `staging.brandbid.wtf` by hand.** The deploy creates them (the Worker is attached as a "custom domain" in `apps/web/wrangler.jsonc`). If a record with the same name already exists (a parked-domain A record, for example), delete it first or the deploy will fail with a conflict.

Later (not now): email records (SPF, DKIM, DMARC) for sending mail, and a `www` → apex redirect.

### 2.4 Turnstile (bot check)

**Cloudflare dashboard → Turnstile → Add widget.** Create one per environment:

| | Name | Hostnames | Widget mode |
| --- | --- | --- | --- |
| Staging | `brandbid-staging` | `staging.brandbid.wtf` | Managed |
| Production | `brandbid-prod` | `brandbid.wtf` | Managed |

Each gives a **site key** (public → build variable `NEXT_PUBLIC_TURNSTILE_SITE_KEY`) and a **secret key** (→ Worker secret `TURNSTILE_SECRET_KEY`). The app shows the widget only when it needs to challenge someone.

If the secret key is missing in a deployed environment, sign-in and checkout deliberately **fail closed** (every attempt is refused as a bot).

### 2.5 Upstash Redis (rate limiting)

At upstash.com create one Redis database per environment (any region; the free tier is plenty). From each database's **REST API** section copy:

- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN`

These are Worker secrets. If they are missing in a deployed environment, sign-in, checkout and the listing prefill return **HTTP 500** on purpose: the app refuses to run without rate limits.

### 2.6 Variables: two kinds, and the difference matters

**Build-time variables (`NEXT_PUBLIC_*`) are compiled into the build.** They are public by design (they reach browsers). Because they are baked in, **every environment needs its own build**: you cannot build once and deploy the same output to staging and production. (This was tested: the values appear inside the built files.)

| Variable | Staging | Production |
| --- | --- | --- |
| `NEXT_PUBLIC_SITE_URL` | `https://staging.brandbid.wtf` | `https://brandbid.wtf` |
| `NEXT_PUBLIC_SUPABASE_URL` | staging project URL | production project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | staging anon key | production anon key |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | staging site key | production site key |
| `NEXT_PUBLIC_GOOGLE_AUTH` (optional) | `true` once Google sign-in is configured, else leave unset | same |
| `NEXT_PUBLIC_SENTRY_DSN` (optional) | | |

**Runtime secrets are NOT in the build.** Set them on the Worker; they never reach browsers. (Also tested: they appear in zero built files.)

| Secret | Notes |
| --- | --- |
| `SUPABASE_SERVICE_ROLE_KEY` | Full database access. Treat like a root password. |
| `IP_PEPPER` | `openssl rand -hex 32`. Never rotate. Different per environment. |
| `TURNSTILE_SECRET_KEY` | From 2.4. |
| `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | From 2.5. |
| `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET` | From the project owner. |

**Never set `PAYMENTS_MODE`.** It is a local-only switch for fake payments; the app refuses to start with it in production and the deploy script refuses to build with it set.

`APP_ENV` is set automatically by `wrangler.jsonc` (a plain, non-secret variable).

### 2.7 First deploy: staging

From `apps/web`:

**1. Set the runtime secrets.**

```bash
cp secrets.example.json secrets.staging.json
# edit secrets.staging.json: fill in every value (this file is git-ignored; delete it when done)
pnpm exec wrangler secret bulk secrets.staging.json --env staging
```

If Wrangler says the Worker does not exist yet and asks whether to create it, answer **yes**.

**2. Build and deploy** (this is the one command; it builds *for staging*, checks the result, then uploads):

```bash
export NEXT_PUBLIC_SITE_URL=https://staging.brandbid.wtf
export NEXT_PUBLIC_SUPABASE_URL=https://<staging-project-ref>.supabase.co
export NEXT_PUBLIC_SUPABASE_ANON_KEY=<staging anon key>
export NEXT_PUBLIC_TURNSTILE_SITE_KEY=<staging turnstile site key>

scripts/deploy-cloudflare.sh staging --dry-run    # builds and checks, uploads nothing. Do this first.
scripts/deploy-cloudflare.sh staging              # the real deploy
```

What the script protects you from: it refuses to build if a variable is missing, if the site URL does not match the environment (a staging URL in a production build), if the Supabase URL is local or not `https`, or if `PAYMENTS_MODE` is set. After building it confirms your values are inside the output and that no local address (`127.0.0.1:54321`) leaked in. Without these checks, a forgotten variable silently falls back to a developer's local settings.

A build takes about 30 seconds. The first deploy also creates the DNS record and the certificate for `staging.brandbid.wtf`; this can take a minute or two to start answering.

### 2.8 Check staging

Replace the host as needed. Everything below should match:

| Check | Command | Expected |
| --- | --- | --- |
| Site is up, database reachable | `curl -s https://staging.brandbid.wtf/ \| grep -c "No brands here yet"` | a number above `0` (on an empty board this proves the page reached the database; once brands exist, just check the page shows them) |
| Sign-in page | `curl -s -o /dev/null -w '%{http_code}' https://staging.brandbid.wtf/signin` | `200` |
| Click redirect | `curl -s -o /dev/null -w '%{http_code} %{redirect_url}' https://staging.brandbid.wtf/go/abc` | `302 https://staging.brandbid.wtf/` |
| Qualification endpoint | `curl -s -o /dev/null -w '%{http_code}' -X POST https://staging.brandbid.wtf/api/q` | `204` |
| Webhook rejects forged calls | `curl -s -w ' %{http_code}' -X POST https://staging.brandbid.wtf/api/webhooks/razorpay -H 'x-razorpay-signature: bad' -d '{}'` | `invalid signature 401` |
| Mock payments are off | `curl -s -o /dev/null -w '%{http_code}' -X POST https://staging.brandbid.wtf/api/dev/mock-pay` | `404` |
| Protected pages redirect | `curl -s -o /dev/null -w '%{http_code} %{redirect_url}' https://staging.brandbid.wtf/dash` | `307 https://staging.brandbid.wtf/signin?next=%2Fdash` |

In a browser: open the site, then `/list` and check the category dropdown loads on step 2; open `/signin` and request a magic link (this needs Supabase email to be configured by the project owner, section 3).

Live logs while you test: `pnpm exec wrangler tail --env staging`.

**Known limit until the AWS worker exists:** a newly paid listing stays "under review" because the automatic check runs in the background worker (section 4). To see a full listing go live on staging, the project owner can run the check by hand from a laptop: `DATABASE_URL=<staging direct connection string> pnpm --filter worker run-once check-listing`.

### 2.9 Razorpay webhook (project owner or you, in the Razorpay dashboard)

For each environment: **Settings → Webhooks → Add**:

- **URL:** `https://staging.brandbid.wtf/api/webhooks/razorpay` (production: `https://brandbid.wtf/api/webhooks/razorpay`)
- **Secret:** the same value as the `RAZORPAY_WEBHOOK_SECRET` secret on that Worker
- **Events:** tick **`payment.captured`** only. Other events are ignored on purpose.

In Razorpay's settings, payment **capture must be Automatic**, and the account needs international (USD) payments enabled for live mode.

### 2.10 Production

Only after staging checks out. Same steps with production values:

- [ ] The production Supabase project is set up and migrated (section 3).
- [ ] A production Turnstile widget and Upstash database exist (separate from staging).
- [ ] A **new** `IP_PEPPER` (`openssl rand -hex 32`), not the staging one.
- [ ] Live Razorpay keys and a webhook pointing at `https://brandbid.wtf/api/webhooks/razorpay`.

```bash
cp secrets.example.json secrets.production.json      # fill in, then:
pnpm exec wrangler secret bulk secrets.production.json --env production

export NEXT_PUBLIC_SITE_URL=https://brandbid.wtf
export NEXT_PUBLIC_SUPABASE_URL=https://<production-project-ref>.supabase.co
export NEXT_PUBLIC_SUPABASE_ANON_KEY=<production anon key>
export NEXT_PUBLIC_TURNSTILE_SITE_KEY=<production turnstile site key>

scripts/deploy-cloudflare.sh production --dry-run
scripts/deploy-cloudflare.sh production
```

Then run the section 2.8 checks against `https://brandbid.wtf`. Open a fresh shell for production so staging values cannot linger in your environment (the script's URL check would catch a mix-up, but be tidy).

### 2.11 Updating, rolling back, secrets

- **Deploy a new version:** pull the latest `main` and re-run the same `scripts/deploy-cloudflare.sh <env>` with that environment's variables. Every deploy is a fresh build.
- **Roll back:** `pnpm exec wrangler rollback --env production` returns to the previous version. This does **not** undo database changes; database migrations only go forward.
- **See what is deployed:** `pnpm exec wrangler deployments list --env production`.
- **Change a secret:** `pnpm exec wrangler secret put NAME --env staging`, or edit the JSON and run `secret bulk` again. Changing `IP_PEPPER` is the one you must not do.
- **Change a build variable:** it needs a new build and deploy (the values are compiled in).

### 2.12 If something goes wrong

| Symptom | Likely cause |
| --- | --- |
| Script: `missing build variables` | Export all four `NEXT_PUBLIC_*` values in the same shell. |
| Script: `NEXT_PUBLIC_SITE_URL is ... but production must be ...` | Staging values in a production shell (or the reverse). |
| Home page returns 500 | Wrong `NEXT_PUBLIC_SUPABASE_URL` or `SUPABASE_SERVICE_ROLE_KEY`, or the Supabase migrations have not been applied. Check `wrangler tail`. |
| Sign-in, checkout or `/api/brands/prefill` return 500 | `UPSTASH_REDIS_REST_URL` / `_TOKEN` not set (deliberate: no rate limits, no service). |
| Sign-in or checkout say "bot check failed" | `TURNSTILE_SECRET_KEY` missing or wrong, or the widget's hostnames do not include the site. |
| Sign-in link request succeeds but no email arrives | Supabase email/SMTP is not configured yet (section 3). |
| Razorpay webhook shows failures | Wrong `RAZORPAY_WEBHOOK_SECRET` (the response is 401), or the URL is wrong. |
| Deploy fails on the domain / route | An old DNS record with the same name exists (see 2.3 step 4), or the zone is not Active yet. |
| Deploy fails with a size error | The account is not on the Workers Paid plan. |
| Build fails mentioning `edge runtime` | Someone added `export const runtime = 'edge'` to a route; remove it (Workers already run at the edge). |

### 2.13 Not done yet (please do not build these yourself)

- **Automatic deploys from GitHub (CI).** Not set up. Manual deploys with the script are the plan until the project owner asks. Note that Cloudflare's built-in Git deploys do not fit well because each environment needs its own build variables.
- **Page cache (R2).** Not wired. The leaderboard pages are rendered fresh on every request, which is correct, just not cached. An R2 incremental cache will be added later; no R2 bucket is needed now.
- **Sentry source maps, PostHog analytics, email DNS records.** Later.

### 2.14 What has and has not been tested

| | Status |
| --- | --- |
| Build for Cloudflare, the deploy script and all its refusals, both environments' Wrangler config (dry run), the built app in the local Workers runtime against a local database | Tested |
| That build variables are compiled in and secrets are not | Tested |
| The real upload, custom-domain creation, certificate, `wrangler secret bulk`, Turnstile and Upstash from a live Worker, the Razorpay webhook from Razorpay itself | **Not tested: this needs your real account.** Please tell the project owner what differs. |

---

## 3. Supabase (project owner)

You are setting this up. Cloudflare needs three values from you per environment: the **project URL**, the **anon key** and the **service role key** (Project Settings → API Keys).

For each of staging and production:

1. **Create the project** (names `brandbid-staging`, `brandbid-prod`). Pick a region close to most users and use the same region for both.
2. **Apply the database.** From the repo root: `supabase link --project-ref <ref>` then `supabase db push`. This applies every migration in `packages/db/migrations` in order. Never edit an applied migration; changes are new migration files.
3. **Auth → URL Configuration:** Site URL = the environment's URL (`https://staging.brandbid.wtf` or `https://brandbid.wtf`). Redirect URLs: add `https://staging.brandbid.wtf/**` (or `https://brandbid.wtf/**`).
4. **Auth → Email Templates:** paste the contents of `supabase/templates/magic_link.html` into **both** "Magic Link" and "Confirm signup" (subject: `Your brandbid sign-in link`). The link in the template uses a flow that works across browsers.
5. **Auth → SMTP settings:** configure a real sender (Resend is planned). Supabase's built-in sender is heavily rate-limited and not for production.
6. **Storage:** create a bucket named `logos`: **public**, file size limit **1 MiB**, allowed types `image/png`, `image/jpeg`, `image/webp`. (The `config.toml` setting only covers local development.)
7. **Auth → Providers → Google** (optional, later): needs a Google OAuth client; steps are under P1.4 in `PHASES.md`. Then set `NEXT_PUBLIC_GOOGLE_AUTH=true` for that environment's build.
8. **Direct connection string** (Project Settings → Database): the AWS worker will need the *direct* (session-mode) one, not the pooler. Keep it safe; it is not needed for Cloudflare.

---

## 4. AWS (background worker): to be decided

The worker (`apps/worker`) runs the scheduled jobs. The plan in `BUILD.md` (D40) is a container on ECS Fargate, but this is **not decided or built yet**. When it is, this section will be filled in.

What this means for now:

- The **web app works without it**, but anything that needs a background job waits: newly paid listings stay "under review" (the automatic check), and settlement and emails are not built yet anyway.
- For testing, a job can be run by hand against a database: `DATABASE_URL=<direct connection string> pnpm --filter worker run-once check-listing`.
- The worker needs one secret: `DATABASE_URL` (the direct Supabase connection string), plus `WORKER_SENTRY_DSN` if Sentry is used.

---

## Appendix: variable reference

| Variable | Kind | Required when deployed | Where it comes from |
| --- | --- | --- | --- |
| `NEXT_PUBLIC_SITE_URL` | build | yes | the environment's URL |
| `NEXT_PUBLIC_SUPABASE_URL` | build | yes | Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | build | yes | Supabase |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | build | yes | Turnstile widget |
| `NEXT_PUBLIC_GOOGLE_AUTH` | build | no | `true` when Google sign-in is configured |
| `NEXT_PUBLIC_SENTRY_DSN` | build | no | Sentry |
| `SUPABASE_SERVICE_ROLE_KEY` | secret | yes | Supabase |
| `IP_PEPPER` | secret | yes (app refuses to hash without it) | `openssl rand -hex 32`, never rotate |
| `TURNSTILE_SECRET_KEY` | secret | yes (otherwise bot checks fail closed) | Turnstile widget |
| `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | secret | yes (otherwise rate-limited routes return 500) | Upstash |
| `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET` | secret | yes for payments | Razorpay |
| `APP_ENV` | plain var | set by `wrangler.jsonc` | do not set by hand |
| `PAYMENTS_MODE` | none | **must not be set** | local development only |
