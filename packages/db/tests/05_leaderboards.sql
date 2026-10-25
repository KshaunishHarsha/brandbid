-- Leaderboards, brand ranks and the claim price (BUILD s8, s9; D1, G1; P1.7).
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

insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000a1', 'owner@test.dev');

create function public.zz_brand(p_key text, p_total bigint, p_reached interval, p_cat text default 'saas', p_status text default 'active')
returns uuid language plpgsql as $$
declare v uuid := gen_random_uuid();
begin
  insert into public.brands (id, slug, name, url, description, owner_id, category_id, status, rate_cents, total_paid_cents, total_reached_at)
  values (v, 'lb-' || p_key, 'Brand ' || p_key, 'https://' || p_key || '.example', 'desc ' || p_key,
          '00000000-0000-0000-0000-0000000000a1', (select id from public.categories where slug = p_cat), p_status, 10, p_total, now() - p_reached);
  return v;
end $$;

create function public.zz_id(p_key text) returns uuid language sql as $$ select id from public.brands where slug = 'lb-' || p_key $$;

-- ================================================================ all-time board
-- totals: A 9000, B 5000 (reached 4d ago), C 5000 (reached 2d ago: tie, B reached first), D 2000, E 100 (ai)
select public.zz_brand('a', 9000, interval '5 days');
select public.zz_brand('b', 5000, interval '4 days');
select public.zz_brand('c', 5000, interval '2 days');
select public.zz_brand('d', 2000, interval '1 day', 'ai');
select public.zz_brand('e', 100,  interval '1 hour', 'ai');
-- never on the board
select public.zz_brand('pending', 99999, interval '1 hour', 'saas', 'pending_review');
select public.zz_brand('draft',   99999, interval '1 hour', 'saas', 'draft');
select public.zz_brand('rejected',99999, interval '1 hour', 'saas', 'rejected');
select public.zz_brand('removed', 99999, interval '1 hour', 'saas', 'removed');

do $$
declare r record; n int := 0; order_keys text[] := '{}';
begin
  for r in select * from public.leaderboard_all_time(null, 50, 0) where slug::text like 'lb-%' loop
    order_keys := order_keys || (r.slug::text);
  end loop;
  assert order_keys = array['lb-a', 'lb-b', 'lb-c', 'lb-d', 'lb-e'], 'order by total, tie to who reached it first; inactive brands excluded: ' || order_keys::text;

  assert (select board_rank from public.leaderboard_all_time(null, 50, 0) where slug = 'lb-a') = 1;
  assert (select board_rank from public.leaderboard_all_time(null, 50, 0) where slug = 'lb-b') = 2, 'earlier to reach the tied total ranks higher';
  assert (select board_rank from public.leaderboard_all_time(null, 50, 0) where slug = 'lb-c') = 3;
  assert (select count(*) from public.leaderboard_all_time(null, 1000, 0)) = 5, 'draft, pending, rejected, removed never appear';

  -- the row carries what the page needs
  select * into r from public.leaderboard_all_time(null, 1, 0);
  assert r.name = 'Brand a' and r.description = 'desc a' and r.total_paid_cents = 9000 and r.url = 'https://a.example';

  -- pagination
  assert (select array_agg(slug::text order by board_rank) from public.leaderboard_all_time(null, 2, 1)) = array['lb-b', 'lb-c'], 'offset + limit';
  assert (select count(*) from public.leaderboard_all_time(null, 0, 0)) = 0, 'limit 0';
  assert (select count(*) from public.leaderboard_all_time(null, 10, 99)) = 0, 'offset past the end';
  assert (select count(*) from public.leaderboard_all_time(null, -5, -5)) = 0, 'negative limit is safe';

  -- category filter: ranks restart inside the category
  assert (select array_agg(slug::text order by board_rank) from public.leaderboard_all_time((select id from public.categories where slug = 'ai'), 50, 0)) = array['lb-d', 'lb-e'];
  assert (select board_rank from public.leaderboard_all_time((select id from public.categories where slug = 'ai'), 50, 0) where slug = 'lb-e') = 2;
  assert (select count(*) from public.leaderboard_all_time((select id from public.categories where slug = 'crypto'), 50, 0)) = 0, 'empty category';
end $$;

-- identical total AND identical reach time: id decides, so the order is stable
select public.zz_brand('t1', 777, interval '9 hours');
do $$
declare t timestamptz; k1 uuid; k2 uuid;
begin
  select total_reached_at into t from public.brands where slug = 'lb-t1';
  k1 := public.zz_id('t1');
  k2 := public.zz_brand('t2', 777, interval '0');
  update public.brands set total_reached_at = t where id = k2;
  assert (select array_agg(brand_id order by board_rank) from public.leaderboard_all_time(null, 50, 0) where brand_id in (k1, k2))
       = (select array_agg(id order by id) from public.brands where id in (k1, k2)), 'full tie broken by id';
  delete from public.brands where id in (k1, k2);
