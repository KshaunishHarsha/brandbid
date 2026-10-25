-- P3.8: admin review/hold controls for first and low-trust withdrawals.
alter table public.withdrawals drop constraint withdrawals_status_check;
alter table public.withdrawals add constraint withdrawals_status_check
  check (status in ('requested','review','held','processing','paid','failed'));
alter table public.withdrawals add column reviewed_by uuid references public.profiles(id);
alter table public.withdrawals add column reviewed_at timestamptz;
alter table public.withdrawals add column review_note text;

create or replace function public.admin_withdrawal_queue(p_admin_id uuid, p_limit int default 100)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare result jsonb;
begin
  if not exists(select 1 from public.profiles where id=p_admin_id and is_admin) then raise exception 'admin_required' using errcode='42501'; end if;
  select coalesce(jsonb_agg(x.row_data order by x.created_at desc),'[]'::jsonb) into result from (
    select w.created_at,jsonb_build_object('id',w.id,'promoter_id',w.promoter_id,'handle',p.handle,'amount_cents',w.amount_cents,
      'fee_cents',w.fee_cents,'provider',w.provider,'status',w.status,'external_ref',w.external_ref,'created_at',w.created_at,
      'trust_score',p.trust_score,'kyc_status',p.kyc_status,'reviewed_at',w.reviewed_at,'review_note',w.review_note)
      as row_data
      from public.withdrawals w join public.profiles p on p.id=w.promoter_id
     where w.status in ('review','held') order by w.created_at desc limit greatest(1,least(coalesce(p_limit,100),500))
  ) x;
  return result;
end;
$$;

create or replace function public.admin_review_withdrawal(p_admin_id uuid,p_withdrawal_id uuid,p_decision text,p_reason text default null)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare w public.withdrawals%rowtype; v_reason text := left(trim(coalesce(p_reason,'')),500); v_status text;
begin
  if not exists(select 1 from public.profiles where id=p_admin_id and is_admin) then raise exception 'admin_required' using errcode='42501'; end if;
  if p_decision is null or p_decision not in ('approve','hold') then raise exception 'invalid_withdrawal_decision'; end if;
  if p_decision='hold' and length(v_reason)<3 then raise exception 'reason_required'; end if;
  select * into w from public.withdrawals where id=p_withdrawal_id for update;
  if not found then raise exception 'withdrawal_not_found'; end if;
  if w.status not in ('review','held') then raise exception 'withdrawal_not_reviewable'; end if;
  v_status := case when p_decision='approve' then 'processing' else 'held' end;
  update public.withdrawals set status=v_status,reviewed_by=p_admin_id,reviewed_at=now(),review_note=case when p_decision='hold' then v_reason else null end where id=w.id;
  insert into public.audit_log(actor_id,action,subject_type,subject_id,details)
    values(p_admin_id,'withdrawal_'||p_decision,'withdrawal',w.id,jsonb_build_object('promoter_id',w.promoter_id,'from_status',w.status,'to_status',v_status,'reason',case when p_decision='hold' then v_reason else null end));
  return jsonb_build_object('changed',true,'status',v_status);
end;
$$;

revoke all on function public.admin_withdrawal_queue(uuid,int) from public,anon,authenticated;
grant execute on function public.admin_withdrawal_queue(uuid,int) to service_role;
revoke all on function public.admin_review_withdrawal(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.admin_review_withdrawal(uuid,uuid,text,text) to service_role;
