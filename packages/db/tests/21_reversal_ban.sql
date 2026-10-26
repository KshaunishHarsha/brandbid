-- P3.7: budget recovery, clawback, waitlist funding, reversal idempotency, and promoter forfeiture.
begin;
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000000e51', 'clawback@promoter.test'),
  ('00000000-0000-0000-0000-000000000e52', 'forfeit@promoter.test'),
  ('00000000-0000-0000-0000-000000000e53', 'brand-owner@reversal.test'),
  ('00000000-0000-0000-0000-000000000e54', 'review-admin@reversal.test');
update public.profiles set is_admin = true where id = '00000000-0000-0000-0000-000000000e54';
update public.profiles set country = 'IN' where id = '00000000-0000-0000-0000-000000000e51';
insert into public.brands (id, slug, name, url, owner_id, status, rate_cents, budget_cents)
values ('00000000-0000-0000-0000-000000000e55', 'reversal-brand', 'Reversal Brand', 'https://reversal.example.test', '00000000-0000-0000-0000-000000000e53', 'active', 10, 0);
insert into public.links (id, code, promoter_id, brand_id, channel, created_at) values
  ('00000000-0000-0000-0000-000000000e56', 'Revers01', '00000000-0000-0000-0000-000000000e51', '00000000-0000-0000-0000-000000000e55', 'link', now() - interval '2 days'),
  ('00000000-0000-0000-0000-000000000e57', 'Revers02', '00000000-0000-0000-0000-000000000e51', '00000000-0000-0000-0000-000000000e55', 'x', now()),
  ('00000000-0000-0000-0000-000000000e58', 'Revers03', '00000000-0000-0000-0000-000000000e52', '00000000-0000-0000-0000-000000000e55', 'linkedin', now());
insert into public.visitors (id, brand_id, claim_link_id, claim_promoter_id, qualified_at, qualified_ip_hash, qualified_fp_hash, qualified_active_ms)
values
  ('00000000-0000-0000-0000-000000000e59', '00000000-0000-0000-0000-000000000e55', '00000000-0000-0000-0000-000000000e56', '00000000-0000-0000-0000-000000000e51', now() - interval '2 days', 'rev-ip-1', 'rev-fp-1', 12000),
  ('00000000-0000-0000-0000-000000000e60', '00000000-0000-0000-0000-000000000e55', '00000000-0000-0000-0000-000000000e57', '00000000-0000-0000-0000-000000000e51', now(), 'rev-ip-2', 'rev-fp-2', 12000),
  ('00000000-0000-0000-0000-000000000e61', '00000000-0000-0000-0000-000000000e55', '00000000-0000-0000-0000-000000000e57', '00000000-0000-0000-0000-000000000e51', now() - interval '30 days', 'rev-ip-3', 'rev-fp-3', 12000),
  ('00000000-0000-0000-0000-000000000e62', '00000000-0000-0000-0000-000000000e55', '00000000-0000-0000-0000-000000000e58', '00000000-0000-0000-0000-000000000e52', now(), 'rev-ip-4', 'rev-fp-4', 12000),
  ('00000000-0000-0000-0000-000000000e72', '00000000-0000-0000-0000-000000000e55', '00000000-0000-0000-0000-000000000e57', '00000000-0000-0000-0000-000000000e51', now(), 'rev-ip-5', 'rev-fp-5', 12000),
  ('00000000-0000-0000-0000-000000000e75', '00000000-0000-0000-0000-000000000e55', '00000000-0000-0000-0000-000000000e57', '00000000-0000-0000-0000-000000000e51', now() - interval '2 days', 'rev-ip-6', 'rev-fp-6', 12000);
insert into public.clicks (id, link_id, brand_id, promoter_id, visitor_id, ip_hash, ua_hash, country)
values
  ('00000000-0000-0000-0000-000000000e63', '00000000-0000-0000-0000-000000000e56', '00000000-0000-0000-0000-000000000e55', '00000000-0000-0000-0000-000000000e51', '00000000-0000-0000-0000-000000000e59', 'rev-ip-1', 'rev-ua-1', 'IN'),
  ('00000000-0000-0000-0000-000000000e64', '00000000-0000-0000-0000-000000000e57', '00000000-0000-0000-0000-000000000e55', '00000000-0000-0000-0000-000000000e51', '00000000-0000-0000-0000-000000000e60', 'rev-ip-2', 'rev-ua-2', 'IN'),
  ('00000000-0000-0000-0000-000000000e65', '00000000-0000-0000-0000-000000000e57', '00000000-0000-0000-0000-000000000e55', '00000000-0000-0000-0000-000000000e51', '00000000-0000-0000-0000-000000000e61', 'rev-ip-3', 'rev-ua-3', 'IN'),
  ('00000000-0000-0000-0000-000000000e66', '00000000-0000-0000-0000-000000000e58', '00000000-0000-0000-0000-000000000e55', '00000000-0000-0000-0000-000000000e52', '00000000-0000-0000-0000-000000000e62', 'rev-ip-4', 'rev-ua-4', 'IN'),
  ('00000000-0000-0000-0000-000000000e73', '00000000-0000-0000-0000-000000000e57', '00000000-0000-0000-0000-000000000e55', '00000000-0000-0000-0000-000000000e51', '00000000-0000-0000-0000-000000000e72', 'rev-ip-5', 'rev-ua-5', 'IN'),
  ('00000000-0000-0000-0000-000000000e76', '00000000-0000-0000-0000-000000000e57', '00000000-0000-0000-0000-000000000e55', '00000000-0000-0000-0000-000000000e51', '00000000-0000-0000-0000-000000000e75', 'rev-ip-6', 'rev-ua-6', 'IN');
