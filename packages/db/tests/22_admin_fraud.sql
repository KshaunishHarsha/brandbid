-- P3.8: admin queue context, clear-all release, and confirm-to-reversal action.
begin;
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000000e81', 'review-promoter@somewhere.test'),
  ('00000000-0000-0000-0000-000000000e82', 'review-owner@somewhere.test'),
  ('00000000-0000-0000-0000-000000000e83', 'review-admin@somewhere.test');
update public.profiles set is_admin = true, country = 'IN' where id = '00000000-0000-0000-0000-000000000e83';
insert into public.brands (id, slug, name, url, owner_id, status, rate_cents, budget_cents)
values ('00000000-0000-0000-0000-000000000e84', 'admin-fraud-brand', 'Admin Fraud Brand', 'https://admin-fraud.example.test', '00000000-0000-0000-0000-000000000e82', 'active', 10, 0);
insert into public.links (id, code, promoter_id, brand_id, channel) values
  ('00000000-0000-0000-0000-000000000e85', 'AdminF01', '00000000-0000-0000-0000-000000000e81', '00000000-0000-0000-0000-000000000e84', 'link'),
  ('00000000-0000-0000-0000-000000000e96', 'AdminF02', '00000000-0000-0000-0000-000000000e81', '00000000-0000-0000-0000-000000000e84', 'x');
insert into public.visitors (id, brand_id, claim_link_id, claim_promoter_id, qualified_at, qualified_ip_hash, qualified_fp_hash, qualified_active_ms)
values
  ('00000000-0000-0000-0000-000000000e86', '00000000-0000-0000-0000-000000000e84', '00000000-0000-0000-0000-000000000e85', '00000000-0000-0000-0000-000000000e81', now() - interval '2 days', 'admin-ip-1', 'admin-fp-1', 12000),
  ('00000000-0000-0000-0000-000000000e97', '00000000-0000-0000-0000-000000000e84', '00000000-0000-0000-0000-000000000e96', '00000000-0000-0000-0000-000000000e81', now(), 'admin-ip-2', 'admin-fp-2', 12000);
insert into public.clicks (id, link_id, brand_id, promoter_id, visitor_id, ip_hash, ua_hash, country)
values
  ('00000000-0000-0000-0000-000000000e87', '00000000-0000-0000-0000-000000000e85', '00000000-0000-0000-0000-000000000e84', '00000000-0000-0000-0000-000000000e81', '00000000-0000-0000-0000-000000000e86', 'admin-ip-1', 'admin-ua-1', 'IN'),
  ('00000000-0000-0000-0000-000000000e98', '00000000-0000-0000-0000-000000000e96', '00000000-0000-0000-0000-000000000e84', '00000000-0000-0000-0000-000000000e81', '00000000-0000-0000-0000-000000000e97', 'admin-ip-2', 'admin-ua-2', 'IN');
insert into public.earnings (id, promoter_id, brand_id, link_id, visitor_id, click_id, amount_cents, cycle_ends_at, funded_at, status, settled_at)
values
  ('00000000-0000-0000-0000-000000000e88', '00000000-0000-0000-0000-000000000e81', '00000000-0000-0000-0000-000000000e84', '00000000-0000-0000-0000-000000000e85', '00000000-0000-0000-0000-000000000e86', '00000000-0000-0000-0000-000000000e87', 100, now() - interval '1 day', now() - interval '2 days', 'flagged', null),
  ('00000000-0000-0000-0000-000000000e99', '00000000-0000-0000-0000-000000000e81', '00000000-0000-0000-0000-000000000e84', '00000000-0000-0000-0000-000000000e96', '00000000-0000-0000-0000-000000000e97', '00000000-0000-0000-0000-000000000e98', 150, now() - interval '1 day', now() - interval '2 days', 'available', now() - interval '1 day');
insert into public.budget_ledger (brand_id, delta_cents, reason, earning_id) values
  ('00000000-0000-0000-0000-000000000e84', 250, 'bid', null),
  ('00000000-0000-0000-0000-000000000e84', -100, 'visitor', '00000000-0000-0000-0000-000000000e88'),
  ('00000000-0000-0000-0000-000000000e84', -150, 'visitor', '00000000-0000-0000-0000-000000000e99');
