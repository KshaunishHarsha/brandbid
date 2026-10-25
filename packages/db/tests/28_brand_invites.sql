-- P3.11: secure team invites, resend invalidation and email-bound acceptance.
begin;
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000000ef1', 'invite-owner@test.dev'),
  ('00000000-0000-0000-0000-000000000ef2', 'invitee@test.dev'),
  ('00000000-0000-0000-0000-000000000ef3', 'wrong-invitee@test.dev');
insert into public.brands (id, slug, name, url, owner_id, status, rate_cents)
values ('00000000-0000-0000-0000-000000000ef4', 'invite-brand', 'Invite Brand', 'https://invite.test', '00000000-0000-0000-0000-000000000ef1', 'active', 10);
insert into public.brand_members (brand_id, user_id, role)
values ('00000000-0000-0000-0000-000000000ef4', '00000000-0000-0000-0000-000000000ef1', 'owner');

do $$
declare first_invite jsonb; current_invite jsonb; invite_id uuid; old_hash text := repeat('a', 64); new_hash text := repeat('c', 64); tok_a text := repeat('b', 64); tok_b text := repeat('d', 64); accepted jsonb;
begin
  first_invite := public.create_brand_invite('00000000-0000-0000-0000-000000000ef4', '00000000-0000-0000-0000-000000000ef1', ' Invitee@Test.dev ', old_hash, tok_a, now() + interval '7 days');
  invite_id := (first_invite->>'invite_id')::uuid;
  current_invite := public.create_brand_invite('00000000-0000-0000-0000-000000000ef4', '00000000-0000-0000-0000-000000000ef1', 'invitee@test.dev', new_hash, tok_b, now() + interval '7 days');
  assert (current_invite->>'invite_id')::uuid = invite_id, 'resend refreshes the pending invitation';
  assert (select token_hash from public.brand_invites where id = invite_id) = new_hash, 'only the current token hash is stored';
  assert (select payload->>'token' from public.notification_outbox where kind = 'brand_invite' and payload->>'invite_id' = invite_id::text and sent_at is null) = tok_b, 'current raw token is queued only for email';
  assert (select payload ? 'token' from public.notification_outbox where kind = 'brand_invite' and dedupe_key like 'brand_invite:' || invite_id::text || ':' || old_hash) = false, 'superseded outbox token is erased';

  begin
    perform public.accept_brand_invite('00000000-0000-0000-0000-000000000ef2', old_hash);
    raise exception 'old token remained valid';
  exception when others then
    assert sqlerrm = 'brand_invite_not_found', 'resend invalidates the previous token';
  end;
  begin
    perform public.accept_brand_invite('00000000-0000-0000-0000-000000000ef3', new_hash);
    raise exception 'wrong email account accepted invite';
  exception when insufficient_privilege then null;
  end;

  accepted := public.accept_brand_invite('00000000-0000-0000-0000-000000000ef2', new_hash);
  assert (accepted->>'changed')::boolean and accepted->>'brand_slug' = 'invite-brand', 'email-matched invitee joins';
  assert (select role from public.brand_members where brand_id = '00000000-0000-0000-0000-000000000ef4' and user_id = '00000000-0000-0000-0000-000000000ef2') = 'member', 'invite grants member role only';
  assert not exists (select 1 from public.brand_members where brand_id = '00000000-0000-0000-0000-000000000ef4' and user_id = '00000000-0000-0000-0000-000000000ef3'), 'wrong account gains no access';
  accepted := public.accept_brand_invite('00000000-0000-0000-0000-000000000ef2', new_hash);
  assert not (accepted->>'changed')::boolean, 'same accepted invite is idempotent';
  begin
    perform public.create_brand_invite('00000000-0000-0000-0000-000000000ef4', '00000000-0000-0000-0000-000000000ef2', 'other@test.dev', old_hash, tok_a, now() + interval '7 days');
    raise exception 'member invited another teammate';
  exception when insufficient_privilege then null;
  end;
  assert has_function_privilege('service_role', 'public.create_brand_invite(uuid,uuid,text,text,text,timestamp with time zone)', 'EXECUTE');
  assert not has_function_privilege('authenticated', 'public.create_brand_invite(uuid,uuid,text,text,text,timestamp with time zone)', 'EXECUTE');
  assert not has_function_privilege('authenticated', 'public.accept_brand_invite(uuid,text)', 'EXECUTE');
end $$;

rollback;
select 'ok: 28_brand_invites' as result;
