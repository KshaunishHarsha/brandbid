-- P3.3: deterministic fraud signals for a link's pending earning cycle.
-- R7 is deliberately omitted until an IP-intelligence provider is selected (BUILD §16).
create table if not exists public.fraud_assessments (
  id bigserial primary key,
  link_id uuid not null references public.links(id),
  promoter_id uuid not null references public.profiles(id),
  cycle_ends_at timestamptz not null,
  score int not null check (score >= 0),
  rules jsonb not null default '[]'::jsonb,
  assessed_at timestamptz not null default now(),
  unique (link_id, cycle_ends_at)
);
alter table public.fraud_assessments enable row level security;
revoke all on public.fraud_assessments from public, anon, authenticated;

create or replace function public.fraud_rule_scores(p_link_id uuid, p_cycle_ends_at timestamptz)
returns table(rule text, score int, details jsonb)
language plpgsql stable security definer set search_path = ''
as $$
declare
  cfg jsonb;
  group_start timestamptz;
  promoter uuid;
  brand uuid;
  promoter_country text;
  promoter_email text;
  brand_name text;
  brand_host text;
  cycle_hours_value int;
  group_count bigint;
  group_amount bigint;
  nonempty_country_count bigint;
  leading_country text;
  leading_country_count bigint;
  active_spread double precision;
  clickthroughs bigint;
  group_ip_promoters bigint;
  group_fp_promoters bigint;
  baseline_daily numeric;
  r9_signals jsonb;
