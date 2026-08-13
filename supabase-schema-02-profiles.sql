-- ═══════════════════════════════════════════════════════════════════
--  Synopsical — 02: profiles (the multi-user / plan foundation)
--
--  Run this in the SQL Editor the same way as the first script — it's
--  additive, so you don't need to re-run supabase-schema.sql first.
--
--  What this does NOT do: charge anyone, talk to Stripe, or gate any
--  feature. It just gives every account a "plan" column that starts as
--  'free' and a place for Stripe's IDs to live once you're ready to wire
--  up billing. Building that column in now means a future subscription
--  feature is a small addition here, not a migration touching every
--  table you already have.
-- ═══════════════════════════════════════════════════════════════════

create table if not exists profiles (
  id                     uuid primary key references auth.users(id) on delete cascade,
  email                  text,
  plan                   text not null default 'free' check (plan in ('free', 'paid')),

  -- Populated later, by a server-side Stripe webhook handler — never by
  -- the browser. See the note on the policy below for why.
  stripe_customer_id     text,
  stripe_subscription_id text,
  subscription_status    text,

  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

alter table profiles enable row level security;

-- Everyone can read their own plan — the app needs this to decide what
-- to show. Nobody can write to it directly.
drop policy if exists profiles_read_own on profiles;
create policy profiles_read_own on profiles
  for select using (id = auth.uid());

-- Deliberately no insert/update/delete policy for the `authenticated`
-- role. If a user could set their own `plan` column, they could just set
-- it to 'paid' themselves — the row can only be written by a process
-- using the service_role key, which bypasses RLS entirely and only ever
-- runs on a server you control, such as a Stripe webhook handler.

-- A new profile row is created automatically the moment someone signs
-- up, so the app never has to remember to do this itself.
create or replace function handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email) values (new.id, new.email);
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- Reused from the first script in case this file is ever run on its own.
create or replace function touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists profiles_touch on profiles;
create trigger profiles_touch before update on profiles
  for each row execute function touch_updated_at();
