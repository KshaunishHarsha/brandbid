-- P2.1 beta gate and waitlist are service-role only.
begin;

do $$
begin
  assert (select value from public.settings where key = 'beta_allowlist') = '[]'::jsonb;
  assert not has_table_privilege('anon', 'public.beta_waitlist', 'SELECT');
  assert not has_table_privilege('anon', 'public.beta_waitlist', 'INSERT');
  assert not has_table_privilege('authenticated', 'public.beta_waitlist', 'SELECT');
  assert not has_table_privilege('authenticated', 'public.beta_waitlist', 'INSERT');
  assert (select relrowsecurity from pg_class where oid = 'public.beta_waitlist'::regclass);
end $$;

update public.settings set value = null where key = 'beta_allowlist';
do $$ begin assert (select value is null from public.settings where key = 'beta_allowlist'); end $$;

do $$
begin
  begin
    update public.settings set value = null where key = 'min_bid_cents';
    raise exception 'expected only beta_allowlist to permit null';
  exception when check_violation then null;
  end;
end $$;

insert into public.beta_waitlist (email) values ('Alice@Example.com');
do $$
begin
  begin
    insert into public.beta_waitlist (email) values ('alice@example.com');
    raise exception 'expected case-insensitive uniqueness';
  exception when unique_violation then null;
  end;
end $$;

rollback;