insert into public.budget_ledger (brand_id, delta_cents, reason) values ('00000000-0000-0000-0000-000000000e55', 550, 'bid');
insert into public.earnings (id, promoter_id, brand_id, link_id, visitor_id, click_id, amount_cents, cycle_ends_at, funded_at, status, settled_at, created_at)
values
  ('00000000-0000-0000-0000-000000000e67', '00000000-0000-0000-0000-000000000e51', '00000000-0000-0000-0000-000000000e55', '00000000-0000-0000-0000-000000000e56', '00000000-0000-0000-0000-000000000e59', '00000000-0000-0000-0000-000000000e63', 200, now() - interval '1 day', now() - interval '2 days', 'available', now() - interval '1 day', now() - interval '2 days'),
  ('00000000-0000-0000-0000-000000000e68', '00000000-0000-0000-0000-000000000e51', '00000000-0000-0000-0000-000000000e55', '00000000-0000-0000-0000-000000000e57', '00000000-0000-0000-0000-000000000e60', '00000000-0000-0000-0000-000000000e64', 100, now() + interval '12 hours', now(), 'pending', null, now()),
  ('00000000-0000-0000-0000-000000000e69', '00000000-0000-0000-0000-000000000e51', '00000000-0000-0000-0000-000000000e55', '00000000-0000-0000-0000-000000000e57', '00000000-0000-0000-0000-000000000e61', '00000000-0000-0000-0000-000000000e65', 50, null, null, 'waitlisted', null, now() - interval '30 days'),
  ('00000000-0000-0000-0000-000000000e70', '00000000-0000-0000-0000-000000000e51', '00000000-0000-0000-0000-000000000e55', '00000000-0000-0000-0000-000000000e57', '00000000-0000-0000-0000-000000000e72', '00000000-0000-0000-0000-000000000e73', 250, now(), now(), 'pending', null, now()),
  ('00000000-0000-0000-0000-000000000e71', '00000000-0000-0000-0000-000000000e52', '00000000-0000-0000-0000-000000000e55', '00000000-0000-0000-0000-000000000e58', '00000000-0000-0000-0000-000000000e62', '00000000-0000-0000-0000-000000000e66', 500, now() + interval '12 hours', now(), 'pending', null, now()),
  ('00000000-0000-0000-0000-000000000e74', '00000000-0000-0000-0000-000000000e51', '00000000-0000-0000-0000-000000000e55', '00000000-0000-0000-0000-000000000e57', '00000000-0000-0000-0000-000000000e75', '00000000-0000-0000-0000-000000000e76', 300, null, null, 'waitlisted', null, now() - interval '1 day');
insert into public.promoter_ledger (promoter_id, delta_cents, reason, earning_id) values
  ('00000000-0000-0000-0000-000000000e51', 200, 'earning', '00000000-0000-0000-0000-000000000e67'),
  ('00000000-0000-0000-0000-000000000e51', -250, 'withdrawal', null),
  ('00000000-0000-0000-0000-000000000e52', 500, 'earning', '00000000-0000-0000-0000-000000000e71');
insert into public.budget_ledger (brand_id, delta_cents, reason, earning_id) values
  ('00000000-0000-0000-0000-000000000e55', -200, 'visitor', '00000000-0000-0000-0000-000000000e67'),
  ('00000000-0000-0000-0000-000000000e55', -100, 'visitor', '00000000-0000-0000-0000-000000000e68'),
  ('00000000-0000-0000-0000-000000000e55', -250, 'visitor', '00000000-0000-0000-0000-000000000e70');
update public.brands set budget_cents = 0 where id = '00000000-0000-0000-0000-000000000e55';
insert into public.fraud_flags (subject_type, subject_id, rule, score, details)
values
  ('earning', '00000000-0000-0000-0000-000000000e67', 'R9', 60, '{"signal":"test"}'),
  ('earning', '00000000-0000-0000-0000-000000000e68', 'R1', 40, '{"signal":"test"}'),
  ('earning', '00000000-0000-0000-0000-000000000e68', 'R4', 20, '{"signal":"test"}');

