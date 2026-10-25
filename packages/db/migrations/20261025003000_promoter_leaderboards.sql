-- P4.1: public promoter boards count settled earnings only; opted-out handles are suppressed at read time.
create materialized view public.promoter_leaderboard_all_time as
select e.promoter_id, sum(e.amount_cents)::bigint as earned_cents, count(*)::bigint as qualified_visitors
  from public.earnings e
 where e.status='available' and e.settled_at is not null
 group by e.promoter_id;
create unique index promoter_leaderboard_all_time_promoter_idx on public.promoter_leaderboard_all_time(promoter_id);

create materialized view public.promoter_leaderboard_week as
select e.promoter_id, sum(e.amount_cents)::bigint as earned_cents, count(*)::bigint as qualified_visitors
  from public.earnings e
 where e.status='available' and e.settled_at >= (date_trunc('week', now() at time zone 'UTC') at time zone 'UTC')
   and e.settled_at < ((date_trunc('week', now() at time zone 'UTC') + interval '7 days') at time zone 'UTC')
 group by e.promoter_id;
create unique index promoter_leaderboard_week_promoter_idx on public.promoter_leaderboard_week(promoter_id);

revoke all on public.promoter_leaderboard_all_time, public.promoter_leaderboard_week from public, anon, authenticated;

create or replace function public.promoter_leaderboard(p_period text, p_limit int default 50, p_offset int default 0)
returns table(board_rank bigint, handle text, earned_cents bigint, qualified_visitors bigint)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if p_period is null or p_period not in ('week','all_time') then raise exception 'invalid_promoter_board_period'; end if;
  return query
    with source as (
      select a.promoter_id,a.earned_cents,a.qualified_visitors from public.promoter_leaderboard_all_time a where p_period='all_time'
      union all
      select w.promoter_id,w.earned_cents,w.qualified_visitors from public.promoter_leaderboard_week w where p_period='week'
    ), ranked as (
      select row_number() over (order by s.earned_cents desc, coalesce(p.handle::text,'') asc, s.promoter_id) as rank,
        case when p.leaderboard_public and p.handle is not null then p.handle::text else 'anonymous' end as display_handle,
        s.earned_cents,s.qualified_visitors
        from source s join public.profiles p on p.id=s.promoter_id
       where s.earned_cents > 0 and p.status='active'
    )
    select r.rank,r.display_handle,r.earned_cents,r.qualified_visitors from ranked r
     where r.rank > greatest(coalesce(p_offset,0),0)
     order by r.rank limit greatest(1,least(coalesce(p_limit,50),100));
end;
$$;

revoke all on function public.promoter_leaderboard(text,int,int) from public, authenticated;
grant execute on function public.promoter_leaderboard(text,int,int) to anon, authenticated, service_role;
