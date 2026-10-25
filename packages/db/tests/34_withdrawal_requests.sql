-- P3.6: verification gates, atomic balance reservation, first-withdrawal review and repeat request behavior.
begin;
insert into auth.users(id,email) values
 ('00000000-0000-0000-0000-000000000f21','withdraw-owner@test.dev'),
 ('00000000-0000-0000-0000-000000000f22','withdraw-promoter@test.dev'),
 ('00000000-0000-0000-0000-000000000f23','withdraw-unverified@test.dev');
update public.profiles set phone_verified_at=now(),kyc_status='verified' where id='00000000-0000-0000-0000-000000000f22';
update public.profiles set is_admin=true where id='00000000-0000-0000-0000-000000000f21';
insert into public.payout_accounts(promoter_id,provider,external_id,verified)
 values('00000000-0000-0000-0000-000000000f22','local-fixture','acct-withdraw-fixture',true);
insert into public.promoter_ledger(promoter_id,delta_cents,reason) values
 ('00000000-0000-0000-0000-000000000f22',2500,'earning'),
 ('00000000-0000-0000-0000-000000000f23',2500,'earning');
do $$ declare r jsonb; begin
  begin
    perform public.request_withdrawal('00000000-0000-0000-0000-000000000f23');
    raise exception 'unverified promoter request succeeded';
  exception when others then
    if sqlerrm<>'phone_verification_required' then raise; end if;
  end;
  update public.profiles set phone_verified_at=now() where id='00000000-0000-0000-0000-000000000f23';
  begin
    perform public.request_withdrawal('00000000-0000-0000-0000-000000000f23');
    raise exception 'unverified KYC request succeeded';
  exception when others then
    if sqlerrm<>'kyc_not_verified' then raise; end if;
  end;
  update public.profiles set kyc_status='verified' where id='00000000-0000-0000-0000-000000000f23';
  begin
    perform public.request_withdrawal('00000000-0000-0000-0000-000000000f23');
    raise exception 'missing payout account request succeeded';
  exception when others then
    if sqlerrm<>'payout_account_required' then raise; end if;
  end;
  insert into public.payout_accounts(promoter_id,provider,external_id,verified)
    values('00000000-0000-0000-0000-000000000f23','local-fixture','acct-withdraw-unverified',true);
  update public.promoter_ledger set delta_cents=500 where promoter_id='00000000-0000-0000-0000-000000000f23';
  begin
    perform public.request_withdrawal('00000000-0000-0000-0000-000000000f23');
    raise exception 'below-minimum request succeeded';
  exception when others then
    if sqlerrm<>'withdrawal_below_minimum' then raise; end if;
  end;
  r:=public.request_withdrawal('00000000-0000-0000-0000-000000000f22');
  assert r->>'status'='review' and (r->>'amount_cents')::bigint=2500,'first withdrawal enters manual review for full balance';
  assert (select sum(delta_cents) from public.promoter_ledger where promoter_id='00000000-0000-0000-0000-000000000f22')=0,'withdrawal reservation atomically debits balance';
  assert (select status from public.withdrawals where id=(r->>'withdrawal_id')::uuid)='review';
  assert (public.promoter_dashboard('00000000-0000-0000-0000-000000000f22')->'wallet'->>'withdrawal_open')::boolean,
    'promoter dashboard reports an open request';
  assert jsonb_array_length(public.promoter_dashboard('00000000-0000-0000-0000-000000000f22')->'wallet'->'withdrawals')=1,
    'promoter dashboard includes withdrawal history';
  begin
    perform public.request_withdrawal('00000000-0000-0000-0000-000000000f22');
    raise exception 'duplicate open withdrawal succeeded';
  exception when others then
    if sqlerrm<>'withdrawal_open' then raise; end if;
  end;
  perform public.admin_review_withdrawal('00000000-0000-0000-0000-000000000f21',(r->>'withdrawal_id')::uuid,'approve',null);
  update public.withdrawals set status='paid',external_ref='local-fixture-paid',paid_at=now() where id=(r->>'withdrawal_id')::uuid;
  insert into public.promoter_ledger(promoter_id,delta_cents,reason) values('00000000-0000-0000-0000-000000000f22',1500,'earning');
  r:=public.request_withdrawal('00000000-0000-0000-0000-000000000f22');
  assert r->>'status'='processing' and (r->>'amount_cents')::bigint=1500,'a later eligible withdrawal follows the reviewed first request';
  assert (select external_ref is null and paid_at is null from public.withdrawals where id=(r->>'withdrawal_id')::uuid),
    'request recording does not claim provider payment';
  assert not has_function_privilege('authenticated','public.request_withdrawal(uuid)','EXECUTE');
  assert has_function_privilege('service_role','public.request_withdrawal(uuid)','EXECUTE');
end $$;
rollback;
select 'ok: 34_withdrawal_requests' as result;
