-- P2.8: qualify one visitor atomically, reserve the full rate or append to the waitlist.
-- Rejection rows contain no network identifiers and let us measure false-reject causes during beta.
create table public.qualify_rejections (
  id bigserial primary key,
  click_id uuid,
  reason text not null check (reason in (
    'invalid_input', 'click_not_found', 'ignored_click', 'too_soon', 'ipua_mismatch',
    'cookie_mismatch', 'visitor_not_found', 'fingerprint_already_qualified',
    'already_qualified', 'claim_missing', 'claim_expired', 'brand_inactive'
  )),
  created_at timestamptz not null default now()
);
alter table public.qualify_rejections enable row level security;
revoke all on public.qualify_rejections from public, anon, authenticated;
grant all on public.qualify_rejections to service_role;
grant usage, select on sequence public.qualify_rejections_id_seq to service_role;

create function public.qualify_visitor(
  p_click_id uuid,
  p_fp_hash text,
  p_cookie_id text,
  p_ip_hash text,
  p_ua_hash text,
  p_active_ms int,
  p_interactions int
)
returns text
language plpgsql security definer set search_path = ''
as $$
declare
  v_click public.clicks%rowtype;
  v_visitor public.visitors%rowtype;
  v_brand public.brands%rowtype;
  v_fp_visitor uuid;
  v_fp_qualified timestamptz;
  v_link_created timestamptz;
  v_waiting boolean;
  v_remaining bigint;
  v_earning_id uuid;
  v_now timestamptz;
