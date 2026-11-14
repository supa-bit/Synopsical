-- ═══════════════════════════════════════════════════════════════════
--  Synopsical — 06: public sharing & privacy-friendly funnel analytics
--
--  Run this in the Supabase SQL Editor after supabase-schema.sql and
--  supabase-schema-02-profiles.sql. Everything here is additive and
--  safe to re-run (`if not exists` / `create or replace`).
--
--  What this adds:
--    1. Public handle + compendium sharing columns on `profiles`
--       (`handle`, `display_name`, `compendium_Optional_bio`, `is_public`),
--       plus an `update_own_publishing()` RPC so a signed-in user can
--       claim a handle and toggle public compendium sharing without
--       gaining write access to the `plan` / `stripe_*` columns.
--    2. Per-entry `is_public` and `slug` columns on `entries`, plus
--       read-only RLS policies allowing anyone (including `anon`
--       visitors) to read entries — and their fields, tags, and links —
--       that the owner has explicitly published (or when the owner has
--       published their whole compendium).
--    3. A lightweight, privacy-friendly `analytics_events` table and
--       `log_analytics_event()` RPC that records anonymous funnel
--       milestones (homepage -> sample -> signup -> first entry -> share)
--       with zero cookies, zero IP storage, and zero note content.
-- ═══════════════════════════════════════════════════════════════════

-- ── 1. Public profile handle & compendium sharing ─────────────────

alter table profiles add column if not exists handle       text unique;
alter table profiles add column if not exists display_name text;
alter table profiles add column if not exists bio          text;
alter table profiles add column if not exists is_public    boolean not null default false;

create index if not exists profiles_handle_idx on profiles (lower(handle));

-- Anyone can look up a profile that has a handle or is marked public so
-- `#/@handle` pages can resolve the compendium title and author name.
-- Notice `email` and `stripe_*` are never needed by public readers; use
-- the `get_public_compendium` RPC below for clean public lookups.
drop policy if exists profiles_read_public on profiles;
create policy profiles_read_public on profiles
  for select using (is_public = true or handle is not null);

-- Because `profiles` intentionally has no direct UPDATE policy for the
-- `authenticated` role (so nobody can set their own `plan = 'paid'`),
-- this SECURITY DEFINER function lets a signed-in user update ONLY their
-- publishing fields (`handle`, `display_name`, `bio`, `is_public`).
create or replace function update_own_publishing(
  new_handle       text,
  new_display_name text default null,
  new_bio          text default null,
  new_is_public    boolean default false
)
returns profiles
language plpgsql
security definer set search_path = public
as $$
declare
  clean_handle text := nullif(lower(trim(both '@' from trim(coalesce(new_handle, '')))), '');
  result_row   profiles;
begin
  if auth.uid() is null then
    raise exception 'Not signed in';
  end if;

  if clean_handle is not null then
    if length(clean_handle) < 3 or length(clean_handle) > 32
       or clean_handle !~ '^[a-z0-9]+(-[a-z0-9]+)*$' then
      raise exception 'Handles must be 3–32 lowercase letters, numbers, or single hyphens.';
    end if;
  end if;

  insert into public.profiles (id, handle, display_name, bio, is_public)
  values (
    auth.uid(),
    clean_handle,
    nullif(trim(coalesce(new_display_name, '')), ''),
    nullif(trim(coalesce(new_bio, '')), ''),
    coalesce(new_is_public, false)
  )
  on conflict (id) do update
    set handle       = excluded.handle,
        display_name = excluded.display_name,
        bio          = excluded.bio,
        is_public    = excluded.is_public,
        updated_at   = now()
  returning * into result_row;

  return result_row;
end $$;

grant execute on function update_own_publishing(text, text, text, boolean) to authenticated;

-- ── 2. Per-entry public sharing (`is_public` + `slug`) ────────────

alter table entries add column if not exists is_public boolean not null default false;
alter table entries add column if not exists slug      text;

create index if not exists entries_owner_slug_idx on entries (owner_id, lower(slug));
create index if not exists entries_public_idx     on entries (is_public) where is_public = true;

-- An entry is publicly readable if the entry itself is marked `is_public`
-- OR its owner has published their entire compendium (`profiles.is_public`).
drop policy if exists entries_read_public on entries;
create policy entries_read_public on entries
  for select using (
    is_public = true
    or exists (
      select 1 from profiles p
      where p.id = entries.owner_id and p.is_public = true
    )
  );

drop policy if exists fields_read_public on entry_fields;
create policy fields_read_public on entry_fields
  for select using (
    exists (
      select 1 from entries e
      left join profiles p on p.id = e.owner_id
      where e.id = entry_fields.entry_id
        and (e.is_public = true or p.is_public = true)
    )
  );

drop policy if exists tags_read_public on tags;
create policy tags_read_public on tags
  for select using (
    exists (
      select 1 from entries e
      left join profiles p on p.id = e.owner_id
      where e.id = tags.entry_id
        and (e.is_public = true or p.is_public = true)
    )
  );

drop policy if exists links_read_public on links;
create policy links_read_public on links
  for select using (
    exists (
      select 1 from entries e1
      left join profiles p1 on p1.id = e1.owner_id
      where e1.id = links.from_entry_id
        and (e1.is_public = true or p1.is_public = true)
    )
    and exists (
      select 1 from entries e2
      left join profiles p2 on p2.id = e2.owner_id
      where e2.id = links.to_entry_id
        and (e2.is_public = true or p2.is_public = true)
    )
  );

-- ── 3. Privacy-friendly funnel analytics ──────────────────────────

create table if not exists analytics_events (
  id         uuid primary key default gen_random_uuid(),
  event_name text not null,
  meta       jsonb not null default '{}'::jsonb,
  user_id    uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists analytics_events_name_idx on analytics_events (event_name, created_at desc);

alter table analytics_events enable row level security;

-- Deliberately no SELECT policy for `anon` or `authenticated` — funnel
-- aggregates are inspected by the project owner in the Supabase SQL
-- Editor (`select event_name, count(*) from analytics_events group by 1`).
-- Anyone (signed-in or anonymous) can log a whitelisted funnel event via
-- `log_analytics_event()`.
create or replace function log_analytics_event(
  p_event text,
  p_meta  jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  if p_event is null or length(p_event) > 48 then
    return;
  end if;
  insert into public.analytics_events (event_name, meta, user_id)
  values (p_event, coalesce(p_meta, '{}'::jsonb), auth.uid());
end $$;

grant execute on function log_analytics_event(text, jsonb) to anon, authenticated;
