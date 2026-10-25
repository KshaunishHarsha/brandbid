-- P3.11: brand members can report suspicious traffic for admin review.
alter table public.fraud_flags drop constraint fraud_flags_subject_type_check;
alter table public.fraud_flags add constraint fraud_flags_subject_type_check
  check (subject_type in ('earning', 'link', 'promoter', 'visitor', 'brand'));

create table public.brand_fraud_reports (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands(id),
  reported_by uuid not null references public.profiles(id),
  reason text not null check (length(reason) between 10 and 1000),
  created_at timestamptz not null default now()
);
create index brand_fraud_reports_brand_time_idx on public.brand_fraud_reports (brand_id, created_at desc);
alter table public.brand_fraud_reports enable row level security;
revoke all on public.brand_fraud_reports from public, anon, authenticated;
grant select, insert on public.brand_fraud_reports to service_role;

create or replace function public.report_brand_suspicious_traffic(p_brand_id uuid, p_reporter_id uuid, p_reason text)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  br public.brands%rowtype;
  v_reason text := left(trim(coalesce(p_reason, '')), 1000);
  v_report_id uuid;
  v_count int;
  v_flag_id uuid;
begin
  if length(v_reason) < 10 then raise exception 'report_reason_required'; end if;
  select * into br from public.brands where id = p_brand_id for share;
  if not found or br.status <> 'active' then raise exception 'brand_not_reportable'; end if;
  if not exists (select 1 from public.brand_members m where m.brand_id = p_brand_id and m.user_id = p_reporter_id) then
    raise exception 'brand_membership_required' using errcode = '42501';
  end if;
  if exists (select 1 from public.brand_fraud_reports r where r.brand_id = p_brand_id and r.reported_by = p_reporter_id and r.created_at > now() - interval '24 hours') then
    raise exception 'brand_report_rate_limited';
  end if;

  insert into public.brand_fraud_reports (brand_id, reported_by, reason)
    values (p_brand_id, p_reporter_id, v_reason) returning id into v_report_id;
  select count(*) into v_count from public.brand_fraud_reports where brand_id = p_brand_id;
  insert into public.fraud_flags (subject_type, subject_id, rule, score, details)
    values ('brand', p_brand_id, 'manual_report', 0,
      jsonb_build_object('brand_id', br.id, 'brand_name', br.name, 'brand_slug', br.slug,
        'report_count', v_count, 'latest_reason', v_reason, 'latest_reported_by', p_reporter_id, 'latest_report_id', v_report_id))
    on conflict (subject_type, subject_id, rule) do update
      set status = 'open', score = 0, details = excluded.details, created_at = now(), reviewed_by = null, reviewed_at = null
    returning id into v_flag_id;

  insert into public.audit_log (actor_id, action, subject_type, subject_id, details)
    values (p_reporter_id, 'brand_traffic_reported', 'brand', p_brand_id,
      jsonb_build_object('report_id', v_report_id, 'flag_id', v_flag_id, 'reason', v_reason));
  return jsonb_build_object('reported', true, 'flag_id', v_flag_id, 'report_count', v_count);
end;
$$;

revoke all on function public.report_brand_suspicious_traffic(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.report_brand_suspicious_traffic(uuid, uuid, text) to service_role;
