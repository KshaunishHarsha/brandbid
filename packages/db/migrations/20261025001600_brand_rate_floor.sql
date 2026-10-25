-- P2.10: the database is authoritative for the current floor and pause state.
create or replace function public.enforce_brand_rate_floor()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_floor bigint;
begin
  select (s.value #>> '{}')::bigint into v_floor
    from public.settings s where s.key = 'floor_cents';
  if v_floor is null then
    raise exception 'floor_not_configured' using errcode = 'P0001';
  end if;
  if new.rate_cents < v_floor then
    raise exception 'brand_rate_below_floor' using errcode = '23514';
  end if;

  new.ads_enabled := new.status = 'active'
    and new.budget_cents >= new.rate_cents
    and not exists (
      select 1 from public.earnings e
      where e.brand_id = new.id and e.status = 'waitlisted'
    );
  return new;
end;
$$;

create trigger brands_enforce_rate_floor
  before update of rate_cents on public.brands
  for each row execute function public.enforce_brand_rate_floor();
