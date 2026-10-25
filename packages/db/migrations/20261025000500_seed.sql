-- Seed data needed in every environment (BUILD.md section 6 "seed" comment, plus later decisions).

insert into settings (key, value) values
  ('floor_cents',          '10'),      -- D22: $0.10 per qualified visitor
  ('min_bid_cents',        '1000'),    -- D30: $10
  ('budget_share_bps',     '5000'),    -- D2: 50% of each bid becomes ad budget
  ('min_withdrawal_cents', '1000'),    -- D26: $10
  ('claim_days',           '7'),       -- D16
  ('qualify_seconds',      '10'),      -- D14
  ('cycle_hours',          '24'),      -- D15
  ('stagnation_days',      '30'),      -- D23
  ('waitlist_days',        '30'),      -- D36
  ('blocked_domains',      '[]'),      -- admin-editable (P1.6 listing check)
  ('banned_words',         '[]'),      -- admin-editable (P1.6 listing check)
  ('fraud_thresholds', $json$
    {
      "flag_score": 50,
      "r1": { "promoters": 3, "window_hours": 24, "score": 40 },
      "r2": { "promoters": 3, "window_days": 7, "score": 50 },
      "r3": { "multiple": 5, "min_qualified": 50, "score": 30 },
      "r4": { "share_pct": 90, "score": 20 },
      "r5": { "stddev_ms_max": 1000, "min_samples": 20, "score": 40 },
      "r6": { "min_qualified": 50, "score": 30 },
      "r7": { "score": 40 },
      "r8": { "account_age_days": 7, "cycle_cents_over": 5000, "score": 25 },
      "r9": { "score": 60 },
      "trust": { "clean_cycle": 1, "max": 50, "confirmed_flag": -10, "confirmed_self_promo": -50,
                 "review_below": 0, "suspend_below": -30 }
    }
  $json$::jsonb)
on conflict (key) do nothing;

-- Categories. requires_review = BUILD s8: goes to the admin queue instead of straight live.
insert into categories (slug, name, requires_review) values
  ('developer-tools',    'Developer tools',        false),
  ('saas',               'SaaS',                   false),
  ('ai',                 'AI',                     false),
  ('design',             'Design',                 false),
  ('marketing',          'Marketing',              false),
  ('e-commerce',         'E-commerce',             false),
  ('productivity',       'Productivity',           false),
  ('education',          'Education',              false),
  ('gaming',             'Gaming',                 false),
  ('media-creators',     'Media and creators',     false),
  ('hardware',           'Hardware',               false),
  ('community',          'Community',              false),
  ('open-source',        'Open source',            false),
  ('services',           'Services',               false),
  ('other',              'Other',                  false),
  ('crypto',             'Crypto',                 true),
  ('finance',            'Finance',                true),
  ('health-supplements', 'Health and supplements', true),
  ('gambling-adjacent',  'Gambling-adjacent',      true)
on conflict (slug) do nothing;
