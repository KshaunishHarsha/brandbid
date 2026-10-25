-- P3.8: admin-only promoter/user lookup and audited suspension action.
create or replace function public.admin_search_users(p_admin_id uuid, p_query text)
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

  select coalesce(jsonb_agg(to_jsonb(u) order by u.created_at desc), '[]'::jsonb) into result
    from (
      select p.id, u.email::text as email, p.handle::text as handle, p.country, p.status, p.is_admin,
             p.trust_score, p.kyc_status, p.created_at,
             coalesce((select sum(pl.delta_cents) from public.promoter_ledger pl where pl.promoter_id = p.id), 0) as ledger_balance_cents,
             (select count(*) from public.links l where l.promoter_id = p.id) as link_count,
             coalesce((select jsonb_agg(jsonb_build_object(
               'delta_cents', recent.delta_cents, 'reason', recent.reason, 'note', recent.note, 'created_at', recent.created_at
             ) order by recent.created_at desc)
               from (select pl.delta_cents, pl.reason, pl.note, pl.created_at from public.promoter_ledger pl
                      where pl.promoter_id = p.id order by pl.created_at desc limit 20) recent), '[]'::jsonb) as recent_ledger
        from public.profiles p join auth.users u on u.id = p.id
       where lower(u.email::text) like '%' || v_query || '%'
          or lower(coalesce(p.handle::text, '')) like '%' || v_query || '%'
          or p.id::text = v_query
       order by p.created_at desc limit 50
    ) u;
  return result;
end;
$$;

create or replace function public.admin_suspend_promoter(p_promoter_id uuid, p_reason text, p_admin_id uuid)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  p public.profiles%rowtype;
  v_reason text := left(trim(coalesce(p_reason, '')), 500);
begin
  if not exists (select 1 from public.profiles a where a.id = p_admin_id and a.is_admin) then
    raise exception 'admin_required' using errcode = '42501';
  end if;
  if length(v_reason) < 3 then raise exception 'reason_required'; end if;
  select * into p from public.profiles where id = p_promoter_id for update;
  if not found then raise exception 'promoter_not_found'; end if;
  if p.is_admin then raise exception 'admin_target_protected' using errcode = '42501'; end if;
  if p.status = 'banned' then raise exception 'promoter_banned'; end if;
  if p.status = 'suspended' then return jsonb_build_object('changed', false, 'status', 'suspended'); end if;

  update public.profiles set status = 'suspended' where id = p_promoter_id;
  update public.links set status = 'disabled' where promoter_id = p_promoter_id and status = 'active';
  insert into public.audit_log (actor_id, action, subject_type, subject_id, details)
    values (p_admin_id, 'promoter_suspended', 'promoter', p_promoter_id, jsonb_build_object('reason', v_reason));
  return jsonb_build_object('changed', true, 'status', 'suspended');
end;
$$;

create or replace function public.admin_ban_promoter(p_promoter_id uuid, p_reason text, p_admin_id uuid)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
begin
  if not exists (select 1 from public.profiles a where a.id = p_admin_id and a.is_admin) then
    raise exception 'admin_required' using errcode = '42501';
  end if;
  if exists (select 1 from public.profiles p where p.id = p_promoter_id and p.is_admin) then
    raise exception 'admin_target_protected' using errcode = '42501';
  end if;
  return public.ban_promoter(p_promoter_id, p_reason, p_admin_id);
end;
$$;

revoke all on function public.admin_search_users(uuid, text) from public, anon, authenticated;
grant execute on function public.admin_search_users(uuid, text) to service_role;
revoke all on function public.admin_suspend_promoter(uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.admin_suspend_promoter(uuid, text, uuid) to service_role;
revoke all on function public.admin_ban_promoter(uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.admin_ban_promoter(uuid, text, uuid) to service_role;
