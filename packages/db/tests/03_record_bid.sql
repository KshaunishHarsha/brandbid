-- record_bid, fund_waitlist and cycle_end (BUILD s7, s8, s15; D36).
begin;

-- Hermetic: start from an empty database for this test only. TRUNCATE and DELETE are transactional, so the rollback at
-- the end puts every real row back untouched. Seed data (settings, categories) is left alone.
truncate table public.profiles, public.brands, public.audit_log, public.notification_outbox, public.member_signals cascade;
delete from auth.users;


create function public.zz_expect_error(q text, msg text) returns void language plpgsql as $$
begin
  begin
    execute q;
  exception when others then
    if sqlerrm = msg then return; end if;
    raise exception 'expected error "%" but got "%" for: %', msg, sqlerrm, q;
  end;
  raise exception 'expected error "%" but statement succeeded: %', msg, q;
end $$;

-- Invariant from BUILD s7 rule 2: cached budget equals the ledger sum.
create function public.zz_ledger_ok(p_brand uuid) returns boolean language sql as $$
  select (select budget_cents from public.brands where id = p_brand)
       = coalesce((select sum(delta_cents) from public.budget_ledger where brand_id = p_brand), 0)
$$;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'owner@test.dev'),
  ('00000000-0000-0000-0000-0000000000a2', 'promoter@test.dev'),
  ('00000000-0000-0000-0000-0000000000a3', 'owner2@test.dev');

-- ================================================================ cycle_end
do $$
declare t timestamptz := '2026-01-01 10:00:00+00';
begin
  assert public.cycle_end(t, t)                           = t + interval '24 hours', 'at creation -> first cycle end';
  assert public.cycle_end(t, t + interval '23 hours 59 minutes 59 seconds') = t + interval '24 hours', 'just before the boundary';
  assert public.cycle_end(t, t + interval '24 hours')     = t + interval '48 hours', 'exactly on the boundary -> next cycle';
  assert public.cycle_end(t, t + interval '36 hours')     = t + interval '48 hours', 'mid second cycle';
  assert public.cycle_end(t, t + interval '10 days 1 second') = t + interval '11 days', 'far later';
end $$;

-- ================================================================ record_bid: happy path
insert into public.brands (id, slug, name, url, owner_id, rate_cents) values
  ('00000000-0000-0000-0000-0000000000b1', 'bid-one', 'One', 'https://one.example', '00000000-0000-0000-0000-0000000000a1', 10);

do $$
declare r jsonb; b public.brands; n_before int; n_after int;
begin
  r := public.record_bid('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000a1', 1000, 'razorpay', 'pay_1', 'a@b.c', 'fp1');
  assert (r->>'created')::boolean, 'first call creates';
  assert (r->>'budget_cents')::bigint = 500 and (r->>'revenue_cents')::bigint = 500, 'split 50/50';
  select * into b from public.brands where id = '00000000-0000-0000-0000-0000000000b1';
  assert b.total_paid_cents = 1000, 'total_paid';
  assert b.budget_cents = 500, 'budget';
  assert b.status = 'pending_review', 'draft -> pending_review on first bid';
  assert b.total_reached_at is not null, 'rank tie-break stamped';
  assert b.ads_enabled, 'ads on once budget >= rate';
  assert public.zz_ledger_ok(b.id), 'ledger == budget';
  assert (select count(*) from public.budget_ledger where brand_id = b.id and reason = 'bid' and delta_cents = 500) = 1;
  assert (select payer_email from public.bids where processor_payment_id = 'pay_1') = 'a@b.c', 'payer email saved';
  assert (select payment_fingerprint from public.bids where processor_payment_id = 'pay_1') = 'fp1', 'fingerprint saved';

  -- idempotent: same payment id again changes nothing
  select count(*) into n_before from public.bids;
  r := public.record_bid('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000a1', 1000, 'razorpay', 'pay_1');
  select count(*) into n_after from public.bids;
  assert not (r->>'created')::boolean, 'replay returns created=false';
  assert n_before = n_after, 'replay inserts no bid';
  select * into b from public.brands where id = '00000000-0000-0000-0000-0000000000b1';
  assert b.total_paid_cents = 1000 and b.budget_cents = 500, 'replay moves no money';
  assert public.zz_ledger_ok(b.id);
end $$;

