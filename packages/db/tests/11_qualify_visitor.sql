-- P2.8: qualification gates, consent-safe identity, exact budget reservation and waitlist order.
begin;
insert into auth.users (id, email, email_confirmed_at) values
  ('00000000-0000-0000-0000-0000000000e1', 'owner@qualify.test', now()),
  ('00000000-0000-0000-0000-0000000000e2', 'promoter@qualify.test', now());
update public.profiles set handle = 'qualifier', promoter_terms_accepted_at = now()
  where id = '00000000-0000-0000-0000-0000000000e2';
insert into public.brands (id, slug, name, url, owner_id, status, rate_cents, budget_cents, ads_enabled)
values ('00000000-0000-0000-0000-0000000000e3', 'qualify-brand', 'Qualify Brand', 'https://qualify.test', '00000000-0000-0000-0000-0000000000e1', 'active', 25, 25, true);
insert into public.budget_ledger (brand_id, delta_cents, reason)
values ('00000000-0000-0000-0000-0000000000e3', 25, 'bid');
insert into public.links (id, code, promoter_id, brand_id, channel, created_at)
values ('00000000-0000-0000-0000-0000000000e4', 'Qualify1', '00000000-0000-0000-0000-0000000000e2', '00000000-0000-0000-0000-0000000000e3', 'link', now() - interval '23 hours');

create function public.zz_qualify_click(p_click uuid, p_cookie text, p_ip text, p_ua text, p_age boolean default true, p_ignored boolean default false)
returns uuid language plpgsql as $$
begin
  perform public.record_click(
    p_click_id => p_click,
    p_link_id => '00000000-0000-0000-0000-0000000000e4',
    p_brand_id => '00000000-0000-0000-0000-0000000000e3',
    p_promoter_id => '00000000-0000-0000-0000-0000000000e2',
    p_ip_hash => p_ip, p_ua_hash => p_ua, p_ipua_hash => p_ip || ':' || p_ua,
    p_rate_limited => p_ignored, p_cookie_id => p_cookie,
    p_cookie_hash => case when p_cookie is null then null else 'cookie-hash:' || p_cookie end
  );
  if p_age then update public.clicks set created_at = now() - interval '11 seconds' where id = p_click; end if;
  return p_click;
end $$;

select public.zz_qualify_click('00000000-0000-0000-0000-0000000000f1', 'cookie-f1', 'ip-f1', 'ua-f1');
do $$ begin
  assert public.qualify_visitor('00000000-0000-0000-0000-0000000000f1', repeat('a', 64), 'cookie-f1', 'ip-f1', 'ua-f1', 9999, 1) = 'rejected:invalid_input';
  assert public.qualify_visitor(null, null, null, 'ip', 'ua', 10000, 1) = 'rejected:invalid_input';
  assert public.qualify_visitor('00000000-0000-0000-0000-0000000000fe', null, null, 'ip', 'ua', 10000, 1) = 'rejected:click_not_found';
  assert public.qualify_visitor('00000000-0000-0000-0000-0000000000f1', null, 'cookie-f1', 'wrong-ip', 'ua-f1', 10000, 1) = 'rejected:ipua_mismatch';
  assert public.qualify_visitor('00000000-0000-0000-0000-0000000000f1', null, 'wrong-cookie', 'ip-f1', 'ua-f1', 10000, 1) = 'rejected:cookie_mismatch';
end $$;

select public.zz_qualify_click('00000000-0000-0000-0000-0000000000f2', null, 'ip-f2', 'ua-f2', false);
select public.zz_qualify_click('00000000-0000-0000-0000-0000000000f3', null, 'ip-f3', 'ua-f3', true, true);
select public.zz_qualify_click('00000000-0000-0000-0000-0000000000fa', null, 'ip-fa', 'ua-fa');
set session_replication_role = replica;
update public.clicks set visitor_id = '00000000-0000-0000-0000-0000000000fb' where id = '00000000-0000-0000-0000-0000000000fa';
set session_replication_role = origin;
do $$ begin
  assert public.qualify_visitor('00000000-0000-0000-0000-0000000000f2', null, null, 'ip-f2', 'ua-f2', 10000, 1) = 'rejected:too_soon';
  assert public.qualify_visitor('00000000-0000-0000-0000-0000000000f3', null, null, 'ip-f3', 'ua-f3', 10000, 1) = 'rejected:ignored_click';
  assert public.qualify_visitor('00000000-0000-0000-0000-0000000000fa', null, null, 'ip-fa', 'ua-fa', 10000, 1) = 'rejected:visitor_not_found';
end $$;

-- Exact budget equality funds the visitor and pauses ads; retry and same-device visitor are rejected.
do $$ begin
  assert public.qualify_visitor('00000000-0000-0000-0000-0000000000f1', repeat('a', 64), 'cookie-f1', 'ip-f1', 'ua-f1', 10000, 2) = 'qualified';
  assert public.qualify_visitor('00000000-0000-0000-0000-0000000000f1', repeat('a', 64), 'cookie-f1', 'ip-f1', 'ua-f1', 10000, 2) = 'rejected:already_qualified';
end $$;
select public.zz_qualify_click('00000000-0000-0000-0000-0000000000f4', 'cookie-f4', 'ip-f4', 'ua-f4');
do $$ begin
  assert public.qualify_visitor('00000000-0000-0000-0000-0000000000f4', repeat('a', 64), 'cookie-f4', 'ip-f4', 'ua-f4', 10000, 1) = 'rejected:fingerprint_already_qualified';
