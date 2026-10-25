-- RLS and privilege tests (BUILD.md section 6 "Row-level security summary").
-- Everything runs in one transaction and is rolled back.
begin;

-- Test helpers (rolled back with everything else). Callable by the client roles under test.
create function public.zz_expect_error(q text, code text) returns void language plpgsql as $$
begin
  begin
    execute q;
  exception when others then
    if sqlstate = code then return; end if;
    raise exception 'expected SQLSTATE % but got % (%) for: %', code, sqlstate, sqlerrm, q;
  end;
  raise exception 'expected SQLSTATE % but statement succeeded: %', code, q;
end $$;

create function public.zz_rows(q text) returns bigint language plpgsql as $$
declare n bigint;
begin execute q; get diagnostics n = row_count; return n; end $$;

create function public.zz_count(q text) returns bigint language plpgsql as $$
declare n bigint;
begin execute 'select count(*) from (' || q || ') s' into n; return n; end $$;

grant execute on function public.zz_expect_error(text, text), public.zz_rows(text), public.zz_count(text)
  to anon, authenticated;

-- ------------------------------------------------------------ fixtures (as postgres)
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'owner@test.dev'),
  ('00000000-0000-0000-0000-0000000000a2', 'promoter@test.dev'),
  ('00000000-0000-0000-0000-0000000000a3', 'admin@test.dev');

do $$ begin
  assert (select count(*) from public.profiles
          where id in ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000a2','00000000-0000-0000-0000-0000000000a3')) = 3,
    'new-user trigger should create a profile per auth user';
end $$;

update public.profiles set is_admin = true where id = '00000000-0000-0000-0000-0000000000a3';
update public.profiles set handle = 'promo' where id = '00000000-0000-0000-0000-0000000000a2';

insert into public.brands (id, slug, name, url, owner_id, status, rate_cents, budget_cents, total_paid_cents) values
  ('00000000-0000-0000-0000-0000000000b1', 'rls-active', 'RLS Active', 'https://a.example', '00000000-0000-0000-0000-0000000000a1', 'active', 10, 500, 1000),
  ('00000000-0000-0000-0000-0000000000b2', 'rls-draft',  'RLS Draft',  'https://b.example', '00000000-0000-0000-0000-0000000000a1', 'draft', 10, 0, 0);
insert into public.brand_members (brand_id, user_id, role) values
  ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000a1', 'owner'),
  ('00000000-0000-0000-0000-0000000000b2', '00000000-0000-0000-0000-0000000000a1', 'owner');
insert into public.bids (id, brand_id, payer_id, amount_cents, revenue_cents, budget_cents, processor, processor_payment_id) values
  ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000a1', 1000, 500, 500, 'test', 'pay_rls_1');
insert into public.budget_ledger (brand_id, delta_cents, reason, bid_id) values
  ('00000000-0000-0000-0000-0000000000b1', 500, 'bid', '00000000-0000-0000-0000-0000000000c1');
insert into public.links (id, code, promoter_id, brand_id, channel) values
  ('00000000-0000-0000-0000-0000000000d1', 'RLSTEST1', '00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-0000000000b1', 'x');
insert into public.visitors (id, brand_id) values
  ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000b1');
insert into public.clicks (id, link_id, brand_id, promoter_id, visitor_id, ip_hash, ua_hash) values
  ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000b1',
   '00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-0000000000e1', 'iphash', 'uahash');
insert into public.visitor_keys (brand_id, key_type, key_hash, visitor_id) values
  ('00000000-0000-0000-0000-0000000000b1', 'cookie', 'k1', '00000000-0000-0000-0000-0000000000e1');
insert into public.earnings (id, promoter_id, brand_id, link_id, visitor_id, click_id, amount_cents, cycle_ends_at, funded_at) values
  ('00000000-0000-0000-0000-000000000a01', '00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-0000000000b1',
   '00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000f1', 10, now() + interval '1 day', now());
insert into public.promoter_ledger (promoter_id, delta_cents, reason, earning_id) values
  ('00000000-0000-0000-0000-0000000000a2', 10, 'earning', '00000000-0000-0000-0000-000000000a01');
insert into public.fraud_flags (subject_type, subject_id, rule, score) values
  ('earning', '00000000-0000-0000-0000-000000000a01', 'R1', 40);

-- ------------------------------------------------------------ anon
set local role anon;
do $$ begin
  assert public.zz_count($q$select 1 from public.brands where slug like 'rls-%'$q$) = 1, 'anon should see only the active brand';
  assert public.zz_count('select 1 from public.categories') = 19, 'anon should read categories';
  assert public.zz_count($q$select 1 from public.public_profiles where handle = 'promo'$q$) = 1, 'public_profiles should expose handles';
  perform public.zz_expect_error('select 1 from public.profiles', '42501');
  perform public.zz_expect_error('select 1 from public.bids', '42501');
  perform public.zz_expect_error('select 1 from public.earnings', '42501');
  perform public.zz_expect_error('select 1 from public.clicks', '42501');
  perform public.zz_expect_error('select 1 from public.settings', '42501');
  perform public.zz_expect_error($q$insert into public.brands (slug,name,url,owner_id,rate_cents) values ('x','x','https://x','00000000-0000-0000-0000-0000000000a1',10)$q$, '42501');
  perform public.zz_expect_error($q$update public.brands set description = 'hacked'$q$, '42501');
end $$;

