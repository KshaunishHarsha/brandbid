-- BUILD §14 attribution examples: live claims survive a later promoter click; expired claims hand off.
begin;
insert into auth.users(id,email,email_confirmed_at) values
 ('00000000-0000-0000-0000-00000000f610','attribution-owner@test.dev',now()),
 ('00000000-0000-0000-0000-00000000f611','attribution-a@test.dev',now()),
 ('00000000-0000-0000-0000-00000000f612','attribution-b@test.dev',now());
update public.profiles set handle='attribution_a',promoter_terms_accepted_at=now() where id='00000000-0000-0000-0000-00000000f611';
update public.profiles set handle='attribution_b',promoter_terms_accepted_at=now() where id='00000000-0000-0000-0000-00000000f612';
insert into public.brands(id,slug,name,url,owner_id,status,rate_cents,budget_cents,ads_enabled)
values('00000000-0000-0000-0000-00000000f620','attribution-brand','Attribution Brand','https://attribution.test','00000000-0000-0000-0000-00000000f610','active',25,50,true);
insert into public.budget_ledger(brand_id,delta_cents,reason)
values('00000000-0000-0000-0000-00000000f620',50,'bid');
insert into public.links(id,code,promoter_id,brand_id,channel,created_at) values
 ('00000000-0000-0000-0000-00000000f621','AttribA1','00000000-0000-0000-0000-00000000f611','00000000-0000-0000-0000-00000000f620','x',now()-interval '1 day'),
 ('00000000-0000-0000-0000-00000000f622','AttribB1','00000000-0000-0000-0000-00000000f612','00000000-0000-0000-0000-00000000f620','link',now()-interval '1 day');

-- A's claim survives B's later click; qualification of B's click still credits A.
select public.record_click(
 p_click_id=>'00000000-0000-0000-0000-00000000f631',p_link_id=>'00000000-0000-0000-0000-00000000f621',
 p_brand_id=>'00000000-0000-0000-0000-00000000f620',p_promoter_id=>'00000000-0000-0000-0000-00000000f611',
 p_ip_hash=>'ip-a',p_ua_hash=>'ua-a',p_ipua_hash=>'ipua-a',p_rate_limited=>false,
 p_cookie_id=>repeat('1',32),p_cookie_hash=>repeat('a',64));
select public.record_click(
 p_click_id=>'00000000-0000-0000-0000-00000000f632',p_link_id=>'00000000-0000-0000-0000-00000000f622',
 p_brand_id=>'00000000-0000-0000-0000-00000000f620',p_promoter_id=>'00000000-0000-0000-0000-00000000f612',
 p_ip_hash=>'ip-b',p_ua_hash=>'ua-b',p_ipua_hash=>'ipua-b',p_rate_limited=>false,
 p_cookie_id=>repeat('1',32),p_cookie_hash=>repeat('a',64));
update public.clicks set created_at=now()-interval '11 seconds' where id='00000000-0000-0000-0000-00000000f632';
do $$ begin
 assert (select claim_promoter_id from public.visitors where id=(select visitor_id from public.clicks where id='00000000-0000-0000-0000-00000000f632'))='00000000-0000-0000-0000-00000000f611', 'later promoter click does not steal a live attribution claim';
 assert public.qualify_visitor('00000000-0000-0000-0000-00000000f632',null,repeat('1',32),'ip-b','ua-b',10000,1)='qualified';
 assert (select count(*) from public.earnings where click_id='00000000-0000-0000-0000-00000000f632' and promoter_id='00000000-0000-0000-0000-00000000f611' and link_id='00000000-0000-0000-0000-00000000f621')=1, 'qualification on B click pays A under the live claim';
end $$;

-- A qualified visitor cannot earn again after clicking B's link.
select public.record_click(
 p_click_id=>'00000000-0000-0000-0000-00000000f633',p_link_id=>'00000000-0000-0000-0000-00000000f622',
 p_brand_id=>'00000000-0000-0000-0000-00000000f620',p_promoter_id=>'00000000-0000-0000-0000-00000000f612',
 p_ip_hash=>'ip-c',p_ua_hash=>'ua-c',p_ipua_hash=>'ipua-c',p_rate_limited=>false,
 p_cookie_id=>repeat('1',32),p_cookie_hash=>repeat('a',64));
