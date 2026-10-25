-- P3.9: reserve only the unspent ad budget and allocate it across bids without refunding revenue.
alter table public.budget_refunds drop constraint budget_refunds_status_check;
alter table public.budget_refunds add constraint budget_refunds_status_check
  check (status in ('requested', 'processing', 'manual', 'done', 'failed'));

create table public.budget_refund_items (
  id uuid primary key default gen_random_uuid(),
  refund_id uuid not null references public.budget_refunds(id),
  bid_id uuid not null references public.bids(id),
  amount_cents bigint not null check (amount_cents > 0),
  status text not null default 'queued' check (status in ('queued', 'done', 'manual')),
  processor_refund_ref text,
  attempts int not null default 0 check (attempts >= 0),
  retry_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  done_at timestamptz,
  unique (refund_id, bid_id)
);
create index budget_refund_items_due_idx on public.budget_refund_items (retry_at, created_at) where status = 'queued';
alter table public.budget_refund_items enable row level security;
revoke all on public.budget_refund_items from public, anon, authenticated;
grant select on public.budget_refund_items to authenticated;
grant select, insert, update on public.budget_refund_items to service_role;
create policy budget_refund_items_read on public.budget_refund_items for select to authenticated
  using (exists (select 1 from public.budget_refunds r where r.id = refund_id and (public.is_brand_member(r.brand_id) or public.is_admin())));

create or replace function public.budget_refund_eligibility(p_brand_id uuid, p_requester uuid)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  br public.brands%rowtype;
  v_role text;
  v_days int;
  v_stagnant_since timestamptz;
  v_open_refund boolean;
  v_waitlisted int;
  v_reason text;