do $$
declare result jsonb; again jsonb; balance bigint;
begin
  result := public.reverse_earning('00000000-0000-0000-0000-000000000e67', 'confirmed self-promotion', '00000000-0000-0000-0000-000000000e54');
  assert (result->>'funded_waitlist')::int = 1, 'returned budget funds the waitlist in order';
  assert (select status from public.earnings where id = '00000000-0000-0000-0000-000000000e67') = 'reversed', 'available earning is reversed';
  assert (select status from public.earnings where id = '00000000-0000-0000-0000-000000000e69') = 'pending', 'waitlisted earning is funded after budget return';
  assert (select status from public.fraud_flags where subject_id = '00000000-0000-0000-0000-000000000e67') = 'confirmed', 'associated open fraud flag is confirmed';
  assert (select trust_score from public.profiles where id = '00000000-0000-0000-0000-000000000e51') = -50, 'confirmed R9 applies the configured self-promotion penalty';
  assert (select status from public.profiles where id = '00000000-0000-0000-0000-000000000e51') = 'suspended', 'trust below the configured threshold suspends the promoter';
  assert (select count(*) from public.links where promoter_id = '00000000-0000-0000-0000-000000000e51' and status <> 'disabled') = 0, 'trust suspension disables active promoter links';
  assert (select count(*) from public.audit_log where action = 'promoter_suspended_trust_threshold' and subject_id = '00000000-0000-0000-0000-000000000e51') = 1, 'automatic suspension is audited once';
  assert (select sum(delta_cents) from public.promoter_ledger where promoter_id = '00000000-0000-0000-0000-000000000e51') = -250, 'clawback can make the promoter balance negative';
  assert (select budget_cents from public.brands where id = '00000000-0000-0000-0000-000000000e55') = 150, 'reversal funds the waitlist from returned budget';
  again := public.reverse_earning('00000000-0000-0000-0000-000000000e67', 'confirmed self-promotion', '00000000-0000-0000-0000-000000000e54');
  assert not (again->>'changed')::boolean, 'a repeated reversal is idempotent';
  assert (select trust_score from public.profiles where id = '00000000-0000-0000-0000-000000000e51') = -50, 'a repeated reversal does not apply its trust penalty again';

  result := public.reverse_earning('00000000-0000-0000-0000-000000000e68', 'invalid pending traffic', '00000000-0000-0000-0000-000000000e54');
  assert (select status from public.earnings where id = '00000000-0000-0000-0000-000000000e68') = 'reversed', 'pending earning is reversed';
  assert (select trust_score from public.profiles where id = '00000000-0000-0000-0000-000000000e51') = -70, 'each confirmed non-R9 flag applies its configured penalty';
  assert (select count(*) from public.fraud_flags where subject_id = '00000000-0000-0000-0000-000000000e68' and status = 'confirmed') = 2, 'all flags confirmed by the reversal are closed';
  assert (select count(*) from public.promoter_ledger where earning_id = '00000000-0000-0000-0000-000000000e68') = 0, 'pending reversal does not claw back uncredited earnings';
  result := public.settle_due_earnings();
  assert (select sum(delta_cents) from public.promoter_ledger where promoter_id = '00000000-0000-0000-0000-000000000e51') = 0, 'next clean settlement recovers the clawback';
  assert (select status from public.earnings where id = '00000000-0000-0000-0000-000000000e70') = 'available', 'future earning settles to recover the negative balance';

  result := public.reverse_earning('00000000-0000-0000-0000-000000000e74', 'waitlisted fraud', '00000000-0000-0000-0000-000000000e54');
  assert (select status from public.earnings where id = '00000000-0000-0000-0000-000000000e74') = 'reversed', 'waitlisted earning is marked reversed';
  assert (select count(*) from public.budget_ledger where earning_id = '00000000-0000-0000-0000-000000000e74') = 0, 'waitlisted reversal adds no budget movement';
  assert (select count(*) from public.promoter_ledger where earning_id = '00000000-0000-0000-0000-000000000e74') = 0, 'waitlisted reversal adds no promoter movement';

  result := public.ban_promoter('00000000-0000-0000-0000-000000000e52', 'confirmed serious fraud', '00000000-0000-0000-0000-000000000e54');
  select sum(delta_cents) into balance from public.promoter_ledger where promoter_id = '00000000-0000-0000-0000-000000000e52';
  assert (select status from public.profiles where id = '00000000-0000-0000-0000-000000000e52') = 'banned', 'ban updates promoter status';
  assert (select status from public.links where id = '00000000-0000-0000-0000-000000000e58') = 'disabled', 'ban disables promoter links';
  assert balance = 0 and (result->>'forfeited_cents')::bigint = 500, 'positive balance is forfeited';
  perform public.ban_promoter('00000000-0000-0000-0000-000000000e52', 'confirmed serious fraud', '00000000-0000-0000-0000-000000000e54');
  assert (select count(*) from public.promoter_ledger where promoter_id = '00000000-0000-0000-0000-000000000e52' and reason = 'forfeit') = 1, 'repeated ban does not forfeit twice';
  assert has_function_privilege('service_role', 'public.reverse_earning(uuid,text,uuid)', 'EXECUTE');
  assert not has_function_privilege('authenticated', 'public.reverse_earning(uuid,text,uuid)', 'EXECUTE');
end $$;

rollback;
select 'ok: 21_reversal_ban' as result;
