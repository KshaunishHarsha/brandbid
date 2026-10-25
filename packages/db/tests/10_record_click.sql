-- record_click (P2.6): visitors, attribution windows, ignored clicks, and retries.
begin;
truncate table public.profiles, public.brands, public.audit_log, public.notification_outbox, public.member_signals cascade;
delete from auth.users;
insert into auth.users (id, email, email_confirmed_at) values
  ('00000000-0000-0000-0000-0000000000a1', 'owner@click.test', now()),
  ('00000000-0000-0000-0000-0000000000a2', 'promoter1@click.test', now()),
  ('00000000-0000-0000-0000-0000000000a3', 'promoter2@click.test', now()),
  ('00000000-0000-0000-0000-0000000000a4', 'member@click.test', now());
update public.profiles set handle = 'promoter1', promoter_terms_accepted_at = now() where id = '00000000-0000-0000-0000-0000000000a2';
update public.profiles set handle = 'promoter2', promoter_terms_accepted_at = now() where id = '00000000-0000-0000-0000-0000000000a3';
update public.profiles set handle = 'memberone' where id = '00000000-0000-0000-0000-0000000000a4';
insert into public.brands (id, slug, name, url, owner_id, status, rate_cents)
values ('00000000-0000-0000-0000-0000000000b1', 'click-brand', 'Click Brand', 'https://click.example.com', '00000000-0000-0000-0000-0000000000a1', 'active', 25);
insert into public.links (id, code, promoter_id, brand_id, channel) values
  ('00000000-0000-0000-0000-0000000000d1', 'Click001', '00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-0000000000b1', 'x'),
  ('00000000-0000-0000-0000-0000000000d2', 'Click002', '00000000-0000-0000-0000-0000000000a3', '00000000-0000-0000-0000-0000000000b1', 'link');
insert into public.brand_members (brand_id, user_id, role) values
  ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000a4', 'member');

create function public.zz_record_click(
  p_click_id uuid, p_link_id uuid, p_brand_id uuid, p_promoter_id uuid, p_viewer_user_id uuid,
  p_cookie_id text, p_cookie_hash text, p_ip_hash text, p_ua_hash text, p_ipua_hash text,
  p_user_agent text, p_country text, p_referrer text, p_rate_limited boolean
) returns void language plpgsql as $$ begin
  perform public.record_click(
    p_click_id => p_click_id, p_link_id => p_link_id, p_brand_id => p_brand_id, p_promoter_id => p_promoter_id,
    p_ip_hash => p_ip_hash, p_ua_hash => p_ua_hash, p_ipua_hash => p_ipua_hash, p_rate_limited => p_rate_limited,
    p_viewer_user_id => p_viewer_user_id, p_cookie_id => p_cookie_id, p_cookie_hash => p_cookie_hash,
    p_user_agent => p_user_agent, p_country => p_country, p_referrer => p_referrer
  );
end $$;

-- First click claims; a later promoter does not steal a live attribution.
select public.zz_record_click('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000a2', null, 'cookie-1', 'cookie-hash-1', 'ip-1', 'ua-1', 'ipua-1', 'Mozilla/5.0', 'US', null, false);
-- Two days into the default seven-day claim, five days remain; a second promoter click must keep A's claim.
update public.visitors set claim_expires_at = now() + interval '5 days'
where claim_click_id = '00000000-0000-0000-0000-0000000000c1';
select public.zz_record_click('00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-0000000000d2', '00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000a3', null, 'cookie-1', 'cookie-hash-1', 'ip-2', 'ua-2', 'ipua-2', 'Mozilla/5.0', 'US', null, false);
do $$
declare v public.visitors;
begin
  select * into v from public.visitors where brand_id = '00000000-0000-0000-0000-0000000000b1';
  assert (select count(*) from public.visitors where brand_id = v.brand_id) = 1, 'same cookie maps to one visitor';
  assert v.claim_promoter_id = '00000000-0000-0000-0000-0000000000a2' and v.claim_rate_cents = 25, 'first promoter keeps live claim and rate';
  assert (select count(*) from public.clicks where visitor_id = v.id) = 2, 'both clicks share visitor';
end $$;

