-- Leaderboards and the claim price (P1.7). BUILD.md sections 8 and 9, D1.
--
-- All SECURITY INVOKER and service-role only, like the other functions: public pages read them
-- through the server, so no client role ever needs access to the bids table.
--
-- Ranking everywhere: higher total first; ties go to whoever REACHED that total first (G1); then id, so the
-- order is always fully determined.

insert into public.settings (key, value) values ('rank_step_cents', '100')   -- "+ $1" in the claim price
on conflict (key) do nothing;

-- 00:00 UTC today (Q3: the daily board uses UTC).
create function public.utc_day_start()
returns timestamptz
language sql stable
as $$
  select date_trunc('day', now() at time zone 'utc') at time zone 'utc'
$$;

-- ---------------------------------------------------------------- all-time board
create function public.leaderboard_all_time(
  p_category_id int default null,
  p_limit int default 50,
  p_offset int default 0
)
returns table (
  board_rank bigint, brand_id uuid, slug citext, name text, description text, logo_path text,
  url text, category_id int, total_paid_cents bigint,
  take_price_cents bigint   -- what a NEW brand pays to take this exact spot (= claim_price(null, board_rank))
)
language sql stable
as $$
  select row_number() over (order by b.total_paid_cents desc, b.total_reached_at asc nulls last, b.id),
         b.id, b.slug, b.name, b.description, b.logo_path, b.url, b.category_id, b.total_paid_cents,
         greatest(b.total_paid_cents + (select (value #>> '{}')::bigint from public.settings where key = 'rank_step_cents'),
                  (select (value #>> '{}')::bigint from public.settings where key = 'min_bid_cents'))
  from public.brands b
  where b.status = 'active'
    and (p_category_id is null or b.category_id = p_category_id)
  order by 1
  limit greatest(p_limit, 0) offset greatest(p_offset, 0)
$$;

-- ---------------------------------------------------------------- today's board (UTC day)
-- Sum of succeeded bids since 00:00 UTC. Refunded bids don't count. A live query: exact, never stale.
create function public.leaderboard_today(
  p_category_id int default null,
  p_limit int default 50,
  p_offset int default 0
)
returns table (
  board_rank bigint, brand_id uuid, slug citext, name text, description text, logo_path text,
  url text, category_id int, total_paid_cents bigint, today_cents bigint
)
language sql stable
as $$
  with today as (
    select x.brand_id, sum(x.amount_cents)::bigint as cents, max(x.created_at) as reached_at
    from public.bids x
    where x.status = 'succeeded' and x.created_at >= public.utc_day_start()
    group by x.brand_id
  )
  select row_number() over (order by t.cents desc, t.reached_at asc, b.id),
         b.id, b.slug, b.name, b.description, b.logo_path, b.url, b.category_id, b.total_paid_cents, t.cents
  from today t
  join public.brands b on b.id = t.brand_id
  where b.status = 'active'
    and (p_category_id is null or b.category_id = p_category_id)
  order by 1
  limit greatest(p_limit, 0) offset greatest(p_offset, 0)
$$;

-- ---------------------------------------------------------------- one brand's positions
create function public.brand_ranks(p_brand_id uuid)
returns table (all_time_rank bigint, today_rank bigint, today_cents bigint)
language sql stable
as $$
  select (select a.board_rank from public.leaderboard_all_time(null, 1000000, 0) a where a.brand_id = p_brand_id),
         (select t.board_rank from public.leaderboard_today(null, 1000000, 0) t where t.brand_id = p_brand_id),
         coalesce((select t.today_cents from public.leaderboard_today(null, 1000000, 0) t where t.brand_id = p_brand_id), 0)
$$;

-- ---------------------------------------------------------------- claim price
-- What it costs to take all-time rank p_rank: (holder's total - my total) + $1, never below the minimum bid.
--   p_brand_id null  -> a brand that is not listed yet (my total = 0)
--   past the end of the board -> the minimum bid
--   the brand already holds that rank or better -> NULL
-- Paying exactly this puts the brand at p_rank or better: the +$1 beats the holder outright, so a tie never decides it.
create function public.claim_price(p_brand_id uuid, p_rank int)
returns bigint
language plpgsql stable
as $$
declare
  v_min bigint;
  v_step bigint;
  v_my_total bigint := 0;
  v_my_rank bigint;
  v_holder_total bigint;
begin
  if p_rank is null or p_rank < 1 then
    raise exception 'invalid_rank';
  end if;
  select (value #>> '{}')::bigint into v_min from public.settings where key = 'min_bid_cents';
  select (value #>> '{}')::bigint into v_step from public.settings where key = 'rank_step_cents';

  if p_brand_id is not null then
    select b.total_paid_cents into v_my_total from public.brands b where b.id = p_brand_id;
    if not found then
      raise exception 'brand_not_found';
    end if;
    -- A brand that is not live (draft / in review) is not on the board, so it has no rank to defend.
    select a.board_rank into v_my_rank from public.leaderboard_all_time(null, 1000000, 0) a where a.brand_id = p_brand_id;
    if v_my_rank is not null and p_rank >= v_my_rank then
      return null;
    end if;
  end if;

  select a.total_paid_cents into v_holder_total from public.leaderboard_all_time(null, 1, p_rank - 1) a;
  if not found then
    return v_min; -- past the end of the board
  end if;
  return greatest(v_holder_total - v_my_total + v_step, v_min);
end;
$$;

-- A short menu of prices for the checkout: the top ranks, a few round ranks, and "join the board".
create function public.claim_price_ladder(p_brand_id uuid default null)
returns table (target_rank int, price_cents bigint)
language sql stable
as $$
  with size as (select count(*)::int as n from public.brands where status = 'active'),
       cand as (
         select distinct r from (
           select unnest(array[1, 2, 3, 5, 10, 25, 50, 100]) as r
           union all select n + 1 from size
         ) c
       ),
       priced as (
         select c.r as target_rank, public.claim_price(p_brand_id, c.r) as price_cents
         from cand c, size s
         where c.r <= s.n + 1
       )
  select target_rank, price_cents from priced where price_cents is not null order by target_rank
$$;

-- Category tabs: only categories that have live brands.
create function public.category_counts()
returns table (id int, slug text, name text, live_brands bigint)
language sql stable
as $$
  select c.id, c.slug, c.name, count(b.id)
  from public.categories c
  join public.brands b on b.category_id = c.id and b.status = 'active'
  group by c.id, c.slug, c.name
  order by count(b.id) desc, c.name
$$;
