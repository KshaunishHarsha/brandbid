-- P3.10: persist nightly money-invariant checks and enforce click UA retention.
create table if not exists public.reconciliation_runs (
  id uuid primary key default gen_random_uuid(),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  passed boolean not null default false,
  violation_count int not null default 0 check (violation_count >= 0),
  violations jsonb not null default '[]'::jsonb,
  user_agents_stripped int not null default 0 check (user_agents_stripped >= 0)
);

alter table public.reconciliation_runs enable row level security;
revoke all on public.reconciliation_runs from public, anon, authenticated;
grant select, insert, update on public.reconciliation_runs to service_role;

create or replace function public.run_reconciliation()
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_run_id uuid;
  v_violations jsonb;
  v_count int;
  v_share bigint;
begin
  insert into public.reconciliation_runs default values returning id into v_run_id;
  select (s.value #>> '{}')::bigint into v_share from public.settings s where s.key = 'budget_share_bps';

  with findings as (
    select jsonb_build_object('rule', 'brand_budget_matches_ledger', 'entity_type', 'brand', 'entity_id', b.id,
      'expected_cents', coalesce(l.total_cents, 0), 'actual_cents', b.budget_cents) as finding
      from public.brands b
      left join (select brand_id, sum(delta_cents) as total_cents from public.budget_ledger group by brand_id) l on l.brand_id = b.id
     where b.budget_cents <> coalesce(l.total_cents, 0)
    union all
    select jsonb_build_object('rule', 'brand_budget_nonnegative', 'entity_type', 'brand', 'entity_id', b.id,
      'actual_cents', b.budget_cents)
      from public.brands b where b.budget_cents < 0
    union all
    select jsonb_build_object('rule', 'earning_amount_matches_claim_rate', 'entity_type', 'earning', 'entity_id', e.id,
      'expected_cents', v.claim_rate_cents, 'actual_cents', e.amount_cents)
      from public.earnings e join public.visitors v on v.id = e.visitor_id
     where e.amount_cents is distinct from v.claim_rate_cents
    union all
    select jsonb_build_object('rule', 'bid_split_matches_setting', 'entity_type', 'bid', 'entity_id', b.id,
      'expected_budget_cents', floor(b.amount_cents * v_share::numeric / 10000)::bigint,
      'actual_budget_cents', b.budget_cents, 'actual_revenue_cents', b.revenue_cents)
      from public.bids b
     where v_share is not null and (b.budget_cents <> floor(b.amount_cents * v_share::numeric / 10000)::bigint
       or b.revenue_cents <> b.amount_cents - floor(b.amount_cents * v_share::numeric / 10000)::bigint)
    union all
    select jsonb_build_object('rule', 'budget_share_setting_present', 'entity_type', 'setting', 'entity_id', null,
      'actual', 'missing') where v_share is null
    union all
    select jsonb_build_object('rule', 'budget_share_setting_in_range', 'entity_type', 'setting', 'entity_id', null,
      'actual_bps', v_share, 'expected_range_bps', jsonb_build_array(0, 10000)) where v_share < 0 or v_share > 10000
    union all
    select jsonb_build_object('rule', 'negative_promoter_balance_has_clawback', 'entity_type', 'promoter', 'entity_id', p.promoter_id,
      'balance_cents', sum(p.delta_cents))
      from public.promoter_ledger p group by p.promoter_id
     having sum(p.delta_cents) < 0 and not bool_or(p.reason = 'clawback')
    union all
    select jsonb_build_object('rule', 'funded_earning_has_one_budget_reservation', 'entity_type', 'earning', 'entity_id', e.id,
      'reservation_rows', count(bl.id))
      from public.earnings e left join public.budget_ledger bl
        on bl.earning_id = e.id and bl.reason = 'visitor' and bl.delta_cents = -e.amount_cents
     where e.status in ('pending', 'available', 'flagged') or (e.status = 'reversed' and e.funded_at is not null)
     group by e.id having count(bl.id) <> 1
    union all
    select jsonb_build_object('rule', 'unfunded_earning_has_no_budget_reservation', 'entity_type', 'earning', 'entity_id', e.id,
      'reservation_rows', count(bl.id))
      from public.earnings e join public.budget_ledger bl on bl.earning_id = e.id and bl.reason = 'visitor'
     where e.status in ('waitlisted', 'expired') or (e.status = 'reversed' and e.funded_at is null)
     group by e.id having count(bl.id) > 0
    union all
    select jsonb_build_object('rule', 'waitlist_head_is_fundable', 'entity_type', 'brand', 'entity_id', b.id,
      'budget_cents', b.budget_cents, 'head_earning_id', head.id, 'head_amount_cents', head.amount_cents)
      from public.brands b
      join lateral (select e.id, e.amount_cents from public.earnings e where e.brand_id = b.id and e.status = 'waitlisted'
                    order by e.created_at, e.id limit 1) head on true
     where b.budget_cents >= head.amount_cents
    union all
    select jsonb_build_object('rule', 'bid_refund_not_above_budget', 'entity_type', 'bid', 'entity_id', b.id,
      'budget_cents', b.budget_cents, 'refunded_cents', b.budget_refunded_cents)
      from public.bids b where b.budget_refunded_cents > b.budget_cents
    union all
    select jsonb_build_object('rule', 'earning_visitor_unique', 'entity_type', 'visitor', 'entity_id', e.visitor_id,
      'earning_count', count(*))
      from public.earnings e group by e.visitor_id having count(*) > 1
  )
  select coalesce(jsonb_agg(finding), '[]'::jsonb) into v_violations from findings;

  v_count := jsonb_array_length(v_violations);
  update public.reconciliation_runs
     set completed_at = now(), passed = (v_count = 0), violation_count = v_count, violations = v_violations
   where id = v_run_id;
  return jsonb_build_object('run_id', v_run_id, 'passed', v_count = 0, 'violation_count', v_count, 'violations', v_violations);
end;
$$;

create or replace function public.strip_old_user_agents(p_before timestamptz default now() - interval '90 days')
returns int
language plpgsql security definer set search_path = ''
as $$
declare v_stripped int;
begin
  update public.clicks set user_agent = null where created_at < p_before and user_agent is not null;
  get diagnostics v_stripped = row_count;
  return v_stripped;
end;
$$;

create or replace function public.admin_reconciliation_history(p_admin_id uuid, p_limit int default 30)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare result jsonb;
begin
  if not exists (select 1 from public.profiles p where p.id = p_admin_id and p.is_admin) then
    raise exception 'admin_required' using errcode = '42501';
  end if;
  select coalesce(jsonb_agg(to_jsonb(r) order by r.started_at desc), '[]'::jsonb) into result
    from (select * from public.reconciliation_runs order by started_at desc limit greatest(1, least(coalesce(p_limit, 30), 100))) r;
  return result;
end;
$$;

revoke all on function public.run_reconciliation() from public, anon, authenticated;
grant execute on function public.run_reconciliation() to service_role;
revoke all on function public.strip_old_user_agents(timestamptz) from public, anon, authenticated;
grant execute on function public.strip_old_user_agents(timestamptz) to service_role;
revoke all on function public.admin_reconciliation_history(uuid, int) from public, anon, authenticated;
grant execute on function public.admin_reconciliation_history(uuid, int) to service_role;
