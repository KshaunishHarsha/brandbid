-- Corrects 20261025000400_rls.sql.
--
-- Postgres grants EXECUTE on every new function to PUBLIC by default. `ALTER DEFAULT PRIVILEGES
-- IN SCHEMA public REVOKE ... FROM public` cannot remove that built-in default (it only edits
-- schema-level entries). The form without IN SCHEMA can. Without this, any function created by a
-- later migration would be callable by anon and authenticated.
--
-- Service role keeps EXECUTE through the existing schema-level default entry.
alter default privileges for role postgres revoke execute on functions from public;

-- Belt and braces for anything that already exists.
revoke execute on all functions in schema public from public, anon;
revoke execute on all functions in schema public from authenticated;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.is_brand_member(uuid) to authenticated;
