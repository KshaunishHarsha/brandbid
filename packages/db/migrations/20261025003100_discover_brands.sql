-- P4.2: let promoters discover active brands with an enabled, funded campaign.
create or replace function public.discover_brands(p_limit int default 50, p_offset int default 0)
returns table(brand_id uuid, slug text, name text, description text, logo_path text, url text,
  rate_cents bigint, remaining_budget_cents bigint, visitors_left bigint)
language sql stable security definer set search_path = ''
as $$
  select b.id,b.slug::text,b.name,b.description,b.logo_path,b.url,b.rate_cents,b.budget_cents,
         floor(b.budget_cents::numeric / b.rate_cents)::bigint
    from public.brands b
   where b.status='active' and b.ads_enabled and b.budget_cents >= b.rate_cents
   order by (b.rate_cents::numeric * b.budget_cents::numeric) desc,b.rate_cents desc,b.budget_cents desc,b.id
   limit greatest(1,least(coalesce(p_limit,50),100)) offset greatest(coalesce(p_offset,0),0)
$$;

revoke all on function public.discover_brands(int,int) from public, authenticated;
grant execute on function public.discover_brands(int,int) to anon, authenticated, service_role;