begin
  select * into br from public.brands where id = p_brand_id;
  if not found then return jsonb_build_object('eligible', false, 'reason', 'brand_not_found'); end if;
  select m.role into v_role from public.brand_members m where m.brand_id = p_brand_id and m.user_id = p_requester;
  if v_role is distinct from 'owner' then raise exception 'brand_owner_required' using errcode = '42501'; end if;
  select coalesce((s.value #>> '{}')::int, 30) into v_days from public.settings s where s.key = 'stagnation_days';
  v_days := coalesce(v_days, 30);
  select coalesce(br.last_spend_at, min(b.created_at)) into v_stagnant_since
    from public.bids b where b.brand_id = p_brand_id and b.status = 'succeeded';
  select exists(select 1 from public.budget_refunds r where r.brand_id = p_brand_id and r.status in ('requested','processing','manual')) into v_open_refund;
  select count(*)::int into v_waitlisted from public.earnings e where e.brand_id = p_brand_id and e.status = 'waitlisted';

  if br.status <> 'active' then v_reason := 'brand_not_active';
  elsif br.budget_cents <= 0 then v_reason := 'no_budget_remaining';
  elsif v_waitlisted > 0 then v_reason := 'waitlist_owed';
  elsif v_open_refund then v_reason := 'refund_already_open';
  elsif v_stagnant_since is null or v_stagnant_since > now() - make_interval(days => v_days) then v_reason := 'budget_not_stagnant';
  end if;
  return jsonb_build_object('eligible', v_reason is null, 'reason', v_reason, 'amount_cents', br.budget_cents,
    'stagnant_since', v_stagnant_since, 'stagnation_days', v_days, 'waitlisted_count', v_waitlisted);
end;
$$;

create or replace function public.refund_budget(p_brand_id uuid, p_requester uuid)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  br public.brands%rowtype;
  eligibility jsonb;
  v_refund_id uuid;
  v_remaining bigint;
  v_window_days int;
  v_reserved bigint;
  b record;
  v_allocation bigint;
  v_manual bigint := 0;
  v_queued bigint := 0;
  v_status text;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_brand_id::text, 3901));
  select * into br from public.brands where id = p_brand_id for update;
  if not found then raise exception 'brand_not_found'; end if;
  eligibility := public.budget_refund_eligibility(p_brand_id, p_requester);
  if not (eligibility->>'eligible')::boolean then raise exception '%', eligibility->>'reason'; end if;

  -- Settle matured cycles before deciding how much unspent budget is refundable.
  perform public.settle_due_earnings();
  select * into br from public.brands where id = p_brand_id for update;
  v_remaining := br.budget_cents;
  select (s.value #>> '{}')::int into v_window_days from public.settings s where s.key = 'refund_window_days';
  insert into public.budget_refunds (brand_id, amount_cents, requested_by, status)
    values (p_brand_id, v_remaining, p_requester, 'requested') returning id into v_refund_id;

  for b in
    select bid.id, bid.created_at, bid.budget_cents, bid.budget_refunded_cents,
      coalesce((select sum(i.amount_cents) from public.budget_refund_items i join public.budget_refunds r on r.id=i.refund_id
        where i.bid_id=bid.id and i.status in ('queued','manual') and r.status in ('requested','processing','manual')),0) as reserved
    from public.bids bid where bid.brand_id=p_brand_id and bid.status='succeeded'
    order by bid.created_at desc, bid.id desc for update
  loop
    exit when v_remaining = 0;
    v_reserved := b.reserved;
    v_allocation := least(v_remaining, greatest(0, b.budget_cents - b.budget_refunded_cents - v_reserved));
    if v_allocation <= 0 then continue; end if;
    insert into public.budget_refund_items (refund_id, bid_id, amount_cents, status)
      values (v_refund_id, b.id, v_allocation,
        case when v_window_days is not null and b.created_at > now() - make_interval(days => v_window_days) then 'queued' else 'manual' end);
    if v_window_days is not null and b.created_at > now() - make_interval(days => v_window_days) then v_queued := v_queued + v_allocation;
    else v_manual := v_manual + v_allocation; end if;
    v_remaining := v_remaining - v_allocation;
  end loop;
  if v_remaining > 0 then raise exception 'refund_budget_allocation_failed'; end if;

  v_status := case when v_queued > 0 and v_manual > 0 then 'processing' when v_queued > 0 then 'requested' when v_manual > 0 then 'manual' else 'failed' end;
  update public.budget_refunds set status = v_status where id = v_refund_id;
  update public.brands set budget_cents = 0, ads_enabled = false where id = p_brand_id;
  insert into public.budget_ledger (brand_id, delta_cents, reason, refund_id)
    values (p_brand_id, -br.budget_cents, 'refund', v_refund_id);
  insert into public.audit_log (actor_id, action, subject_type, subject_id, details)
    values (p_requester, 'budget_refund_requested', 'brand', p_brand_id,
      jsonb_build_object('refund_id', v_refund_id, 'amount_cents', br.budget_cents, 'processor_cents', v_queued, 'manual_cents', v_manual));
  return jsonb_build_object('refund_id', v_refund_id, 'status', v_status, 'amount_cents', br.budget_cents,
    'processor_cents', v_queued, 'manual_cents', v_manual);
end;
$$;

create or replace function public.admin_complete_budget_refund_item(p_admin_id uuid, p_item_id uuid, p_reference text)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare i public.budget_refund_items%rowtype; r public.budget_refunds%rowtype; b public.bids%rowtype;
begin
  if not exists (select 1 from public.profiles where id=p_admin_id and is_admin) then raise exception 'admin_required' using errcode='42501'; end if;
  if length(trim(coalesce(p_reference,''))) < 3 then raise exception 'refund_reference_required'; end if;
  select * into i from public.budget_refund_items where id=p_item_id for update;
  if not found then raise exception 'refund_item_not_found'; end if;
  if i.status='done' then return jsonb_build_object('changed',false,'status','done'); end if;
  if i.status <> 'manual' then raise exception 'refund_item_not_manual'; end if;
  select * into r from public.budget_refunds where id=i.refund_id for update;
  select * into b from public.bids where id=i.bid_id for update;
  if b.budget_refunded_cents + i.amount_cents > b.budget_cents then raise exception 'refund_budget_allocation_failed'; end if;
  update public.bids set budget_refunded_cents=budget_refunded_cents+i.amount_cents where id=b.id;
  update public.budget_refund_items set status='done',processor_refund_ref=trim(p_reference),done_at=now(),last_error=null where id=i.id;
  update public.budget_refunds set status=case when exists(select 1 from public.budget_refund_items where refund_id=r.id and status='queued') then 'processing'
    when exists(select 1 from public.budget_refund_items where refund_id=r.id and status='manual') then 'manual' else 'done' end,
    processor_refund_ref=case when not exists(select 1 from public.budget_refund_items where refund_id=r.id and id<>i.id and status<>'done') then trim(p_reference) else processor_refund_ref end,
    done_at=case when not exists(select 1 from public.budget_refund_items where refund_id=r.id and id<>i.id and status<>'done') then now() else done_at end where id=r.id;
  insert into public.audit_log(actor_id,action,subject_type,subject_id,details)
    values(p_admin_id,'budget_refund_manual_completed','budget_refund_item',i.id,jsonb_build_object('refund_id',r.id,'bid_id',b.id,'amount_cents',i.amount_cents,'reference',trim(p_reference)));
  return jsonb_build_object('changed',true,'status','done');
end;
$$;

create or replace function public.admin_budget_refunds(p_admin_id uuid, p_limit int default 100)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare result jsonb;
begin
  if not exists (select 1 from public.profiles where id=p_admin_id and is_admin) then raise exception 'admin_required' using errcode='42501'; end if;
  select coalesce(jsonb_agg(x.row_data order by x.created_at desc),'[]'::jsonb) into result from (
    select i.created_at,jsonb_build_object('item_id',i.id,'refund_id',r.id,'brand_id',b.id,'brand_name',b.name,'brand_slug',b.slug,
      'payment_id',bid.processor_payment_id,'amount_cents',i.amount_cents,'attempts',i.attempts,'last_error',i.last_error,
      'requested_at',r.created_at,'refund_status',r.status) as row_data
      from public.budget_refund_items i join public.budget_refunds r on r.id=i.refund_id
      join public.brands b on b.id=r.brand_id join public.bids bid on bid.id=i.bid_id
     where i.status='manual' and r.status in ('manual','processing') order by i.created_at desc limit greatest(1,least(coalesce(p_limit,100),500))
  ) x;
  return result;
end;
$$;

revoke all on function public.budget_refund_eligibility(uuid,uuid) from public, anon, authenticated;
grant execute on function public.budget_refund_eligibility(uuid,uuid) to service_role;
revoke all on function public.refund_budget(uuid,uuid) from public, anon, authenticated;
grant execute on function public.refund_budget(uuid,uuid) to service_role;
revoke all on function public.admin_complete_budget_refund_item(uuid,uuid,text) from public, anon, authenticated;
grant execute on function public.admin_complete_budget_refund_item(uuid,uuid,text) to service_role;
revoke all on function public.admin_budget_refunds(uuid,int) from public, anon, authenticated;
grant execute on function public.admin_budget_refunds(uuid,int) to service_role;
