-- brand_budget_summary (P1.10): the dashboard's budget numbers come straight from the ledger.
begin;

-- Hermetic: start from an empty database for this test only. TRUNCATE and DELETE are transactional, so the rollback at
-- the end puts every real row back untouched. Seed data (settings, categories) is left alone.
truncate table public.profiles, public.brands, public.audit_log, public.notification_outbox, public.member_signals cascade;
delete from auth.users;

insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000a1', 'owner@test.dev'), ('00000000-0000-0000-0000-0000000000a2', 'promoter@test.dev');
insert into public.brands (id, slug, name, url, owner_id, status, rate_cents) values
  ('00000000-0000-0000-0000-0000000000b1', 'dash-one', 'One', 'https://one.example.com', '00000000-0000-0000-0000-0000000000a1', 'active', 10),
  ('00000000-0000-0000-0000-0000000000b2', 'dash-new', 'New', 'https://new.example.com', '00000000-0000-0000-0000-0000000000a1', 'draft', 25);
insert into public.links (id, code, promoter_id, brand_id, channel) values
  ('00000000-0000-0000-0000-0000000000d1', 'DASHLINK', '00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-0000000000b1', 'x');

-- a brand with nothing yet
do $$
declare r record;
begin
  select * into r from public.brand_budget_summary('00000000-0000-0000-0000-0000000000b2');
  assert r.remaining_cents = 0 and r.added_cents = 0 and r.spent_cents = 0 and r.refunded_cents = 0, 'a new brand has nothing';
  assert r.waitlisted_cents = 0 and r.waitlisted_count = 0 and r.rate_cents = 25 and r.visitors_left = 0, 'and nobody waiting';
  assert not exists (select 1 from public.brand_budget_summary('00000000-0000-0000-0000-0000000000ff')), 'an unknown brand returns no row';
end $$;

-- real history: two bids (budget 500 + 1000), 3 visitors paid out of the budget, 2 waiting, one reversal, one refund
select public.record_bid('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000a1', 1000, 'razorpay', 'pay_d1');
select public.record_bid('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000a1', 2000, 'razorpay', 'pay_d2');

create function public.zz_waitlisted() returns void language plpgsql as $$
declare v uuid := gen_random_uuid();
begin
  insert into public.visitors (id, brand_id) values (v, '00000000-0000-0000-0000-0000000000b1');
  insert into public.earnings (promoter_id, brand_id, link_id, visitor_id, click_id, amount_cents, status)
  values ('00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000d1', v, gen_random_uuid(), 10, 'waitlisted');
end $$;

do $$
declare r record; b uuid := '00000000-0000-0000-0000-0000000000b1';
begin
  -- three waitlisted visitors get paid from the budget by fund_waitlist (-30)
  perform public.zz_waitlisted(); perform public.zz_waitlisted(); perform public.zz_waitlisted();
  assert public.fund_waitlist(b) = 3;
  -- two more are still waiting (don't fund them)
  perform public.zz_waitlisted(); perform public.zz_waitlisted();
  -- a fraud reversal returned 10; a stagnation refund returned 100
  insert into public.budget_ledger (brand_id, delta_cents, reason) values (b, 10, 'reversal'), (b, -100, 'refund');
  update public.brands set budget_cents = budget_cents + 10 - 100 where id = b;

  select * into r from public.brand_budget_summary(b);
  assert r.added_cents = 1500, 'added = 500 + 1000: ' || r.added_cents;
  assert r.spent_cents = 20, 'spent = 30 paid - 10 returned by the reversal: ' || r.spent_cents;
  assert r.refunded_cents = 100, 'refunded: ' || r.refunded_cents;
  assert r.waitlisted_cents = 20 and r.waitlisted_count = 2, 'owed to the 2 still waiting';
  assert r.remaining_cents = 1380, 'remaining: ' || r.remaining_cents;
  assert r.remaining_cents = r.added_cents - r.spent_cents - r.refunded_cents, 'the ledger identity holds: remaining = added - spent - refunded';
  assert r.rate_cents = 10 and r.visitors_left = 138, 'visitors left = 1380 / 10';
  assert r.remaining_cents = (select budget_cents from public.brands where id = b), 'and it equals the cached budget';

  -- only waitlisted visitors count as owed (not pending, expired or reversed ones)
  update public.earnings set status = 'expired' where id = (select id from public.earnings where brand_id = b and status = 'waitlisted' limit 1);
  select * into r from public.brand_budget_summary(b);
  assert r.waitlisted_cents = 10 and r.waitlisted_count = 1, 'an expired waitlist entry is no longer owed';

  -- the rate changes visitors_left but not the money
  update public.brands set rate_cents = 25 where id = b;
  select * into r from public.brand_budget_summary(b);
  assert r.visitors_left = 55 and r.remaining_cents = 1380, '1380 / 25 = 55 whole visitors';
end $$;

-- another brand's ledger never leaks in
do $$
declare r record;
begin
  perform public.record_bid('00000000-0000-0000-0000-0000000000b2', '00000000-0000-0000-0000-0000000000a1', 4000, 'razorpay', 'pay_d3');
  select * into r from public.brand_budget_summary('00000000-0000-0000-0000-0000000000b2');
  assert r.added_cents = 2000 and r.remaining_cents = 2000, 'its own bid only';
  assert (select added_cents from public.brand_budget_summary('00000000-0000-0000-0000-0000000000b1')) = 1500, 'and the first brand is unchanged';
end $$;

rollback;
select 'ok: 07_brand_dashboard' as result;
