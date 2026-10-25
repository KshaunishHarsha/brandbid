begin;
truncate table public.profiles, public.brands, public.audit_log, public.notification_outbox, public.member_signals cascade;
delete from auth.users;
update public.settings set value = '["promoter@test.dev"]'::jsonb where key = 'beta_allowlist';
insert into auth.users (id, email, email_confirmed_at) values
  ('00000000-0000-0000-0000-0000000000a1', 'owner@test.dev', now()),
  ('00000000-0000-0000-0000-0000000000a2', 'promoter@test.dev', now());
update public.profiles set handle = 'promoter', promoter_terms_accepted_at = now() where id = '00000000-0000-0000-0000-0000000000a2';
insert into public.brands (id, slug, name, url, owner_id, status, rate_cents)
values ('00000000-0000-0000-0000-0000000000b1', 'brand-one', 'Brand', 'https://brand.example.com', '00000000-0000-0000-0000-0000000000a1', 'active', 10);

do $$
declare a public.links; b public.links;
begin
  a := public.get_or_create_link('00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-0000000000b1', 'x', 'Abc12345');
  b := public.get_or_create_link('00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-0000000000b1', 'x', 'Def12345');
  assert a.id = b.id and a.code = 'Abc12345', 'existing link stays stable';
  assert (select count(*) from public.links) = 1, 'one link per tuple';
end $$;

insert into public.brand_members (brand_id, user_id, role) values
  ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000a2', 'member');
do $$ begin
  perform public.get_or_create_link('00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-0000000000b1', 'link', 'Ghi12345');
  raise exception 'member accepted';
exception when raise_exception then
  if sqlerrm <> 'self_promotion' then raise; end if;
end $$;
delete from public.brand_members where user_id = '00000000-0000-0000-0000-0000000000a2';
update public.profiles set status = 'suspended' where id = '00000000-0000-0000-0000-0000000000a2';
do $$ begin
  perform public.get_or_create_link('00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-0000000000b1', 'link', 'Ghi12345');
  raise exception 'suspended accepted';
exception when raise_exception then
  if sqlerrm <> 'not_eligible' then raise; end if;
end $$;
rollback;
select 'ok: 09_share_links' as result;
