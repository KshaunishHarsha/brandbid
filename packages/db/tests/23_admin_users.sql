-- P3.8: admin-only user search, ledger context, safe suspension and ban/forfeit.
begin;
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000000ea1', 'search-user@users.test'),
  ('00000000-0000-0000-0000-000000000ea2', 'ban-user@users.test'),
  ('00000000-0000-0000-0000-000000000ea3', 'users-owner@users.test'),
  ('00000000-0000-0000-0000-000000000ea4', 'users-admin@users.test');
update public.profiles set is_admin = true where id = '00000000-0000-0000-0000-000000000ea4';
insert into public.brands (id, slug, name, url, owner_id, status, rate_cents)
values ('00000000-0000-0000-0000-000000000ea5', 'users-admin-brand', 'Users Admin Brand', 'https://users.test', '00000000-0000-0000-0000-000000000ea3', 'active', 10);
insert into public.links (id, code, promoter_id, brand_id, channel) values
  ('00000000-0000-0000-0000-000000000ea6', 'UsersL01', '00000000-0000-0000-0000-000000000ea1', '00000000-0000-0000-0000-000000000ea5', 'link'),
  ('00000000-0000-0000-0000-000000000ea7', 'UsersL02', '00000000-0000-0000-0000-000000000ea2', '00000000-0000-0000-0000-000000000ea5', 'x');
insert into public.promoter_ledger (promoter_id, delta_cents, reason, note) values
  ('00000000-0000-0000-0000-000000000ea1', 250, 'earning', 'demo earning'),
  ('00000000-0000-0000-0000-000000000ea2', 300, 'earning', 'to forfeit');

do $$
declare results jsonb; result jsonb; bad_admin jsonb; audit_count int;
begin
  results := public.admin_search_users('00000000-0000-0000-0000-000000000ea4', 'search-user@users.test');
  assert jsonb_array_length(results) = 1, 'search finds one matching user';
  assert results->0->>'email' = 'search-user@users.test', 'search returns email';
  assert (results->0->>'ledger_balance_cents')::int = 250, 'search includes current ledger balance';
  assert (results->0->>'link_count')::int = 1, 'search includes link count';
  assert jsonb_array_length(results->0->'recent_ledger') = 1, 'search includes recent ledger rows';
  assert jsonb_array_length(public.admin_search_users('00000000-0000-0000-0000-000000000ea4', 'x')) = 0, 'short query returns no bulk listing';

  result := public.admin_suspend_promoter('00000000-0000-0000-0000-000000000ea1', 'suspicious account', '00000000-0000-0000-0000-000000000ea4');
  assert (result->>'changed')::boolean, 'active user can be suspended';
  assert (select status from public.profiles where id = '00000000-0000-0000-0000-000000000ea1') = 'suspended', 'suspend updates account status';
  assert (select status from public.links where id = '00000000-0000-0000-0000-000000000ea6') = 'disabled', 'suspend disables links';
  select count(*) into audit_count from public.audit_log where action = 'promoter_suspended' and subject_id = '00000000-0000-0000-0000-000000000ea1';
  perform public.admin_suspend_promoter('00000000-0000-0000-0000-000000000ea1', 'suspicious account', '00000000-0000-0000-0000-000000000ea4');
  assert (select count(*) from public.audit_log where action = 'promoter_suspended' and subject_id = '00000000-0000-0000-0000-000000000ea1') = audit_count, 'repeat suspension is idempotent';

  result := public.admin_ban_promoter('00000000-0000-0000-0000-000000000ea2', 'confirmed serious fraud', '00000000-0000-0000-0000-000000000ea4');
  assert (result->>'forfeited_cents')::int = 300, 'ban forfeits positive balance';
  assert (select status from public.profiles where id = '00000000-0000-0000-0000-000000000ea2') = 'banned', 'ban updates account status';
  assert (select status from public.links where id = '00000000-0000-0000-0000-000000000ea7') = 'disabled', 'ban disables links';

  begin
    perform public.admin_ban_promoter('00000000-0000-0000-0000-000000000ea4', 'admin target', '00000000-0000-0000-0000-000000000ea4');
    raise exception 'admin target was banned';
  exception when insufficient_privilege then null;
  end;
  assert has_function_privilege('service_role', 'public.admin_search_users(uuid,text)', 'EXECUTE');
  assert not has_function_privilege('authenticated', 'public.admin_search_users(uuid,text)', 'EXECUTE');
end $$;

rollback;
select 'ok: 23_admin_users' as result;
