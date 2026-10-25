-- P2.2: service-role-only, atomic link creation. The server supplies a CSPRNG code.
create function public.get_or_create_link(
  p_promoter_id uuid, p_brand_id uuid, p_channel text, p_code text
)
returns public.links
language plpgsql security definer set search_path = ''
as $$
declare
  v_link public.links;
  v_email text;
  v_allowlist jsonb;
begin
  if p_channel not in ('story', 'linkedin', 'x', 'link')
     or p_code !~ '^[0-9A-Za-z]{8}$' then
    raise exception 'invalid_link_input' using errcode = '22023';
  end if;
  if exists (select 1 from public.brand_members where brand_id = p_brand_id and user_id = p_promoter_id) then
    raise exception 'self_promotion' using errcode = 'P0001';
  end if;
  select u.email into v_email from auth.users u where u.id = p_promoter_id and u.email_confirmed_at is not null;
  select s.value into v_allowlist from public.settings s where s.key = 'beta_allowlist';
  if not found then raise exception 'not_eligible' using errcode = 'P0001'; end if;
  if v_email is null or not exists (
      select 1 from public.profiles p where p.id = p_promoter_id
        and p.status = 'active' and p.handle is not null and p.promoter_terms_accepted_at is not null
    ) or not exists (select 1 from public.brands b where b.id = p_brand_id and b.status = 'active')
    or (v_allowlist is not null and not (v_allowlist ? lower(v_email))) then
    raise exception 'not_eligible' using errcode = 'P0001';
  end if;
  select * into v_link from public.links
    where promoter_id = p_promoter_id and brand_id = p_brand_id and channel = p_channel;
  if found then return v_link; end if;
  insert into public.links (promoter_id, brand_id, channel, code)
  values (p_promoter_id, p_brand_id, p_channel, p_code)
  on conflict (promoter_id, brand_id, channel) do nothing;
  select * into v_link from public.links
    where promoter_id = p_promoter_id and brand_id = p_brand_id and channel = p_channel;
  return v_link;
end;
$$;

revoke all on function public.get_or_create_link(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.get_or_create_link(uuid, uuid, text, text) to service_role;
