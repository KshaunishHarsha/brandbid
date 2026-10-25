-- Money core, part 1: cycle math, fund_waitlist, record_bid.
-- BUILD.md sections 7, 8, 14, 15 and decisions D36, D37, D38.
--
-- These are SECURITY INVOKER on purpose: they run with the caller's table privileges, so even if
-- someone mistakenly granted EXECUTE to a client role, RLS and column grants would still apply.
-- Only the service role (API routes, /go, worker) may call them; client roles have no EXECUTE.

-- ---------------------------------------------------------------- cycle_end
-- End of the 24 h cycle (counted from the link's creation) that contains p_at. BUILD s15.
create function public.cycle_end(p_link_created timestamptz, p_at timestamptz)
returns timestamptz
language sql stable
as $$
  select p_link_created
         + make_interval(secs => s.secs) * (floor(extract(epoch from (p_at - p_link_created)) / s.secs) + 1)
  from (
    select (((select (value #>> '{}')::int from public.settings where key = 'cycle_hours') * 3600))::double precision as secs
  ) s
$$;

-- ---------------------------------------------------------------- fund_waitlist (D36)
-- Pays a brand's waitlisted earnings from its budget, oldest first. Strict order: if the head of the
-- line doesn't fit, stop (a later, cheaper entry never jumps the queue). Returns how many were funded.
-- Call it inside every function that adds budget (record_bid, reverse_earning, admin credits).
create function public.fund_waitlist(p_brand_id uuid)
returns int
language plpgsql
as $$
declare
  v_brand public.brands%rowtype;
  v_budget bigint;
  v_funded int := 0;
  e record;
begin
  select * into v_brand from public.brands where id = p_brand_id for update;
  if not found then
    raise exception 'brand_not_found';
  end if;
  v_budget := v_brand.budget_cents;

  for e in
    select w.id, w.amount_cents, l.created_at as link_created
    from public.earnings w
    join public.links l on l.id = w.link_id
    where w.brand_id = p_brand_id and w.status = 'waitlisted'
    order by w.created_at, w.id
    for update of w
  loop
    exit when v_budget < e.amount_cents;
    v_budget := v_budget - e.amount_cents;

    insert into public.budget_ledger (brand_id, delta_cents, reason, earning_id)
    values (p_brand_id, -e.amount_cents, 'visitor', e.id);

    update public.earnings
       set status = 'pending',
           funded_at = now(),
           cycle_ends_at = public.cycle_end(e.link_created, now())
     where id = e.id;

    v_funded := v_funded + 1;
  end loop;

  update public.brands
     set budget_cents = v_budget,
         last_spend_at = case when v_funded > 0 then now() else last_spend_at end,
         ads_enabled = (
           not exists (select 1 from public.earnings w where w.brand_id = p_brand_id and w.status = 'waitlisted')
           and v_budget >= rate_cents
         )
   where id = p_brand_id;

  return v_funded;
end;
$$;

-- ---------------------------------------------------------------- record_bid
-- Records a successful payment: split, ledger, rank, waitlist. Idempotent on p_processor_payment_id.
-- Raises (stable messages the webhook handler matches on):
--   brand_not_found, brand_not_payable, bid_below_minimum
create function public.record_bid(
  p_brand_id uuid,
  p_payer_id uuid,
  p_amount_cents bigint,
  p_processor text,
  p_processor_payment_id text,
  p_payer_email text default null,
  p_payment_fingerprint text default null
)
returns jsonb
language plpgsql
as $$
declare
  v_brand public.brands%rowtype;
  v_bid public.bids%rowtype;
  v_share int;
  v_min bigint;
  v_budget bigint;
  v_old_total bigint;
  v_funded int;
begin
  -- Lock first: two concurrent identical webhooks serialise here, and the second sees the first's bid.
  select * into v_brand from public.brands where id = p_brand_id for update;
  if not found then
    raise exception 'brand_not_found';
  end if;

  select * into v_bid from public.bids where processor_payment_id = p_processor_payment_id;
  if found then
    return jsonb_build_object(
      'bid_id', v_bid.id, 'created', false,
      'budget_cents', v_bid.budget_cents, 'revenue_cents', v_bid.revenue_cents, 'funded_waitlist', 0);
  end if;

  if v_brand.status not in ('draft', 'pending_review', 'active') then
    raise exception 'brand_not_payable';
  end if;

  select (value #>> '{}')::bigint into v_min from public.settings where key = 'min_bid_cents';
  if p_amount_cents is null or p_amount_cents < v_min then
    raise exception 'bid_below_minimum';
  end if;

  -- BUILD s7 rule 7: budget = floor(amount * share / 10000); revenue = the rest.
  select (value #>> '{}')::int into v_share from public.settings where key = 'budget_share_bps';
  v_budget := (p_amount_cents * v_share) / 10000;

  insert into public.bids (
    brand_id, payer_id, amount_cents, revenue_cents, budget_cents,
    processor, processor_payment_id, payer_email, payment_fingerprint
  ) values (
    p_brand_id, p_payer_id, p_amount_cents, p_amount_cents - v_budget, v_budget,
    p_processor, p_processor_payment_id, p_payer_email, p_payment_fingerprint
  ) returning * into v_bid;

  v_old_total := v_brand.total_paid_cents;

  update public.brands
     set total_paid_cents = total_paid_cents + p_amount_cents,
         total_reached_at = now(),                              -- G1: rank tie-break
         budget_cents = budget_cents + v_budget,
         status = case when status = 'draft' then 'pending_review' else status end
   where id = p_brand_id;

  if v_budget > 0 then
    insert into public.budget_ledger (brand_id, delta_cents, reason, bid_id)
    values (p_brand_id, v_budget, 'bid', v_bid.id);
  end if;

  -- G5: tell the owners of brands this bid just overtook (only for a brand that is already ranked).
  if v_brand.status = 'active' then
    insert into public.notification_outbox (kind, recipient_user_id, payload, dedupe_key)
    select 'outbid', b.owner_id,
           jsonb_build_object('brand_id', b.id, 'by_brand_id', p_brand_id, 'by_total_cents', v_old_total + p_amount_cents),
           'outbid:' || b.id || ':' || v_bid.id
    from public.brands b
    where b.status = 'active'
      and b.id <> p_brand_id
      and b.total_paid_cents > v_old_total
      and b.total_paid_cents < v_old_total + p_amount_cents
    on conflict (dedupe_key) do nothing;
  end if;

  -- D36: new budget pays the waitlist first, then ads_enabled is recomputed.
  v_funded := public.fund_waitlist(p_brand_id);

  return jsonb_build_object(
    'bid_id', v_bid.id, 'created', true,
    'budget_cents', v_bid.budget_cents, 'revenue_cents', v_bid.revenue_cents, 'funded_waitlist', v_funded);
end;
$$;
