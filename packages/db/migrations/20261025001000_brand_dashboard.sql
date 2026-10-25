-- Brand dashboard numbers (P1.10). BUILD.md section 17.
-- Service-role only like the other functions; the web app checks that the caller is a member of the brand first.

-- Where a brand's ad budget stands, straight from the ledger:
--   remaining = added - spent - refunded       (remaining is the cached brands.budget_cents; the nightly reconciliation checks it)
--   spent     = visitors paid, minus any returned by a reversal
--   owed      = qualified visitors still waiting for budget (D36): the next bid pays them first
create function public.brand_budget_summary(p_brand_id uuid)
returns table (
  remaining_cents bigint, added_cents bigint, spent_cents bigint, refunded_cents bigint,
  waitlisted_cents bigint, waitlisted_count bigint, rate_cents bigint, visitors_left bigint
)
language sql stable
as $$
  select b.budget_cents,
         coalesce(sum(l.delta_cents) filter (where l.reason = 'bid'), 0)::bigint,
         (-coalesce(sum(l.delta_cents) filter (where l.reason in ('visitor', 'reversal')), 0))::bigint,
         (-coalesce(sum(l.delta_cents) filter (where l.reason = 'refund'), 0))::bigint,
         (select coalesce(sum(e.amount_cents), 0) from public.earnings e where e.brand_id = b.id and e.status = 'waitlisted')::bigint,
         (select count(*) from public.earnings e where e.brand_id = b.id and e.status = 'waitlisted')::bigint,
         b.rate_cents,
         (b.budget_cents / b.rate_cents)::bigint
  from public.brands b
  left join public.budget_ledger l on l.brand_id = b.id
  where b.id = p_brand_id
  group by b.id
$$;
