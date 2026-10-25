-- P3.8: admin-only fraud queue and atomic clear/confirm outcomes.
create or replace function public.admin_fraud_queue(p_admin_id uuid)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  result jsonb;
begin
  if not exists (select 1 from public.profiles p where p.id = p_admin_id and p.is_admin) then
    raise exception 'admin_required' using errcode = '42501';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'flag_id', f.id,
    'subject_type', f.subject_type,
    'subject_id', f.subject_id,
    'rule', f.rule,
    'score', f.score,
    'details', f.details,
    'created_at', f.created_at,
    'earning', case when e.id is null then null else jsonb_build_object(
      'id', e.id, 'status', e.status, 'amount_cents', e.amount_cents, 'cycle_ends_at', e.cycle_ends_at,
      'promoter_id', e.promoter_id, 'promoter_email', pu.email,
      'brand_id', e.brand_id, 'brand_name', b.name, 'brand_slug', b.slug,
      'link_id', e.link_id, 'link_code', l.code, 'channel', l.channel,
      'visitor_id', v.id, 'qualified_at', v.qualified_at, 'country', c.country,
      'active_ms', v.qualified_active_ms, 'interactions', v.qualified_interactions,
      'click_id', c.id, 'clicked_at', c.created_at, 'outbound_at', c.outbound_at, 'ignored_reason', c.ignored_reason
    ) end
  ) order by f.created_at, f.id), '[]'::jsonb)
    into result
    from public.fraud_flags f
    left join public.earnings e on f.subject_type = 'earning' and e.id = f.subject_id
    left join public.profiles p on p.id = coalesce(e.promoter_id, case when f.subject_type = 'promoter' then f.subject_id end)
    left join auth.users pu on pu.id = p.id
    left join public.brands b on b.id = e.brand_id
    left join public.links l on l.id = e.link_id
    left join public.visitors v on v.id = e.visitor_id
    left join public.clicks c on c.id = e.click_id
   where f.status = 'open';
  return result;
end;
$$;

create or replace function public.review_fraud_flag(p_flag_id uuid, p_decision text, p_reason text, p_admin_id uuid)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  f public.fraud_flags%rowtype;
  v_reason text := left(trim(coalesce(p_reason, '')), 500);
  v_reversal jsonb;
  v_promoter uuid;
begin
  if not exists (select 1 from public.profiles p where p.id = p_admin_id and p.is_admin) then
    raise exception 'admin_required' using errcode = '42501';
  end if;
  if p_decision not in ('clear', 'confirm') then raise exception 'invalid_fraud_decision'; end if;
  if p_decision = 'confirm' and length(v_reason) < 3 then raise exception 'reason_required'; end if;

  -- Lock the earning before its flag so simultaneous reviews of multiple rules cannot deadlock.
  select ff.subject_type, ff.subject_id into f.subject_type, f.subject_id from public.fraud_flags ff where ff.id = p_flag_id;
  if not found then raise exception 'fraud_flag_not_found'; end if;
  if f.subject_type = 'earning' then
    perform e.id from public.earnings e where e.id = f.subject_id for update;
    if not found then raise exception 'earning_not_found'; end if;
  end if;
  select * into f from public.fraud_flags ff where ff.id = p_flag_id for update;
  if f.status <> 'open' then return jsonb_build_object('changed', false, 'status', f.status); end if;

  if p_decision = 'confirm' then
    if f.subject_type <> 'earning' then raise exception 'subject_not_reviewable'; end if;
    v_reversal := public.reverse_earning(f.subject_id, v_reason, p_admin_id);
    return v_reversal || jsonb_build_object('decision', 'confirm');
  end if;

  update public.fraud_flags set status = 'cleared', reviewed_by = p_admin_id, reviewed_at = now() where id = f.id;
  if f.subject_type = 'earning' then
    select e.promoter_id into v_promoter from public.earnings e where e.id = f.subject_id;
    if not exists (select 1 from public.fraud_flags open_flag where open_flag.subject_type = 'earning' and open_flag.subject_id = f.subject_id and open_flag.status = 'open') then
      update public.earnings set status = 'available', settled_at = coalesce(settled_at, now())
       where id = f.subject_id and status = 'flagged';
      if found and not exists (select 1 from public.promoter_ledger pl where pl.earning_id = f.subject_id and pl.reason = 'earning') then
        insert into public.promoter_ledger (promoter_id, delta_cents, reason, earning_id)
          select e.promoter_id, e.amount_cents, 'earning', e.id from public.earnings e where e.id = f.subject_id;
        update public.profiles set trust_score = least(trust_score + 1, 50) where id = v_promoter;
      end if;
    end if;
  end if;
  insert into public.audit_log (actor_id, action, subject_type, subject_id, details)
    values (p_admin_id, 'fraud_flag_cleared', f.subject_type, f.subject_id,
      jsonb_build_object('flag_id', f.id, 'rule', f.rule, 'reason', v_reason));
  return jsonb_build_object('changed', true, 'decision', 'clear', 'status', 'cleared');
end;
$$;

revoke all on function public.admin_fraud_queue(uuid) from public, anon, authenticated;
grant execute on function public.admin_fraud_queue(uuid) to service_role;
revoke all on function public.review_fraud_flag(uuid, text, text, uuid) from public, anon, authenticated;
grant execute on function public.review_fraud_flag(uuid, text, text, uuid) to service_role;