-- IP+UA fallback matches when a cookie is unavailable; retrying a click id is idempotent.
select public.zz_record_click('00000000-0000-0000-0000-0000000000c3', '00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000a2', null, null, null, 'ip-3', 'ua-3', 'ipua-3', 'Mozilla/5.0', 'IN', null, false);
select public.zz_record_click('00000000-0000-0000-0000-0000000000c4', '00000000-0000-0000-0000-0000000000d2', '00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000a3', null, null, null, 'ip-4', 'ua-4', 'ipua-3', 'Mozilla/5.0', 'IN', null, false);
select public.zz_record_click('00000000-0000-0000-0000-0000000000c4', '00000000-0000-0000-0000-0000000000d2', '00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000a3', null, null, null, 'ip-4', 'ua-4', 'ipua-3', 'Mozilla/5.0', 'IN', null, false);
do $$ begin
  assert (select count(*) from public.clicks where id = '00000000-0000-0000-0000-0000000000c4') = 1, 'click id retry creates one row';
  assert (select count(*) from public.visitors where brand_id = '00000000-0000-0000-0000-0000000000b1') = 2, 'IPUA key reuses a visitor';
end $$;

-- An expired, unqualified claim can be replaced; a qualified visitor keeps its claim.
update public.visitors set claim_expires_at = now() - interval '1 second' where claim_click_id = '00000000-0000-0000-0000-0000000000c3';
select public.zz_record_click('00000000-0000-0000-0000-0000000000c5', '00000000-0000-0000-0000-0000000000d2', '00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000a3', null, null, null, 'ip-5', 'ua-5', 'ipua-3', 'Mozilla/5.0', 'IN', null, false);
update public.visitors set qualified_at = now(), claim_expires_at = now() - interval '1 second' where claim_click_id = '00000000-0000-0000-0000-0000000000c5';
select public.zz_record_click('00000000-0000-0000-0000-0000000000c6', '00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000a2', null, null, null, 'ip-6', 'ua-6', 'ipua-3', 'Mozilla/5.0', 'IN', null, false);
do $$ begin
  assert (select claim_promoter_id from public.visitors where claim_click_id = '00000000-0000-0000-0000-0000000000c5') = '00000000-0000-0000-0000-0000000000a3', 'expired unqualified claim is replaced';
  assert (select claim_click_id from public.visitors where qualified_at is not null) = '00000000-0000-0000-0000-0000000000c5', 'qualified claim is preserved';
end $$;

-- Self, brand-member, inactive-promoter, and rate-limited requests create ignored clicks without visitors.
select public.zz_record_click('00000000-0000-0000-0000-0000000000c7', '00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-0000000000a2', null, null, 'self-ip', 'self-ua', 'self-ipua', 'Mozilla/5.0', 'US', null, false);
select public.zz_record_click('00000000-0000-0000-0000-0000000000c8', '00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-0000000000a4', null, null, 'member-ip', 'member-ua', 'member-ipua', 'Mozilla/5.0', 'US', null, false);
update public.profiles set status = 'suspended' where id = '00000000-0000-0000-0000-0000000000a3';
select public.zz_record_click('00000000-0000-0000-0000-0000000000c9', '00000000-0000-0000-0000-0000000000d2', '00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000a3', null, null, null, 'banned-ip', 'banned-ua', 'banned-ipua', 'Mozilla/5.0', 'US', null, false);
select public.zz_record_click('00000000-0000-0000-0000-0000000000ca', '00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000a2', null, null, null, 'limited-ip', 'limited-ua', 'limited-ipua', 'Mozilla/5.0', 'US', null, true);
do $$ begin
  assert (select ignored_reason from public.clicks where id = '00000000-0000-0000-0000-0000000000c7') = 'self', 'self click ignored';
  assert (select ignored_reason from public.clicks where id = '00000000-0000-0000-0000-0000000000c8') = 'brand_member', 'member click ignored';
  assert (select ignored_reason from public.clicks where id = '00000000-0000-0000-0000-0000000000c9') = 'banned_promoter', 'inactive promoter click ignored';
  assert (select ignored_reason from public.clicks where id = '00000000-0000-0000-0000-0000000000ca') = 'rate_limited', 'rate-limited click ignored';
  assert (select visitor_id from public.clicks where id in ('00000000-0000-0000-0000-0000000000c7', '00000000-0000-0000-0000-0000000000c8', '00000000-0000-0000-0000-0000000000c9', '00000000-0000-0000-0000-0000000000ca') and visitor_id is not null limit 1) is null, 'ignored requests create no visitors';
end $$;
rollback;
select 'ok: 10_record_click' as result;
