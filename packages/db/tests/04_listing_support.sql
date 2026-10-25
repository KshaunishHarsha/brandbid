-- find_user_id_by_email and cleanup_stale_listings (P1.6, D45).
begin;

insert into auth.users (id, email, email_confirmed_at, last_sign_in_at, created_at) values
  ('00000000-0000-0000-0000-0000000000a1', 'Owner@Test.dev',  now(), now(), now() - interval '30 days'),  -- confirmed, active
  ('00000000-0000-0000-0000-0000000000a2', 'stale@test.dev',   null,  null,  now() - interval '10 days'),  -- abandoned: should go
  ('00000000-0000-0000-0000-0000000000a3', 'recent@test.dev',  null,  null,  now() - interval '1 day'),    -- too new: stays
  ('00000000-0000-0000-0000-0000000000a4', 'paid@test.dev',    null,  null,  now() - interval '10 days'),  -- unconfirmed but paid a bid: stays
  ('00000000-0000-0000-0000-0000000000a5', 'draftowner@test.dev', null, null, now() - interval '10 days'), -- owns a paid brand: stays
  ('00000000-0000-0000-0000-0000000000a6', 'abandoned2@test.dev', null, null, now() - interval '10 days'); -- owns only an old unpaid draft

do $$ begin
  -- email lookup is case-insensitive and returns null for strangers
  assert public.find_user_id_by_email('owner@test.dev') = '00000000-0000-0000-0000-0000000000a1', 'finds by lowercase';
  assert public.find_user_id_by_email('OWNER@TEST.DEV') = '00000000-0000-0000-0000-0000000000a1', 'finds by uppercase';
  assert public.find_user_id_by_email('nobody@test.dev') is null, 'unknown email';
end $$;

insert into public.brands (id, slug, name, url, owner_id, status, rate_cents, created_at) values
  ('00000000-0000-0000-0000-0000000000b1', 'old-draft',   'Old draft',   'https://a.example', '00000000-0000-0000-0000-0000000000a6', 'draft',          10, now() - interval '10 days'),
  ('00000000-0000-0000-0000-0000000000b2', 'new-draft',   'New draft',   'https://b.example', '00000000-0000-0000-0000-0000000000a1', 'draft',          10, now() - interval '1 day'),
  ('00000000-0000-0000-0000-0000000000b3', 'paid-brand',  'Paid',        'https://c.example', '00000000-0000-0000-0000-0000000000a5', 'pending_review', 10, now() - interval '10 days'),
  ('00000000-0000-0000-0000-0000000000b4', 'old-draft-2', 'Old, paid',   'https://d.example', '00000000-0000-0000-0000-0000000000a4', 'draft',          10, now() - interval '10 days');
insert into public.brand_members (brand_id, user_id, role) values
  ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000a6', 'owner'),
  ('00000000-0000-0000-0000-0000000000b3', '00000000-0000-0000-0000-0000000000a5', 'owner');
-- a draft that somehow has a bid must never be deleted
insert into public.bids (brand_id, payer_id, amount_cents, revenue_cents, budget_cents, processor, processor_payment_id) values
  ('00000000-0000-0000-0000-0000000000b4', '00000000-0000-0000-0000-0000000000a4', 1000, 500, 500, 'test', 'pay_clean_1');

do $$
declare r jsonb;
begin
  r := public.cleanup_stale_listings(7);
  assert (r->>'drafts_deleted')::int = 1, 'only the old, unpaid draft is deleted';
  assert not exists (select 1 from public.brands where id = '00000000-0000-0000-0000-0000000000b1'), 'old unpaid draft gone';
  assert exists (select 1 from public.brands where id = '00000000-0000-0000-0000-0000000000b2'), 'new draft stays';
  assert exists (select 1 from public.brands where id = '00000000-0000-0000-0000-0000000000b3'), 'paid brand stays';
  assert exists (select 1 from public.brands where id = '00000000-0000-0000-0000-0000000000b4'), 'a draft with a bid stays';

  -- b1's owner (a6) then has nothing left, and stale a2 never did anything: both go. Others stay.
  assert (r->>'users_deleted')::int = 2, 'two abandoned accounts removed';
  assert not exists (select 1 from auth.users where id in ('00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-0000000000a6'));
  assert exists (select 1 from auth.users where id = '00000000-0000-0000-0000-0000000000a1'), 'confirmed user stays';
  assert exists (select 1 from auth.users where id = '00000000-0000-0000-0000-0000000000a3'), 'recent user stays';
  assert exists (select 1 from auth.users where id = '00000000-0000-0000-0000-0000000000a4'), 'payer stays';
  assert exists (select 1 from auth.users where id = '00000000-0000-0000-0000-0000000000a5'), 'brand owner stays';
  assert not exists (select 1 from public.profiles where id in ('00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-0000000000a6')), 'profiles cascade';

  -- a second run finds nothing
  r := public.cleanup_stale_listings(7);
  assert (r->>'drafts_deleted')::int = 0 and (r->>'users_deleted')::int = 0, 'idempotent';
end $$;

-- new columns exist and default to "unchecked"
do $$ begin
  assert (select checked_at from public.brands where id = '00000000-0000-0000-0000-0000000000b3') is null;
  assert (select review_reason from public.brands where id = '00000000-0000-0000-0000-0000000000b3') is null;
end $$;

rollback;
select 'ok: 04_listing_support' as result;
