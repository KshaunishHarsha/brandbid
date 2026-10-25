-- P2.1: closed-beta allowlist and a place to keep waitlist requests.
-- SQL null means the beta gate is open. An empty array means invite-only with no invitations yet.
alter table public.settings alter column value drop not null;
alter table public.settings add constraint settings_null_only_for_beta check (value is not null or key = 'beta_allowlist');

insert into public.settings (key, value)
values ('beta_allowlist', '[]'::jsonb)
on conflict (key) do nothing;

create table public.beta_waitlist (
  id bigserial primary key,
  email citext not null unique,
  created_at timestamptz not null default now()
);

alter table public.beta_waitlist enable row level security;
-- Only server-side service-role code can read or write this table.
revoke all on public.beta_waitlist from anon, authenticated;
revoke all on sequence public.beta_waitlist_id_seq from anon, authenticated;
