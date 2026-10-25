-- P2.11: aggregate a promoter's dashboard without granting the browser access to clicks or visitors.
create index visitors_claim_link_qualified_idx on public.visitors (claim_link_id, qualified_at) where claim_link_id is not null;

create or replace function public.promoter_dashboard(p_promoter_id uuid)
returns jsonb
language sql stable security invoker set search_path = ''
as $$
  with config as (
    select
      coalesce((select (s.value #>> '{}')::int from public.settings s where s.key = 'waitlist_days'), 30) as waitlist_days
  ),
  link_stats as (
    select
      l.id as link_id,
      l.code as link_code,
      l.channel,
      l.status as link_status,
      l.created_at as link_created_at,
      b.id as brand_id,
      b.name as brand_name,
      b.slug::text as brand_slug,
      b.status as brand_status,
      b.ads_enabled,
      b.budget_cents as brand_budget_cents,
      b.rate_cents as brand_rate_cents,
      (select count(*) from public.clicks c where c.link_id = l.id and c.ignored_reason is null) as clicks,
      (select count(*) from public.visitors v where v.claim_link_id = l.id and v.qualified_at is not null) as qualified_visitors,
      (select coalesce(sum(e.amount_cents), 0) from public.earnings e where e.link_id = l.id and e.status = 'pending') as pending_cents,
      (select count(*) from public.earnings e where e.link_id = l.id and e.status = 'pending') as pending_count,
      (select min(e.cycle_ends_at) from public.earnings e where e.link_id = l.id and e.status = 'pending') as next_settlement_at,
      (select coalesce(sum(e.amount_cents), 0) from public.earnings e where e.link_id = l.id and e.status = 'waitlisted') as waitlisted_cents,
      (select coalesce(jsonb_agg(jsonb_build_object(
        'amount_cents', e.amount_cents,
        'created_at', e.created_at,
        'expires_at', e.created_at + make_interval(days => cfg.waitlist_days)
      ) order by e.created_at, e.id), '[]'::jsonb)
        from public.earnings e where e.link_id = l.id and e.status = 'waitlisted') as waitlisted_earnings,
      public.cycle_end(l.created_at, now()) as current_cycle_ends_at
    from public.links l
    join public.brands b on b.id = l.brand_id
    cross join config cfg
    where l.promoter_id = p_promoter_id
  ),
  totals as (
    select
      coalesce(sum(e.amount_cents) filter (where e.status = 'pending'), 0) as pending_cents,
      coalesce(sum(e.amount_cents) filter (where e.status = 'waitlisted'), 0) as waitlisted_cents
    from public.earnings e
    where e.promoter_id = p_promoter_id
  )
  select jsonb_build_object(
    'links', coalesce((select jsonb_agg(to_jsonb(s) order by s.brand_name, s.channel) from link_stats s), '[]'::jsonb),
    'totals', (select to_jsonb(t) from totals t)
  );
$$;

revoke all on function public.promoter_dashboard(uuid) from public, anon, authenticated;
grant execute on function public.promoter_dashboard(uuid) to service_role;
