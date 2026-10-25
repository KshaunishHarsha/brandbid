-- P3.6: promoters reserve their settled ledger balance in one reviewed withdrawal request.
create or replace function public.promoter_dashboard(p_promoter_id uuid)
returns jsonb
language sql stable security invoker set search_path = ''
as $$
  with config as (
    select coalesce((select (s.value #>> '{}')::int from public.settings s where s.key = 'waitlist_days'), 30) as waitlist_days,
      greatest(1000, coalesce((select (s.value #>> '{}')::bigint from public.settings s where s.key = 'min_withdrawal_cents'), 1000)) as min_withdrawal_cents
  ),
  link_stats as (
    select
      l.id as link_id,l.code as link_code,l.channel,l.status as link_status,l.created_at as link_created_at,
      b.id as brand_id,b.name as brand_name,b.slug::text as brand_slug,b.status as brand_status,b.ads_enabled,
      b.budget_cents as brand_budget_cents,b.rate_cents as brand_rate_cents,
      (select count(*) from public.clicks c where c.link_id=l.id and c.ignored_reason is null) as clicks,
      (select count(*) from public.visitors v where v.claim_link_id=l.id and v.qualified_at is not null) as qualified_visitors,
      (select coalesce(sum(e.amount_cents),0) from public.earnings e where e.link_id=l.id and e.status='pending') as pending_cents,
      (select count(*) from public.earnings e where e.link_id=l.id and e.status='pending') as pending_count,
      (select min(e.cycle_ends_at) from public.earnings e where e.link_id=l.id and e.status='pending') as next_settlement_at,
      (select coalesce(sum(e.amount_cents),0) from public.earnings e where e.link_id=l.id and e.status='waitlisted') as waitlisted_cents,
      (select coalesce(jsonb_agg(jsonb_build_object('amount_cents',e.amount_cents,'created_at',e.created_at,
        'expires_at',e.created_at+make_interval(days=>cfg.waitlist_days)) order by e.created_at,e.id),'[]'::jsonb)
        from public.earnings e where e.link_id=l.id and e.status='waitlisted') as waitlisted_earnings,
      public.cycle_end(l.created_at,now()) as current_cycle_ends_at
    from public.links l join public.brands b on b.id=l.brand_id cross join config cfg
    where l.promoter_id=p_promoter_id
  ),
  totals as (
    select coalesce(sum(e.amount_cents) filter(where e.status='pending'),0) as pending_cents,
      coalesce(sum(e.amount_cents) filter(where e.status='waitlisted'),0) as waitlisted_cents
    from public.earnings e where e.promoter_id=p_promoter_id
  ),
  wallet as (
    select coalesce(sum(pl.delta_cents),0)::bigint as balance_cents,
      p.phone_verified_at is not null as phone_verified,
      p.kyc_status,
      coalesce((select pa.verified from public.payout_accounts pa where pa.promoter_id=p.id),false) as payout_account_verified,
      p.status='active' as account_active,
      exists(select 1 from public.withdrawals w where w.promoter_id=p.id and w.status in ('requested','review','held','processing')) as withdrawal_open,
      cfg.min_withdrawal_cents
    from public.profiles p cross join config cfg left join public.promoter_ledger pl on pl.promoter_id=p.id
    where p.id=p_promoter_id group by p.id,p.phone_verified_at,p.kyc_status,p.status,cfg.min_withdrawal_cents
  )
  select jsonb_build_object(
    'links',coalesce((select jsonb_agg(to_jsonb(s) order by s.brand_name,s.channel) from link_stats s),'[]'::jsonb),
    'totals',(select to_jsonb(t) from totals t),
    'wallet',(select to_jsonb(w) || jsonb_build_object('withdrawals',coalesce((
      select jsonb_agg(jsonb_build_object('id',h.id,'amount_cents',h.amount_cents,'fee_cents',h.fee_cents,
        'provider',h.provider,'status',h.status,'created_at',h.created_at,'paid_at',h.paid_at)
        order by h.created_at desc) from (select * from public.withdrawals where promoter_id=p_promoter_id order by created_at desc limit 10) h
    ),'[]'::jsonb)) from wallet w)
  );
$$;

create or replace function public.request_withdrawal(p_promoter_id uuid)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  p public.profiles%rowtype;
  account public.payout_accounts%rowtype;
  v_balance bigint;
  v_minimum bigint;
  v_status text;
  v_withdrawal_id uuid;
begin
  if p_promoter_id is null then raise exception 'promoter_not_found'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_promoter_id::text,3));
  select * into p from public.profiles where id=p_promoter_id for update;
  if not found or p.status<>'active' then raise exception 'promoter_not_active'; end if;
  if p.phone_verified_at is null then raise exception 'phone_verification_required'; end if;
  if p.kyc_status<>'verified' then raise exception 'kyc_not_verified'; end if;
  select * into account from public.payout_accounts where promoter_id=p_promoter_id and verified for update;
  if not found then raise exception 'payout_account_required'; end if;
  if exists(select 1 from public.withdrawals where promoter_id=p_promoter_id and status in ('requested','review','held','processing')) then
    raise exception 'withdrawal_open';
  end if;
  select greatest(1000,coalesce((s.value #>> '{}')::bigint,1000)) into v_minimum
    from public.settings s where s.key='min_withdrawal_cents';
  v_minimum:=greatest(1000,coalesce(v_minimum,1000));
  select coalesce(sum(delta_cents),0)::bigint into v_balance from public.promoter_ledger where promoter_id=p_promoter_id;
  if v_balance<0 then raise exception 'withdrawal_balance_negative'; end if;
  if v_balance<v_minimum then raise exception 'withdrawal_below_minimum'; end if;
  v_status:=case when not exists(select 1 from public.withdrawals where promoter_id=p_promoter_id) or p.trust_score<0
    then 'review' else 'processing' end;
  insert into public.withdrawals(promoter_id,amount_cents,provider,status)
    values(p_promoter_id,v_balance,account.provider,v_status) returning id into v_withdrawal_id;
  insert into public.promoter_ledger(promoter_id,delta_cents,reason,withdrawal_id,note)
    values(p_promoter_id,-v_balance,'withdrawal',v_withdrawal_id,'Withdrawal request reserved');
  return jsonb_build_object('withdrawal_id',v_withdrawal_id,'amount_cents',v_balance,'status',v_status);
end;
$$;

revoke all on function public.request_withdrawal(uuid) from public,anon,authenticated;
grant execute on function public.request_withdrawal(uuid) to service_role;
