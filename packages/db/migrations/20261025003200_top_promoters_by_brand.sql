-- P4.3: settled promoter totals for a live brand, with opt-out identities suppressed.
create index earnings_available_brand_settled_idx on public.earnings (brand_id, settled_at desc)
  include (promoter_id, amount_cents) where status='available';

create or replace function public.top_promoters_for_brand(p_brand_id uuid, p_limit int default 10)
returns table(board_rank bigint, handle text, is_anonymous boolean, earned_cents bigint, qualified_visitors bigint)
language sql stable security definer set search_path = ''
as $$
  with totals as (
    select e.promoter_id,sum(e.amount_cents)::bigint as earned_cents,count(*)::bigint as qualified_visitors
      from public.earnings e join public.profiles p on p.id=e.promoter_id
     where e.brand_id=p_brand_id and e.status='available' and e.settled_at is not null and p.status='active'
       and exists(select 1 from public.brands b where b.id=p_brand_id and b.status='active')
     group by e.promoter_id
  ), ranked as (
    select row_number() over (order by t.earned_cents desc,coalesce(p.handle::text,'') asc,t.promoter_id) as rank,
      case when p.leaderboard_public then p.handle::text else null end as display_handle,
      not p.leaderboard_public as anonymous,t.earned_cents,t.qualified_visitors
      from totals t join public.profiles p on p.id=t.promoter_id
  )
  select r.rank,r.display_handle,r.anonymous,r.earned_cents,r.qualified_visitors from ranked r
   order by r.rank limit greatest(1,least(coalesce(p_limit,10),50))
$$;

revoke all on function public.top_promoters_for_brand(uuid,int) from public, authenticated;
grant execute on function public.top_promoters_for_brand(uuid,int) to anon, authenticated, service_role;
