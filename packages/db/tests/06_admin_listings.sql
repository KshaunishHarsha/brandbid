-- approve_listing, reject_listing (full refund, D38), admin_set_category, admin_pending_listings (P1.9).
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

create function public.zz_ledger_ok(p_brand uuid) returns boolean language sql as $$
  select (select budget_cents from public.brands where id = p_brand)
       = coalesce((select sum(delta_cents) from public.budget_ledger where brand_id = p_brand), 0)
$$;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'owner@test.dev'),
  ('00000000-0000-0000-0000-0000000000a9', 'admin@test.dev');

insert into public.brands (id, slug, name, url, description, owner_id, category_id, status, rate_cents, review_reason, checked_at) values
  ('00000000-0000-0000-0000-0000000000b1', 'rev-crypto', 'Coin Co', 'https://coin.example.com', 'coins', '00000000-0000-0000-0000-0000000000a1',
     (select id from public.categories where slug = 'crypto'), 'draft', 10, null, null),
  ('00000000-0000-0000-0000-0000000000b2', 'rev-saas', 'Saas Co', 'https://saas.example.com', 'tools', '00000000-0000-0000-0000-0000000000a1',
     (select id from public.categories where slug = 'saas'), 'draft', 10, null, null);

-- two real payments for the first, one for the second (through record_bid, as in production)
select public.record_bid('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000a1', 1000, 'razorpay', 'pay_r1');
select public.record_bid('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000a1', 2501, 'razorpay', 'pay_r2');  -- odd cent
select public.record_bid('00000000-0000-0000-0000-0000000000b2', '00000000-0000-0000-0000-0000000000a1', 5000, 'razorpay', 'pay_r3');
update public.brands set review_reason = 'category_requires_review', checked_at = now() where slug = 'rev-crypto';

-- ================================================================ the queue
do $$
declare r record;
begin
  assert (select count(*) from public.admin_pending_listings()) = 2, 'both paid listings are waiting';
  select * into r from public.admin_pending_listings() where slug = 'rev-crypto';
  assert r.owner_email = 'owner@test.dev' and r.category_name = 'Crypto' and r.category_requires_review, 'owner, category and review flag';
  assert r.total_paid_cents = 3501 and r.bid_count = 2, 'paid total and bid count';
  assert r.review_reason = 'category_requires_review' and r.checked_at is not null;
  assert (select array_agg(slug::text order by created_at, brand_id) from public.admin_pending_listings()) is not null;
end $$;

-- ================================================================ category edit
do $$
declare ai int := (select id from public.categories where slug = 'ai');
begin
  assert (public.admin_set_category('00000000-0000-0000-0000-0000000000b2', ai, '00000000-0000-0000-0000-0000000000a9')->>'changed')::boolean;
  assert (select category_id from public.brands where slug = 'rev-saas') = ai, 'category updated';
  assert (select details->>'to' from public.audit_log where action = 'listing_category_changed') = ai::text, 'audited with from/to';
  assert not (public.admin_set_category('00000000-0000-0000-0000-0000000000b2', ai, '00000000-0000-0000-0000-0000000000a9')->>'changed')::boolean, 'no-op when unchanged';
  assert (select count(*) from public.audit_log where action = 'listing_category_changed') = 1, 'a no-op writes no audit row';
  perform public.zz_expect_error($q$select public.admin_set_category('00000000-0000-0000-0000-0000000000b2', 99999, '00000000-0000-0000-0000-0000000000a9')$q$, 'category_not_found');
  perform public.zz_expect_error($q$select public.admin_set_category('00000000-0000-0000-0000-0000000000ff', 1, '00000000-0000-0000-0000-0000000000a9')$q$, 'brand_not_found');
  update public.brands set category_id = (select id from public.categories where slug = 'saas') where slug = 'rev-saas';
end $$;

-- ================================================================ approve
do $$
declare b2 uuid := '00000000-0000-0000-0000-0000000000b2'; adm uuid := '00000000-0000-0000-0000-0000000000a9';
begin
  assert (public.approve_listing(b2, adm)->>'changed')::boolean, 'approve changes a pending listing';
  assert (select status from public.brands where id = b2) = 'active';
  assert (select review_reason from public.brands where id = b2) is null;
  assert (select count(*) from public.notification_outbox where kind = 'listing_approved' and recipient_user_id = '00000000-0000-0000-0000-0000000000a1') = 1, 'owner is told';
  assert (select payload->>'slug' from public.notification_outbox where kind = 'listing_approved') = 'rev-saas', 'the email can link to the page';
  assert (select count(*) from public.audit_log where action = 'listing_approved' and actor_id = adm and subject_id = b2) = 1, 'audited';
  assert exists (select 1 from public.leaderboard_all_time(null, 100, 0) where brand_id = b2), 'it is on the board';

  -- idempotent
  assert not (public.approve_listing(b2, adm)->>'changed')::boolean;
  assert (select count(*) from public.notification_outbox where kind = 'listing_approved') = 1, 'no second email';
  assert (select count(*) from public.audit_log where action = 'listing_approved') = 1, 'no second audit row';

  perform public.zz_expect_error($q$select public.approve_listing('00000000-0000-0000-0000-0000000000ff', '00000000-0000-0000-0000-0000000000a9')$q$, 'brand_not_found');
  insert into public.brands (id, slug, name, url, owner_id, status, rate_cents) values ('00000000-0000-0000-0000-0000000000b8', 'rev-draft', 'D', 'https://d.example.com', '00000000-0000-0000-0000-0000000000a1', 'draft', 10);
  perform public.zz_expect_error($q$select public.approve_listing('00000000-0000-0000-0000-0000000000b8', '00000000-0000-0000-0000-0000000000a9')$q$, 'brand_not_reviewable');
