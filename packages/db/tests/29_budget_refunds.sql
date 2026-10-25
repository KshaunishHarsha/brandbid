-- P3.9: eligibility, owner-only requests, budget-only split, payment-window gate and manual path.
begin;
insert into auth.users (id,email) values
  ('00000000-0000-0000-0000-000000000f91','refund-owner@test.dev'),
  ('00000000-0000-0000-0000-000000000f92','refund-member@test.dev');
insert into public.brands (id,slug,name,url,owner_id,status,rate_cents)
values ('00000000-0000-0000-0000-000000000f93','refund-brand','Refund Brand','https://refund.test','00000000-0000-0000-0000-000000000f91','active',10),
       ('00000000-0000-0000-0000-000000000f94','fresh-brand','Fresh Brand','https://fresh.test','00000000-0000-0000-0000-000000000f91','active',10);
insert into public.brand_members (brand_id,user_id,role) values
  ('00000000-0000-0000-0000-000000000f93','00000000-0000-0000-0000-000000000f91','owner'),
  ('00000000-0000-0000-0000-000000000f93','00000000-0000-0000-0000-000000000f92','member'),
  ('00000000-0000-0000-0000-000000000f94','00000000-0000-0000-0000-000000000f91','owner');
insert into public.settings(key,value) values ('refund_window_days','90') on conflict(key) do update set value=excluded.value;
select public.record_bid('00000000-0000-0000-0000-000000000f93','00000000-0000-0000-0000-000000000f91',10000,'razorpay','refund-a');
select public.record_bid('00000000-0000-0000-0000-000000000f93','00000000-0000-0000-0000-000000000f91',10000,'razorpay','refund-b');
select public.record_bid('00000000-0000-0000-0000-000000000f94','00000000-0000-0000-0000-000000000f91',10000,'razorpay','fresh-bid');
update public.brands set last_spend_at=now()-interval '31 days',ads_enabled=true where id='00000000-0000-0000-0000-000000000f93';
update public.bids set created_at=now()-interval '120 days' where processor_payment_id='refund-a';
update public.brands set last_spend_at=now(),ads_enabled=true where id='00000000-0000-0000-0000-000000000f94';

do $$
declare e jsonb; r jsonb; rid uuid;
begin
  e := public.budget_refund_eligibility('00000000-0000-0000-0000-000000000f93','00000000-0000-0000-0000-000000000f91');
  assert (e->>'eligible')::boolean and (e->>'amount_cents')::bigint=10000, 'stagnant remaining ad budget is eligible';
  e := public.budget_refund_eligibility('00000000-0000-0000-0000-000000000f94','00000000-0000-0000-0000-000000000f91');
  assert not (e->>'eligible')::boolean and e->>'reason'='budget_not_stagnant', 'recent activity prevents a refund';
  begin
    perform public.refund_budget('00000000-0000-0000-0000-000000000f93','00000000-0000-0000-0000-000000000f92');
    raise exception 'member requested refund';
  exception when insufficient_privilege then null;
  end;
  r := public.refund_budget('00000000-0000-0000-0000-000000000f93','00000000-0000-0000-0000-000000000f91');
  rid := (r->>'refund_id')::uuid;
  assert (r->>'amount_cents')::bigint=10000 and (r->>'processor_cents')::bigint=5000 and (r->>'manual_cents')::bigint=5000, 'in-window budget is queued and old payments require manual handling';
  assert (select count(*) from public.budget_refund_items where refund_id=rid)=2, 'refund is split across the newest bids';
  assert (select sum(amount_cents) from public.budget_refund_items where refund_id=rid)=10000, 'allocation sums to refundable budget';
  assert (select status from public.budget_refunds where id=rid)='processing', 'refund has both processor and manual items';
  assert (select budget_cents from public.brands where id='00000000-0000-0000-0000-000000000f93')=0, 'budget cache is reduced atomically';
  assert not (select ads_enabled from public.brands where id='00000000-0000-0000-0000-000000000f93'), 'ads are disabled while refund is pending';
  assert (select total_paid_cents from public.brands where id='00000000-0000-0000-0000-000000000f93')=20000, 'rank total is unchanged';
  assert (select delta_cents from public.budget_ledger where refund_id=rid)=-10000, 'full unspent budget is reserved in the ledger';
  assert exists(select 1 from public.audit_log where action='budget_refund_requested' and subject_id='00000000-0000-0000-0000-000000000f93');
  update public.profiles set is_admin=true where id='00000000-0000-0000-0000-000000000f91';
  assert jsonb_array_length(public.admin_budget_refunds('00000000-0000-0000-0000-000000000f91',10))=1, 'admin queue includes manual child items in a mixed refund';
  perform public.admin_complete_budget_refund_item('00000000-0000-0000-0000-000000000f91',
    (select id from public.budget_refund_items where refund_id=rid and status='manual'), 'manual-refund-reference');
  assert (select budget_refunded_cents from public.bids where processor_payment_id='refund-a')=5000, 'admin completion books the externally verified manual amount against the bid cap';
  assert (select status from public.budget_refunds where id=rid)='processing', 'manual completion leaves queued processor item in progress';
  assert not has_function_privilege('authenticated','public.refund_budget(uuid,uuid)','EXECUTE');
  assert has_function_privilege('service_role','public.refund_budget(uuid,uuid)','EXECUTE');
end $$;
rollback;
select 'ok: 29_budget_refunds' as result;
