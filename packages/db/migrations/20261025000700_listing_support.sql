-- Listing flow support (P1.6, D45).

-- Result of the automatic listing check (worker job `check-listing`). NULL checked_at = not yet checked.
alter table public.brands
  add column checked_at timestamptz,
  add column review_reason text;   -- comma-separated reasons it was held, e.g. 'category_requires_review,url_unreachable'

create index brands_unchecked_idx on public.brands (created_at)
  where status = 'pending_review' and checked_at is null;

-- Service-role helper: account id for an email (used when a brand pays without signing in).
create function public.find_user_id_by_email(p_email text)
returns uuid
language sql stable security definer set search_path = ''
as $$
  select id from auth.users where lower(email) = lower(p_email) limit 1
$$;

-- Removes listings that were started but never paid, and the throwaway accounts made for them.
--  - draft brands older than p_days with no bids
--  - accounts that never confirmed their email, never signed in, own nothing and paid nothing
create function public.cleanup_stale_listings(p_days int default 7)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_drafts int;
  v_users int;
begin
  with gone as (
    delete from public.brands b
     where b.status = 'draft'
       and b.created_at < now() - make_interval(days => p_days)
       and not exists (select 1 from public.bids x where x.brand_id = b.id)
    returning 1
  ) select count(*) into v_drafts from gone;

  with gone as (
    delete from auth.users u
     where u.email_confirmed_at is null
       and u.last_sign_in_at is null
       and u.created_at < now() - make_interval(days => p_days)
       and not exists (select 1 from public.brands b where b.owner_id = u.id)
       and not exists (select 1 from public.brand_members m where m.user_id = u.id)
       and not exists (select 1 from public.bids x where x.payer_id = u.id)
       and not exists (select 1 from public.links l where l.promoter_id = u.id)
    returning 1
  ) select count(*) into v_users from gone;

  return jsonb_build_object('drafts_deleted', v_drafts, 'users_deleted', v_users);
end;
$$;
