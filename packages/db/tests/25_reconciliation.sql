-- P3.10: nightly money checks, persistent history, admin report and user-agent retention.
begin;
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000000ec1', 'reconcile-owner@test.dev'),
  ('00000000-0000-0000-0000-000000000ec2', 'reconcile-admin@test.dev');
update public.profiles set is_admin = true where id = '00000000-0000-0000-0000-000000000ec2';
insert into public.brands (id, slug, name, url, owner_id, status, rate_cents, budget_cents, total_paid_cents, ads_enabled)
values ('00000000-0000-0000-0000-000000000ec3', 'reconcile-brand', 'Reconcile Brand', 'https://reconcile.test', '00000000-0000-0000-0000-000000000ec1', 'active', 10, 100, 200, true);
insert into public.bids (id, brand_id, payer_id, amount_cents, revenue_cents, budget_cents, processor, processor_payment_id)
values ('00000000-0000-0000-0000-000000000ec4', '00000000-0000-0000-0000-000000000ec3', '00000000-0000-0000-0000-000000000ec1', 200, 100, 100, 'mock', 'reconcile-payment-1');
insert into public.budget_ledger (brand_id, delta_cents, reason, bid_id)
values ('00000000-0000-0000-0000-000000000ec3', 100, 'bid', '00000000-0000-0000-0000-000000000ec4');
insert into public.links (id, code, promoter_id, brand_id, channel) values
  ('00000000-0000-0000-0000-000000000ec5', 'Recon001', '00000000-0000-0000-0000-000000000ec1', '00000000-0000-0000-0000-000000000ec3', 'link');
insert into public.clicks (id, link_id, brand_id, promoter_id, ip_hash, ua_hash, user_agent, created_at) values
  ('00000000-0000-0000-0000-000000000ec6', '00000000-0000-0000-0000-000000000ec5', '00000000-0000-0000-0000-000000000ec3', '00000000-0000-0000-0000-000000000ec1', 'ip-old', 'ua-old', 'Old browser signature', now() - interval '91 days'),
  ('00000000-0000-0000-0000-000000000ec7', '00000000-0000-0000-0000-000000000ec5', '00000000-0000-0000-0000-000000000ec3', '00000000-0000-0000-0000-000000000ec1', 'ip-new', 'ua-new', 'Current browser signature', now());

do $$
declare result jsonb; bad jsonb; history jsonb; stripped int;
begin
  result := public.run_reconciliation();
  assert result ? 'run_id', 'reconciliation persists a run';
  assert not exists (select 1 from jsonb_array_elements(result->'violations') v
    where v->>'entity_id' = '00000000-0000-0000-0000-000000000ec3'), 'consistent fixture brand has no findings';

  update public.brands set budget_cents = 99 where id = '00000000-0000-0000-0000-000000000ec3';
  insert into public.promoter_ledger (promoter_id, delta_cents, reason, note)
    values ('00000000-0000-0000-0000-000000000ec1', -50, 'withdrawal', 'fixture: unexplained negative');
  bad := public.run_reconciliation();
  assert not (bad->>'passed')::boolean, 'invariant violations fail reconciliation';
  assert exists (select 1 from jsonb_array_elements(bad->'violations') v where v->>'entity_id' = '00000000-0000-0000-0000-000000000ec3' and v->>'rule' = 'brand_budget_matches_ledger'), 'fixture budget mismatch is reported';
  assert exists (select 1 from jsonb_array_elements(bad->'violations') v where v->>'entity_id' = '00000000-0000-0000-0000-000000000ec1' and v->>'rule' = 'negative_promoter_balance_has_clawback'), 'unexplained negative balance is reported';

  stripped := public.strip_old_user_agents();
  assert stripped = 1, 'only older-than-90-day user agents are cleared';
  assert (select user_agent is null from public.clicks where id = '00000000-0000-0000-0000-000000000ec6'), 'old raw user agent is removed';
  assert (select user_agent = 'Current browser signature' from public.clicks where id = '00000000-0000-0000-0000-000000000ec7'), 'recent user agent remains';

  history := public.admin_reconciliation_history('00000000-0000-0000-0000-000000000ec2', 10);
  assert jsonb_array_length(history) >= 2, 'admin can read both run-history rows created by this fixture';
  assert has_function_privilege('service_role', 'public.run_reconciliation()', 'EXECUTE');
  assert not has_function_privilege('authenticated', 'public.run_reconciliation()', 'EXECUTE');
  assert not has_function_privilege('authenticated', 'public.strip_old_user_agents(timestamp with time zone)', 'EXECUTE');
  assert not has_function_privilege('authenticated', 'public.admin_reconciliation_history(uuid,integer)', 'EXECUTE');
end $$;

rollback;
select 'ok: 25_reconciliation' as result;