begin
  if p_click_id is null or p_ip_hash is null or p_ua_hash is null
     or p_active_ms is null or p_active_ms < 10000
     or p_interactions is null or p_interactions < 1
     or (p_fp_hash is not null and p_fp_hash !~ '^[0-9a-f]{64}$') then
    insert into public.qualify_rejections (click_id, reason) values (p_click_id, 'invalid_input');
    return 'rejected:invalid_input';
  end if;

  select * into v_click from public.clicks c where c.id = p_click_id;
  if not found then
    insert into public.qualify_rejections (click_id, reason) values (p_click_id, 'click_not_found');
    return 'rejected:click_not_found';
  end if;
  if v_click.ignored_reason is not null or v_click.visitor_id is null then
    insert into public.qualify_rejections (click_id, reason) values (p_click_id, 'ignored_click');
    return 'rejected:ignored_click';
  end if;
  if pg_catalog.clock_timestamp() - v_click.created_at < interval '10 seconds' then
    insert into public.qualify_rejections (click_id, reason) values (p_click_id, 'too_soon');
    return 'rejected:too_soon';
  end if;
  if v_click.ip_hash is distinct from p_ip_hash or v_click.ua_hash is distinct from p_ua_hash then
    insert into public.qualify_rejections (click_id, reason) values (p_click_id, 'ipua_mismatch');
    return 'rejected:ipua_mismatch';
  end if;
  if p_cookie_id is not null and v_click.cookie_id is distinct from p_cookie_id then
    insert into public.qualify_rejections (click_id, reason) values (p_click_id, 'cookie_mismatch');
    return 'rejected:cookie_mismatch';
  end if;

  -- Global lock order: visitor first, then brand. record_click uses the same order.
  select * into v_visitor from public.visitors v where v.id = v_click.visitor_id for update;
  if not found or v_visitor.brand_id <> v_click.brand_id then
    insert into public.qualify_rejections (click_id, reason) values (p_click_id, 'visitor_not_found');
    return 'rejected:visitor_not_found';
  end if;

  if p_fp_hash is not null then
    -- Serialize fingerprints so parallel requests cannot both count the same already-qualified device.
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(v_click.brand_id::text || ':fp:' || p_fp_hash, 2)
    );
    select k.visitor_id into v_fp_visitor from public.visitor_keys k
      where k.brand_id = v_click.brand_id and k.key_type = 'fp' and k.key_hash = p_fp_hash;
    if v_fp_visitor is not null and v_fp_visitor <> v_visitor.id then
      select v.qualified_at into v_fp_qualified from public.visitors v where v.id = v_fp_visitor;
      if v_fp_qualified is not null then
        insert into public.qualify_rejections (click_id, reason) values (p_click_id, 'fingerprint_already_qualified');
        return 'rejected:fingerprint_already_qualified';
      end if;
      update public.visitor_keys set visitor_id = v_visitor.id
        where brand_id = v_click.brand_id and key_type = 'fp' and key_hash = p_fp_hash and visitor_id = v_fp_visitor;
    else
      insert into public.visitor_keys (brand_id, key_type, key_hash, visitor_id)
      values (v_click.brand_id, 'fp', p_fp_hash, v_visitor.id) on conflict do nothing;
    end if;
  end if;

  if v_visitor.qualified_at is not null or exists (
    select 1 from public.earnings e where e.visitor_id = v_visitor.id
  ) then
    insert into public.qualify_rejections (click_id, reason) values (p_click_id, 'already_qualified');
    return 'rejected:already_qualified';
  end if;
  if v_visitor.claim_link_id is null or v_visitor.claim_promoter_id is null or v_visitor.claim_rate_cents is null then
    insert into public.qualify_rejections (click_id, reason) values (p_click_id, 'claim_missing');
    return 'rejected:claim_missing';
  end if;
  if v_visitor.claim_expires_at is null or v_visitor.claim_expires_at <= now() then
    insert into public.qualify_rejections (click_id, reason) values (p_click_id, 'claim_expired');
    return 'rejected:claim_expired';
  end if;

  select b.* into v_brand from public.brands b where b.id = v_visitor.brand_id for update;
  if not found or v_brand.status <> 'active' then
    insert into public.qualify_rejections (click_id, reason) values (p_click_id, 'brand_inactive');
    return 'rejected:brand_inactive';
  end if;
  select l.created_at into v_link_created from public.links l
    where l.id = v_visitor.claim_link_id and l.brand_id = v_brand.id and l.promoter_id = v_visitor.claim_promoter_id;
  if v_link_created is null then
    insert into public.qualify_rejections (click_id, reason) values (p_click_id, 'claim_missing');
    return 'rejected:claim_missing';
  end if;
  v_now := pg_catalog.clock_timestamp();
  if v_visitor.claim_expires_at <= v_now then
    insert into public.qualify_rejections (click_id, reason) values (p_click_id, 'claim_expired');
    return 'rejected:claim_expired';
  end if;

  select exists (
    select 1 from public.earnings e where e.brand_id = v_brand.id and e.status = 'waitlisted'
  ) into v_waiting;

  if v_brand.budget_cents < v_visitor.claim_rate_cents or v_waiting then
    insert into public.earnings (
      promoter_id, brand_id, link_id, visitor_id, click_id, amount_cents, status, created_at
    ) values (
      v_visitor.claim_promoter_id, v_brand.id, v_visitor.claim_link_id, v_visitor.id,
      p_click_id, v_visitor.claim_rate_cents, 'waitlisted', v_now
    );
    update public.visitors set qualified_at = v_now, qualified_click_id = p_click_id,
      qualified_ip_hash = p_ip_hash, qualified_fp_hash = p_fp_hash,
      qualified_active_ms = p_active_ms, qualified_interactions = p_interactions
      where id = v_visitor.id;
    update public.brands set ads_enabled = false where id = v_brand.id;
    insert into public.notification_outbox (kind, recipient_user_id, payload, dedupe_key)
      values (
        'budget_used_up', v_brand.owner_id,
        pg_catalog.jsonb_build_object('brand_id', v_brand.id),
        'budget_used_up:' || v_brand.id::text || ':' || pg_catalog.to_char(v_now at time zone 'UTC', 'YYYY-MM-DD')
      ) on conflict (dedupe_key) do nothing;
    return 'waitlisted';
  end if;

  v_remaining := v_brand.budget_cents - v_visitor.claim_rate_cents;
  insert into public.earnings (
    promoter_id, brand_id, link_id, visitor_id, click_id, amount_cents,
    cycle_ends_at, status, funded_at
  ) values (
    v_visitor.claim_promoter_id, v_brand.id, v_visitor.claim_link_id, v_visitor.id, p_click_id,
    v_visitor.claim_rate_cents, public.cycle_end(v_link_created, v_now), 'pending', v_now
  ) returning id into v_earning_id;
  insert into public.budget_ledger (brand_id, delta_cents, reason, earning_id)
    values (v_brand.id, -v_visitor.claim_rate_cents, 'visitor', v_earning_id);
  update public.visitors set qualified_at = v_now, qualified_click_id = p_click_id,
    qualified_ip_hash = p_ip_hash, qualified_fp_hash = p_fp_hash,
    qualified_active_ms = p_active_ms, qualified_interactions = p_interactions
    where id = v_visitor.id;
  update public.brands set budget_cents = v_remaining, last_spend_at = v_now,
    ads_enabled = v_remaining >= rate_cents where id = v_brand.id;

  if v_remaining < v_brand.rate_cents then
    insert into public.notification_outbox (kind, recipient_user_id, payload, dedupe_key)
      values (
        'budget_used_up', v_brand.owner_id,
        pg_catalog.jsonb_build_object('brand_id', v_brand.id),
        'budget_used_up:' || v_brand.id::text || ':' || pg_catalog.to_char(v_now at time zone 'UTC', 'YYYY-MM-DD')
      ) on conflict (dedupe_key) do nothing;
  end if;
  return 'qualified';
end;
$$;

revoke all on function public.qualify_visitor(uuid, text, text, text, text, int, int) from public, anon, authenticated;
grant execute on function public.qualify_visitor(uuid, text, text, text, text, int, int) to service_role;