update public.clicks set created_at=now()-interval '11 seconds' where id='00000000-0000-0000-0000-00000000f633';
do $$ begin
 assert public.qualify_visitor('00000000-0000-0000-0000-00000000f633',null,repeat('1',32),'ip-c','ua-c',10000,1)='rejected:already_qualified';
 assert (select count(*) from public.earnings where brand_id='00000000-0000-0000-0000-00000000f620')=1, 'a second promoter cannot earn from an already qualified visitor';
end $$;

-- If A's unqualified claim expires, B's later click takes attribution and pays B.
select public.record_click(
 p_click_id=>'00000000-0000-0000-0000-00000000f634',p_link_id=>'00000000-0000-0000-0000-00000000f621',
 p_brand_id=>'00000000-0000-0000-0000-00000000f620',p_promoter_id=>'00000000-0000-0000-0000-00000000f611',
 p_ip_hash=>'ip-d',p_ua_hash=>'ua-d',p_ipua_hash=>'ipua-d',p_rate_limited=>false,
 p_cookie_id=>repeat('2',32),p_cookie_hash=>repeat('b',64));
update public.visitors set claim_expires_at=now()-interval '1 second' where claim_click_id='00000000-0000-0000-0000-00000000f634';
select public.record_click(
 p_click_id=>'00000000-0000-0000-0000-00000000f635',p_link_id=>'00000000-0000-0000-0000-00000000f622',
 p_brand_id=>'00000000-0000-0000-0000-00000000f620',p_promoter_id=>'00000000-0000-0000-0000-00000000f612',
 p_ip_hash=>'ip-e',p_ua_hash=>'ua-e',p_ipua_hash=>'ipua-e',p_rate_limited=>false,
 p_cookie_id=>repeat('2',32),p_cookie_hash=>repeat('b',64));
update public.clicks set created_at=now()-interval '11 seconds' where id='00000000-0000-0000-0000-00000000f635';
do $$ begin
 assert (select claim_promoter_id from public.visitors where id=(select visitor_id from public.clicks where id='00000000-0000-0000-0000-00000000f635'))='00000000-0000-0000-0000-00000000f612', 'expired unqualified attribution transfers to the next promoter';
 assert public.qualify_visitor('00000000-0000-0000-0000-00000000f635',null,repeat('2',32),'ip-e','ua-e',10000,1)='qualified';
 assert (select count(*) from public.earnings where click_id='00000000-0000-0000-0000-00000000f635' and promoter_id='00000000-0000-0000-0000-00000000f612' and link_id='00000000-0000-0000-0000-00000000f622')=1, 'the new claim receives the earning after expiry';
end $$;

-- A qualifying A click during a budget outage keeps its attribution when a later bid funds the waitlist.
select public.record_click(
 p_click_id=>'00000000-0000-0000-0000-00000000f636',p_link_id=>'00000000-0000-0000-0000-00000000f621',
 p_brand_id=>'00000000-0000-0000-0000-00000000f620',p_promoter_id=>'00000000-0000-0000-0000-00000000f611',
 p_ip_hash=>'ip-f',p_ua_hash=>'ua-f',p_ipua_hash=>'ipua-f',p_rate_limited=>false,
 p_cookie_id=>repeat('3',32),p_cookie_hash=>repeat('c',64));
update public.clicks set created_at=now()-interval '11 seconds' where id='00000000-0000-0000-0000-00000000f636';
do $$ begin
 assert public.qualify_visitor('00000000-0000-0000-0000-00000000f636',null,repeat('3',32),'ip-f','ua-f',10000,1)='waitlisted';
 assert (select count(*) from public.earnings where click_id='00000000-0000-0000-0000-00000000f636' and promoter_id='00000000-0000-0000-0000-00000000f611' and link_id='00000000-0000-0000-0000-00000000f621' and status='waitlisted')=1, 'waitlist keeps the original promoter and link';
end $$;
select public.record_bid('00000000-0000-0000-0000-00000000f620','00000000-0000-0000-0000-00000000f610',1000,'razorpay','pay_attribution_refill');
do $$ begin
 assert (select count(*) from public.earnings where click_id='00000000-0000-0000-0000-00000000f636' and promoter_id='00000000-0000-0000-0000-00000000f611' and link_id='00000000-0000-0000-0000-00000000f621' and status='pending')=1, 'a later budget refill funds the original A attribution';
end $$;

rollback;
select 'ok: 36_attribution_examples' as result;
