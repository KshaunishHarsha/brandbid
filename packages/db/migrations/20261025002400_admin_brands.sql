-- P3.8: admin brand search, ad suspension, and audited soft removal.
create or replace function public.admin_search_brands(p_admin_id uuid, p_query text)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_query text := lower(trim(coalesce(p_query, '')));
  result jsonb;
begin
  if not exists (select 1 from public.profiles p where p.id = p_admin_id and p.is_admin) then
    raise exception 'admin_required' using errcode = '42501';
  end if;
  if length(v_query) < 2 then return '[]'::jsonb; end if;

  select coalesce(jsonb_agg(to_jsonb(b) order by b.created_at desc), '[]'::jsonb) into result
    from (
      select br.id, br.slug::text as slug, br.name, br.url, br.status, br.ads_enabled,
             br.owner_id, (select u.email::text from auth.users u where u.id = br.owner_id) as owner_email,
             br.total_paid_cents, br.budget_cents, br.rate_cents, br.created_at,
             coalesce((select sum(bl.delta_cents) from public.budget_ledger bl where bl.brand_id = br.id), 0) as ledger_balance_cents,
             (select count(*) from public.bids bi where bi.brand_id = br.id) as bid_count,
             (select count(*) from public.links l where l.brand_id = br.id) as link_count,
             coalesce((select jsonb_agg(jsonb_build_object(
               'delta_cents', recent.delta_cents, 'reason', recent.reason, 'created_at', recent.created_at
             ) order by recent.created_at desc)
               from (select bl.delta_cents, bl.reason, bl.created_at from public.budget_ledger bl
                      where bl.brand_id = br.id order by bl.created_at desc limit 20) recent), '[]'::jsonb) as recent_budget_ledger
        from public.brands br
       where lower(br.name) like '%' || v_query || '%'
          or lower(br.slug::text) like '%' || v_query || '%'
          or lower(br.url) like '%' || v_query || '%'
          or br.id::text = v_query
       order by br.created_at desc limit 50
    ) b;
  return result;
end;
$$;

create or replace function public.admin_disable_brand_ads(p_brand_id uuid, p_reason text, p_admin_id uuid)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  br public.brands%rowtype;
  v_reason text := left(trim(coalesce(p_reason, '')), 500);
begin
  if not exists (select 1 from public.profiles a where a.id = p_admin_id and a.is_admin) then
    raise exception 'admin_required' using errcode = '42501';
  end if;
  if length(v_reason) < 3 then raise exception 'reason_required'; end if;
  select * into br from public.brands where id = p_brand_id for update;
  if not found then raise exception 'brand_not_found'; end if;
  if br.status <> 'active' then raise exception 'brand_not_active'; end if;
  if not br.ads_enabled then return jsonb_build_object('changed', false, 'ads_enabled', false); end if;

  update public.brands set ads_enabled = false where id = p_brand_id;
  update public.links set status = 'disabled' where brand_id = p_brand_id and status = 'active';
  insert into public.audit_log (actor_id, action, subject_type, subject_id, details)
    values (p_admin_id, 'brand_ads_disabled', 'brand', p_brand_id, jsonb_build_object('reason', v_reason));
  return jsonb_build_object('changed', true, 'ads_enabled', false);
end;
$$;

create or replace function public.admin_remove_brand(p_brand_id uuid, p_reason text, p_admin_id uuid)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  br public.brands%rowtype;
  v_reason text := left(trim(coalesce(p_reason, '')), 500);
begin
  if not exists (select 1 from public.profiles a where a.id = p_admin_id and a.is_admin) then
    raise exception 'admin_required' using errcode = '42501';
  end if;
  if length(v_reason) < 3 then raise exception 'reason_required'; end if;
  select * into br from public.brands where id = p_brand_id for update;
  if not found then raise exception 'brand_not_found'; end if;
  if br.status = 'removed' then return jsonb_build_object('changed', false, 'status', 'removed'); end if;
  if br.status <> 'active' then raise exception 'brand_not_active'; end if;

  update public.brands set status = 'removed', ads_enabled = false where id = p_brand_id;
  update public.links set status = 'disabled' where brand_id = p_brand_id and status = 'active';
  insert into public.audit_log (actor_id, action, subject_type, subject_id, details)
    values (p_admin_id, 'brand_removed', 'brand', p_brand_id,
            jsonb_build_object('reason', v_reason, 'budget_cents', br.budget_cents, 'total_paid_cents', br.total_paid_cents));
  return jsonb_build_object('changed', true, 'status', 'removed');
end;
$$;

revoke all on function public.admin_search_brands(uuid, text) from public, anon, authenticated;
grant execute on function public.admin_search_brands(uuid, text) to service_role;
revoke all on function public.admin_disable_brand_ads(uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.admin_disable_brand_ads(uuid, text, uuid) to service_role;
revoke all on function public.admin_remove_brand(uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.admin_remove_brand(uuid, text, uuid) to service_role;