end $$;

-- Missing/expired claims and inactive brands cannot create earnings.
select public.zz_qualify_click('00000000-0000-0000-0000-0000000000f5', 'cookie-f5', 'ip-f5', 'ua-f5');
update public.visitors set claim_link_id = null where id = (select visitor_id from public.clicks where id = '00000000-0000-0000-0000-0000000000f5');
select public.zz_qualify_click('00000000-0000-0000-0000-0000000000f6', 'cookie-f6', 'ip-f6', 'ua-f6');
update public.visitors set claim_expires_at = now() - interval '1 second' where id = (select visitor_id from public.clicks where id = '00000000-0000-0000-0000-0000000000f6');
select public.zz_qualify_click('00000000-0000-0000-0000-0000000000f7', 'cookie-f7', 'ip-f7', 'ua-f7');
update public.brands set status = 'removed' where id = '00000000-0000-0000-0000-0000000000e3';
do $$ begin
  assert public.qualify_visitor('00000000-0000-0000-0000-0000000000f5', null, 'cookie-f5', 'ip-f5', 'ua-f5', 10000, 1) = 'rejected:claim_missing';
  assert public.qualify_visitor('00000000-0000-0000-0000-0000000000f6', null, 'cookie-f6', 'ip-f6', 'ua-f6', 10000, 1) = 'rejected:claim_expired';
  assert public.qualify_visitor('00000000-0000-0000-0000-0000000000f7', null, 'cookie-f7', 'ip-f7', 'ua-f7', 10000, 1) = 'rejected:brand_inactive';
end $$;
update public.brands set status = 'active' where id = '00000000-0000-0000-0000-0000000000e3';

-- D36: no budget queues the next qualified visitor; a later funded visitor cannot jump the queue.
select public.zz_qualify_click('00000000-0000-0000-0000-0000000000f8', 'cookie-f8', 'ip-f8', 'ua-f8');
do $$ begin
  assert public.qualify_visitor('00000000-0000-0000-0000-0000000000f8', null, 'cookie-f8', 'ip-f8', 'ua-f8', 10000, 1) = 'waitlisted';
end $$;
update public.brands set budget_cents = 25 where id = '00000000-0000-0000-0000-0000000000e3';
insert into public.budget_ledger (brand_id, delta_cents, reason) values ('00000000-0000-0000-0000-0000000000e3', 25, 'bid');
select public.zz_qualify_click('00000000-0000-0000-0000-0000000000f9', 'cookie-f9', 'ip-f9', 'ua-f9');
do $$ begin
  assert public.qualify_visitor('00000000-0000-0000-0000-0000000000f9', null, 'cookie-f9', 'ip-f9', 'ua-f9', 10000, 1) = 'waitlisted';
  assert (select count(*) from public.earnings where brand_id = '00000000-0000-0000-0000-0000000000e3' and status = 'waitlisted') = 2, 'waitlist is FIFO and no visitor jumps the queue';
  assert (select count(*) from public.earnings where visitor_id = (select visitor_id from public.clicks where id = '00000000-0000-0000-0000-0000000000f1') and status = 'pending') = 1, 'successful visitor has one earning';
  assert (select count(*) from public.budget_ledger where brand_id = '00000000-0000-0000-0000-0000000000e3' and delta_cents < 0) = 1, 'waitlisted earnings reserve no budget';
  assert (select budget_cents from public.brands where id = '00000000-0000-0000-0000-0000000000e3') = 25, 'waitlist head blocks new reservations';
  assert (select ads_enabled from public.brands where id = '00000000-0000-0000-0000-0000000000e3') = false;
  assert exists (select 1 from public.notification_outbox where kind = 'budget_used_up' and recipient_user_id = '00000000-0000-0000-0000-0000000000e1');
  assert (select qualified_ip_hash from public.visitors where id = (select visitor_id from public.clicks where id = '00000000-0000-0000-0000-0000000000f1')) = 'ip-f1';
  assert (select qualified_fp_hash from public.visitors where id = (select visitor_id from public.clicks where id = '00000000-0000-0000-0000-0000000000f1')) = repeat('a', 64);
  assert (select qualified_active_ms from public.visitors where id = (select visitor_id from public.clicks where id = '00000000-0000-0000-0000-0000000000f1')) = 10000;
  assert (select qualified_interactions from public.visitors where id = (select visitor_id from public.clicks where id = '00000000-0000-0000-0000-0000000000f1')) = 2;
  assert (select cycle_ends_at = public.cycle_end(l.created_at, e.funded_at) from public.earnings e join public.links l on l.id = e.link_id where e.visitor_id = (select visitor_id from public.clicks where id = '00000000-0000-0000-0000-0000000000f1'));
  assert (select count(*) from public.qualify_rejections where reason in ('invalid_input','click_not_found','ignored_click','too_soon','ipua_mismatch','cookie_mismatch','visitor_not_found','fingerprint_already_qualified','already_qualified','claim_missing','claim_expired','brand_inactive')) >= 12, 'reject causes are counted without IP or UA';
end $$;

drop function public.zz_qualify_click(uuid, text, text, text, boolean, boolean);
rollback;
select 'ok: 11_qualify_visitor' as result;
