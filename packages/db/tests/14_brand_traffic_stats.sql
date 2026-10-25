-- P2.12: the member-scoped aggregates match raw click, qualification, and outbound rows.
begin;
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000f1', 'member@traffic.test'),
  ('00000000-0000-0000-0000-0000000000f2', 'stranger@traffic.test');
insert into public.brands (id, slug, name, url, owner_id, status, rate_cents, budget_cents, ads_enabled)
values ('00000000-0000-0000-0000-0000000000f3', 'traffic-brand', 'Traffic Brand', 'https://traffic.example.com', '00000000-0000-0000-0000-0000000000f1', 'active', 100, 700, true);
insert into public.brand_members (brand_id, user_id, role)
values ('00000000-0000-0000-0000-0000000000f3', '00000000-0000-0000-0000-0000000000f1', 'owner');
insert into public.budget_ledger (brand_id, delta_cents, reason)
values ('00000000-0000-0000-0000-0000000000f3', 1000, 'bid'), ('00000000-0000-0000-0000-0000000000f3', -300, 'visitor');
insert into public.links (id, code, promoter_id, brand_id, channel) values
  ('00000000-0000-0000-0000-0000000000f4', 'Traffic1', '00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000f3', 'story'),
  ('00000000-0000-0000-0000-0000000000f5', 'Traffic2', '00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000f3', 'x');
insert into public.clicks (id, link_id, brand_id, promoter_id, ip_hash, ua_hash, country, ignored_reason, created_at, outbound_at) values
  ('00000000-0000-0000-0000-0000000000f6', '00000000-0000-0000-0000-0000000000f4', '00000000-0000-0000-0000-0000000000f3', '00000000-0000-0000-0000-0000000000f1', 'ip1', 'ua1', 'IN', null, now() - interval '1 day', now() - interval '1 day'),
  ('00000000-0000-0000-0000-0000000000f7', '00000000-0000-0000-0000-0000000000f4', '00000000-0000-0000-0000-0000000000f3', '00000000-0000-0000-0000-0000000000f1', 'ip2', 'ua2', 'US', null, now() - interval '2 days', now() - interval '31 days'),
  ('00000000-0000-0000-0000-0000000000f8', '00000000-0000-0000-0000-0000000000f4', '00000000-0000-0000-0000-0000000000f3', '00000000-0000-0000-0000-0000000000f1', 'ip3', 'ua3', 'CA', 'self', now() - interval '2 days', null),
  ('00000000-0000-0000-0000-0000000000f9', '00000000-0000-0000-0000-0000000000f5', '00000000-0000-0000-0000-0000000000f3', '00000000-0000-0000-0000-0000000000f1', 'ip4', 'ua4', 'CA', null, now() - interval '3 days', now() - interval '3 days'),
  ('00000000-0000-0000-0000-0000000000fa', '00000000-0000-0000-0000-0000000000f4', '00000000-0000-0000-0000-0000000000f3', '00000000-0000-0000-0000-0000000000f1', 'ip5', 'ua5', 'IN', null, now() - interval '40 days', now() - interval '40 days'),
  ('00000000-0000-0000-0000-0000000000fb', '00000000-0000-0000-0000-0000000000f4', '00000000-0000-0000-0000-0000000000f3', '00000000-0000-0000-0000-0000000000f1', 'ip6', 'ua6', null, null, now() - interval '1 day', null);
insert into public.visitors (id, brand_id, claim_link_id, claim_promoter_id, qualified_at, qualified_click_id) values
  ('00000000-0000-0000-0000-0000000000fc', '00000000-0000-0000-0000-0000000000f3', '00000000-0000-0000-0000-0000000000f4', '00000000-0000-0000-0000-0000000000f1', now() - interval '1 day', '00000000-0000-0000-0000-0000000000f6'),
  ('00000000-0000-0000-0000-0000000000fd', '00000000-0000-0000-0000-0000000000f3', '00000000-0000-0000-0000-0000000000f5', '00000000-0000-0000-0000-0000000000f1', now() - interval '3 days', '00000000-0000-0000-0000-0000000000f9'),
  ('00000000-0000-0000-0000-0000000000fe', '00000000-0000-0000-0000-0000000000f3', '00000000-0000-0000-0000-0000000000f4', '00000000-0000-0000-0000-0000000000f1', now() - interval '31 days', '00000000-0000-0000-0000-0000000000f7');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000f1","role":"authenticated"}', true);
do $$
declare stats jsonb := public.brand_traffic_stats('00000000-0000-0000-0000-0000000000f3');
begin
  assert jsonb_array_length(stats->'daily') = 30;
  assert (select sum((value->>'clicks')::int) from jsonb_array_elements(stats->'daily')) =
    (select count(*) from public.clicks where brand_id = '00000000-0000-0000-0000-0000000000f3' and ignored_reason is null and created_at >= ((now() at time zone 'UTC')::date - 29)::timestamp at time zone 'UTC');
  assert (select sum((value->>'clicks')::int) from jsonb_array_elements(stats->'daily')) = 4;
  assert (select sum((value->>'qualified_visitors')::int) from jsonb_array_elements(stats->'daily')) =
    (select count(*) from public.visitors where brand_id = '00000000-0000-0000-0000-0000000000f3' and qualified_at >= ((now() at time zone 'UTC')::date - 29)::timestamp at time zone 'UTC');
  assert (select sum((value->>'qualified_visitors')::int) from jsonb_array_elements(stats->'daily')) = 2;
  assert (select sum((value->>'click_throughs')::int) from jsonb_array_elements(stats->'daily')) =
    (select count(*) from public.clicks where brand_id = '00000000-0000-0000-0000-0000000000f3' and outbound_at >= ((now() at time zone 'UTC')::date - 29)::timestamp at time zone 'UTC');
  assert (select sum((value->>'click_throughs')::int) from jsonb_array_elements(stats->'daily')) = 2;
  assert (select (value->>'clicks')::int from jsonb_array_elements(stats->'channels') where value->>'channel' = 'story') = 3;
  assert (select (value->>'qualified_visitors')::int from jsonb_array_elements(stats->'channels') where value->>'channel' = 'x') = 1;
  assert (select (value->>'clicks')::int from jsonb_array_elements(stats->'countries') where value->>'country' = 'Unknown') = 1;
  assert has_function_privilege('authenticated', 'public.brand_traffic_stats(uuid)', 'EXECUTE');
  assert not has_function_privilege('anon', 'public.brand_traffic_stats(uuid)', 'EXECUTE');
end $$;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000f2","role":"authenticated"}', true);
do $$ begin
  begin
    perform public.brand_traffic_stats('00000000-0000-0000-0000-0000000000f3');
    raise exception 'non-member received brand traffic';
  exception when insufficient_privilege then
    null;
  end;
end $$;

rollback;
select 'ok: 14_brand_traffic_stats' as result;
