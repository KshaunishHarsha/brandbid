-- No account can ever hold a password (account pre-hijacking defence). See migration 001300.
begin;

-- Hermetic: start from an empty database for this test only. TRUNCATE and DELETE are transactional, so the rollback at
-- the end puts every real row back untouched. Seed data (settings, categories) is left alone.
truncate table public.profiles, public.brands, public.audit_log, public.notification_outbox, public.member_signals cascade;
delete from auth.users;

create extension if not exists pgcrypto with schema extensions;

do $$
declare id1 uuid := gen_random_uuid(); id2 uuid := gen_random_uuid();
begin
  -- A signup that sets a password (exactly what Supabase's public /auth/v1/signup does)
  insert into auth.users (id, email, encrypted_password)
  values (id1, 'attacker-registered@test.dev', extensions.crypt('Attacker-Pass-123!', extensions.gen_salt('bf')));
  assert (select encrypted_password from auth.users where id = id1) = '', 'a password supplied at signup is discarded';

  -- A later attempt to set one on an existing account (password reset, update user, admin update)
  update auth.users set encrypted_password = extensions.crypt('Another-Pass-456!', extensions.gen_salt('bf')) where id = id1;
  assert (select encrypted_password from auth.users where id = id1) = '', 'a password set later is discarded';

  -- No password was never a problem: passwordless accounts stay passwordless, and other updates still work
  insert into auth.users (id, email) values (id2, 'passwordless@test.dev');
  assert (select encrypted_password from auth.users where id = id2) = '', 'a passwordless account stays that way';
  update auth.users set email_confirmed_at = now() where id = id2;
  assert (select email_confirmed_at from auth.users where id = id2) is not null, 'unrelated updates are untouched';

  -- The profile trigger still works alongside it
  assert (select count(*) from public.profiles where id in (id1, id2)) = 2, 'profiles are still created';
end $$;

rollback;
select 'ok: 10_no_passwords' as result;
