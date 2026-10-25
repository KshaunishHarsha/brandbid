-- P2.10: server-side rate floor, automatic pause state, queue pause, and claim-rate snapshot.
begin;
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000c1', 'owner@rate.test'),
  ('00000000-0000-0000-0000-0000000000c2', 'promoter@rate.test');
insert into public.brands (id, slug, name, url, owner_id, status, rate_cents, budget_cents, ads_enabled)
values ('00000000-0000-0000-0000-0000000000c3', 'rate-brand', 'Rate Brand', 'https://rate.example.com', '00000000-0000-0000-0000-0000000000c1', 'active', 25, 150, true);
insert into public.budget_ledger (brand_id, delta_cents, reason)
values ('00000000-0000-0000-0000-0000000000c3', 150, 'bid');

do $$ begin
  begin
    update public.brands set rate_cents = 9 where id = '00000000-0000-0000-0000-0000000000c3';
    raise exception 'below-floor rate unexpectedly saved';
  exception when check_violation then
    assert sqlerrm = 'brand_rate_below_floor', 'the database exposes a named floor violation';
  end;
  assert (select rate_cents from public.brands where id = '00000000-0000-0000-0000-0000000000c3') = 25, 'rejected rate is unchanged';
end $$;

-- The rate increase pauses when the remaining budget cannot cover one visitor, and resumes when it can.
update public.budget_ledger set delta_cents = 80 where brand_id = '00000000-0000-0000-0000-0000000000c3' and delta_cents = 150;
update public.brands set budget_cents = 80, rate_cents = 100 where id = '00000000-0000-0000-0000-0000000000c3';
do $$ begin
  assert (select ads_enabled from public.brands where id = '00000000-0000-0000-0000-0000000000c3') = false, 'rate above budget pauses ads';
end $$;
update public.budget_ledger set delta_cents = 150 where brand_id = '00000000-0000-0000-0000-0000000000c3' and delta_cents = 80;
update public.brands set budget_cents = 150, rate_cents = 100 where id = '00000000-0000-0000-0000-0000000000c3';
do $$ begin
  assert (select ads_enabled from public.brands where id = '00000000-0000-0000-0000-0000000000c3') = true, 'sufficient budget resumes ads';
end $$;

-- Editing a rate cannot turn on a brand that is still awaiting review.
update public.brands set status = 'pending_review', ads_enabled = false where id = '00000000-0000-0000-0000-0000000000c3';
update public.brands set rate_cents = 110 where id = '00000000-0000-0000-0000-0000000000c3';
do $$ begin
  assert (select ads_enabled from public.brands where id = '00000000-0000-0000-0000-0000000000c3') = false, 'pending review remains paused';
end $$;
update public.brands set status = 'active', rate_cents = 100 where id = '00000000-0000-0000-0000-0000000000c3';

-- A waitlisted visitor keeps the amount claimed earlier and prevents queue-jumping after rate edits.
insert into public.links (id, code, promoter_id, brand_id, channel)
values ('00000000-0000-0000-0000-0000000000c4', 'RateTest', '00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-0000000000c3', 'link');
insert into public.visitors (id, brand_id, claim_link_id, claim_promoter_id, claim_click_id, claim_rate_cents, claim_expires_at)
values ('00000000-0000-0000-0000-0000000000c5', '00000000-0000-0000-0000-0000000000c3', '00000000-0000-0000-0000-0000000000c4', '00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-0000000000c6', 25, now() + interval '7 days');
insert into public.earnings (id, promoter_id, brand_id, link_id, visitor_id, click_id, amount_cents, status)
values ('00000000-0000-0000-0000-0000000000c7', '00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-0000000000c3', '00000000-0000-0000-0000-0000000000c4', '00000000-0000-0000-0000-0000000000c5', '00000000-0000-0000-0000-0000000000c6', 25, 'waitlisted');
update public.brands set rate_cents = 120 where id = '00000000-0000-0000-0000-0000000000c3';
do $$ begin
  assert (select rate_cents from public.brands where id = '00000000-0000-0000-0000-0000000000c3') = 120;
  assert (select claim_rate_cents from public.visitors where id = '00000000-0000-0000-0000-0000000000c5') = 25, 'existing claim keeps its old rate';
  assert (select amount_cents from public.earnings where id = '00000000-0000-0000-0000-0000000000c7') = 25, 'existing waitlisted earning keeps its old rate';
  assert (select ads_enabled from public.brands where id = '00000000-0000-0000-0000-0000000000c3') = false, 'an existing waitlist keeps the brand paused';
end $$;

rollback;
select 'ok: 12_brand_rate_floor' as result;
