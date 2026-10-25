-- P3.1: allow opt-out from optional product-alert emails while preserving transactional notices.
alter table public.profiles add column product_emails_enabled boolean not null default true;
alter table public.notification_outbox add column suppressed_at timestamptz;

create table public.email_unsubscribe_tokens (
  token_hash text primary key check (token_hash ~ '^[0-9a-f]{64}$'),
  user_id uuid not null references public.profiles(id) on delete cascade,
  category text not null check (category='product_alerts'),
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.email_unsubscribe_tokens enable row level security;
revoke all on public.email_unsubscribe_tokens from public,anon,authenticated;
grant all on public.email_unsubscribe_tokens to service_role;
create index email_unsubscribe_tokens_expiry_idx on public.email_unsubscribe_tokens(expires_at);

create or replace function public.email_unsubscribe_status(p_token_hash text)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists(select 1 from public.email_unsubscribe_tokens t
    where t.token_hash=p_token_hash and t.category='product_alerts'
      and t.expires_at>now() and t.consumed_at is null)
$$;

create or replace function public.confirm_email_unsubscribe(p_token_hash text)
returns boolean
language plpgsql security definer set search_path = ''
as $$
declare t public.email_unsubscribe_tokens%rowtype;
begin
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then raise exception 'unsubscribe_token_invalid'; end if;
  select * into t from public.email_unsubscribe_tokens where token_hash=p_token_hash for update;
  if not found or t.category<>'product_alerts' or t.expires_at<=now() or t.consumed_at is not null then
    raise exception 'unsubscribe_token_invalid';
  end if;
  update public.profiles set product_emails_enabled=false where id=t.user_id;
  update public.email_unsubscribe_tokens set consumed_at=now() where token_hash=t.token_hash;
  return true;
end;
$$;

revoke all on function public.email_unsubscribe_status(text) from public,anon,authenticated;
grant execute on function public.email_unsubscribe_status(text) to service_role;
revoke all on function public.confirm_email_unsubscribe(text) from public,anon,authenticated;
grant execute on function public.confirm_email_unsubscribe(text) to service_role;
