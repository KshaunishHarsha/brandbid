-- P2.6: create one click, associate the best available visitor keys, and set attribution.
create function public.record_click(
  p_click_id uuid,
  p_link_id uuid,
  p_brand_id uuid,
  p_promoter_id uuid,
  p_ip_hash text,
  p_ua_hash text,
  p_ipua_hash text,
  p_rate_limited boolean,
  p_viewer_user_id uuid default null,
  p_cookie_id text default null,
  p_cookie_hash text default null,
  p_user_agent text default null,
  p_country text default null,
  p_referrer text default null
)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_link public.links;
  v_brand public.brands;
  v_visitor public.visitors;
  v_visitor_id uuid;
  v_ignored_reason text;
  v_claim_days int := 7;
  v_lock_cookie bigint;
  v_lock_ipua bigint;
begin
  if p_click_id is null or p_link_id is null or p_brand_id is null or p_promoter_id is null
     or p_ip_hash is null or p_ua_hash is null or p_ipua_hash is null then
    raise exception 'invalid_click_input' using errcode = '22023';
  end if;

  -- Retries for the same redirect cannot create a second claim or click row.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_click_id::text, 0));
  if exists (select 1 from public.clicks c where c.id = p_click_id) then return; end if;

  select * into v_link from public.links l
    where l.id = p_link_id and l.brand_id = p_brand_id and l.promoter_id = p_promoter_id;
  select * into v_brand from public.brands b where b.id = p_brand_id;
  if not found or v_link.id is null or v_link.status <> 'active' or v_brand.status <> 'active' then
    raise exception 'link_not_active' using errcode = 'P0001';
  end if;

  if p_viewer_user_id = p_promoter_id then
    v_ignored_reason := 'self';
  elsif p_viewer_user_id is not null and exists (
    select 1 from public.brand_members m where m.brand_id = p_brand_id and m.user_id = p_viewer_user_id
  ) then
    v_ignored_reason := 'brand_member';
  elsif exists (select 1 from public.profiles p where p.id = p_promoter_id and p.status <> 'active') then
    v_ignored_reason := 'banned_promoter';
  elsif p_rate_limited then
    v_ignored_reason := 'rate_limited';
  end if;

  if v_ignored_reason is null then
    -- Serialize requests sharing either identity key before matching and creating visitors.
    v_lock_cookie := pg_catalog.hashtextextended(p_brand_id::text || ':cookie:' || coalesce(p_cookie_hash, p_ipua_hash), 1);
    v_lock_ipua := pg_catalog.hashtextextended(p_brand_id::text || ':ipua:' || p_ipua_hash, 1);
    if v_lock_cookie <= v_lock_ipua then
      perform pg_catalog.pg_advisory_xact_lock(v_lock_cookie);
      perform pg_catalog.pg_advisory_xact_lock(v_lock_ipua);
    else
      perform pg_catalog.pg_advisory_xact_lock(v_lock_ipua);
      perform pg_catalog.pg_advisory_xact_lock(v_lock_cookie);
    end if;
    if p_cookie_hash is not null then
      select k.visitor_id into v_visitor_id from public.visitor_keys k
        where k.brand_id = p_brand_id and k.key_type = 'cookie' and k.key_hash = p_cookie_hash;
    end if;
    if v_visitor_id is null then
      select k.visitor_id into v_visitor_id from public.visitor_keys k
        where k.brand_id = p_brand_id and k.key_type = 'ipua' and k.key_hash = p_ipua_hash;
    end if;
    if v_visitor_id is null then
      insert into public.visitors (brand_id) values (p_brand_id) returning id into v_visitor_id;
    end if;

    select coalesce((s.value #>> '{}')::int, 7) into v_claim_days
      from public.settings s where s.key = 'claim_days';
    v_claim_days := greatest(1, least(coalesce(v_claim_days, 7), 90));

    select * into strict v_visitor from public.visitors v where v.id = v_visitor_id for update;
    select * into strict v_brand from public.brands b where b.id = p_brand_id for update;
    if v_visitor.claim_link_id is null or (v_visitor.claim_expires_at <= now() and v_visitor.qualified_at is null) then
      update public.visitors set
        claim_link_id = p_link_id,
        claim_promoter_id = p_promoter_id,
        claim_click_id = p_click_id,
        claim_rate_cents = v_brand.rate_cents,
        claim_expires_at = now() + make_interval(days => v_claim_days)
      where id = v_visitor_id;
    end if;

    if p_cookie_hash is not null then
      insert into public.visitor_keys (brand_id, key_type, key_hash, visitor_id)
      values (p_brand_id, 'cookie', p_cookie_hash, v_visitor_id) on conflict do nothing;
    end if;
    insert into public.visitor_keys (brand_id, key_type, key_hash, visitor_id)
    values (p_brand_id, 'ipua', p_ipua_hash, v_visitor_id) on conflict do nothing;
  end if;

  insert into public.clicks (
    id, link_id, brand_id, promoter_id, visitor_id, cookie_id, ip_hash, ua_hash,
    user_agent, country, referrer, ignored_reason
  ) values (
    p_click_id, p_link_id, p_brand_id, p_promoter_id,
    case when v_ignored_reason is null then v_visitor_id else null end,
    p_cookie_id, p_ip_hash, p_ua_hash, left(p_user_agent, 512), left(p_country, 2), left(p_referrer, 2048), v_ignored_reason
  ) on conflict (id) do nothing;
end;
$$;

revoke all on function public.record_click(uuid, uuid, uuid, uuid, text, text, text, boolean, uuid, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.record_click(uuid, uuid, uuid, uuid, text, text, text, boolean, uuid, text, text, text, text, text) to service_role;
