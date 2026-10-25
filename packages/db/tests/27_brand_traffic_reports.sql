-- P3.11: brand members can submit private, audited traffic reports for the admin fraud queue.
begin;
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000000ee1', 'report-owner@test.dev'),
  ('00000000-0000-0000-0000-000000000ee2', 'report-member@test.dev'),
  ('00000000-0000-0000-0000-000000000ee3', 'report-outsider@test.dev'),
  ('00000000-0000-0000-0000-000000000ee4', 'report-admin@test.dev');
update public.profiles set is_admin = true where id = '00000000-0000-0000-0000-000000000ee4';
insert into public.brands (id, slug, name, url, owner_id, status, rate_cents)
values ('00000000-0000-0000-0000-000000000ee5', 'reported-brand', 'Reported Brand', 'https://report.test', '00000000-0000-0000-0000-000000000ee1', 'active', 10);
insert into public.brand_members (brand_id, user_id, role) values
  ('00000000-0000-0000-0000-000000000ee5', '00000000-0000-0000-0000-000000000ee1', 'owner'),
  ('00000000-0000-0000-0000-000000000ee5', '00000000-0000-0000-0000-000000000ee2', 'member');

do $$
declare result jsonb; flag uuid; queue jsonb;
begin
  result := public.report_brand_suspicious_traffic('00000000-0000-0000-0000-000000000ee5', '00000000-0000-0000-0000-000000000ee2', 'Repeated clicks from one source');
  flag := (result->>'flag_id')::uuid;
  assert (result->>'reported')::boolean, 'member report is accepted';
  assert (select subject_type from public.fraud_flags where id = flag) = 'brand', 'report enters brand fraud queue';
  assert (select details->>'latest_reason' from public.fraud_flags where id = flag) = 'Repeated clicks from one source', 'report reason is retained';
  assert (select count(*) from public.audit_log where action = 'brand_traffic_reported' and actor_id = '00000000-0000-0000-0000-000000000ee2') = 1, 'report is audited';
  queue := public.admin_fraud_queue('00000000-0000-0000-0000-000000000ee4');
  assert exists (select 1 from jsonb_array_elements(queue) f where f->>'flag_id' = flag::text and f->'details'->>'brand_name' = 'Reported Brand'), 'admin fraud queue contains brand context';

  begin
    perform public.report_brand_suspicious_traffic('00000000-0000-0000-0000-000000000ee5', '00000000-0000-0000-0000-000000000ee2', 'Another report inside the limit');
    raise exception 'report rate limit was bypassed';
  exception when others then
    assert sqlerrm = 'brand_report_rate_limited', 'same member is rate limited for 24 hours';
  end;
  begin
    perform public.report_brand_suspicious_traffic('00000000-0000-0000-0000-000000000ee5', '00000000-0000-0000-0000-000000000ee3', 'Outsider report should fail');
    raise exception 'non-member report was accepted';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.review_fraud_flag(flag, 'confirm', 'not an earning', '00000000-0000-0000-0000-000000000ee4');
    raise exception 'brand report was treated as an earning reversal';
  exception when others then
    assert sqlerrm = 'subject_not_reviewable', 'brand reports cannot reverse earnings';
  end;
  perform public.review_fraud_flag(flag, 'clear', '', '00000000-0000-0000-0000-000000000ee4');
  assert (select status from public.fraud_flags where id = flag) = 'cleared', 'admin can clear a brand report';
  assert has_function_privilege('service_role', 'public.report_brand_suspicious_traffic(uuid,uuid,text)', 'EXECUTE');
  assert not has_function_privilege('authenticated', 'public.report_brand_suspicious_traffic(uuid,uuid,text)', 'EXECUTE');
end $$;

rollback;
select 'ok: 27_brand_traffic_reports' as result;
