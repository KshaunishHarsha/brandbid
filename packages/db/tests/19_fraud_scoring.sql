-- P3.3: configured signal scoring, aggregate flag threshold, repeat safety, and a near-miss group.
begin;
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000000e01', 'promoter@fraud.example.test'),
  ('00000000-0000-0000-0000-000000000e02', 'owner@fraud.test'),
  ('00000000-0000-0000-0000-000000000e03', 'other1@other.test'),
  ('00000000-0000-0000-0000-000000000e04', 'other2@other.test');
update public.profiles set country = 'IN' where id = '00000000-0000-0000-0000-000000000e01';

insert into public.brands (id, slug, name, url, owner_id, status, rate_cents)
values
  ('00000000-0000-0000-0000-000000000e05', 'fraud-target-brand', 'Fraud Target', 'https://fraud.example.test', '00000000-0000-0000-0000-000000000e02', 'active', 10),
  ('00000000-0000-0000-0000-000000000e15', 'fraud-neutral-brand', 'Neutral Brand', 'https://neutral.test', '00000000-0000-0000-0000-000000000e02', 'active', 10);

insert into public.links (id, code, promoter_id, brand_id, channel) values
  ('00000000-0000-0000-0000-000000000e06', 'FraudL01', '00000000-0000-0000-0000-000000000e01', '00000000-0000-0000-0000-000000000e05', 'link'),
  ('00000000-0000-0000-0000-000000000e16', 'FraudL02', '00000000-0000-0000-0000-000000000e01', '00000000-0000-0000-0000-000000000e15', 'link');

insert into public.visitors (id, brand_id, claim_link_id, claim_promoter_id, qualified_at, qualified_ip_hash, qualified_fp_hash, qualified_active_ms)
values
  ('00000000-0000-0000-0000-000000000e07', '00000000-0000-0000-0000-000000000e05', '00000000-0000-0000-0000-000000000e06', '00000000-0000-0000-0000-000000000e01', now(), 'fraud-ip', 'fraud-fp', 10000),
  ('00000000-0000-0000-0000-000000000e10', '00000000-0000-0000-0000-000000000e05', null, '00000000-0000-0000-0000-000000000e03', now(), 'fraud-ip', 'fraud-fp', 14000),
  ('00000000-0000-0000-0000-000000000e11', '00000000-0000-0000-0000-000000000e05', null, '00000000-0000-0000-0000-000000000e04', now(), 'fraud-ip', 'fraud-fp', 18000),
  ('00000000-0000-0000-0000-000000000e17', '00000000-0000-0000-0000-000000000e15', '00000000-0000-0000-0000-000000000e16', '00000000-0000-0000-0000-000000000e01', now(), 'clean-ip', 'clean-fp', 14000);

insert into public.clicks (id, link_id, brand_id, promoter_id, visitor_id, ip_hash, ua_hash, country)
values
  ('00000000-0000-0000-0000-000000000e12', '00000000-0000-0000-0000-000000000e06', '00000000-0000-0000-0000-000000000e05', '00000000-0000-0000-0000-000000000e01', '00000000-0000-0000-0000-000000000e07', 'fraud-ip', 'ua-main', 'IN'),
  ('00000000-0000-0000-0000-000000000e18', '00000000-0000-0000-0000-000000000e16', '00000000-0000-0000-0000-000000000e15', '00000000-0000-0000-0000-000000000e01', '00000000-0000-0000-0000-000000000e17', 'clean-ip', 'ua-clean', 'IN');

insert into public.earnings (id, promoter_id, brand_id, link_id, visitor_id, click_id, amount_cents, cycle_ends_at, funded_at, status)
values
  ('00000000-0000-0000-0000-000000000e13', '00000000-0000-0000-0000-000000000e01', '00000000-0000-0000-0000-000000000e05', '00000000-0000-0000-0000-000000000e06', '00000000-0000-0000-0000-000000000e07', '00000000-0000-0000-0000-000000000e12', 10, now() + interval '12 hours', now(), 'pending'),
  ('00000000-0000-0000-0000-000000000e19', '00000000-0000-0000-0000-000000000e01', '00000000-0000-0000-0000-000000000e15', '00000000-0000-0000-0000-000000000e16', '00000000-0000-0000-0000-000000000e17', '00000000-0000-0000-0000-000000000e18', 10, now() + interval '12 hours', now(), 'pending');

do $$
declare
  flagged jsonb;
  clean jsonb;