-- ================================================================ rounding and settings
do $$
declare r jsonb;
begin
  r := public.record_bid('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000a1', 1001, 'razorpay', 'pay_odd');
  assert (r->>'budget_cents')::bigint = 500 and (r->>'revenue_cents')::bigint = 501, 'odd cent goes to revenue (floor budget)';

  update public.settings set value = '3333' where key = 'budget_share_bps';
  r := public.record_bid('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000a1', 1000, 'razorpay', 'pay_share');
  assert (r->>'budget_cents')::bigint = 333 and (r->>'revenue_cents')::bigint = 667, 'split follows the setting';
  update public.settings set value = '5000' where key = 'budget_share_bps';

  update public.settings set value = '0' where key = 'budget_share_bps';
  r := public.record_bid('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000a1', 1000, 'razorpay', 'pay_zero_share');
  assert (r->>'budget_cents')::bigint = 0, '0% share gives no budget';
  assert (select count(*) from public.budget_ledger where bid_id = (r->>'bid_id')::uuid) = 0, 'no zero-delta ledger row';
  update public.settings set value = '5000' where key = 'budget_share_bps';

  assert public.zz_ledger_ok('00000000-0000-0000-0000-0000000000b1');
  -- the bid rows themselves always sum correctly
  assert (select count(*) from public.bids where revenue_cents + budget_cents <> amount_cents) = 0;
end $$;

-- ================================================================ rejections
insert into public.brands (id, slug, name, url, owner_id, rate_cents, status) values
  ('00000000-0000-0000-0000-0000000000b2', 'bid-rejected', 'R', 'https://r.example', '00000000-0000-0000-0000-0000000000a1', 10, 'rejected'),
  ('00000000-0000-0000-0000-0000000000b3', 'bid-removed',  'M', 'https://m.example', '00000000-0000-0000-0000-0000000000a1', 10, 'removed');
do $$ begin
  perform public.zz_expect_error($q$select public.record_bid('00000000-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-0000000000a1',999,'razorpay','pay_low')$q$, 'bid_below_minimum');
  perform public.zz_expect_error($q$select public.record_bid('00000000-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-0000000000a1',0,'razorpay','pay_zero')$q$, 'bid_below_minimum');
  perform public.zz_expect_error($q$select public.record_bid('00000000-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-0000000000a1',-500,'razorpay','pay_neg')$q$, 'bid_below_minimum');
  perform public.zz_expect_error($q$select public.record_bid('00000000-0000-0000-0000-0000000000ff','00000000-0000-0000-0000-0000000000a1',1000,'razorpay','pay_nobrand')$q$, 'brand_not_found');
  perform public.zz_expect_error($q$select public.record_bid('00000000-0000-0000-0000-0000000000b2','00000000-0000-0000-0000-0000000000a1',1000,'razorpay','pay_rej')$q$, 'brand_not_payable');
  perform public.zz_expect_error($q$select public.record_bid('00000000-0000-0000-0000-0000000000b3','00000000-0000-0000-0000-0000000000a1',1000,'razorpay','pay_rem')$q$, 'brand_not_payable');
  -- failed calls leave nothing behind
  assert (select count(*) from public.bids where processor_payment_id in ('pay_low','pay_zero','pay_neg','pay_nobrand','pay_rej','pay_rem')) = 0;
  -- ...but an already-recorded payment still replays cleanly even after its brand is later rejected
  update public.brands set status = 'rejected' where id = '00000000-0000-0000-0000-0000000000b1';
  assert not (public.record_bid('00000000-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-0000000000a1',1000,'razorpay','pay_1')->>'created')::boolean;
  update public.brands set status = 'active' where id = '00000000-0000-0000-0000-0000000000b1';
end $$;

-- ================================================================ ads_enabled follows budget vs rate
insert into public.brands (id, slug, name, url, owner_id, rate_cents) values
  ('00000000-0000-0000-0000-0000000000b4', 'bid-highrate', 'H', 'https://h.example', '00000000-0000-0000-0000-0000000000a1', 600);
do $$ begin
  perform public.record_bid('00000000-0000-0000-0000-0000000000b4','00000000-0000-0000-0000-0000000000a1',1000,'razorpay','pay_hr');  -- budget 500 < rate 600
  assert not (select ads_enabled from public.brands where id = '00000000-0000-0000-0000-0000000000b4'), 'budget below rate keeps ads off';
  perform public.record_bid('00000000-0000-0000-0000-0000000000b4','00000000-0000-0000-0000-0000000000a1',1000,'razorpay','pay_hr2'); -- budget 1000 >= 600
  assert (select ads_enabled from public.brands where id = '00000000-0000-0000-0000-0000000000b4'), 'enough budget turns ads on';
end $$;