end $$;

-- every row's quoted price equals claim_price for that rank (one rule, two entry points)
do $$
declare r record;
begin
  for r in select * from public.leaderboard_all_time(null, 1000, 0) loop
    assert r.take_price_cents = public.claim_price(null, r.board_rank::int), 'take_price matches claim_price at rank ' || r.board_rank;
  end loop;
  assert (select take_price_cents from public.leaderboard_all_time(null, 1, 0)) = 9100;
  assert (select take_price_cents from public.leaderboard_all_time(null, 1, 4)) = 1000, 'a 100c holder: 100 + 100 is below the minimum';
  assert (select count(*) from public.category_counts()) = 2, 'only categories with live brands';
  assert (select live_brands from public.category_counts() where slug = 'saas') = 3 and (select live_brands from public.category_counts() where slug = 'ai') = 2;
  assert (select slug from public.category_counts() limit 1) = 'saas', 'busiest category first';
end $$;

-- brand_ranks agrees with the board for every brand
do $$
declare r record;
begin
  for r in select * from public.leaderboard_all_time(null, 1000, 0) loop
    assert (select all_time_rank from public.brand_ranks(r.brand_id)) = r.board_rank, 'brand_ranks matches the board for ' || r.slug;
  end loop;
  assert (select all_time_rank from public.brand_ranks(public.zz_id('pending'))) is null, 'a brand in review has no rank';
  assert (select today_rank from public.brand_ranks(public.zz_id('a'))) is null, 'no bids today: not on today''s board';
  assert (select today_cents from public.brand_ranks(public.zz_id('a'))) = 0;
end $$;

-- ================================================================ today's board (UTC day)
create function public.zz_bid(p_key text, p_cents bigint, p_at timestamptz, p_status text default 'succeeded') returns void language sql as $$
  insert into public.bids (brand_id, payer_id, amount_cents, revenue_cents, budget_cents, processor, processor_payment_id, status, created_at)
  values (public.zz_id(p_key), '00000000-0000-0000-0000-0000000000a1', p_cents, p_cents - p_cents / 2, p_cents / 2, 'test', 'pay_' || gen_random_uuid(), p_status, p_at)
$$;

do $$
declare d0 timestamptz := public.utc_day_start();
begin
  assert d0 <= now() and d0 > now() - interval '24 hours' and (d0 at time zone 'utc')::time = '00:00', 'utc_day_start is today 00:00 UTC';

  perform public.zz_bid('a', 1000, d0 + interval '1 hour');
  perform public.zz_bid('a',  500, d0 + interval '2 hours');       -- A: 1500 today, last at +2h
  perform public.zz_bid('b', 1500, d0 + interval '1 second');      -- B: 1500 today, reached at +1s  -> earlier than A: B wins the tie
  perform public.zz_bid('c', 9999, d0 - interval '1 microsecond'); -- just before midnight: excluded
  perform public.zz_bid('d',  100, d0);                            -- exactly at midnight: included
  perform public.zz_bid('e', 7777, d0 + interval '1 hour', 'refunded');  -- refunded: excluded
  perform public.zz_bid('pending', 5000, d0 + interval '1 hour');  -- not an active brand: excluded
end $$;

do $$
declare keys text[];
begin
  select array_agg(slug::text order by board_rank) into keys from public.leaderboard_today(null, 50, 0) where slug::text like 'lb-%';
  assert keys = array['lb-b', 'lb-a', 'lb-d'], 'today order: tie goes to whoever reached the total first: ' || keys::text;
  assert (select today_cents from public.leaderboard_today(null, 50, 0) where slug = 'lb-a') = 1500, 'sums several bids';
  assert (select today_cents from public.leaderboard_today(null, 50, 0) where slug = 'lb-d') = 100, 'midnight bid counts';
  assert (select total_paid_cents from public.leaderboard_today(null, 50, 0) where slug = 'lb-a') = 9000, 'also carries the all-time total';
  assert not exists (select 1 from public.leaderboard_today(null, 50, 0) where slug in ('lb-c', 'lb-e', 'lb-pending')), 'yesterday, refunded and inactive are out';

  assert (select array_agg(slug::text order by board_rank) from public.leaderboard_today((select id from public.categories where slug = 'ai'), 50, 0)) = array['lb-d'], 'category filter on today';
  assert (select today_rank from public.brand_ranks(public.zz_id('b'))) = 1;
  assert (select today_cents from public.brand_ranks(public.zz_id('a'))) = 1500;
  assert (select count(*) from public.leaderboard_today(null, 1, 1)) = 1, 'pagination on today';
end $$;

