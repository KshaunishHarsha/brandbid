-- P3.2: settle completed earnings cycles and expire old waitlist entries.
create or replace function public.settle_due_earnings()
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  grp record;
  v_now timestamptz := now();
  v_waitlist_days int;
  v_assessment jsonb;
  v_available int := 0;
  v_flagged int := 0;
  v_total_available int := 0;
  v_total_flagged int := 0;
  v_expired int := 0;
  v_earnings_count int;
  v_earnings_cents bigint;
  v_lock_key bigint;
begin
  select coalesce((s.value #>> '{}')::int, 30) into v_waitlist_days
    from public.settings s where s.key = 'waitlist_days';
  v_waitlist_days := coalesce(v_waitlist_days, 30);

  for grp in
    select distinct e.link_id, e.cycle_ends_at
      from public.earnings e
     where e.status = 'pending' and e.cycle_ends_at <= v_now
     order by e.cycle_ends_at, e.link_id
  loop
    v_lock_key := hashtextextended(grp.link_id::text || ':' || grp.cycle_ends_at::text, 0);
    if not pg_try_advisory_xact_lock(v_lock_key) then continue; end if;

    -- Lock the whole group with SKIP LOCKED; competing workers use the same group lock above.
    perform e.id from public.earnings e
     where e.link_id = grp.link_id and e.cycle_ends_at = grp.cycle_ends_at and e.status = 'pending'
     for update skip locked;
    if not found then continue; end if;

    v_assessment := public.assess_fraud_group(grp.link_id, grp.cycle_ends_at);

    with changed as (
      update public.earnings e
         set status = case when exists (
               select 1 from public.fraud_flags f where f.subject_type = 'earning' and f.subject_id = e.id and f.status = 'open'
             ) then 'flagged' else 'available' end,
             settled_at = case when exists (
               select 1 from public.fraud_flags f where f.subject_type = 'earning' and f.subject_id = e.id and f.status = 'open'
             ) then null else v_now end
       where e.link_id = grp.link_id and e.cycle_ends_at = grp.cycle_ends_at and e.status = 'pending'
       returning e.id, e.promoter_id, e.amount_cents, e.status
    ), ledger as (
      insert into public.promoter_ledger (promoter_id, delta_cents, reason, earning_id)
      select c.promoter_id, c.amount_cents, 'earning', c.id from changed c where c.status = 'available'
      returning promoter_id, delta_cents
    )
    select count(*) filter (where c.status = 'available'), count(*) filter (where c.status = 'flagged'),
           coalesce((select sum(l.delta_cents) from ledger l), 0), (select count(*) from ledger)
      into v_available, v_flagged, v_earnings_cents, v_earnings_count
      from changed c;
    v_total_available := v_total_available + coalesce(v_available, 0);
    v_total_flagged := v_total_flagged + coalesce(v_flagged, 0);

    if v_available > 0 then
      update public.profiles p set trust_score = least(p.trust_score + 1, 50)
       where p.id = (select l.promoter_id from public.links l where l.id = grp.link_id);

      insert into public.notification_outbox as existing (kind, recipient_user_id, payload, dedupe_key)
      values (
        'earnings_available',
        (select l.promoter_id from public.links l where l.id = grp.link_id),
        jsonb_build_object('amount_cents', v_earnings_cents, 'count', v_earnings_count),
        'earnings_available:' || (select l.promoter_id::text from public.links l where l.id = grp.link_id) || ':' || to_char(v_now at time zone 'UTC', 'YYYY-MM-DD')
      )
      on conflict (dedupe_key) do update
        set payload = jsonb_build_object(
          'amount_cents', coalesce((existing.payload->>'amount_cents')::bigint, 0) + (excluded.payload->>'amount_cents')::bigint,
          'count', coalesce((existing.payload->>'count')::int, 0) + (excluded.payload->>'count')::int
        )
        where existing.sent_at is null;
    end if;
  end loop;

  with expiring as (
    select e.promoter_id, count(*)::int as n, min(e.created_at + make_interval(days => v_waitlist_days)) as expires_at
      from public.earnings e
     where e.status = 'waitlisted'
       and e.created_at + make_interval(days => v_waitlist_days) > v_now
       and e.created_at + make_interval(days => v_waitlist_days) <= v_now + interval '3 days'
     group by e.promoter_id
  )
  insert into public.notification_outbox as existing (kind, recipient_user_id, payload, dedupe_key)
  select 'waitlist_expiring', x.promoter_id, jsonb_build_object('count', x.n, 'expires_at', x.expires_at),
         'waitlist_expiring:' || x.promoter_id::text || ':' || to_char(v_now at time zone 'UTC', 'YYYY-MM-DD')
    from expiring x
  on conflict (dedupe_key) do update
    set payload = excluded.payload
    where existing.sent_at is null;

  with expired as (
    update public.earnings e set status = 'expired'
     where e.status = 'waitlisted' and e.created_at + make_interval(days => v_waitlist_days) <= v_now
    returning e.id
  ) select count(*) into v_expired from expired;

  return jsonb_build_object('available', v_total_available, 'flagged', v_total_flagged, 'expired', coalesce(v_expired, 0));
end;
$$;

revoke all on function public.settle_due_earnings() from public, anon, authenticated;
grant execute on function public.settle_due_earnings() to service_role;
