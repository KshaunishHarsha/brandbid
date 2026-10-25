-- Smoke test: migrations applied and seed data is present.
do $$
begin
  assert (select count(*) from public.settings) >= 10, 'settings not seeded';
  assert (select count(*) from public.categories) = 19, 'categories not seeded';
  assert (select value from public.settings where key = 'budget_share_bps') = '5000'::jsonb, 'wrong budget share';
end $$;
select 'ok: 00_smoke' as result;