end $$;

-- ================================================================ reject with a full refund
do $$
declare b1 uuid := '00000000-0000-0000-0000-0000000000b1'; adm uuid := '00000000-0000-0000-0000-0000000000a9'; r jsonb;
begin
  -- before: 3501 paid in two bids, 1750 of it ad budget (500 + 1250), the rest revenue
  assert (select total_paid_cents from public.brands where id = b1) = 3501;
  assert (select budget_cents from public.brands where id = b1) = 1750;

  perform public.zz_expect_error($q$select public.reject_listing('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000a9', '')$q$, 'reason_required');
  perform public.zz_expect_error($q$select public.reject_listing('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000a9', '  x ')$q$, 'reason_required');
  assert (select status from public.brands where id = b1) = 'pending_review', 'a refused reject changes nothing';

  r := public.reject_listing(b1, adm, 'Looks like a scam');
  assert (r->>'changed')::boolean and (r->>'refund_cents')::bigint = 3501 and (r->>'bids_refunded')::int = 2, 'refunds the WHOLE amount, both bids: ' || r::text;

  assert (select status from public.brands where id = b1) = 'rejected';
  assert (select total_paid_cents from public.brands where id = b1) = 0, 'total paid back to zero';
  assert (select budget_cents from public.brands where id = b1) = 0, 'budget back to zero';
  assert not (select ads_enabled from public.brands where id = b1);
  assert public.zz_ledger_ok(b1), 'budget ledger still equals the cached budget (0)';
  assert (select coalesce(sum(delta_cents), 0) from public.budget_ledger where brand_id = b1) = 0, 'ledger sums to zero';
  assert (select count(*) from public.budget_ledger where brand_id = b1 and reason = 'refund' and delta_cents < 0) = 2, 'one refund row per bid';
  assert (select count(*) from public.bids where brand_id = b1 and status = 'refunded' and refunded_at is not null) = 2, 'both bids marked refunded';
  assert (select count(*) from public.bids where brand_id = b1 and status = 'succeeded') = 0;
  assert (select count(*) from public.bids where brand_id = b1 and status = 'refunded' and refund_ref is null and refund_attempts = 0) = 2, 'processor refunds are still owed (the worker does them)';
  assert (select review_reason from public.brands where id = b1) = 'Looks like a scam';

  assert (select payload->>'refund_cents' from public.notification_outbox where kind = 'listing_rejected') = '3501', 'owner told the refund amount';
  assert (select details->>'reason' from public.audit_log where action = 'listing_rejected' and subject_id = b1) = 'Looks like a scam';
  assert not exists (select 1 from public.leaderboard_all_time(null, 100, 0) where brand_id = b1), 'not on the board';
  assert not exists (select 1 from public.leaderboard_today(null, 100, 0) where brand_id = b1), 'refunded bids are not on today''s board';
  assert not exists (select 1 from public.admin_pending_listings() where brand_id = b1), 'gone from the queue';

  -- idempotent: a second reject does not refund or notify again
  r := public.reject_listing(b1, adm, 'again');
  assert not (r->>'changed')::boolean and (r->>'refund_cents')::bigint = 3501, 'second call reports the same refund, changes nothing';
  assert (select count(*) from public.notification_outbox where kind = 'listing_rejected') = 1;
  assert (select count(*) from public.audit_log where action = 'listing_rejected') = 1;
  assert (select count(*) from public.budget_ledger where brand_id = b1 and reason = 'refund') = 2;
  assert (select review_reason from public.brands where id = b1) = 'Looks like a scam', 'the original reason is kept';

  -- a payment that arrives after rejection is refused by record_bid (the webhook then auto-refunds it, D44)
  perform public.zz_expect_error($q$select public.record_bid('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000a1', 1000, 'razorpay', 'pay_late')$q$, 'brand_not_payable');
end $$;

-- a live brand cannot be rejected, and an inconsistent ledger stops the refund instead of guessing
do $$
begin
  perform public.zz_expect_error($q$select public.reject_listing('00000000-0000-0000-0000-0000000000b2', '00000000-0000-0000-0000-0000000000a9', 'too late')$q$, 'brand_not_reviewable');
  perform public.zz_expect_error($q$select public.reject_listing('00000000-0000-0000-0000-0000000000b8', '00000000-0000-0000-0000-0000000000a9', 'nothing paid')$q$, 'brand_not_reviewable');
  perform public.zz_expect_error($q$select public.reject_listing('00000000-0000-0000-0000-0000000000ff', '00000000-0000-0000-0000-0000000000a9', 'x y z')$q$, 'brand_not_found');
end $$;

do $$
declare b uuid := '00000000-0000-0000-0000-0000000000c1';
begin
  insert into public.brands (id, slug, name, url, owner_id, status, rate_cents) values (b, 'rev-spent', 'Spent', 'https://s.example.com', '00000000-0000-0000-0000-0000000000a1', 'draft', 10);
  perform public.record_bid(b, '00000000-0000-0000-0000-0000000000a1', 2000, 'razorpay', 'pay_spent');
  update public.brands set budget_cents = 100 where id = b;      -- pretend 900 of the 1000 budget was spent
  perform public.zz_expect_error($q$select public.reject_listing('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000a9', 'should not refund')$q$, 'brand_ledger_inconsistent');
  assert (select status from public.brands where id = b) = 'pending_review', 'the failed reject rolled everything back';
  assert (select status from public.bids where processor_payment_id = 'pay_spent') = 'succeeded', 'bid untouched';
end $$;

rollback;
select 'ok: 06_admin_listings' as result;
