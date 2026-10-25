-- Smoke test: the database is up and pg-boss created its schema.
do $$
begin
  assert (select count(*) from pgboss.queue) >= 7, 'expected the 7 worker queues to exist';
end $$;
select 'ok: 00_smoke' as result;
