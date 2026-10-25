-- P4.1: public leaderboards show settled earnings, use the UTC week, and honor promoter anonymity.
begin;
insert into auth.users (id,email) values
 ('00000000-0000-0000-0000-000000000fa1','board-owner@test.dev'),
 ('00000000-0000-0000-0000-000000000fa2','board-anon@test.dev'),
 ('00000000-0000-0000-0000-000000000fa3','board-pending@test.dev');
update public.profiles set handle='board_owner' where id='00000000-0000-0000-0000-000000000fa1';
update public.profiles set handle='board_anon',leaderboard_public=false where id='00000000-0000-0000-0000-000000000fa2';
update public.profiles set handle='board_pending' where id='00000000-0000-0000-0000-000000000fa3';
insert into public.brands (id,slug,name,url,owner_id,status,rate_cents)
 values ('00000000-0000-0000-0000-000000000fa4','promoter-board-fixture','Promoter Board','https://board.test','00000000-0000-0000-0000-000000000fa1','active',10);
insert into public.links (id,code,promoter_id,brand_id,channel) values
 ('00000000-0000-0000-0000-000000000fa5','board001','00000000-0000-0000-0000-000000000fa1','00000000-0000-0000-0000-000000000fa4','link'),
 ('00000000-0000-0000-0000-000000000fa6','board002','00000000-0000-0000-0000-000000000fa2','00000000-0000-0000-0000-000000000fa4','link'),
 ('00000000-0000-0000-0000-000000000fa7','board003','00000000-0000-0000-0000-000000000fa3','00000000-0000-0000-0000-000000000fa4','link');
insert into public.visitors (id,brand_id) values
 ('00000000-0000-0000-0000-000000000fa8','00000000-0000-0000-0000-000000000fa4'),
 ('00000000-0000-0000-0000-000000000fa9','00000000-0000-0000-0000-000000000fa4'),
 ('00000000-0000-0000-0000-000000000faa','00000000-0000-0000-0000-000000000fa4'),
 ('00000000-0000-0000-0000-000000000fab','00000000-0000-0000-0000-000000000fa4'),
 ('00000000-0000-0000-0000-000000000fac','00000000-0000-0000-0000-000000000fa4');
insert into public.clicks (id,link_id,brand_id,promoter_id,ip_hash,ua_hash) values
 ('00000000-0000-0000-0000-000000000fad','00000000-0000-0000-0000-000000000fa5','00000000-0000-0000-0000-000000000fa4','00000000-0000-0000-0000-000000000fa1','ip-a','ua-a'),
 ('00000000-0000-0000-0000-000000000fae','00000000-0000-0000-0000-000000000fa5','00000000-0000-0000-0000-000000000fa4','00000000-0000-0000-0000-000000000fa1','ip-b','ua-b'),
 ('00000000-0000-0000-0000-000000000faf','00000000-0000-0000-0000-000000000fa6','00000000-0000-0000-0000-000000000fa4','00000000-0000-0000-0000-000000000fa2','ip-c','ua-c'),
 ('00000000-0000-0000-0000-000000000fb0','00000000-0000-0000-0000-000000000fa7','00000000-0000-0000-0000-000000000fa4','00000000-0000-0000-0000-000000000fa3','ip-d','ua-d'),
 ('00000000-0000-0000-0000-000000000fb1','00000000-0000-0000-0000-000000000fa7','00000000-0000-0000-0000-000000000fa4','00000000-0000-0000-0000-000000000fa3','ip-e','ua-e');
insert into public.earnings (promoter_id,brand_id,link_id,visitor_id,click_id,amount_cents,cycle_ends_at,status,funded_at,settled_at) values
 ('00000000-0000-0000-0000-000000000fa1','00000000-0000-0000-0000-000000000fa4','00000000-0000-0000-0000-000000000fa5','00000000-0000-0000-0000-000000000fa8','00000000-0000-0000-0000-000000000fad',50000000,now(), 'available',now()-interval '1 day',date_trunc('week',now() at time zone 'UTC') at time zone 'UTC'+interval '1 day'),
 ('00000000-0000-0000-0000-000000000fa1','00000000-0000-0000-0000-000000000fa4','00000000-0000-0000-0000-000000000fa5','00000000-0000-0000-0000-000000000fa9','00000000-0000-0000-0000-000000000fae',30000000,now(), 'available',now()-interval '14 days',now()-interval '10 days'),
 ('00000000-0000-0000-0000-000000000fa2','00000000-0000-0000-0000-000000000fa4','00000000-0000-0000-0000-000000000fa6','00000000-0000-0000-0000-000000000faa','00000000-0000-0000-0000-000000000faf',90000000,now(), 'available',now()-interval '1 day',date_trunc('week',now() at time zone 'UTC') at time zone 'UTC'+interval '1 day'),
 ('00000000-0000-0000-0000-000000000fa3','00000000-0000-0000-0000-000000000fa4','00000000-0000-0000-0000-000000000fa7','00000000-0000-0000-0000-000000000fab','00000000-0000-0000-0000-000000000fb0',900000000,now(), 'pending',now(),null),
 ('00000000-0000-0000-0000-000000000fa3','00000000-0000-0000-0000-000000000fa4','00000000-0000-0000-0000-000000000fa7','00000000-0000-0000-0000-000000000fac','00000000-0000-0000-0000-000000000fb1',800000000,now(), 'reversed',now()-interval '2 days',now()-interval '1 day');
refresh materialized view public.promoter_leaderboard_all_time;
refresh materialized view public.promoter_leaderboard_week;
do $$ declare a record; w record; begin
  select * into a from public.promoter_leaderboard('all_time',10,0) where board_rank=1;
  assert a.handle='anonymous' and a.earned_cents=90000000 and a.qualified_visitors=1, 'opted-out promoter appears as anonymous with settled earnings';
  select * into a from public.promoter_leaderboard('all_time',10,0) where board_rank=2;
  assert a.handle='board_owner' and a.earned_cents=80000000 and a.qualified_visitors=2, 'all-time includes old and current settled earnings';
  assert not exists(select 1 from public.promoter_leaderboard('all_time',10,0) where handle='board_pending'), 'pending and reversed earnings do not appear';
  select * into w from public.promoter_leaderboard('week',10,0) where board_rank=1;
  assert w.handle='anonymous' and w.earned_cents=90000000, 'weekly board uses the opted-out label';
  select * into w from public.promoter_leaderboard('week',10,0) where board_rank=2;
  assert w.handle='board_owner' and w.earned_cents=50000000, 'weekly totals include only current UTC-week settlements';
  assert not has_table_privilege('anon','public.promoter_leaderboard_all_time','SELECT'), 'raw aggregate view is not public';
  assert has_function_privilege('anon','public.promoter_leaderboard(text,integer,integer)','EXECUTE');
end $$;
rollback;
select 'ok: 30_promoter_leaderboards' as result;
