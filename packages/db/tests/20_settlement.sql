-- P3.2: cycle boundaries, clean/flagged outcomes, waitlist expiry, notifications, and repeat safety.
begin;
-- Keep unrelated local demo rows out of the due-group scan; this transaction rolls these changes back.
update public.earnings set cycle_ends_at = now() + interval '100 years' where status = 'pending';
update public.earnings set created_at = now() where status = 'waitlisted';

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000000e21', 'settle-promoter@other.test'),
  ('00000000-0000-0000-0000-000000000e22', 'settle-owner@settle.test');
update public.profiles set country = 'IN' where id = '00000000-0000-0000-0000-000000000e21';
insert into public.brands (id, slug, name, url, owner_id, status, rate_cents)
values ('00000000-0000-0000-0000-000000000e23', 'settle-brand', 'Settlement Brand', 'https://settle.test', '00000000-0000-0000-0000-000000000e22', 'active', 10);
insert into public.links (id, code, promoter_id, brand_id, channel) values
  ('00000000-0000-0000-0000-000000000e24', 'Settle01', '00000000-0000-0000-0000-000000000e21', '00000000-0000-0000-0000-000000000e23', 'link'),
  ('00000000-0000-0000-0000-000000000e25', 'Settle02', '00000000-0000-0000-0000-000000000e21', '00000000-0000-0000-0000-000000000e23', 'x'),
  ('00000000-0000-0000-0000-000000000e26', 'Settle03', '00000000-0000-0000-0000-000000000e21', '00000000-0000-0000-0000-000000000e23', 'story');
insert into public.visitors (id, brand_id, claim_link_id, claim_promoter_id, qualified_at, qualified_ip_hash, qualified_fp_hash, qualified_active_ms)
values
  ('00000000-0000-0000-0000-000000000e27', '00000000-0000-0000-0000-000000000e23', '00000000-0000-0000-0000-000000000e24', '00000000-0000-0000-0000-000000000e21', now() - interval '2 hours', 'settle-ip-1', 'settle-fp-1', 12000),
  ('00000000-0000-0000-0000-000000000e28', '00000000-0000-0000-0000-000000000e23', '00000000-0000-0000-0000-000000000e25', '00000000-0000-0000-0000-000000000e21', now() - interval '2 hours', 'settle-ip-2', 'settle-fp-2', 12000),
  ('00000000-0000-0000-0000-000000000e29', '00000000-0000-0000-0000-000000000e23', '00000000-0000-0000-0000-000000000e26', '00000000-0000-0000-0000-000000000e21', now(), 'settle-ip-3', 'settle-fp-3', 12000),
  ('00000000-0000-0000-0000-000000000e38', '00000000-0000-0000-0000-000000000e23', '00000000-0000-0000-0000-000000000e24', '00000000-0000-0000-0000-000000000e21', now() - interval '31 days', 'settle-ip-4', 'settle-fp-4', 12000),
  ('00000000-0000-0000-0000-000000000e39', '00000000-0000-0000-0000-000000000e23', '00000000-0000-0000-0000-000000000e24', '00000000-0000-0000-0000-000000000e21', now() - interval '28 days', 'settle-ip-5', 'settle-fp-5', 12000);
insert into public.clicks (id, link_id, brand_id, promoter_id, visitor_id, ip_hash, ua_hash, country)
values
  ('00000000-0000-0000-0000-000000000e30', '00000000-0000-0000-0000-000000000e24', '00000000-0000-0000-0000-000000000e23', '00000000-0000-0000-0000-000000000e21', '00000000-0000-0000-0000-000000000e27', 'settle-ip-1', 'settle-ua-1', 'IN'),
  ('00000000-0000-0000-0000-000000000e31', '00000000-0000-0000-0000-000000000e25', '00000000-0000-0000-0000-000000000e23', '00000000-0000-0000-0000-000000000e21', '00000000-0000-0000-0000-000000000e28', 'settle-ip-2', 'settle-ua-2', 'IN'),
  ('00000000-0000-0000-0000-000000000e32', '00000000-0000-0000-0000-000000000e26', '00000000-0000-0000-0000-000000000e23', '00000000-0000-0000-0000-000000000e21', '00000000-0000-0000-0000-000000000e29', 'settle-ip-3', 'settle-ua-3', 'IN'),
  ('00000000-0000-0000-0000-000000000e40', '00000000-0000-0000-0000-000000000e24', '00000000-0000-0000-0000-000000000e23', '00000000-0000-0000-0000-000000000e21', '00000000-0000-0000-0000-000000000e38', 'settle-ip-4', 'settle-ua-4', 'IN'),
  ('00000000-0000-0000-0000-000000000e41', '00000000-0000-0000-0000-000000000e24', '00000000-0000-0000-0000-000000000e23', '00000000-0000-0000-0000-000000000e21', '00000000-0000-0000-0000-000000000e39', 'settle-ip-5', 'settle-ua-5', 'IN');