begin
  flagged := public.assess_fraud_group('00000000-0000-0000-0000-000000000e06', now() + interval '12 hours');
  assert (flagged->>'score')::int >= 50 and (flagged->>'flagged')::boolean, 'combined R1/R2/R9 score crosses flag threshold';
  assert flagged->'rules' @> '[{"rule":"R1"},{"rule":"R2"},{"rule":"R9"}]'::jsonb, 'shared IP, fingerprint and email-domain signals are recorded';
  assert (select count(*) from public.fraud_flags where subject_id = '00000000-0000-0000-0000-000000000e13') = 3, 'one earning receives each detected rule';
  perform public.assess_fraud_group('00000000-0000-0000-0000-000000000e06', now() + interval '12 hours');
  assert (select count(*) from public.fraud_flags where subject_id = '00000000-0000-0000-0000-000000000e13') = 3, 'reassessment does not duplicate flags';

  clean := public.assess_fraud_group('00000000-0000-0000-0000-000000000e16', now() + interval '12 hours');
  assert (clean->>'score')::int = 0 and not (clean->>'flagged')::boolean, 'near-miss group is not flagged';
  assert (select count(*) from public.fraud_assessments where link_id = '00000000-0000-0000-0000-000000000e16' and score = 0) = 1, 'zero-score group still enters assessment history';

  insert into public.links (id, code, promoter_id, brand_id, channel)
  values ('00000000-0000-0000-0000-000000000e20', 'FraudL03', '00000000-0000-0000-0000-000000000e01', '00000000-0000-0000-0000-000000000e15', 'x');
  insert into public.visitors (id, brand_id, claim_link_id, claim_promoter_id, qualified_at, qualified_ip_hash, qualified_fp_hash, qualified_active_ms)
  select ('00000000-0000-0000-0002-' || lpad(i::text, 12, '0'))::uuid, '00000000-0000-0000-0000-000000000e15',
         '00000000-0000-0000-0000-000000000e20', '00000000-0000-0000-0000-000000000e01', now(), 'volume-ip-' || i, 'volume-fp-' || i, 10000
    from generate_series(1, 51) i;
  insert into public.clicks (id, link_id, brand_id, promoter_id, visitor_id, ip_hash, ua_hash, country)
  select ('00000000-0000-0000-0003-' || lpad(i::text, 12, '0'))::uuid, '00000000-0000-0000-0000-000000000e20',
         '00000000-0000-0000-0000-000000000e15', '00000000-0000-0000-0000-000000000e01',
         ('00000000-0000-0000-0002-' || lpad(i::text, 12, '0'))::uuid, 'volume-ip-' || i, 'ua-volume-' || i, 'US'
    from generate_series(1, 51) i;
  insert into public.earnings (id, promoter_id, brand_id, link_id, visitor_id, click_id, amount_cents, cycle_ends_at, funded_at, status)
  select ('00000000-0000-0000-0004-' || lpad(i::text, 12, '0'))::uuid, '00000000-0000-0000-0000-000000000e01',
         '00000000-0000-0000-0000-000000000e15', '00000000-0000-0000-0000-000000000e20',
         ('00000000-0000-0000-0002-' || lpad(i::text, 12, '0'))::uuid,
         ('00000000-0000-0000-0003-' || lpad(i::text, 12, '0'))::uuid, 100, now() + interval '13 hours', now(), 'pending'
    from generate_series(1, 51) i;
  flagged := public.assess_fraud_group('00000000-0000-0000-0000-000000000e20', now() + interval '13 hours');
  assert (flagged->>'score')::int >= 50 and (flagged->>'flagged')::boolean, 'high-volume group crosses the flag threshold';
  assert flagged->'rules' @> '[{"rule":"R3"},{"rule":"R4"},{"rule":"R5"},{"rule":"R6"},{"rule":"R8"}]'::jsonb,
    'volume, foreign-country concentration, tight active times, no click-throughs and new-account earnings are detected';
  assert (select count(*) from public.fraud_flags where subject_id in (select id from public.earnings where link_id = '00000000-0000-0000-0000-000000000e20')) = 51 * 5,
    'every earning in a high-score group is held for every triggered rule';
  assert has_function_privilege('service_role', 'public.assess_fraud_group(uuid,timestamptz)', 'EXECUTE');
  assert not has_function_privilege('authenticated', 'public.assess_fraud_group(uuid,timestamptz)', 'EXECUTE');
end $$;

rollback;
select 'ok: 19_fraud_scoring' as result;
