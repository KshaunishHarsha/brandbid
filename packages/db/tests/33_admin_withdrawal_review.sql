-- P3.8: admin approval moves to processing, hold records a reason, and every decision is audited.
begin;
insert into auth.users (id,email) values
 ('00000000-0000-0000-0000-000000000fe1','withdraw-admin@test.dev'),
 ('00000000-0000-0000-0000-000000000fe2','withdraw-promoter@test.dev');
update public.profiles set is_admin=true where id='00000000-0000-0000-0000-000000000fe1';
insert into public.withdrawals (id,promoter_id,amount_cents,provider,status) values
 ('00000000-0000-0000-0000-000000000fe3','00000000-0000-0000-0000-000000000fe2',2500,'future-provider','review'),
 ('00000000-0000-0000-0000-000000000fe4','00000000-0000-0000-0000-000000000fe2',3000,'future-provider','review');
do $$ declare r jsonb; q jsonb; begin
  r := public.admin_review_withdrawal('00000000-0000-0000-0000-000000000fe1','00000000-0000-0000-0000-000000000fe3','approve',null);
  assert r->>'status'='processing' and (select status from public.withdrawals where id='00000000-0000-0000-0000-000000000fe3')='processing', 'approved withdrawal moves to processing';
  r := public.admin_review_withdrawal('00000000-0000-0000-0000-000000000fe1','00000000-0000-0000-0000-000000000fe4','hold','Verify payout account ownership');
  assert r->>'status'='held' and (select review_note from public.withdrawals where id='00000000-0000-0000-0000-000000000fe4')='Verify payout account ownership', 'hold requires a reason';
  q := public.admin_withdrawal_queue('00000000-0000-0000-0000-000000000fe1',10);
  assert jsonb_array_length(q)=1 and q->0->>'id'='00000000-0000-0000-0000-000000000fe4', 'queue lists held withdrawals for follow-up';
  assert (select count(*) from public.audit_log where action in ('withdrawal_approve','withdrawal_hold') and actor_id='00000000-0000-0000-0000-000000000fe1')=2, 'both review decisions are audited';
  begin
    perform public.admin_review_withdrawal('00000000-0000-0000-0000-000000000fe1','00000000-0000-0000-0000-000000000fe4','hold','');
  exception when others then
    if sqlerrm <> 'reason_required' then raise; end if;
    r := jsonb_build_object('reason_required',true);
  end;
  assert r->>'reason_required'='true', 'hold requires meaningful reason';
  assert not has_function_privilege('authenticated','public.admin_withdrawal_queue(uuid,integer)','EXECUTE');
  assert has_function_privilege('service_role','public.admin_review_withdrawal(uuid,uuid,text,text)','EXECUTE');
end $$;
rollback;
select 'ok: 33_admin_withdrawal_review' as result;
