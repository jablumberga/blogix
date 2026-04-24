-- push_tokens: stores APNS device tokens per user
-- user_id matches the id field from auth JWT: "1" = admin, "p-N" = partner, "d-N" = driver

create table if not exists push_tokens (
  id          bigserial primary key,
  user_id     text        not null unique,
  token       text        not null,
  platform    text        not null default 'ios',
  updated_at  timestamptz not null default now()
);

-- Only service_role (used by Netlify functions) can read/write this table
alter table push_tokens enable row level security;

create policy "service_role_full_access" on push_tokens
  using (true)
  with check (true);

-- Index for role-based sends (pattern: "p-%" for partners, "d-%" for drivers)
create index if not exists push_tokens_user_id_idx on push_tokens (user_id);

-- Run in Supabase Dashboard → SQL Editor, or via: supabase db push
