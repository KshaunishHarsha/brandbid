-- Admin listing review (P1.9). BUILD.md sections 8 (listing, rejection refund), 18; decisions D38, G3.
--
-- Everything here is a function the admin panel calls with the service role, one transaction each,
-- and each writes to audit_log. Not executable by client roles (default privileges, migration 000550).

-- Processor refunds for rejected listings are issued by the worker (or immediately by the admin action) and retried
-- with backoff. A refunded bid with refund_ref still NULL means "money still owed back to the payer".
alter table public.bids
  add column refund_attempts int not null default 0,
  add column refund_last_error text,
  add column refund_retry_at timestamptz;

create index bids_refund_owed_idx on public.bids (refund_retry_at nulls first)
  where status = 'refunded' and refund_ref is null;

-- ---------------------------------------------------------------- the review queue
create function public.admin_pending_listings()
returns table (
  brand_id uuid, slug extensions.citext, name text, description text, url text, logo_path text,
  category_id int, category_name text, category_requires_review boolean,
  owner_id uuid, owner_email text,
  review_reason text, checked_at timestamptz,
  total_paid_cents bigint, bid_count bigint, created_at timestamptz
)
language sql stable security definer set search_path = ''
as $$
  select b.id, b.slug, b.name, b.description, b.url, b.logo_path,
         b.category_id, c.name, coalesce(c.requires_review, false),
         b.owner_id, (select u.email::text from auth.users u where u.id = b.owner_id),
         b.review_reason, b.checked_at,
         b.total_paid_cents,
         (select count(*) from public.bids x where x.brand_id = b.id and x.status = 'succeeded'),
         b.created_at
  from public.brands b
  left join public.categories c on c.id = b.category_id
  where b.status = 'pending_review'
  order by b.created_at, b.id
$$;

-- ---------------------------------------------------------------- approve
create function public.approve_listing(p_brand_id uuid, p_admin_id uuid)
returns jsonb
language plpgsql
as $$
declare
  v_brand public.brands%rowtype;
begin
  select * into v_brand from public.brands where id = p_brand_id for update;
  if not found then
    raise exception 'brand_not_found';
  end if;
  if v_brand.status = 'active' then
    return jsonb_build_object('changed', false);          -- idempotent
  end if;
  if v_brand.status <> 'pending_review' then
    raise exception 'brand_not_reviewable';
  end if;

  update public.brands
     set status = 'active', checked_at = coalesce(checked_at, now()), review_reason = null
   where id = p_brand_id;

  insert into public.notification_outbox (kind, recipient_user_id, payload, dedupe_key)
  values ('listing_approved', v_brand.owner_id, jsonb_build_object('brand_id', p_brand_id, 'name', v_brand.name, 'slug', v_brand.slug),
          'listing_approved:' || p_brand_id)
  on conflict (dedupe_key) do nothing;

  insert into public.audit_log (actor_id, action, subject_type, subject_id, details)
  values (p_admin_id, 'listing_approved', 'brand', p_brand_id, jsonb_build_object('held_for', v_brand.review_reason));

  return jsonb_build_object('changed', true);
end;
$$;

-- ---------------------------------------------------------------- reject, with a full refund (D38)
-- Reverses every succeeded bid (bid -> refunded, budget ledger -budget, totals back to zero) in one
-- transaction. The processor refund itself is issued by the worker afterwards (job process-refunds),
-- which finds bids with status = 'refunded' and no refund_ref.
create function public.reject_listing(p_brand_id uuid, p_admin_id uuid, p_reason text)
returns jsonb
language plpgsql
as $$
declare
  v_brand public.brands%rowtype;
  b public.bids%rowtype;
  v_amount bigint := 0;
  v_budget bigint := 0;
  v_count int := 0;
  v_reason text := left(trim(coalesce(p_reason, '')), 500);
begin
  select * into v_brand from public.brands where id = p_brand_id for update;
  if not found then
    raise exception 'brand_not_found';
  end if;
  if v_brand.status = 'rejected' then
    return jsonb_build_object('changed', false,
      'refund_cents', (select coalesce(sum(x.amount_cents), 0) from public.bids x where x.brand_id = p_brand_id and x.status = 'refunded'));
  end if;
  if v_brand.status <> 'pending_review' then
    raise exception 'brand_not_reviewable';       -- a live brand is removed, not rejected; a draft has nothing to refund
  end if;
  if length(v_reason) < 3 then
    raise exception 'reason_required';
  end if;

  for b in select * from public.bids where brand_id = p_brand_id and status = 'succeeded' order by created_at, id for update loop
    update public.bids set status = 'refunded', refunded_at = now() where id = b.id;
    if b.budget_cents > 0 then
      insert into public.budget_ledger (brand_id, delta_cents, reason, bid_id)
      values (p_brand_id, -b.budget_cents, 'refund', b.id);
    end if;
    v_amount := v_amount + b.amount_cents;
    v_budget := v_budget + b.budget_cents;
    v_count := v_count + 1;
  end loop;

  -- The brand never went live, so none of its budget can have been spent. If it somehow was, stop: do not guess.
  if v_brand.budget_cents < v_budget or v_brand.total_paid_cents < v_amount then
    raise exception 'brand_ledger_inconsistent';
  end if;

  update public.brands
     set status = 'rejected',
         total_paid_cents = total_paid_cents - v_amount,
         budget_cents = budget_cents - v_budget,
         ads_enabled = false,
         review_reason = v_reason
   where id = p_brand_id;

  insert into public.notification_outbox (kind, recipient_user_id, payload, dedupe_key)
  values ('listing_rejected', v_brand.owner_id,
          jsonb_build_object('brand_id', p_brand_id, 'name', v_brand.name, 'reason', v_reason, 'refund_cents', v_amount),
          'listing_rejected:' || p_brand_id)
  on conflict (dedupe_key) do nothing;

  insert into public.audit_log (actor_id, action, subject_type, subject_id, details)
  values (p_admin_id, 'listing_rejected', 'brand', p_brand_id,
          jsonb_build_object('reason', v_reason, 'refund_cents', v_amount, 'bids_refunded', v_count));

  return jsonb_build_object('changed', true, 'refund_cents', v_amount, 'bids_refunded', v_count);
end;
$$;

-- ---------------------------------------------------------------- change category
create function public.admin_set_category(p_brand_id uuid, p_category_id int, p_admin_id uuid)
returns jsonb
language plpgsql
as $$
declare
  v_brand public.brands%rowtype;
begin
  select * into v_brand from public.brands where id = p_brand_id for update;
  if not found then
    raise exception 'brand_not_found';
  end if;
  if v_brand.status not in ('pending_review', 'active') then
    raise exception 'brand_not_reviewable';
  end if;
  if not exists (select 1 from public.categories where id = p_category_id) then
    raise exception 'category_not_found';
  end if;
  if v_brand.category_id is not distinct from p_category_id then
    return jsonb_build_object('changed', false);
  end if;

  update public.brands set category_id = p_category_id where id = p_brand_id;
  insert into public.audit_log (actor_id, action, subject_type, subject_id, details)
  values (p_admin_id, 'listing_category_changed', 'brand', p_brand_id,
          jsonb_build_object('from', v_brand.category_id, 'to', p_category_id));
  return jsonb_build_object('changed', true);
end;
$$;
