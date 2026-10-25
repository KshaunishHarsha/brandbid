-- P3.11: owner-only brand team invites with hashed, expiring, email-bound tokens.
create table public.brand_invites (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands(id),
  email text not null check (email = lower(email)),
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  invited_by uuid not null references public.profiles(id),
  expires_at timestamptz not null,
  accepted_at timestamptz,
  accepted_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  check ((accepted_at is null) = (accepted_by is null))
);
create unique index brand_invites_pending_brand_email_idx on public.brand_invites (brand_id, email) where accepted_at is null;
create index brand_invites_pending_expiry_idx on public.brand_invites (expires_at) where accepted_at is null;
alter table public.brand_invites enable row level security;
revoke all on public.brand_invites from public, anon, authenticated;
grant select, insert, update on public.brand_invites to service_role;

create or replace function public.create_brand_invite(
  p_brand_id uuid, p_invited_by uuid, p_email text, p_token_hash text, p_token text, p_expires_at timestamptz
)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  br public.brands%rowtype;
  v_email text := lower(trim(coalesce(p_email, '')));
  v_invite_id uuid;
  v_role text;
begin
  select * into br from public.brands where id = p_brand_id for share;
  if not found or br.status <> 'active' then raise exception 'brand_not_invitable'; end if;
  select m.role into v_role from public.brand_members m where m.brand_id = p_brand_id and m.user_id = p_invited_by;
  if v_role is distinct from 'owner' then raise exception 'brand_owner_required' using errcode = '42501'; end if;
  if v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then raise exception 'invite_email_invalid'; end if;
  if p_token_hash !~ '^[0-9a-f]{64}$' or p_token !~ '^[0-9a-f]{64}$'
    or p_expires_at <= now() or p_expires_at > now() + interval '30 days' then
    raise exception 'invite_token_invalid';
  end if;
  if exists (
    select 1 from auth.users u join public.brand_members m on m.user_id = u.id
     where m.brand_id = p_brand_id and lower(u.email::text) = v_email
  ) then raise exception 'brand_member_already_exists'; end if;

  select i.id into v_invite_id from public.brand_invites i
   where i.brand_id = p_brand_id and i.email = v_email and i.accepted_at is null for update;
  if v_invite_id is null then
    insert into public.brand_invites (brand_id, email, token_hash, invited_by, expires_at)
      values (p_brand_id, v_email, p_token_hash, p_invited_by, p_expires_at) returning id into v_invite_id;
  else
    update public.notification_outbox set sent_at = now(), payload = payload - 'token'
     where kind = 'brand_invite' and payload->>'invite_id' = v_invite_id::text and sent_at is null;
    update public.brand_invites set token_hash = p_token_hash, invited_by = p_invited_by,
      expires_at = p_expires_at, created_at = now() where id = v_invite_id;
  end if;

  insert into public.notification_outbox (kind, recipient_email, payload, dedupe_key)
    values ('brand_invite', v_email,
      jsonb_build_object('invite_id', v_invite_id, 'token', p_token, 'brand_name', br.name, 'brand_slug', br.slug),
      'brand_invite:' || v_invite_id::text || ':' || p_token_hash)
    on conflict (dedupe_key) do nothing;
  insert into public.audit_log (actor_id, action, subject_type, subject_id, details)
    values (p_invited_by, 'brand_invite_sent', 'brand', p_brand_id, jsonb_build_object('invite_id', v_invite_id, 'email', v_email));
  return jsonb_build_object('invite_id', v_invite_id, 'expires_at', p_expires_at);
end;
$$;

create or replace function public.accept_brand_invite(p_user_id uuid, p_token_hash text)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  inv public.brand_invites%rowtype;
  v_email text;
  br public.brands%rowtype;
begin
  select * into inv from public.brand_invites where token_hash = p_token_hash for update;
  if not found then raise exception 'brand_invite_not_found'; end if;
  select lower(u.email::text) into v_email from auth.users u where u.id = p_user_id;
  if v_email is null or v_email <> inv.email then raise exception 'brand_invite_email_mismatch' using errcode = '42501'; end if;
  if inv.accepted_at is not null then
    if inv.accepted_by = p_user_id then
      select * into br from public.brands where id = inv.brand_id;
      return jsonb_build_object('changed', false, 'brand_id', br.id, 'brand_slug', br.slug, 'brand_name', br.name);
    end if;
    raise exception 'brand_invite_already_accepted';
  end if;
  if inv.expires_at <= now() then raise exception 'brand_invite_expired'; end if;
  select * into br from public.brands where id = inv.brand_id;
  if not found or br.status <> 'active' then raise exception 'brand_not_invitable'; end if;

  insert into public.brand_members (brand_id, user_id, role) values (inv.brand_id, p_user_id, 'member')
    on conflict (brand_id, user_id) do nothing;
  update public.brand_invites set accepted_at = now(), accepted_by = p_user_id where id = inv.id;
  insert into public.audit_log (actor_id, action, subject_type, subject_id, details)
    values (p_user_id, 'brand_invite_accepted', 'brand', inv.brand_id, jsonb_build_object('invite_id', inv.id));
  return jsonb_build_object('changed', true, 'brand_id', br.id, 'brand_slug', br.slug, 'brand_name', br.name);
end;
$$;

revoke all on function public.create_brand_invite(uuid, uuid, text, text, text, timestamptz) from public, anon, authenticated;
grant execute on function public.create_brand_invite(uuid, uuid, text, text, text, timestamptz) to service_role;
revoke all on function public.accept_brand_invite(uuid, text) from public, anon, authenticated;
grant execute on function public.accept_brand_invite(uuid, text) to service_role;
