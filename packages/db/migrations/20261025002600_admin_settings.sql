-- P3.8: audited admin settings editor; floor increases update existing rates and queue notices.
create or replace function public.admin_settings(p_admin_id uuid)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare result jsonb;
begin
  if not exists (select 1 from public.profiles p where p.id = p_admin_id and p.is_admin) then
    raise exception 'admin_required' using errcode = '42501';
  end if;
  select coalesce(jsonb_object_agg(s.key, s.value), '{}'::jsonb) into result
    from public.settings s
   where s.key in ('floor_cents', 'budget_share_bps', 'min_withdrawal_cents', 'claim_days', 'cycle_hours', 'fraud_thresholds');
  return result;
end;
$$;

create or replace function public.admin_update_setting(p_key text, p_value jsonb, p_reason text, p_admin_id uuid)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_old jsonb;
  v_num numeric;
  v_reason text := left(trim(coalesce(p_reason, '')), 500);
  v_floor bigint;
  br record;
begin
  if not exists (select 1 from public.profiles p where p.id = p_admin_id and p.is_admin) then
    raise exception 'admin_required' using errcode = '42501';
  end if;
  if length(v_reason) < 3 then raise exception 'reason_required'; end if;
  if p_key not in ('floor_cents', 'budget_share_bps', 'min_withdrawal_cents', 'claim_days', 'cycle_hours', 'fraud_thresholds') then
    raise exception 'setting_not_editable';
  end if;
  if p_value is null then raise exception 'setting_value_invalid'; end if;

  select value into v_old from public.settings where key = p_key for update;
  if not found then raise exception 'setting_not_found'; end if;
  if v_old = p_value then return jsonb_build_object('changed', false, 'key', p_key); end if;

  if p_key = 'fraud_thresholds' then
    if jsonb_typeof(p_value) <> 'object'
      or jsonb_typeof(p_value->'flag_score') <> 'number'
      or (p_value->>'flag_score')::numeric < 1 or (p_value->>'flag_score')::numeric > 1000
      or (p_value->>'flag_score')::numeric <> trunc((p_value->>'flag_score')::numeric)
      or exists (select 1 from unnest(array['r1','r2','r3','r4','r5','r6','r8','r9']) as rules(rule_key)
                 where jsonb_typeof(p_value->rules.rule_key) <> 'object' or jsonb_typeof(p_value->rules.rule_key->'score') <> 'number'
                    or (p_value->rules.rule_key->>'score')::numeric < 0 or (p_value->rules.rule_key->>'score')::numeric > 1000
                    or (p_value->rules.rule_key->>'score')::numeric <> trunc((p_value->rules.rule_key->>'score')::numeric))
      or jsonb_typeof(p_value->'trust') <> 'object' then
      raise exception 'setting_value_invalid';
    end if;
  else
    if jsonb_typeof(p_value) <> 'number' then raise exception 'setting_value_invalid'; end if;
    v_num := (p_value #>> '{}')::numeric;
    if v_num <> trunc(v_num) or v_num < 0 or v_num > 2147483647 then raise exception 'setting_value_invalid'; end if;
    if p_key = 'floor_cents' and v_num < 10 then raise exception 'setting_value_invalid'; end if;
    if p_key = 'budget_share_bps' and v_num > 10000 then raise exception 'setting_value_invalid'; end if;
    if p_key = 'min_withdrawal_cents' and v_num < 1000 then raise exception 'setting_value_invalid'; end if;
    if p_key in ('claim_days', 'cycle_hours') and v_num < 1 then raise exception 'setting_value_invalid'; end if;
  end if;

  update public.settings set value = p_value where key = p_key;
  if p_key = 'floor_cents' and (p_value #>> '{}')::bigint > (v_old #>> '{}')::bigint then
    v_floor := (p_value #>> '{}')::bigint;
    for br in select id, owner_id, name, rate_cents from public.brands where rate_cents < v_floor for update
    loop
      update public.brands set rate_cents = v_floor where id = br.id;
      insert into public.audit_log (actor_id, action, subject_type, subject_id, details)
        values (p_admin_id, 'brand_rate_floor_raised', 'brand', br.id,
          jsonb_build_object('from_rate_cents', br.rate_cents, 'to_rate_cents', v_floor, 'setting_key', p_key));
      insert into public.notification_outbox (kind, recipient_user_id, payload, dedupe_key)
        values ('rate_floor_raised', br.owner_id,
          jsonb_build_object('name', br.name, 'rate_cents', v_floor, 'brand_id', br.id),
          'rate_floor_raised:' || br.id::text || ':' || v_floor::text)
        on conflict (dedupe_key) do nothing;
    end loop;
  end if;

  insert into public.audit_log (actor_id, action, subject_type, details)
    values (p_admin_id, 'setting_changed', 'setting', jsonb_build_object('key', p_key, 'from', v_old, 'to', p_value, 'reason', v_reason));
  return jsonb_build_object('changed', true, 'key', p_key);
end;
$$;

revoke all on function public.admin_settings(uuid) from public, anon, authenticated;
grant execute on function public.admin_settings(uuid) to service_role;
revoke all on function public.admin_update_setting(text, jsonb, text, uuid) from public, anon, authenticated;
grant execute on function public.admin_update_setting(text, jsonb, text, uuid) to service_role;