begin
  select s.value into cfg from public.settings s where s.key = 'fraud_thresholds';
  cfg := coalesce(cfg, '{}'::jsonb);
  select l.promoter_id, l.brand_id, b.name, lower(split_part(split_part(b.url, '://', 2), '/', 1)),
         coalesce(nullif(p.country, ''), ''), lower(coalesce(u.email::text, ''))
    into promoter, brand, brand_name, brand_host, promoter_country, promoter_email
    from public.links l
    join public.brands b on b.id = l.brand_id
    join public.profiles p on p.id = l.promoter_id
    join auth.users u on u.id = l.promoter_id
   where l.id = p_link_id;
  if promoter is null or p_cycle_ends_at is null then
    raise exception 'fraud_group_not_found' using errcode = '22023';
  end if;

  select coalesce((s.value #>> '{}')::int, 24) into cycle_hours_value
    from public.settings s where s.key = 'cycle_hours';
  group_start := p_cycle_ends_at - make_interval(hours => coalesce(cycle_hours_value, 24));

  select count(*), coalesce(sum(e.amount_cents), 0)
    into group_count, group_amount
    from public.earnings e
   where e.link_id = p_link_id and e.cycle_ends_at = p_cycle_ends_at and e.status = 'pending';
  if group_count = 0 then return; end if;

  -- R1: a qualification IP is shared by the configured number of promoters in the last 24 hours.
  if exists (
    select 1
      from public.visitors v
     where v.claim_link_id = p_link_id and v.qualified_at >= group_start and v.qualified_at < p_cycle_ends_at
       and v.qualified_ip_hash is not null
       and (select count(distinct recent.claim_promoter_id)
              from public.visitors recent
             where recent.qualified_ip_hash = v.qualified_ip_hash
               and recent.qualified_at >= p_cycle_ends_at - interval '24 hours'
               and recent.qualified_at < p_cycle_ends_at) >= coalesce((cfg #>> '{r1,promoters}')::int, 3)
  ) then
    return query select 'R1'::text, coalesce((cfg #>> '{r1,score}')::int, 40), jsonb_build_object('signal', 'shared_qualification_ip');
  end if;

  -- R2: a fingerprint is shared by the configured number of promoters in the last seven days.
  if exists (
    select 1
      from public.visitors v
     where v.claim_link_id = p_link_id and v.qualified_at >= group_start and v.qualified_at < p_cycle_ends_at
       and v.qualified_fp_hash is not null
       and (select count(distinct recent.claim_promoter_id)
              from public.visitors recent
             where recent.qualified_fp_hash = v.qualified_fp_hash
               and recent.qualified_at >= p_cycle_ends_at - interval '7 days'
               and recent.qualified_at < p_cycle_ends_at) >= coalesce((cfg #>> '{r2,promoters}')::int, 3)
  ) then
    return query select 'R2'::text, coalesce((cfg #>> '{r2,score}')::int, 50), jsonb_build_object('signal', 'shared_qualification_fingerprint');
  end if;

  -- R3: compare this link's cycle volume with the promoter's prior seven-day daily average.
  select count(*)::numeric / 7 into baseline_daily
    from public.visitors v
   where v.claim_promoter_id = promoter and v.qualified_at >= group_start - interval '7 days'
     and v.qualified_at < group_start;
  if group_count > coalesce((cfg #>> '{r3,min_qualified}')::int, 50)
     and group_count > coalesce((cfg #>> '{r3,multiple}')::numeric, 5) * coalesce(baseline_daily, 0) then
    return query select 'R3'::text, coalesce((cfg #>> '{r3,score}')::int, 30),
      jsonb_build_object('qualified', group_count, 'prior_daily_average', baseline_daily);
  end if;

  -- R4: one non-home country accounts for over the configured share of known country values.
  select count(*) into nonempty_country_count
    from public.earnings e join public.clicks c on c.id = e.click_id
   where e.link_id = p_link_id and e.cycle_ends_at = p_cycle_ends_at and e.status = 'pending'
     and nullif(c.country::text, '') is not null;
  select c.country::text, count(*) into leading_country, leading_country_count
    from public.earnings e join public.clicks c on c.id = e.click_id
   where e.link_id = p_link_id and e.cycle_ends_at = p_cycle_ends_at and e.status = 'pending'
     and nullif(c.country::text, '') is not null
   group by c.country order by count(*) desc, c.country::text limit 1;
  if nonempty_country_count > 0 and leading_country_count::numeric / nonempty_country_count * 100 > coalesce((cfg #>> '{r4,share_pct}')::numeric, 90)
     and leading_country <> promoter_country then
    return query select 'R4'::text, coalesce((cfg #>> '{r4,score}')::int, 20),
      jsonb_build_object('country', leading_country, 'share_percent', round(leading_country_count::numeric / nonempty_country_count * 100, 2));
  end if;

  -- R5: near-identical active times across enough qualified visitors.
  select stddev_samp(v.qualified_active_ms)::double precision into active_spread
    from public.earnings e join public.visitors v on v.id = e.visitor_id
   where e.link_id = p_link_id and e.cycle_ends_at = p_cycle_ends_at and e.status = 'pending'
     and v.qualified_active_ms is not null;
  if group_count >= coalesce((cfg #>> '{r5,min_samples}')::int, 20) and active_spread < coalesce((cfg #>> '{r5,stddev_ms_max}')::double precision, 1000) then
    return query select 'R5'::text, coalesce((cfg #>> '{r5,score}')::int, 40), jsonb_build_object('active_time_stddev_ms', round(active_spread::numeric, 2));
  end if;

  -- R6: enough qualified visitors in the cycle and none clicked through to the brand site.
  select count(*) filter (where c.outbound_at is not null) into clickthroughs
    from public.earnings e join public.clicks c on c.id = e.click_id
   where e.link_id = p_link_id and e.cycle_ends_at = p_cycle_ends_at and e.status = 'pending';
  if group_count >= coalesce((cfg #>> '{r6,min_qualified}')::int, 50) and clickthroughs = 0 then
    return query select 'R6'::text, coalesce((cfg #>> '{r6,score}')::int, 30), jsonb_build_object('qualified', group_count, 'clickthroughs', clickthroughs);
  end if;

  -- R8: a new account earned over the configured amount across all links in this cycle.
  if exists (
    select 1 from public.profiles p
     where p.id = promoter and p.created_at > p_cycle_ends_at - make_interval(days => coalesce((cfg #>> '{r8,account_age_days}')::int, 7))
       and (select coalesce(sum(e.amount_cents), 0) from public.earnings e
             where e.promoter_id = promoter and e.cycle_ends_at = p_cycle_ends_at and e.status = 'pending') > coalesce((cfg #>> '{r8,cycle_cents_over}')::bigint, 5000)
  ) then
    return query select 'R8'::text, coalesce((cfg #>> '{r8,score}')::int, 25), jsonb_build_object('cycle_earnings_cents',
      (select sum(e.amount_cents) from public.earnings e where e.promoter_id = promoter and e.cycle_ends_at = p_cycle_ends_at and e.status = 'pending'));
  end if;

  -- R9: supported self-promotion signals. Billing-name matching is unavailable until brands store a billing name.
  select coalesce(jsonb_agg(distinct signal), '[]'::jsonb) into r9_signals
    from (
      select 'email_domain_matches_brand'::text as signal
       where split_part(promoter_email, '@', 2) = case when brand_host like 'www.%' then substring(brand_host from 5) else brand_host end
         and split_part(promoter_email, '@', 2) <> ''
      union all
      select 'brand_bid_payment_email_matches'::text
       where exists (select 1 from public.bids b where b.brand_id = brand and lower(b.payer_email) = promoter_email)
      union all
      select 'brand_member_dashboard_ip_or_fingerprint_matches'::text
       where exists (
         select 1 from public.member_signals ms join public.brand_members bm on bm.brand_id = ms.brand_id and bm.user_id = ms.user_id
          where ms.brand_id = brand and ms.seen_at >= p_cycle_ends_at - interval '30 days'
            and exists (select 1 from public.earnings e join public.visitors v on v.id = e.visitor_id
                         where e.link_id = p_link_id and e.cycle_ends_at = p_cycle_ends_at and e.status = 'pending'
                           and ((v.qualified_ip_hash is not null and v.qualified_ip_hash = ms.ip_hash)
                             or (v.qualified_fp_hash is not null and v.qualified_fp_hash = ms.fp_hash)))
       )
    ) signals;
  if jsonb_array_length(r9_signals) > 0 then
    return query select 'R9'::text, coalesce((cfg #>> '{r9,score}')::int, 60), jsonb_build_object('signals', r9_signals);
  end if;
end;
$$;

create or replace function public.assess_fraud_group(p_link_id uuid, p_cycle_ends_at timestamptz)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_promoter uuid;
  v_rules jsonb;
  v_score int;
  v_flag_score int;
begin
  select l.promoter_id into v_promoter from public.links l where l.id = p_link_id;
  if v_promoter is null or p_cycle_ends_at is null then
    raise exception 'fraud_group_not_found' using errcode = '22023';
  end if;
  if not exists (select 1 from public.earnings e where e.link_id = p_link_id and e.cycle_ends_at = p_cycle_ends_at and e.status = 'pending') then
    raise exception 'fraud_group_not_pending' using errcode = '22023';
  end if;
  select coalesce((s.value->>'flag_score')::int, 50) into v_flag_score
    from public.settings s where s.key = 'fraud_thresholds';
  v_flag_score := coalesce(v_flag_score, 50);
  select coalesce(sum(s.score), 0)::int,
         coalesce(jsonb_agg(jsonb_build_object('rule', s.rule, 'score', s.score, 'details', s.details) order by s.rule), '[]'::jsonb)
    into v_score, v_rules
    from public.fraud_rule_scores(p_link_id, p_cycle_ends_at) s;

  insert into public.fraud_assessments (link_id, promoter_id, cycle_ends_at, score, rules)
  values (p_link_id, v_promoter, p_cycle_ends_at, v_score, v_rules)
  on conflict (link_id, cycle_ends_at) do update
    set score = excluded.score, rules = excluded.rules, assessed_at = now();

  if v_score >= v_flag_score then
    insert into public.fraud_flags (subject_type, subject_id, rule, score, details)
    select 'earning', e.id, r->>'rule', (r->>'score')::int, r->'details'
      from public.earnings e
      cross join lateral jsonb_array_elements(v_rules) r
     where e.link_id = p_link_id and e.cycle_ends_at = p_cycle_ends_at and e.status = 'pending'
    on conflict (subject_type, subject_id, rule) do nothing;
  end if;
  return jsonb_build_object('score', v_score, 'flagged', v_score >= v_flag_score, 'rules', v_rules);
end;
$$;

create unique index if not exists fraud_flags_subject_rule_unique on public.fraud_flags (subject_type, subject_id, rule);
revoke all on function public.fraud_rule_scores(uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.fraud_rule_scores(uuid, timestamptz) to service_role;
revoke all on function public.assess_fraud_group(uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.assess_fraud_group(uuid, timestamptz) to service_role;