-- ------------------------------------------------------------ promoter (a2)
reset role;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a2","role":"authenticated"}', true);
set local role authenticated;
do $$ begin
  assert public.zz_count('select 1 from public.profiles') = 1, 'promoter sees only their own profile';
  assert public.zz_count('select 1 from public.earnings') = 1, 'promoter sees own earnings';
  assert public.zz_count('select 1 from public.promoter_ledger') = 1, 'promoter sees own ledger';
  assert public.zz_count('select 1 from public.links') = 1, 'promoter sees own links';
  assert public.zz_count($q$select 1 from public.brands where slug like 'rls-%'$q$) = 1, 'promoter sees only the active brand (not the draft)';
  assert public.zz_count('select 1 from public.bids') = 0, 'non-member sees no bids';
  assert public.zz_count('select 1 from public.budget_ledger') = 0, 'non-member sees no budget ledger';
  assert public.zz_count('select 1 from public.brand_members') = 0, 'non-member sees no brand members';
  assert public.zz_count('select 1 from public.settings') = 0, 'non-admin sees no settings';
  assert public.zz_count('select 1 from public.fraud_flags') = 0, 'non-admin sees no fraud flags';
  perform public.zz_expect_error('select 1 from public.clicks', '42501');
  perform public.zz_expect_error('select 1 from public.visitors', '42501');
  perform public.zz_expect_error('select 1 from public.visitor_keys', '42501');
  -- may edit own handle / country / leaderboard flag
  assert public.zz_rows($q$update public.profiles set handle = 'promo2', country = 'IN', leaderboard_public = false$q$) = 1, 'own profile update';
  -- may not touch protected columns
  perform public.zz_expect_error('update public.profiles set trust_score = 100', '42501');
  perform public.zz_expect_error($q$update public.profiles set status = 'active'$q$, '42501');
  perform public.zz_expect_error('update public.profiles set is_admin = true', '42501');
  perform public.zz_expect_error($q$update public.profiles set kyc_status = 'verified'$q$, '42501');
  perform public.zz_expect_error('update public.profiles set promoter_terms_accepted_at = now()', '42501');
  -- may not write other people's brands, or money
  assert public.zz_rows($q$update public.brands set description = 'hacked' where slug = 'rls-active'$q$) = 0, 'non-member cannot edit a brand';
  perform public.zz_expect_error('update public.brands set budget_cents = 999999', '42501');
  perform public.zz_expect_error($q$insert into public.earnings (promoter_id,brand_id,link_id,visitor_id,click_id,amount_cents,cycle_ends_at,funded_at)
    values ('00000000-0000-0000-0000-0000000000a2','00000000-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-0000000000d1',gen_random_uuid(),gen_random_uuid(),10,now(),now())$q$, '42501');
  perform public.zz_expect_error('insert into public.promoter_ledger (promoter_id, delta_cents, reason) values (auth.uid(), 99999, ''earning'')', '42501');
  perform public.zz_expect_error('delete from public.links', '42501');
end $$;

-- ------------------------------------------------------------ brand owner (a1)
reset role;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);
set local role authenticated;
do $$ begin
  assert public.zz_count($q$select 1 from public.brands where slug like 'rls-%'$q$) = 2, 'owner sees active and draft brand';
  assert public.zz_count('select 1 from public.bids') = 1, 'owner sees own bids';
  assert public.zz_count('select 1 from public.budget_ledger') = 1, 'owner sees own budget ledger';
  assert public.zz_count('select 1 from public.earnings') = 0, 'owner is not a promoter';
  assert public.zz_count('select 1 from public.links') = 0, 'owner has no links';
  assert public.zz_rows($q$update public.brands set description = 'new text' where slug = 'rls-active'$q$) = 1, 'owner edits description';
  assert public.zz_rows($q$update public.brands set rate_cents = 25 where slug = 'rls-active'$q$) = 1, 'owner edits rate';
  assert public.zz_rows($q$update public.brands set logo_path = 'logos/x.png' where slug = 'rls-active'$q$) = 1, 'owner edits logo';
  perform public.zz_expect_error('update public.brands set budget_cents = 999999', '42501');
  perform public.zz_expect_error('update public.brands set total_paid_cents = 999999', '42501');
  perform public.zz_expect_error($q$update public.brands set status = 'active'$q$, '42501');
  perform public.zz_expect_error('update public.brands set ads_enabled = true', '42501');
  perform public.zz_expect_error('update public.brands set owner_id = auth.uid()', '42501');
  perform public.zz_expect_error('insert into public.bids (brand_id,payer_id,amount_cents,revenue_cents,budget_cents,processor,processor_payment_id) values (null,null,1,1,0,''x'',''y'')', '42501');
end $$;

-- ------------------------------------------------------------ admin (a3)
reset role;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a3","role":"authenticated"}', true);
set local role authenticated;
do $$ begin
  assert public.zz_count('select 1 from public.profiles') >= 3, 'admin sees all profiles';
  assert public.zz_count('select 1 from public.settings') >= 10, 'admin reads settings';
  assert public.zz_count('select 1 from public.fraud_flags') = 1, 'admin reads fraud flags';
  assert public.zz_count('select 1 from public.earnings') = 1, 'admin reads all earnings';
  assert public.zz_count($q$select 1 from public.brands where slug like 'rls-%'$q$) = 2, 'admin sees all brands';
  perform public.zz_expect_error('select 1 from public.clicks', '42501');           -- admin panel uses the service role
  perform public.zz_expect_error('update public.brands set budget_cents = 1', '42501');
  perform public.zz_expect_error('update public.settings set value = ''1''::jsonb', '42501');
end $$;

reset role;
rollback;
select 'ok: 01_rls' as result;