-- ================================================================ rerank: tie-break and outbid notices
-- Take the earlier test brands off the board so only the rank-* brands matter here.
update public.brands set status = 'removed' where slug in ('bid-one', 'bid-highrate');
insert into public.brands (id, slug, name, url, owner_id, rate_cents, status, total_paid_cents, total_reached_at) values
  ('00000000-0000-0000-0000-0000000000c1', 'rank-top',    'Top',    'https://t.example',  '00000000-0000-0000-0000-0000000000a3', 10, 'active', 9000, now() - interval '5 days'),
  ('00000000-0000-0000-0000-0000000000c2', 'rank-mid',    'Mid',    'https://m2.example', '00000000-0000-0000-0000-0000000000a3', 10, 'active', 5000, now() - interval '4 days'),
  ('00000000-0000-0000-0000-0000000000c3', 'rank-low',    'Low',    'https://l.example',  '00000000-0000-0000-0000-0000000000a3', 10, 'active', 2000, now() - interval '3 days'),
  ('00000000-0000-0000-0000-0000000000c4', 'rank-climber','Climb',  'https://c.example',  '00000000-0000-0000-0000-0000000000a1', 10, 'active', 1000, now() - interval '2 days');
do $$
declare before_reached timestamptz; after_reached timestamptz;
begin
  select total_reached_at into before_reached from public.brands where id = '00000000-0000-0000-0000-0000000000c4';
  -- climber bids 4500: 1000 -> 5500. Overtakes mid (5000) and low (2000); not top (9000).
  perform public.record_bid('00000000-0000-0000-0000-0000000000c4','00000000-0000-0000-0000-0000000000a1',4500,'razorpay','pay_climb');
  assert (select total_paid_cents from public.brands where id = '00000000-0000-0000-0000-0000000000c4') = 5500;
  select total_reached_at into after_reached from public.brands where id = '00000000-0000-0000-0000-0000000000c4';
  assert after_reached > before_reached, 'total_reached_at advances on every bid';
  assert (select status from public.brands where id = '00000000-0000-0000-0000-0000000000c4') = 'active', 'active brand stays active';

  assert (select count(*) from public.notification_outbox where kind = 'outbid') = 2, 'two brands overtaken';
  assert exists (select 1 from public.notification_outbox where kind = 'outbid' and (payload->>'brand_id')::uuid = '00000000-0000-0000-0000-0000000000c2'), 'mid notified';
  assert exists (select 1 from public.notification_outbox where kind = 'outbid' and (payload->>'brand_id')::uuid = '00000000-0000-0000-0000-0000000000c3'), 'low notified';
  assert not exists (select 1 from public.notification_outbox where kind = 'outbid' and (payload->>'brand_id')::uuid = '00000000-0000-0000-0000-0000000000c1'), 'top not notified';
  assert (select count(*) from public.notification_outbox where kind = 'outbid' and recipient_user_id = '00000000-0000-0000-0000-0000000000a3') = 2, 'sent to the owner';

  -- a brand's first bid (draft -> pending) overtakes nobody because it is not on the board yet
  insert into public.brands (id, slug, name, url, owner_id, rate_cents) values
    ('00000000-0000-0000-0000-0000000000c5', 'rank-new', 'New', 'https://n.example', '00000000-0000-0000-0000-0000000000a1', 10);
  perform public.record_bid('00000000-0000-0000-0000-0000000000c5','00000000-0000-0000-0000-0000000000a1',50000,'razorpay','pay_new');
  assert (select count(*) from public.notification_outbox where kind = 'outbid') = 2, 'no outbid notices for an unranked brand';
end $$;

-- ================================================================ fund_waitlist
insert into public.brands (id, slug, name, url, owner_id, rate_cents, status, budget_cents, ads_enabled) values
  ('00000000-0000-0000-0000-0000000000d1', 'wl-one', 'WL', 'https://w.example', '00000000-0000-0000-0000-0000000000a1', 10, 'active', 0, false);
insert into public.links (id, code, promoter_id, brand_id, channel, created_at) values
  ('00000000-0000-0000-0000-0000000000e1', 'WLLINK01', '00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-0000000000d1', 'x', now() - interval '36 hours');

-- helper: add a waitlisted earning with an explicit age
create function public.zz_waitlist(p_n int, p_amount bigint, p_age interval) returns uuid language plpgsql as $$
declare v uuid := gen_random_uuid(); e uuid := gen_random_uuid();
begin
  insert into public.visitors (id, brand_id) values (v, '00000000-0000-0000-0000-0000000000d1');
  insert into public.earnings (id, promoter_id, brand_id, link_id, visitor_id, click_id, amount_cents, status, created_at)
  values (e, '00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-0000000000d1',
          '00000000-0000-0000-0000-0000000000e1', v, gen_random_uuid(), p_amount, 'waitlisted', now() - p_age);
  return e;
end $$;

