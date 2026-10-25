-- P4.3: brand promoter boards show settled brand-specific earnings and honor opt-out.
begin;
insert into auth.users (id,email) values
 ('00000000-0000-0000-0000-000000000fd1','top-owner@test.dev'),
 ('00000000-0000-0000-0000-000000000fd2','top-visible@test.dev'),
 ('00000000-0000-0000-0000-000000000fd3','top-anon@test.dev'),
 ('00000000-0000-0000-0000-000000000fd4','top-pending@test.dev');
update public.profiles set handle='top_owner' where id='00000000-0000-0000-0000-000000000fd1';
update public.profiles set handle='top_visible' where id='00000000-0000-0000-0000-000000000fd2';
update public.profiles set handle='top_anon',leaderboard_public=false where id='00000000-0000-0000-0000-000000000fd3';
update public.profiles set handle='top_pending' where id='00000000-0000-0000-0000-000000000fd4';
insert into public.brands (id,slug,name,url,owner_id,status,rate_cents)
values ('00000000-0000-0000-0000-000000000fd5','top-brand-fixture','Top Brand','https://top.test','00000000-0000-0000-0000-000000000fd1','active',10);
insert into public.links (id,code,promoter_id,brand_id,channel) values
 ('00000000-0000-0000-0000-000000000fd6','top0001a','00000000-0000-0000-0000-000000000fd2','00000000-0000-0000-0000-000000000fd5','link'),
 ('00000000-0000-0000-0000-000000000fd7','top0001b','00000000-0000-0000-0000-000000000fd3','00000000-0000-0000-0000-000000000fd5','link'),
 ('00000000-0000-0000-0000-000000000fd8','top0001c','00000000-0000-0000-0000-000000000fd4','00000000-0000-0000-0000-000000000fd5','link');
insert into public.visitors (id,brand_id) values
 ('00000000-0000-0000-0000-000000000fd9','00000000-0000-0000-0000-000000000fd5'),
 ('00000000-0000-0000-0000-000000000fda','00000000-0000-0000-0000-000000000fd5'),
 ('00000000-0000-0000-0000-000000000fdb','00000000-0000-0000-0000-000000000fd5');
insert into public.clicks (id,link_id,brand_id,promoter_id,ip_hash,ua_hash) values
 ('00000000-0000-0000-0000-000000000fdc','00000000-0000-0000-0000-000000000fd6','00000000-0000-0000-0000-000000000fd5','00000000-0000-0000-0000-000000000fd2','top-ip-a','top-ua-a'),
 ('00000000-0000-0000-0000-000000000fdd','00000000-0000-0000-0000-000000000fd7','00000000-0000-0000-0000-000000000fd5','00000000-0000-0000-0000-000000000fd3','top-ip-b','top-ua-b'),
 ('00000000-0000-0000-0000-000000000fde','00000000-0000-0000-0000-000000000fd8','00000000-0000-0000-0000-000000000fd5','00000000-0000-0000-0000-000000000fd4','top-ip-c','top-ua-c');
insert into public.earnings (promoter_id,brand_id,link_id,visitor_id,click_id,amount_cents,cycle_ends_at,status,funded_at,settled_at) values
 ('00000000-0000-0000-0000-000000000fd2','00000000-0000-0000-0000-000000000fd5','00000000-0000-0000-0000-000000000fd6','00000000-0000-0000-0000-000000000fd9','00000000-0000-0000-0000-000000000fdc',50000000,now(),'available',now(),now()),
 ('00000000-0000-0000-0000-000000000fd3','00000000-0000-0000-0000-000000000fd5','00000000-0000-0000-0000-000000000fd7','00000000-0000-0000-0000-000000000fda','00000000-0000-0000-0000-000000000fdd',80000000,now(),'available',now(),now()),
 ('00000000-0000-0000-0000-000000000fd4','00000000-0000-0000-0000-000000000fd5','00000000-0000-0000-0000-000000000fd8','00000000-0000-0000-0000-000000000fdb','00000000-0000-0000-0000-000000000fde',900000000,now(),'pending',now(),null);
do $$ declare r record; begin
  select * into r from public.top_promoters_for_brand('00000000-0000-0000-0000-000000000fd5',10) where board_rank=1;
  assert r.handle is null and r.is_anonymous and r.earned_cents=80000000, 'opted-out promoter appears without a handle';
  select * into r from public.top_promoters_for_brand('00000000-0000-0000-0000-000000000fd5',10) where board_rank=2;
  assert r.handle='top_visible' and not r.is_anonymous and r.earned_cents=50000000, 'visible promoter is ranked by settled brand earnings';
  assert not exists(select 1 from public.top_promoters_for_brand('00000000-0000-0000-0000-000000000fd5',10) where handle='top_pending'), 'pending earnings are excluded';
  assert not exists(select 1 from public.top_promoters_for_brand('ffffffff-ffff-4fff-8fff-ffffffffffff',10)), 'unknown brand yields no rows';
  assert has_function_privilege('anon','public.top_promoters_for_brand(uuid,integer)','EXECUTE');
end $$;
rollback;
select 'ok: 32_top_promoters_by_brand' as result;
