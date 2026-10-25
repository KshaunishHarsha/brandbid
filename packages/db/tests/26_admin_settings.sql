-- P3.8: settings validation, audit trail, floor propagation, notifications and ACLs.
begin;
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000000ed1', 'settings-owner@test.dev'),
  ('00000000-0000-0000-0000-000000000ed2', 'settings-admin@test.dev');
update public.profiles set is_admin = true where id = '00000000-0000-0000-0000-000000000ed2';
insert into public.brands (id, slug, name, url, owner_id, status, rate_cents, budget_cents, ads_enabled)
values ('00000000-0000-0000-0000-000000000ed3', 'settings-floor-brand', 'Floor Brand', 'https://floor.test', '00000000-0000-0000-0000-000000000ed1', 'active', 10, 100, true);

do $$
declare result jsonb; audit_count int; cfg jsonb;
begin
  result := public.admin_settings('00000000-0000-0000-0000-000000000ed2');
  assert result->>'floor_cents' is not null and result->>'fraud_thresholds' is not null, 'admin can read editable settings';

  result := public.admin_update_setting('floor_cents', '20'::jsonb, 'updated policy', '00000000-0000-0000-0000-000000000ed2');
  assert (result->>'changed')::boolean, 'new floor is saved';
  assert (select rate_cents from public.brands where id = '00000000-0000-0000-0000-000000000ed3') = 20, 'rates below raised floor are updated';
  assert (select count(*) from public.notification_outbox where kind = 'rate_floor_raised' and recipient_user_id = '00000000-0000-0000-0000-000000000ed1') = 1, 'brand owner notice is queued';
  select count(*) into audit_count from public.audit_log where action = 'setting_changed' and details->>'key' = 'floor_cents';
  perform public.admin_update_setting('floor_cents', '20'::jsonb, 'repeat value', '00000000-0000-0000-0000-000000000ed2');
  assert (select count(*) from public.audit_log where action = 'setting_changed' and details->>'key' = 'floor_cents') = audit_count, 'no-op setting change does not write another audit row';
  assert (select count(*) from public.audit_log where action = 'brand_rate_floor_raised' and subject_id = '00000000-0000-0000-0000-000000000ed3') = 1, 'affected brand rate change is audited';

  select value into cfg from public.settings where key = 'fraud_thresholds';
  perform public.admin_update_setting('fraud_thresholds', jsonb_set(cfg, '{flag_score}', '55'::jsonb), 'updated flag threshold', '00000000-0000-0000-0000-000000000ed2');

  begin
    perform public.admin_update_setting('budget_share_bps', '10001'::jsonb, 'invalid share', '00000000-0000-0000-0000-000000000ed2');
    raise exception 'invalid budget share was accepted';
  exception when others then
    assert sqlerrm = 'setting_value_invalid', 'invalid values are rejected';
  end;
  assert has_function_privilege('service_role', 'public.admin_update_setting(text,jsonb,text,uuid)', 'EXECUTE');
  assert not has_function_privilege('authenticated', 'public.admin_update_setting(text,jsonb,text,uuid)', 'EXECUTE');
end $$;

rollback;
select 'ok: 26_admin_settings' as result;
