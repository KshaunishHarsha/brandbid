-- Row-level security and privileges. BUILD.md section 6 "Row-level security summary".
--
-- Model: browser roles (anon, authenticated) get the minimum. Everything that moves money,
-- or touches clicks/visitors, goes through the service role (API routes, /go, worker),
-- which bypasses RLS. Column-level GRANTs stop clients writing protected columns.

-- ---------------------------------------------------------------- helpers
create function public.is_admin() returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce((select p.is_admin from public.profiles p where p.id = (select auth.uid())), false)
$$;

create function public.is_brand_member(p_brand_id uuid) returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.brand_members m
    where m.brand_id = p_brand_id and m.user_id = (select auth.uid())
  )
$$;

-- New auth user -> profile row.
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.profiles (id) values (new.id) on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------- lock everything down first
do $$
declare t text;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke all on all functions in schema public from public, anon, authenticated;

-- Anything created later starts with no client access; grant it explicitly in its own migration.
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;

grant execute on function public.is_admin() to authenticated;
grant execute on function public.is_brand_member(uuid) to authenticated;

-- ---------------------------------------------------------------- profiles
grant select on profiles to authenticated;
grant update (handle, country, leaderboard_public) on profiles to authenticated;  -- status, trust, kyc, admin: server only

create policy profiles_select on profiles for select to authenticated
  using (id = (select auth.uid()) or public.is_admin());
create policy profiles_update_own on profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- Public view: handle only, for the "via @handle" banner and leaderboards.
create view public_profiles as
  select id, handle from profiles where handle is not null;
grant select on public_profiles to anon, authenticated;

-- ---------------------------------------------------------------- categories
grant select on categories to anon, authenticated;
create policy categories_read on categories for select to anon, authenticated using (true);

-- ---------------------------------------------------------------- brands
grant select on brands to anon, authenticated;
grant update (description, logo_path, rate_cents) on brands to authenticated;  -- money columns: server only

create policy brands_public_read on brands for select to anon, authenticated
  using (status = 'active');
create policy brands_member_read on brands for select to authenticated
  using (public.is_brand_member(id) or public.is_admin());
create policy brands_member_update on brands for update to authenticated
  using (public.is_brand_member(id)) with check (public.is_brand_member(id));

-- ---------------------------------------------------------------- own-data tables (read only)
grant select on brand_members, links, earnings, promoter_ledger, bids, budget_ledger,
  budget_refunds, payout_accounts, withdrawals to authenticated;

create policy brand_members_read on brand_members for select to authenticated
  using (user_id = (select auth.uid()) or public.is_brand_member(brand_id) or public.is_admin());
create policy links_read on links for select to authenticated
  using (promoter_id = (select auth.uid()) or public.is_admin());
create policy earnings_read on earnings for select to authenticated
  using (promoter_id = (select auth.uid()) or public.is_admin());
create policy promoter_ledger_read on promoter_ledger for select to authenticated
  using (promoter_id = (select auth.uid()) or public.is_admin());
create policy payout_accounts_read on payout_accounts for select to authenticated
  using (promoter_id = (select auth.uid()) or public.is_admin());
create policy withdrawals_read on withdrawals for select to authenticated
  using (promoter_id = (select auth.uid()) or public.is_admin());
create policy bids_read on bids for select to authenticated
  using (public.is_brand_member(brand_id) or public.is_admin());
create policy budget_ledger_read on budget_ledger for select to authenticated
  using (public.is_brand_member(brand_id) or public.is_admin());
create policy budget_refunds_read on budget_refunds for select to authenticated
  using (public.is_brand_member(brand_id) or public.is_admin());

-- ---------------------------------------------------------------- admin-only reads
grant select on fraud_flags, settings, audit_log, notification_outbox, member_signals to authenticated;
create policy fraud_flags_admin on fraud_flags for select to authenticated using (public.is_admin());
create policy settings_admin on settings for select to authenticated using (public.is_admin());
create policy audit_log_admin on audit_log for select to authenticated using (public.is_admin());
create policy notification_outbox_admin on notification_outbox for select to authenticated using (public.is_admin());
create policy member_signals_admin on member_signals for select to authenticated using (public.is_admin());

-- clicks, visitors, visitor_keys: RLS on, no grants, no policies. Nobody from the client, not even admins
-- (admins see them through the service role in the admin panel).
