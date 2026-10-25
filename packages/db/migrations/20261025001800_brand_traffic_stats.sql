-- P2.12: expose only brand-scoped daily/channel/country aggregates to a verified member.
create or replace function public.brand_traffic_stats(p_brand_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
begin
  if p_brand_id is null or not public.is_brand_member(p_brand_id) then
    raise exception 'brand_membership_required' using errcode = '42501';
  end if;

  return (
    with bounds as (
      select
        ((now() at time zone 'UTC')::date - 29) as first_day,
        ((now() at time zone 'UTC')::date + 1) as after_last_day
    ),
    events as (
      select c.created_at as at, l.channel::text as channel, coalesce(nullif(c.country::text, ''), 'Unknown') as country,
        1::bigint as clicks, 0::bigint as qualified_visitors, 0::bigint as click_throughs
      from public.clicks c
      join public.links l on l.id = c.link_id and l.brand_id = p_brand_id
      where c.brand_id = p_brand_id and c.ignored_reason is null

      union all

      select v.qualified_at as at, l.channel::text as channel, coalesce(nullif(qc.country::text, ''), 'Unknown') as country,
        0::bigint, 1::bigint, 0::bigint
      from public.visitors v
      join public.links l on l.id = v.claim_link_id and l.brand_id = p_brand_id
      left join public.clicks qc on qc.id = v.qualified_click_id and qc.brand_id = p_brand_id
      where v.brand_id = p_brand_id and v.qualified_at is not null

      union all

      select c.outbound_at as at, l.channel::text as channel, coalesce(nullif(c.country::text, ''), 'Unknown') as country,
        0::bigint, 0::bigint, 1::bigint
      from public.clicks c
      join public.links l on l.id = c.link_id and l.brand_id = p_brand_id
      where c.brand_id = p_brand_id and c.outbound_at is not null
    ),
    grouped as (
      select (e.at at time zone 'UTC')::date as day, e.channel, e.country,
        sum(e.clicks)::bigint as clicks,
        sum(e.qualified_visitors)::bigint as qualified_visitors,
        sum(e.click_throughs)::bigint as click_throughs
      from events e cross join bounds b
      where e.at >= (b.first_day::timestamp at time zone 'UTC')
        and e.at < (b.after_last_day::timestamp at time zone 'UTC')
      group by 1, 2, 3
    ),
    days as (
      select generate_series(b.first_day, b.after_last_day - 1, interval '1 day')::date as day
      from bounds b
    ),
    daily as (
      select d.day, coalesce(sum(g.clicks), 0)::bigint as clicks,
        coalesce(sum(g.qualified_visitors), 0)::bigint as qualified_visitors,
        coalesce(sum(g.click_throughs), 0)::bigint as click_throughs
      from days d left join grouped g on g.day = d.day
      group by d.day order by d.day
    ),
    channels as (
      select g.channel, sum(g.clicks)::bigint as clicks,
        sum(g.qualified_visitors)::bigint as qualified_visitors,
        sum(g.click_throughs)::bigint as click_throughs
      from grouped g group by g.channel
    ),
    countries as (
      select g.country, sum(g.clicks)::bigint as clicks,
        sum(g.qualified_visitors)::bigint as qualified_visitors,
        sum(g.click_throughs)::bigint as click_throughs
      from grouped g group by g.country
    )
    select jsonb_build_object(
      'daily', coalesce((select jsonb_agg(to_jsonb(d) order by d.day) from daily d), '[]'::jsonb),
      'channels', coalesce((select jsonb_agg(to_jsonb(c) order by c.channel) from channels c), '[]'::jsonb),
      'countries', coalesce((select jsonb_agg(to_jsonb(c) order by c.clicks desc, c.country) from countries c), '[]'::jsonb)
    )
  );
end;
$$;

revoke all on function public.brand_traffic_stats(uuid) from public, anon, authenticated;
grant execute on function public.brand_traffic_stats(uuid) to authenticated;