insert into public.earnings (id, promoter_id, brand_id, link_id, visitor_id, click_id, amount_cents, cycle_ends_at, funded_at, status, created_at)
values
  ('00000000-0000-0000-0000-000000000e33', '00000000-0000-0000-0000-000000000e21', '00000000-0000-0000-0000-000000000e23', '00000000-0000-0000-0000-000000000e24', '00000000-0000-0000-0000-000000000e27', '00000000-0000-0000-0000-000000000e30', 100, now(), now() - interval '1 day', 'pending', now() - interval '1 day'),
  ('00000000-0000-0000-0000-000000000e34', '00000000-0000-0000-0000-000000000e21', '00000000-0000-0000-0000-000000000e23', '00000000-0000-0000-0000-000000000e25', '00000000-0000-0000-0000-000000000e28', '00000000-0000-0000-0000-000000000e31', 200, now(), now() - interval '1 day', 'pending', now() - interval '1 day'),
  ('00000000-0000-0000-0000-000000000e35', '00000000-0000-0000-0000-000000000e21', '00000000-0000-0000-0000-000000000e23', '00000000-0000-0000-0000-000000000e26', '00000000-0000-0000-0000-000000000e29', '00000000-0000-0000-0000-000000000e32', 300, now() + interval '1 second', now(), 'pending', now()),
  ('00000000-0000-0000-0000-000000000e36', '00000000-0000-0000-0000-000000000e21', '00000000-0000-0000-0000-000000000e23', '00000000-0000-0000-0000-000000000e24', '00000000-0000-0000-0000-000000000e38', '00000000-0000-0000-0000-000000000e40', 400, null, null, 'waitlisted', now() - interval '31 days'),
  ('00000000-0000-0000-0000-000000000e37', '00000000-0000-0000-0000-000000000e21', '00000000-0000-0000-0000-000000000e23', '00000000-0000-0000-0000-000000000e24', '00000000-0000-0000-0000-000000000e39', '00000000-0000-0000-0000-000000000e41', 500, null, null, 'waitlisted', now() - interval '28 days');
insert into public.fraud_flags (subject_type, subject_id, rule, score, details)
values ('earning', '00000000-0000-0000-0000-000000000e34', 'manual_test', 50, '{}');

do $$
declare
  result jsonb;
  before_ledger bigint;
  after_ledger bigint;
  before_trust int;
begin
  select count(*) into before_ledger from public.promoter_ledger where promoter_id = '00000000-0000-0000-0000-000000000e21';
  select trust_score into before_trust from public.profiles where id = '00000000-0000-0000-0000-000000000e21';
  result := public.settle_due_earnings();
  assert (result->>'available')::int = 1 and (result->>'flagged')::int = 1 and (result->>'expired')::int = 1,
    'job returns counts across settlement, fraud hold and expiry operations';
  assert (select status from public.earnings where id = '00000000-0000-0000-0000-000000000e33') = 'available', 'due clean earnings settle';
  assert (select settled_at is not null from public.earnings where id = '00000000-0000-0000-0000-000000000e33'), 'clean earnings receive settlement time';
  assert (select status from public.earnings where id = '00000000-0000-0000-0000-000000000e34') = 'flagged', 'earnings with an open flag are held';
  assert (select settled_at is null from public.earnings where id = '00000000-0000-0000-0000-000000000e34'), 'flagged earning remains unsettled';
  assert (select count(*) from public.promoter_ledger where earning_id = '00000000-0000-0000-0000-000000000e34') = 0, 'flagged earning receives no ledger credit';
  assert (select status from public.earnings where id = '00000000-0000-0000-0000-000000000e35') = 'pending', 'one second before the cycle end is not settled';
  assert (select status from public.earnings where id = '00000000-0000-0000-0000-000000000e36') = 'expired', 'waitlist entry older than 30 days expires';
  assert (select count(*) from public.promoter_ledger where earning_id = '00000000-0000-0000-0000-000000000e36') = 0, 'expired waitlist entry does not move money';
  assert (select status from public.earnings where id = '00000000-0000-0000-0000-000000000e37') = 'waitlisted', 'waitlist entry inside the expiry window stays queued';
  assert exists (select 1 from public.notification_outbox where kind = 'earnings_available' and recipient_user_id = '00000000-0000-0000-0000-000000000e21'), 'available earnings queue a daily notice';
  assert exists (select 1 from public.notification_outbox where kind = 'waitlist_expiring' and recipient_user_id = '00000000-0000-0000-0000-000000000e21'), 'expiring waitlist queues a daily digest';
  assert (select trust_score from public.profiles where id = '00000000-0000-0000-0000-000000000e21') = least(before_trust + 1, 50), 'clean cycle increases trust by one, capped at 50';

  result := public.settle_due_earnings();
  select count(*) into after_ledger from public.promoter_ledger where promoter_id = '00000000-0000-0000-0000-000000000e21';
  assert after_ledger = before_ledger + 1, 'a second settlement run adds no duplicate ledger entry';
  assert (select count(*) from public.notification_outbox where recipient_user_id = '00000000-0000-0000-0000-000000000e21' and kind in ('earnings_available', 'waitlist_expiring')) = 2,
    'repeat run does not duplicate daily notification rows';
  assert (select trust_score from public.profiles where id = '00000000-0000-0000-0000-000000000e21') = least(before_trust + 1, 50), 'a second run does not award trust twice';
  assert has_function_privilege('service_role', 'public.settle_due_earnings()', 'EXECUTE');
  assert not has_function_privilege('authenticated', 'public.settle_due_earnings()', 'EXECUTE');
end $$;

rollback;
select 'ok: 20_settlement' as result;
