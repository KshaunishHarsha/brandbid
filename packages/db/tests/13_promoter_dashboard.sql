-- P2.11: dashboard aggregates match raw click, qualification, earning and ledger counts.
begin;
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000d1', 'promoter@dashboard.test'),
  ('00000000-0000-0000-0000-0000000000d2', 'owner@dashboard.test');
insert into public.brands (id, slug, name, url, owner_id, status, rate_cents, budget_cents, ads_enabled)
values ('00000000-0000-0000-0000-0000000000d3', 'dashboard-brand', 'Dashboard Brand', 'https://dash.example.com', '00000000-0000-0000-0000-0000000000d2', 'active', 25, 1000, true);
insert into public.links (id, code, promoter_id, brand_id, channel, created_at) values
  ('00000000-0000-0000-0000-0000000000d4', 'DashTes1', '00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000d3', 'link', now() - interval '2 hours'),
  ('00000000-0000-0000-0000-0000000000d5', 'DashTes2', '00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000d3', 'x', now() - interval '4 hours');

insert into public.clicks (id, link_id, brand_id, promoter_id, ip_hash, ua_hash, ignored_reason) values
  ('00000000-0000-0000-0000-0000000000d6', '00000000-0000-0000-0000-0000000000d4', '00000000-0000-0000-0000-0000000000d3', '00000000-0000-0000-0000-0000000000d1', 'ip1', 'ua1', null),
  ('00000000-0000-0000-0000-0000000000d7', '00000000-0000-0000-0000-0000000000d4', '00000000-0000-0000-0000-0000000000d3', '00000000-0000-0000-0000-0000000000d1', 'ip2', 'ua2', null),
  ('00000000-0000-0000-0000-0000000000d8', '00000000-0000-0000-0000-0000000000d4', '00000000-0000-0000-0000-0000000000d3', '00000000-0000-0000-0000-0000000000d1', 'ip3', 'ua3', 'rate_limited'),
  ('00000000-0000-0000-0000-0000000000d9', '00000000-0000-0000-0000-0000000000d5', '00000000-0000-0000-0000-0000000000d3', '00000000-0000-0000-0000-0000000000d1', 'ip4', 'ua4', null),
  ('00000000-0000-0000-0000-0000000000db', '00000000-0000-0000-0000-0000000000d5', '00000000-0000-0000-0000-0000000000d3', '00000000-0000-0000-0000-0000000000d1', 'ip5', 'ua5', null);

insert into public.visitors (id, brand_id, claim_link_id, claim_promoter_id, qualified_at) values
  ('00000000-0000-0000-0000-0000000000dc', '00000000-0000-0000-0000-0000000000d3', '00000000-0000-0000-0000-0000000000d4', '00000000-0000-0000-0000-0000000000d1', now()),
  ('00000000-0000-0000-0000-0000000000dd', '00000000-0000-0000-0000-0000000000d3', '00000000-0000-0000-0000-0000000000d4', '00000000-0000-0000-0000-0000000000d1', now()),
  ('00000000-0000-0000-0000-0000000000de', '00000000-0000-0000-0000-0000000000d3', '00000000-0000-0000-0000-0000000000d4', '00000000-0000-0000-0000-0000000000d1', null),
  ('00000000-0000-0000-0000-0000000000df', '00000000-0000-0000-0000-0000000000d3', '00000000-0000-0000-0000-0000000000d5', '00000000-0000-0000-0000-0000000000d1', now());

insert into public.earnings (id, promoter_id, brand_id, link_id, visitor_id, click_id, amount_cents, cycle_ends_at, funded_at, status, created_at) values
  ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000d3', '00000000-0000-0000-0000-0000000000d4', '00000000-0000-0000-0000-0000000000dc', '00000000-0000-0000-0000-0000000000d6', 25, now() + interval '2 hours', now(), 'pending', now()),
  ('00000000-0000-0000-0000-0000000000e2', '00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000d3', '00000000-0000-0000-0000-0000000000d4', '00000000-0000-0000-0000-0000000000dd', '00000000-0000-0000-0000-0000000000d7', 15, null, null, 'waitlisted', now() - interval '1 day'),
  ('00000000-0000-0000-0000-0000000000e3', '00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000d3', '00000000-0000-0000-0000-0000000000d5', '00000000-0000-0000-0000-0000000000df', '00000000-0000-0000-0000-0000000000db', 35, now() + interval '3 hours', now(), 'pending', now());

do $$
declare
  payload jsonb := public.promoter_dashboard('00000000-0000-0000-0000-0000000000d1');
  link_data jsonb;
  second_link_data jsonb;
begin
  select value into link_data from jsonb_array_elements(payload->'links') where value->>'link_id' = '00000000-0000-0000-0000-0000000000d4';
  assert (link_data->>'clicks')::int = (select count(*) from public.clicks where link_id = '00000000-0000-0000-0000-0000000000d4' and ignored_reason is null);
  assert (link_data->>'clicks')::int = 2;
  assert (link_data->>'qualified_visitors')::int = (select count(*) from public.visitors where claim_link_id = '00000000-0000-0000-0000-0000000000d4' and qualified_at is not null);
  assert (link_data->>'qualified_visitors')::int = 2;
  assert (link_data->>'pending_cents')::int = 25;
  assert (link_data->>'waitlisted_cents')::int = 15;
  assert jsonb_array_length(link_data->'waitlisted_earnings') = 1;
  assert (link_data->'waitlisted_earnings'->0->>'expires_at')::timestamptz = (select created_at + interval '30 days' from public.earnings where id = '00000000-0000-0000-0000-0000000000e2');
  assert (link_data->>'current_cycle_ends_at')::timestamptz > now();
  select value into second_link_data from jsonb_array_elements(payload->'links') where value->>'link_id' = '00000000-0000-0000-0000-0000000000d5';
  assert (second_link_data->>'clicks')::int = (select count(*) from public.clicks where link_id = '00000000-0000-0000-0000-0000000000d5' and ignored_reason is null);
  assert (second_link_data->>'clicks')::int = 2;
  assert (second_link_data->>'qualified_visitors')::int = (select count(*) from public.visitors where claim_link_id = '00000000-0000-0000-0000-0000000000d5' and qualified_at is not null);
  assert (second_link_data->>'qualified_visitors')::int = 1;
  assert (second_link_data->>'pending_cents')::int = 35;
  assert (payload->'totals'->>'pending_cents')::int = (select coalesce(sum(amount_cents), 0) from public.earnings where promoter_id = '00000000-0000-0000-0000-0000000000d1' and status = 'pending');
  assert (payload->'totals'->>'pending_cents')::int = 60;
  assert (payload->'totals'->>'waitlisted_cents')::int = (select coalesce(sum(amount_cents), 0) from public.earnings where promoter_id = '00000000-0000-0000-0000-0000000000d1' and status = 'waitlisted');
  assert (payload->'totals'->>'waitlisted_cents')::int = 15;
  assert has_function_privilege('service_role', 'public.promoter_dashboard(uuid)', 'EXECUTE');
  assert not has_function_privilege('authenticated', 'public.promoter_dashboard(uuid)', 'EXECUTE');
end $$;

rollback;
select 'ok: 13_promoter_dashboard' as result;
