-- Passwords must never exist (security).
--
-- brandbid signs people in with an emailed link or Google. There is no password login anywhere in the product, but
-- Supabase's public signup endpoint still lets anyone, with only the public anon key, create an account for ANY email
-- address with a password they choose. If that account is later used by the real owner of the email (for example a
-- brand pays as a guest, D45, and is attached to the existing account for that email, or the owner signs in by link and
-- thereby confirms it), the attacker would still hold a working password and could log in as them. This is "account
-- pre-hijacking".
--
-- The fix is to make a stored password impossible: whatever is written to auth.users.encrypted_password becomes the
-- empty string, which no password can ever match. Together with "Confirm email" being ON (an attacker cannot get a
-- session for an email they cannot read; scripts/verify-supabase.sh checks this) it closes the hole.

create function public.never_store_passwords()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.encrypted_password := '';
  return new;
end;
$$;

create trigger auth_users_never_store_passwords
  before insert or update of encrypted_password on auth.users
  for each row execute function public.never_store_passwords();

-- Anything that already has a password loses it.
update auth.users set encrypted_password = '' where encrypted_password is distinct from '';
