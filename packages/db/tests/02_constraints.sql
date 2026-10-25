-- Schema constraint, seed and privilege-hygiene tests.
begin;

-- Hermetic: start from an empty database for this test only. TRUNCATE and DELETE are transactional, so the rollback at
-- the end puts every real row back untouched. Seed data (settings, categories) is left alone.
truncate table public.profiles, public.brands, public.audit_log, public.notification_outbox, public.member_signals cascade;
delete from auth.users;


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

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'c1@test.dev'),
  ('00000000-0000-0000-0000-0000000000a2', 'c2@test.dev');
insert into public.brands (id, slug, name, url, owner_id, status, rate_cents) values
  ('00000000-0000-0000-0000-0000000000b1', 'con-one', 'One', 'https://one.example', '00000000-0000-0000-0000-0000000000a1', 'active', 10);
insert into public.links (id, code, promoter_id, brand_id, channel) values
  ('00000000-0000-0000-0000-0000000000d1', 'CONTEST1', '00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-0000000000b1', 'x');
insert into public.visitors (id, brand_id) values ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000b1');
insert into public.bids (brand_id, payer_id, amount_cents, revenue_cents, budget_cents, processor, processor_payment_id) values
  ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000a1', 1000, 500, 500, 'test', 'pay_con_1');
insert into public.earnings (promoter_id, brand_id, link_id, visitor_id, click_id, amount_cents, cycle_ends_at, funded_at) values
  ('00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000d1',
   '00000000-0000-0000-0000-0000000000e1', gen_random_uuid(), 10, now() + interval '1 day', now());

-- ------------------------------------------------------------ money invariants in the schema
do $$ begin
  -- budget never negative; paid total never negative
  perform public.zz_expect_error('update public.brands set budget_cents = -1', '23514');
  perform public.zz_expect_error('update public.brands set total_paid_cents = -1', '23514');
  perform public.zz_expect_error('update public.brands set rate_cents = 0', '23514');
  -- a bid must split exactly: revenue + budget = amount
  perform public.zz_expect_error($q$insert into public.bids (brand_id,payer_id,amount_cents,revenue_cents,budget_cents,processor,processor_payment_id)
    values ('00000000-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-0000000000a1',1000,400,500,'t','pay_bad_split')$q$, '23514');
  perform public.zz_expect_error($q$insert into public.bids (brand_id,payer_id,amount_cents,revenue_cents,budget_cents,processor,processor_payment_id)
    values ('00000000-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-0000000000a1',0,0,0,'t','pay_zero')$q$, '23514');
  -- webhook idempotency key
  perform public.zz_expect_error($q$insert into public.bids (brand_id,payer_id,amount_cents,revenue_cents,budget_cents,processor,processor_payment_id)
    values ('00000000-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-0000000000a1',1000,500,500,'t','pay_con_1')$q$, '23505');
  -- D37: a bid can never refund more budget than it added
  perform public.zz_expect_error('update public.bids set budget_refunded_cents = 501', '23514');
  -- one payout per visitor, ever
  perform public.zz_expect_error($q$insert into public.earnings (promoter_id,brand_id,link_id,visitor_id,click_id,amount_cents,cycle_ends_at,funded_at)
    values ('00000000-0000-0000-0000-0000000000a2','00000000-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-0000000000d1','00000000-0000-0000-0000-0000000000e1',gen_random_uuid(),10,now(),now())$q$, '23505');
  -- D36: waitlisted earnings have no cycle; funded ones must
  insert into public.visitors (id, brand_id) values ('00000000-0000-0000-0000-0000000000e2', '00000000-0000-0000-0000-0000000000b1');
  insert into public.earnings (promoter_id,brand_id,link_id,visitor_id,click_id,amount_cents,status)
    values ('00000000-0000-0000-0000-0000000000a2','00000000-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-0000000000d1','00000000-0000-0000-0000-0000000000e2',gen_random_uuid(),10,'waitlisted');
  insert into public.visitors (id, brand_id) values ('00000000-0000-0000-0000-0000000000e3', '00000000-0000-0000-0000-0000000000b1');
  perform public.zz_expect_error($q$insert into public.earnings (promoter_id,brand_id,link_id,visitor_id,click_id,amount_cents,status)
    values ('00000000-0000-0000-0000-0000000000a2','00000000-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-0000000000d1','00000000-0000-0000-0000-0000000000e3',gen_random_uuid(),10,'pending')$q$, '23514');
  perform public.zz_expect_error('update public.earnings set amount_cents = 0', '23514');
  perform public.zz_expect_error($q$update public.earnings set status = 'bogus'$q$, '23514');
  -- withdrawals: minimum $10
  perform public.zz_expect_error($q$insert into public.withdrawals (promoter_id,amount_cents,provider) values ('00000000-0000-0000-0000-0000000000a2',999,'x')$q$, '23514');
  -- ledgers can't hold zero rows
  perform public.zz_expect_error($q$insert into public.budget_ledger (brand_id,delta_cents,reason) values ('00000000-0000-0000-0000-0000000000b1',0,'bid')$q$, '23514');
  perform public.zz_expect_error($q$insert into public.promoter_ledger (promoter_id,delta_cents,reason) values ('00000000-0000-0000-0000-0000000000a2',5,'bogus')$q$, '23514');
end $$;

