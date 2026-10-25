-- P3.8: admin-only brand lookup and audited moderation.
begin;
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000000eb1', 'brand-owner@brands.test'),
  ('00000000-0000-0000-0000-000000000eb2', 'brands-admin@brands.test'),
  ('00000000-0000-0000-0000-000000000eb3', 'other-owner@brands.test');
update public.profiles set is_admin = true where id = '00000000-0000-0000-0000-000000000eb2';
insert into public.brands (id, slug, name, url, owner_id, status, rate_cents, budget_cents, total_paid_cents, ads_enabled) values
  ('00000000-0000-0000-0000-000000000eb4', 'admin-search-brand', 'Admin Search Brand', 'https://brands.test', '00000000-0000-0000-0000-000000000eb1', 'active', 10, 100, 200, true),
  ('00000000-0000-0000-0000-000000000eb5', 'admin-remove-brand', 'Admin Remove Brand', 'https://remove.brands.test', '00000000-0000-0000-0000-000000000eb3', 'active', 10, 50, 100, true);
insert into public.links (id, code, promoter_id, brand_id, channel) values
  ('00000000-0000-0000-0000-000000000eb6', 'AdminB01', '00000000-0000-0000-0000-000000000eb1', '00000000-0000-0000-0000-000000000eb4', 'link'),
  ('00000000-0000-0000-0000-000000000eb7', 'AdminB02', '00000000-0000-0000-0000-000000000eb1', '00000000-0000-0000-0000-000000000eb5', 'x');
insert into public.budget_ledger (brand_id, delta_cents, reason) values
  ('00000000-0000-0000-0000-000000000eb4', 100, 'bid'),
  ('00000000-0000-0000-0000-000000000eb5', 50, 'bid');

do $$
declare result jsonb; audit_count int;
begin
  result := public.admin_search_brands('00000000-0000-0000-0000-000000000eb2', 'search-brand');
  assert jsonb_array_length(result) = 1, 'search finds one brand';
  assert result->0->>'owner_email' = 'brand-owner@brands.test', 'search includes owner email';
  assert (result->0->>'ledger_balance_cents')::int = 100, 'search includes ledger balance';
  assert (result->0->>'link_count')::int = 1, 'search includes links';
  assert jsonb_array_length(public.admin_search_brands('00000000-0000-0000-0000-000000000eb2', 'x')) = 0, 'short query returns no bulk list';

  result := public.admin_disable_brand_ads('00000000-0000-0000-0000-000000000eb4', 'fraud review', '00000000-0000-0000-0000-000000000eb2');
  assert (result->>'changed')::boolean, 'active brand ads can be disabled';
  assert not (select ads_enabled from public.brands where id = '00000000-0000-0000-0000-000000000eb4'), 'ads are off';
  assert (select status from public.links where id = '00000000-0000-0000-0000-000000000eb6') = 'disabled', 'links are disabled';
  select count(*) into audit_count from public.audit_log where action = 'brand_ads_disabled' and subject_id = '00000000-0000-0000-0000-000000000eb4';
  perform public.admin_disable_brand_ads('00000000-0000-0000-0000-000000000eb4', 'repeat action', '00000000-0000-0000-0000-000000000eb2');
  assert (select count(*) from public.audit_log where action = 'brand_ads_disabled' and subject_id = '00000000-0000-0000-0000-000000000eb4') = audit_count, 'repeat disable is idempotent';

  result := public.admin_remove_brand('00000000-0000-0000-0000-000000000eb5', 'policy violation', '00000000-0000-0000-0000-000000000eb2');
  assert (result->>'changed')::boolean, 'active brand can be removed';
  assert (select status from public.brands where id = '00000000-0000-0000-0000-000000000eb5') = 'removed', 'brand uses soft removal';
  assert not (select ads_enabled from public.brands where id = '00000000-0000-0000-0000-000000000eb5'), 'removal disables ads';
  assert (select status from public.links where id = '00000000-0000-0000-0000-000000000eb7') = 'disabled', 'removal disables links';
  assert (select budget_cents from public.brands where id = '00000000-0000-0000-0000-000000000eb5') = 50, 'removal preserves budget for reconciliation';
  assert has_function_privilege('service_role', 'public.admin_remove_brand(uuid,text,uuid)', 'EXECUTE');
  assert not has_function_privilege('authenticated', 'public.admin_remove_brand(uuid,text,uuid)', 'EXECUTE');
end $$;

rollback;
select 'ok: 24_admin_brands' as result;
