-- P3.1: optional product alerts can be unsubscribed once; transactional notices are not preference-gated.
begin;
insert into auth.users(id,email) values
 ('00000000-0000-0000-0000-000000000f31','mail-pref@test.dev'),
 ('00000000-0000-0000-0000-000000000f32','mail-transactional@test.dev');
insert into public.email_unsubscribe_tokens(token_hash,user_id,category,expires_at) values
 (repeat('a',64),'00000000-0000-0000-0000-000000000f31','product_alerts',now()+interval '1 day'),
 (repeat('b',64),'00000000-0000-0000-0000-000000000f32','product_alerts',now()+interval '1 day'),
 (repeat('c',64),'00000000-0000-0000-0000-000000000f32','product_alerts',now()-interval '1 day');
do $$ begin
  assert public.email_unsubscribe_status(repeat('a',64)), 'valid token can open confirmation page';
  assert not public.email_unsubscribe_status(repeat('c',64)), 'expired token is invalid';
  assert public.confirm_email_unsubscribe(repeat('a',64)), 'confirmation records opt-out';
  assert not (select product_emails_enabled from public.profiles where id='00000000-0000-0000-0000-000000000f31');
  assert not public.email_unsubscribe_status(repeat('a',64)), 'token is single-use';
  begin
    perform public.confirm_email_unsubscribe(repeat('a',64));
    raise exception 'consumed token succeeded';
  exception when others then
    if sqlerrm<>'unsubscribe_token_invalid' then raise; end if;
  end;
  assert (select product_emails_enabled from public.profiles where id='00000000-0000-0000-0000-000000000f32'), 'other account remains opted in';
  assert not has_function_privilege('authenticated','public.confirm_email_unsubscribe(text)','EXECUTE');
  assert has_function_privilege('service_role','public.confirm_email_unsubscribe(text)','EXECUTE');
end $$;
rollback;
select 'ok: 35_email_preferences' as result;
