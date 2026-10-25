-- P4.2: discovery filters for payable live campaigns and sorts by rate × remaining budget.
begin;
insert into auth.users (id,email) values ('00000000-0000-0000-0000-000000000fc1','discover-owner@test.dev');
insert into public.brands (id,slug,name,url,owner_id,status,rate_cents,budget_cents,ads_enabled) values
 ('00000000-0000-0000-0000-000000000fc2','discover-high-score','High score','https://high.test','00000000-0000-0000-0000-000000000fc1','active',100,10000,true),
 ('00000000-0000-0000-0000-000000000fc3','discover-high-rate','High rate','https://rate.test','00000000-0000-0000-0000-000000000fc1','active',150,500,true),
 ('00000000-0000-0000-0000-000000000fc4','discover-paused','Paused','https://paused.test','00000000-0000-0000-0000-000000000fc1','active',500,10000,false),
 ('00000000-0000-0000-0000-000000000fc5','discover-underfunded','Underfunded','https://under.test','00000000-0000-0000-0000-000000000fc1','active',500,499,true),
 ('00000000-0000-0000-0000-000000000fc6','discover-review','Review','https://review.test','00000000-0000-0000-0000-000000000fc1','pending_review',500,10000,true);
do $$ declare first_row record; second_row record; begin
  select * into first_row from public.discover_brands(10,0) where slug='discover-high-score';
  assert first_row.brand_id='00000000-0000-0000-0000-000000000fc2' and first_row.visitors_left=100, 'funded campaign includes visitor estimate';
  select * into second_row from public.discover_brands(10,0) where slug='discover-high-rate';
  assert second_row.brand_id='00000000-0000-0000-0000-000000000fc3' and first_row.rate_cents::numeric*first_row.remaining_budget_cents > second_row.rate_cents::numeric*second_row.remaining_budget_cents,
    'campaign with greater rate-budget product ranks first';
  assert not exists(select 1 from public.discover_brands(100,0) where slug in ('discover-paused','discover-underfunded','discover-review')), 'paused, underfunded and pending brands are hidden';
  assert has_function_privilege('anon','public.discover_brands(integer,integer)','EXECUTE');
end $$;
rollback;
select 'ok: 31_discover_brands' as result;
