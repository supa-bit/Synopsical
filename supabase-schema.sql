-- ═══════════════════════════════════════════════════════════════════
--  Synopsical — database setup
--
--  Run this once in your Supabase project: SQL Editor → New query →
--  paste → Run. You should see "Success. No rows returned."
--
--  This mirrors the original HTML app's four tables, plus a settings
--  table so your theme follows you between devices. Row Level Security
--  is what makes the data private — without it, anyone with the public
--  key could read your entries.
-- ═══════════════════════════════════════════════════════════════════

create extension if not exists pgcrypto;

-- ── Entries ───────────────────────────────────────────────────────
create table if not exists entries (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null default auth.uid() references auth.users(id) on delete cascade,

  title         text not null check (length(trim(title)) > 0),
  category      text not null default '',
  subcategory   text,
  summary       text,
  body          text,
  source        text,

  -- Faceplate: the little coloured badge or image for each entry.
  faceplate_type  text not null default 'text' check (faceplate_type in ('text','image')),
  faceplate_text  text,
  faceplate_bg    text not null default '#28241c',
  faceplate_color text not null default '#c9a84c',
  faceplate_font  text not null default 'default',
  -- Path into Supabase Storage, not a base64 blob. The original inlined
  -- images into the record, which is what filled up browser storage.
  faceplate_image text,

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists entries_owner_updated_idx
  on entries (owner_id, updated_at desc);
create index if not exists entries_owner_category_idx
  on entries (owner_id, category);

-- Full-text search. The original scanned with LIKE '%term%', which cannot
-- use an index and misses word variants.
alter table entries drop column if exists search_tsv;
alter table entries add column search_tsv tsvector
  generated always as (
    setweight(to_tsvector('english', coalesce(title, '')),       'A') ||
    setweight(to_tsvector('english', coalesce(category, '')),    'B') ||
    setweight(to_tsvector('english', coalesce(summary, '')),     'B') ||
    setweight(to_tsvector('english', coalesce(body, '')),        'C')
  ) stored;

create index if not exists entries_search_idx on entries using gin (search_tsv);

-- ── Custom fields ─────────────────────────────────────────────────
create table if not exists entry_fields (
  id         uuid primary key default gen_random_uuid(),
  entry_id   uuid not null references entries(id) on delete cascade,
  owner_id   uuid not null default auth.uid() references auth.users(id) on delete cascade,
  field_name text not null,
  field_value text,
  sort_order integer not null default 0
);
create index if not exists entry_fields_entry_idx on entry_fields (entry_id, sort_order);

-- ── Tags ──────────────────────────────────────────────────────────
create table if not exists tags (
  id        uuid primary key default gen_random_uuid(),
  entry_id  uuid not null references entries(id) on delete cascade,
  owner_id  uuid not null default auth.uid() references auth.users(id) on delete cascade,
  tag       text not null check (length(trim(tag)) > 0),
  unique (entry_id, tag)
);
create index if not exists tags_entry_idx on tags (entry_id);
create index if not exists tags_owner_tag_idx on tags (owner_id, tag);

-- ── Links between entries ─────────────────────────────────────────
create table if not exists links (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  from_entry_id uuid not null references entries(id) on delete cascade,
  to_entry_id   uuid not null references entries(id) on delete cascade,
  relation      text,
  check (from_entry_id <> to_entry_id),
  unique (from_entry_id, to_entry_id)
);
create index if not exists links_from_idx on links (from_entry_id);
create index if not exists links_to_idx   on links (to_entry_id);

-- ── Settings (theme, fonts) ───────────────────────────────────────
create table if not exists settings (
  owner_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  data     jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- ── Keep updated_at honest ────────────────────────────────────────
create or replace function touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists entries_touch on entries;
create trigger entries_touch before update on entries
  for each row execute function touch_updated_at();

drop trigger if exists settings_touch on settings;
create trigger settings_touch before update on settings
  for each row execute function touch_updated_at();

-- ═══════════════════════════════════════════════════════════════════
--  Row Level Security — this is what keeps your data private.
-- ═══════════════════════════════════════════════════════════════════

alter table entries      enable row level security;
alter table entry_fields enable row level security;
alter table tags         enable row level security;
alter table links        enable row level security;
alter table settings     enable row level security;

drop policy if exists entries_own on entries;
create policy entries_own on entries for all
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

drop policy if exists entry_fields_own on entry_fields;
create policy entry_fields_own on entry_fields for all
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

drop policy if exists tags_own on tags;
create policy tags_own on tags for all
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

drop policy if exists links_own on links;
create policy links_own on links for all
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

drop policy if exists settings_own on settings;
create policy settings_own on settings for all
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- ── Storage bucket for faceplate images ───────────────────────────
insert into storage.buckets (id, name, public)
values ('faceplates', 'faceplates', false)
on conflict (id) do nothing;

drop policy if exists faceplates_own on storage.objects;
create policy faceplates_own on storage.objects for all
  using (bucket_id = 'faceplates' and owner = auth.uid())
  with check (bucket_id = 'faceplates' and owner = auth.uid());