-- ------------------------------------------------------------ identity and format rules
do $$ begin
  perform public.zz_expect_error($q$update public.profiles set handle = 'ab' where id = '00000000-0000-0000-0000-0000000000a1'$q$, '23514');
  perform public.zz_expect_error($q$update public.profiles set handle = 'Has-Dash' where id = '00000000-0000-0000-0000-0000000000a1'$q$, '23514');
  update public.profiles set handle = 'Promo_1' where id = '00000000-0000-0000-0000-0000000000a1';  -- citext lowercases for comparison
  perform public.zz_expect_error($q$update public.profiles set handle = 'promo_1' where id = '00000000-0000-0000-0000-0000000000a2'$q$, '23505');
  perform public.zz_expect_error($q$update public.profiles set status = 'weird' where id = '00000000-0000-0000-0000-0000000000a1'$q$, '23514');
  -- link codes and channels
  perform public.zz_expect_error($q$insert into public.links (code,promoter_id,brand_id,channel) values ('short','00000000-0000-0000-0000-0000000000a2','00000000-0000-0000-0000-0000000000b1','story')$q$, '23514');
  perform public.zz_expect_error($q$insert into public.links (code,promoter_id,brand_id,channel) values ('GOODCODE','00000000-0000-0000-0000-0000000000a2','00000000-0000-0000-0000-0000000000b1','tiktok')$q$, '23514');
  perform public.zz_expect_error($q$insert into public.links (code,promoter_id,brand_id,channel) values ('CONTEST1','00000000-0000-0000-0000-0000000000a2','00000000-0000-0000-0000-0000000000b1','story')$q$, '23505');  -- code unique
  perform public.zz_expect_error($q$insert into public.links (code,promoter_id,brand_id,channel) values ('OTHERCOD','00000000-0000-0000-0000-0000000000a2','00000000-0000-0000-0000-0000000000b1','x')$q$, '23505');  -- one per promoter/brand/channel
  -- brand slugs
  perform public.zz_expect_error($q$insert into public.brands (slug,name,url,owner_id,rate_cents) values ('Bad Slug','x','https://x','00000000-0000-0000-0000-0000000000a1',10)$q$, '23514');
  perform public.zz_expect_error($q$insert into public.brands (slug,name,url,owner_id,rate_cents) values ('CON-ONE','x','https://x','00000000-0000-0000-0000-0000000000a1',10)$q$, '23505');
  -- outbox
  perform public.zz_expect_error($q$insert into public.notification_outbox (kind) values ('orphan')$q$, '23514');
  insert into public.notification_outbox (kind, recipient_email, dedupe_key) values ('t', 'a@b.c', 'dedupe-1');
  perform public.zz_expect_error($q$insert into public.notification_outbox (kind, recipient_email, dedupe_key) values ('t', 'a@b.c', 'dedupe-1')$q$, '23505');
end $$;

-- ------------------------------------------------------------ seed
do $$ begin
  assert (select value from public.settings where key = 'floor_cents') = '10'::jsonb;
  assert (select value from public.settings where key = 'min_bid_cents') = '1000'::jsonb;
  assert (select value from public.settings where key = 'budget_share_bps') = '5000'::jsonb;
  assert (select value from public.settings where key = 'waitlist_days') = '30'::jsonb;
  assert (select value from public.settings where key = 'claim_days') = '7'::jsonb;
  assert (select value from public.settings where key = 'qualify_seconds') = '10'::jsonb;
  assert (select value->>'flag_score' from public.settings where key = 'fraud_thresholds') = '50';
  assert (select count(*) from public.categories where requires_review) = 4, 'four review categories';
  assert (select count(*) from public.categories where slug in ('crypto','finance','health-supplements','gambling-adjacent') and requires_review) = 4;
end $$;

-- ------------------------------------------------------------ privilege hygiene (guards future migrations)
do $$
declare r record; role_name text;
begin
  assert (select count(*) from pg_tables where schemaname = 'public' and not rowsecurity) = 0,
    'every public table must have RLS enabled';

  foreach role_name in array array['anon', 'authenticated'] loop
    for r in select tablename from pg_tables where schemaname = 'public' loop
      assert not has_table_privilege(role_name, 'public.' || quote_ident(r.tablename), 'INSERT'),
        format('%s must not INSERT into %s', role_name, r.tablename);
      assert not has_table_privilege(role_name, 'public.' || quote_ident(r.tablename), 'DELETE'),
        format('%s must not DELETE from %s', role_name, r.tablename);
      assert not has_table_privilege(role_name, 'public.' || quote_ident(r.tablename), 'TRUNCATE'),
        format('%s must not TRUNCATE %s', role_name, r.tablename);
    end loop;
  end loop;

  -- anon may read only brands + categories (and the public_profiles view)
  for r in select tablename from pg_tables where schemaname = 'public' and tablename not in ('brands', 'categories') loop
    assert not has_table_privilege('anon', 'public.' || quote_ident(r.tablename), 'SELECT'),
      format('anon must not SELECT %s', r.tablename);
  end loop;

  -- clicks, visitors, visitor_keys: no client access at all
  foreach role_name in array array['anon', 'authenticated'] loop
    assert not has_table_privilege(role_name, 'public.clicks', 'SELECT');
    assert not has_table_privilege(role_name, 'public.visitors', 'SELECT');
    assert not has_table_privilege(role_name, 'public.visitor_keys', 'SELECT');
  end loop;

  -- no function in public is callable by anon; authenticated only gets the two policy helpers
  for r in select p.proname, p.oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname not like 'zz\_%' loop
    assert not has_function_privilege('anon', r.oid, 'EXECUTE'), format('anon can execute %s', r.proname);
    assert r.proname in ('is_admin', 'is_brand_member') or not has_function_privilege('authenticated', r.oid, 'EXECUTE'),
      format('authenticated can execute %s', r.proname);
  end loop;
end $$;

rollback;
select 'ok: 02_constraints' as result;