insert into public.promoter_ledger (promoter_id, delta_cents, reason, earning_id)
values ('00000000-0000-0000-0000-000000000e81', 150, 'earning', '00000000-0000-0000-0000-000000000e99');
insert into public.fraud_flags (id, subject_type, subject_id, rule, score, details) values
  ('00000000-0000-0000-0000-000000000e89', 'earning', '00000000-0000-0000-0000-000000000e88', 'R1', 40, '{"signal":"shared_ip"}'),
  ('00000000-0000-0000-0000-000000000e90', 'earning', '00000000-0000-0000-0000-000000000e88', 'R4', 20, '{"country":"US"}'),
  ('00000000-0000-0000-0000-000000000e9a', 'earning', '00000000-0000-0000-0000-000000000e99', 'R9', 60, '{"signal":"self_promo"}');
update public.brands set budget_cents = 0 where id = '00000000-0000-0000-0000-000000000e84';

do $$
declare queue jsonb; result jsonb;
begin
  queue := public.admin_fraud_queue('00000000-0000-0000-0000-000000000e83');
  assert jsonb_array_length(queue) = 3, 'admin queue returns all open flags';
  assert (queue->0->'earning'->>'amount_cents')::int = 100, 'queue includes earning, brand, promoter, link, visitor and click context';
  result := public.review_fraud_flag('00000000-0000-0000-0000-000000000e89', 'clear', '', '00000000-0000-0000-0000-000000000e83');
  assert (result->>'changed')::boolean, 'first flag can be cleared';
  assert (select status from public.earnings where id = '00000000-0000-0000-0000-000000000e88') = 'flagged', 'earning stays held while another flag is open';
  result := public.review_fraud_flag('00000000-0000-0000-0000-000000000e90', 'clear', 'reviewed as safe', '00000000-0000-0000-0000-000000000e83');
  assert (select status from public.earnings where id = '00000000-0000-0000-0000-000000000e88') = 'available', 'last clear releases the earning';
  assert (select count(*) from public.promoter_ledger where earning_id = '00000000-0000-0000-0000-000000000e88' and reason = 'earning') = 1, 'release credits the earning exactly once';
  perform public.review_fraud_flag('00000000-0000-0000-0000-000000000e90', 'clear', '', '00000000-0000-0000-0000-000000000e83');
  assert (select count(*) from public.promoter_ledger where earning_id = '00000000-0000-0000-0000-000000000e88' and reason = 'earning') = 1, 'repeated clear does not duplicate the credit';

  result := public.review_fraud_flag('00000000-0000-0000-0000-000000000e9a', 'confirm', 'confirmed self-promotion', '00000000-0000-0000-0000-000000000e83');
  assert (select status from public.earnings where id = '00000000-0000-0000-0000-000000000e99') = 'reversed', 'confirm invokes the audited reversal flow';
  assert (select status from public.fraud_flags where id = '00000000-0000-0000-0000-000000000e9a') = 'confirmed', 'confirm closes the flag as confirmed';
  assert (select trust_score from public.profiles where id = '00000000-0000-0000-0000-000000000e81') = -49, 'confirmed self-promotion applies the configured penalty after the clean-cycle credit';
  assert (select status from public.profiles where id = '00000000-0000-0000-0000-000000000e81') = 'suspended', 'admin confirmation suspends an account below the trust threshold';
  assert (select count(*) from public.links where promoter_id = '00000000-0000-0000-0000-000000000e81' and status <> 'disabled') = 0, 'admin-confirmed trust suspension disables links';
  assert has_function_privilege('service_role', 'public.admin_fraud_queue(uuid)', 'EXECUTE');
  assert not has_function_privilege('authenticated', 'public.admin_fraud_queue(uuid)', 'EXECUTE');
end $$;

rollback;
select 'ok: 22_admin_fraud' as result;