do $$
declare e1 uuid; e2 uuid; e3 uuid; n int;
begin
  -- nothing waitlisted: no-op
  assert public.fund_waitlist('00000000-0000-0000-0000-0000000000d1') = 0;

  -- strict order: 10 (oldest), 50, 10 (newest); budget 20. Funds the first, stops at the 50.
  e1 := public.zz_waitlist(1, 10, interval '3 hours');
  e2 := public.zz_waitlist(2, 50, interval '2 hours');
  e3 := public.zz_waitlist(3, 10, interval '1 hour');
  update public.brands set budget_cents = 20 where id = '00000000-0000-0000-0000-0000000000d1';
  insert into public.budget_ledger (brand_id, delta_cents, reason) values ('00000000-0000-0000-0000-0000000000d1', 20, 'bid');

  n := public.fund_waitlist('00000000-0000-0000-0000-0000000000d1');
  assert n = 1, 'only the head fits';
  assert (select status from public.earnings where id = e1) = 'pending', 'oldest funded';
  assert (select status from public.earnings where id = e2) = 'waitlisted', 'the 50 does not fit and blocks the line';
  assert (select status from public.earnings where id = e3) = 'waitlisted', 'later cheaper entry does NOT jump the queue';
  assert (select budget_cents from public.brands where id = '00000000-0000-0000-0000-0000000000d1') = 10, 'budget reduced by 10';
  assert not (select ads_enabled from public.brands where id = '00000000-0000-0000-0000-0000000000d1'), 'ads stay off while a waitlist remains';
  assert (select last_spend_at from public.brands where id = '00000000-0000-0000-0000-0000000000d1') is not null, 'last_spend_at set';
  assert public.zz_ledger_ok('00000000-0000-0000-0000-0000000000d1'), 'ledger == budget';

  -- funded earning: right fields, and settles at the end of its funding cycle (link is 36h old -> ends at +48h)
  assert (select funded_at from public.earnings where id = e1) is not null;
  assert (select cycle_ends_at from public.earnings where id = e1)
       = (select created_at + interval '48 hours' from public.links where id = '00000000-0000-0000-0000-0000000000e1'), 'cycle end from the funding moment';
  assert (select count(*) from public.budget_ledger where earning_id = e1 and delta_cents = -10 and reason = 'visitor') = 1, 'one visitor ledger row';
  assert (select count(*) from public.budget_ledger where earning_id in (e2, e3)) = 0, 'no ledger rows for waitlisted';

  -- running again with the same budget changes nothing
  assert public.fund_waitlist('00000000-0000-0000-0000-0000000000d1') = 0, 'idempotent';

  -- a bid arrives (budget +500): pays the 50 then the 10, in order, and turns ads back on
  perform public.record_bid('00000000-0000-0000-0000-0000000000d1','00000000-0000-0000-0000-0000000000a1',1000,'razorpay','pay_wl');
  assert (select status from public.earnings where id = e2) = 'pending' and (select status from public.earnings where id = e3) = 'pending', 'a bid pays the waitlist';
  assert (select budget_cents from public.brands where id = '00000000-0000-0000-0000-0000000000d1') = 500 + 10 - 50 - 10, 'budget after paying the line';
  assert (select ads_enabled from public.brands where id = '00000000-0000-0000-0000-0000000000d1'), 'ads back on once the line is clear';
  assert public.zz_ledger_ok('00000000-0000-0000-0000-0000000000d1');
  assert (select count(*) from public.earnings where brand_id = '00000000-0000-0000-0000-0000000000d1' and status = 'waitlisted') = 0;
end $$;

-- budget never goes negative, even with a huge waitlist; and it is always the OLDEST entries that get paid
do $$
declare i int; n int; ids uuid[] := '{}'; funded uuid[]; expected uuid[];
begin
  update public.brands set budget_cents = 95 where id = '00000000-0000-0000-0000-0000000000d1';
  delete from public.budget_ledger where brand_id = '00000000-0000-0000-0000-0000000000d1';
  insert into public.budget_ledger (brand_id, delta_cents, reason) values ('00000000-0000-0000-0000-0000000000d1', 95, 'bid');
  for i in 1..30 loop
    ids := ids || public.zz_waitlist(i, 10, make_interval(mins => 100 - i));  -- i=1 is the oldest
  end loop;
  n := public.fund_waitlist('00000000-0000-0000-0000-0000000000d1');
  assert n = 9, '95 pays for 9 x 10';
  assert (select budget_cents from public.brands where id = '00000000-0000-0000-0000-0000000000d1') = 5;
  select array_agg(id order by created_at) into funded from public.earnings where id = any(ids) and status = 'pending';
  expected := ids[1:9];
  assert funded = expected, 'exactly the 9 oldest entries are funded, in order';
  assert (select count(*) from public.earnings where id = any(ids) and status = 'waitlisted') = 21;
  assert public.zz_ledger_ok('00000000-0000-0000-0000-0000000000d1');
end $$;

-- fund_waitlist on a missing brand
do $$ begin
  perform public.zz_expect_error($q$select public.fund_waitlist('00000000-0000-0000-0000-0000000000ff')$q$, 'brand_not_found');
end $$;

rollback;
select 'ok: 03_record_bid' as result;
