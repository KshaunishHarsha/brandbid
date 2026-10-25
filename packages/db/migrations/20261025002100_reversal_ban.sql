-- P3.7: reverse fraudulent earnings and ban promoters without bypassing the ledgers.
alter table public.earnings drop constraint earnings_check;
alter table public.earnings add constraint earnings_check
  check (status in ('waitlisted', 'expired', 'reversed') or (cycle_ends_at is not null and funded_at is not null));

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

  update public.earnings set status = 'reversed' where id = e.id;
  update public.fraud_flags set status = 'confirmed', reviewed_by = p_admin_id, reviewed_at = now()
   where subject_type = 'earning' and subject_id = e.id and status = 'open';

  if e.status <> 'waitlisted' then v_funded := public.fund_waitlist(e.brand_id); end if;

  insert into public.notification_outbox (kind, recipient_user_id, payload, dedupe_key)
    values ('earnings_reversed', e.promoter_id,
      jsonb_build_object('earning_id', e.id, 'amount_cents', e.amount_cents, 'reason_category', v_reason),
      'earnings_reversed:' || e.id::text)
    on conflict (dedupe_key) do nothing;
  insert into public.audit_log (actor_id, action, subject_type, subject_id, details)
    values (p_admin_id, 'earning_reversed', 'earning', e.id,
      jsonb_build_object('reason', v_reason, 'amount_cents', e.amount_cents, 'was_waitlisted', e.status = 'waitlisted', 'funded_waitlist', v_funded));

  return jsonb_build_object('changed', true, 'amount_cents', e.amount_cents, 'funded_waitlist', v_funded);
end;
$$;

create or replace function public.ban_promoter(p_promoter_id uuid, p_reason text, p_admin_id uuid)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_status text;
  v_balance bigint;
  v_forfeit bigint := 0;
  v_reason text := left(trim(coalesce(p_reason, '')), 500);
begin
  if not exists (select 1 from public.profiles p where p.id = p_admin_id and p.is_admin) then
    raise exception 'admin_required' using errcode = '42501';
  end if;
  if length(v_reason) < 3 then raise exception 'reason_required'; end if;

  select p.status into v_status from public.profiles p where p.id = p_promoter_id for update;
  if not found then raise exception 'promoter_not_found'; end if;
  select coalesce(sum(pl.delta_cents), 0) into v_balance from public.promoter_ledger pl where pl.promoter_id = p_promoter_id;
  update public.profiles set status = 'banned' where id = p_promoter_id;
  update public.links set status = 'disabled' where promoter_id = p_promoter_id and status <> 'disabled';

  if v_balance > 0 then
    v_forfeit := v_balance;
    insert into public.promoter_ledger (promoter_id, delta_cents, reason, note)
      values (p_promoter_id, -v_forfeit, 'forfeit', v_reason);
  end if;
  if v_status <> 'banned' or v_forfeit > 0 then
    insert into public.audit_log (actor_id, action, subject_type, subject_id, details)
      values (p_admin_id, 'promoter_banned', 'promoter', p_promoter_id,
        jsonb_build_object('reason', v_reason, 'forfeited_cents', v_forfeit));
  end if;
  return jsonb_build_object('changed', v_status <> 'banned', 'forfeited_cents', v_forfeit);
end;
$$;

revoke all on function public.reverse_earning(uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.reverse_earning(uuid, text, uuid) to service_role;
revoke all on function public.ban_promoter(uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.ban_promoter(uuid, text, uuid) to service_role;