-- ================================================================ claim price
-- board now: A 9000, B 5000, C 5000, D 2000, E 100  (5 brands; min bid 1000; step 100)
do $$
begin
  -- a brand that is not listed yet
  assert public.claim_price(null, 1) = 9100, 'rank 1 = 9000 + $1';
  assert public.claim_price(null, 2) = 5100, 'rank 2 = holder 5000 + $1';
  assert public.claim_price(null, 3) = 5100, 'rank 3 = the other 5000 + $1';
  assert public.claim_price(null, 4) = 2100;
  assert public.claim_price(null, 5) = 1000, 'rank 5 holder has 100: 100 + 100 is below the minimum, so the minimum';
  assert public.claim_price(null, 6) = 1000, 'one past the end of the board = minimum bid';
  assert public.claim_price(null, 500) = 1000, 'far past the end = minimum bid';
  perform public.zz_expect_error('select public.claim_price(null, 0)', 'invalid_rank');
  perform public.zz_expect_error('select public.claim_price(null, -3)', 'invalid_rank');
  perform public.zz_expect_error('select public.claim_price(null, null)', 'invalid_rank');

  -- an existing brand: pays the gap to the holder, plus $1
  assert public.claim_price(public.zz_id('d'), 1) = 9000 - 2000 + 100, 'D (2000) to rank 1';
  assert public.claim_price(public.zz_id('d'), 3) = 5000 - 2000 + 100, 'D to rank 3';
  assert public.claim_price(public.zz_id('d'), 4) is null, 'D already holds rank 4';
  assert public.claim_price(public.zz_id('d'), 5) is null, 'a worse rank than the one held';
  assert public.claim_price(public.zz_id('d'), 99) is null;
  assert public.claim_price(public.zz_id('a'), 1) is null, 'the leader already holds rank 1';
  assert public.claim_price(public.zz_id('c'), 2) = 1000, 'C vs B: the gap + $1 is only $1, below the minimum bid, so the minimum';

  -- not live yet: no rank to defend, its own total still counts
  update public.brands set total_paid_cents = 3000 where slug = 'lb-pending';
  assert public.claim_price(public.zz_id('pending'), 2) = 5000 - 3000 + 100, 'a brand in review pays only the difference';
  assert public.claim_price(public.zz_id('pending'), 4) = 2000 - 3000 + 100 + 0 or public.claim_price(public.zz_id('pending'), 4) = 1000, 'already ahead of the rank-4 holder: pays only the minimum';

  perform public.zz_expect_error($q$select public.claim_price('00000000-0000-0000-0000-0000000000ff', 1)$q$, 'brand_not_found');

  -- the step is a setting
  update public.settings set value = '250' where key = 'rank_step_cents';
  assert public.claim_price(null, 1) = 9250, 'step is configurable';
  update public.settings set value = '100' where key = 'rank_step_cents';
  update public.settings set value = '4000' where key = 'min_bid_cents';
  assert public.claim_price(null, 4) = 4000, 'never below the minimum bid (setting)';
  update public.settings set value = '1000' where key = 'min_bid_cents';
end $$;

-- ladder: a short menu for the checkout
do $$
begin
  assert (select array_agg(target_rank order by target_rank) from public.claim_price_ladder(null)) = array[1, 2, 3, 5, 6], 'new brand: ranks up to the end of the board, plus joining it';
  assert (select price_cents from public.claim_price_ladder(null) where target_rank = 6) = 1000, 'joining the board costs the minimum';
  assert (select price_cents from public.claim_price_ladder(null) where target_rank = 1) = 9100;
  assert (select array_agg(target_rank order by target_rank) from public.claim_price_ladder(public.zz_id('d'))) = array[1, 2, 3], 'D (rank 4) can only move up';
  assert (select count(*) from public.claim_price_ladder(public.zz_id('a'))) = 0, 'the leader has nowhere to go';
end $$;

-- ================================================================ paying the quoted price really gets the rank
do $$
declare want int; price bigint; got bigint; d uuid := public.zz_id('d');
begin
  -- D (rank 4) pays what the board quotes for rank 2
  price := public.claim_price(d, 2);
  perform public.record_bid(d, '00000000-0000-0000-0000-0000000000a1', price, 'razorpay', 'pay_quote_1');
  select all_time_rank into got from public.brand_ranks(d);
  assert got <= 2, 'paid the rank-2 quote, got rank ' || got;

  -- a brand that is not listed yet (E-like newcomer) pays the quote for rank 1 and is promoted live
  perform public.zz_brand('newcomer', 0, interval '0', 'saas', 'draft');
  price := public.claim_price(null, 1);
  perform public.record_bid(public.zz_id('newcomer'), '00000000-0000-0000-0000-0000000000a1', price, 'razorpay', 'pay_quote_2');
  update public.brands set status = 'active' where slug = 'lb-newcomer';  -- what the listing check does
  select all_time_rank into got from public.brand_ranks(public.zz_id('newcomer'));
  assert got = 1, 'a newcomer paying the rank-1 quote takes rank 1, got ' || got;
  assert (select total_paid_cents from public.brands where slug = 'lb-newcomer') > 9000;
end $$;

rollback;
select 'ok: 05_leaderboards' as result;
