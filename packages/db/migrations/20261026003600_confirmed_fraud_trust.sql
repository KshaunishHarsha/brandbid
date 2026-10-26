-- P3.3: apply the documented trust penalty exactly once when an earning's open fraud flags are confirmed.
create or replace function public.reverse_earning(p_earning_id uuid, p_reason text, p_admin_id uuid)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  e public.earnings%rowtype;
  v_reason text := left(trim(coalesce(p_reason, '')), 500);
  v_has_credit boolean;
  v_budget_debits int;
  v_funded int := 0;
  v_flag_penalty int;
  v_self_promo_penalty int;
  v_suspend_below int;
  v_trust_delta int := 0;
  v_trust_score int;
begin
  if not exists (select 1 from public.profiles p where p.id = p_admin_id and p.is_admin) then
    raise exception 'admin_required' using errcode = '42501';
  end if;
  if length(v_reason) < 3 then raise exception 'reason_required'; end if;

  select * into e from public.earnings where id = p_earning_id for update;
  if not found then raise exception 'earning_not_found'; end if;
  if e.status = 'reversed' then return jsonb_build_object('changed', false, 'funded_waitlist', 0); end if;
  if e.status = 'expired' then raise exception 'earning_not_reversible'; end if;
  perform 1 from public.brands where id = e.brand_id for update;
  if not found then raise exception 'brand_not_found'; end if;

  if e.status <> 'waitlisted' then
    select count(*) into v_budget_debits from public.budget_ledger bl
     where bl.earning_id = e.id and bl.reason = 'visitor' and bl.delta_cents = -e.amount_cents;
    if v_budget_debits <> 1 then raise exception 'earning_budget_ledger_inconsistent'; end if;
  end if;
  select exists (select 1 from public.promoter_ledger pl where pl.earning_id = e.id and pl.reason = 'earning') into v_has_credit;
  if e.status = 'available' and not v_has_credit then raise exception 'earning_ledger_missing'; end if;

  if e.status <> 'waitlisted' then
    update public.brands set budget_cents = budget_cents + e.amount_cents where id = e.brand_id;
    insert into public.budget_ledger (brand_id, delta_cents, reason, earning_id)
      values (e.brand_id, e.amount_cents, 'reversal', e.id);
  end if;
  if v_has_credit then
    insert into public.promoter_ledger (promoter_id, delta_cents, reason, earning_id, note)
      values (e.promoter_id, -e.amount_cents, 'clawback', e.id, v_reason);
  end if;

  -- Read configured penalties before closing the flags; only flags transitioned by this
  -- reversal affect trust, so retries and already-confirmed flags cannot debit trust twice.
  select coalesce((s.value #>> '{trust,confirmed_flag}')::int, -10),
         coalesce((s.value #>> '{trust,confirmed_self_promo}')::int, -50),
         coalesce((s.value #>> '{trust,suspend_below}')::int, -30)
    into v_flag_penalty, v_self_promo_penalty, v_suspend_below
    from public.settings s where s.key = 'fraud_thresholds';
  v_flag_penalty := coalesce(v_flag_penalty, -10);
  v_self_promo_penalty := coalesce(v_self_promo_penalty, -50);
  v_suspend_below := coalesce(v_suspend_below, -30);

  select coalesce(sum(case when ff.rule = 'R9' then v_self_promo_penalty else v_flag_penalty end), 0)::int
    into v_trust_delta
    from public.fraud_flags ff
   where ff.subject_type = 'earning' and ff.subject_id = e.id and ff.status = 'open';

  update public.earnings set status = 'reversed' where id = e.id;
  update public.fraud_flags set status = 'confirmed', reviewed_by = p_admin_id, reviewed_at = now()
   where subject_type = 'earning' and subject_id = e.id and status = 'open';

  if v_trust_delta <> 0 then
    update public.profiles set trust_score = trust_score + v_trust_delta
     where id = e.promoter_id returning trust_score into v_trust_score;
    if v_trust_score < v_suspend_below then
      update public.profiles set status = 'suspended'
       where id = e.promoter_id and status = 'active';
      if found then
        update public.links set status = 'disabled' where promoter_id = e.promoter_id and status = 'active';
        insert into public.audit_log (actor_id, action, subject_type, subject_id, details)
          values (p_admin_id, 'promoter_suspended_trust_threshold', 'promoter', e.promoter_id,
            jsonb_build_object('earning_id', e.id, 'trust_delta', v_trust_delta,
              'trust_score', v_trust_score, 'suspend_below', v_suspend_below));
      end if;
    end if;
  end if;

  if e.status <> 'waitlisted' then v_funded := public.fund_waitlist(e.brand_id); end if;

  insert into public.notification_outbox (kind, recipient_user_id, payload, dedupe_key)
    values ('earnings_reversed', e.promoter_id,
      jsonb_build_object('earning_id', e.id, 'amount_cents', e.amount_cents, 'reason_category', v_reason),
      'earnings_reversed:' || e.id::text)
    on conflict (dedupe_key) do nothing;
  insert into public.audit_log (actor_id, action, subject_type, subject_id, details)
    values (p_admin_id, 'earning_reversed', 'earning', e.id,
      jsonb_build_object('reason', v_reason, 'amount_cents', e.amount_cents, 'was_waitlisted', e.status = 'waitlisted', 'funded_waitlist', v_funded,
        'trust_delta', v_trust_delta));

  return jsonb_build_object('changed', true, 'amount_cents', e.amount_cents, 'funded_waitlist', v_funded,
    'trust_delta', v_trust_delta, 'trust_score', v_trust_score);
end;
$$;

revoke all on function public.reverse_earning(uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.reverse_earning(uuid, text, uuid) to service_role;
