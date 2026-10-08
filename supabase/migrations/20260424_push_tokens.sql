-- push_tokens: stores APNS device tokens per user
-- user_id matches the id field from auth JWT: "1" = admin, "p-N" = partner, "d-N" = driver
-- Only accessible via service_role (Netlify functions); no anon/authenticated access.

create table if not exists push_tokens (
  id          bigserial primary key,
  user_id     text        not null unique,
  token       text        not null,
  platform    text        not null default 'ios',
  updated_at  timestamptz not null default now()
);

alter table push_tokens enable row level security;

-- Block all access except service_role (which bypasses RLS entirely)
-- anon and authenticated roles cannot read, write, or enumerate tokens
create policy "block_non_service_roles" on push_tokens
  as restrictive
  to anon, authenticated
  using (false)
  with check (false);

create index if not exists push_tokens_user_id_idx on push_tokens (user_id);
create index if not exists push_tokens_token_idx   on push_tokens (token);

-- Run in Supabase Dashboard → SQL Editor
