-- ═══════════════════════════════════════════════════════════════════
--  Synopsical — 05: embeddings and related entries
--
--  Run this in the SQL Editor the same way as the earlier scripts.
--
--  This adds the storage and matching side of the "Related entries"
--  feature. It does NOT call any AI provider itself — that only ever
--  happens in the embed-entry Edge Function
--  (supabase/functions/embed-entry/index.ts), which is the one and
--  only place your embeddings-provider API key is allowed to live.
--  Neither this file nor app.js ever sees that key.
-- ═══════════════════════════════════════════════════════════════════

create extension if not exists vector;

-- 1024 dimensions to match text-embedding-v4 requested at that size in
-- the Edge Function. If that ever changes, this column has to change
-- with it — the two are not independently adjustable.
alter table entries add column if not exists embedding vector(1024);

-- Deliberately no ivfflat/hnsw approximate-nearest-neighbour index yet.
-- At personal-app scale (thousands of rows, not millions), an exact
-- nearest-neighbour scan is fast without one, and adding an ANN index
-- means picking tuning parameters against data that doesn't exist yet.
-- Worth revisiting if this is ever noticeably slow.

-- Runs as the calling user (no SECURITY DEFINER), so ordinary Row Level
-- Security on `entries` applies exactly as it does everywhere else —
-- this can only ever return the caller's own entries.
create or replace function related_entries(target_id uuid, limit_n int default 5)
returns table (
  id uuid, title text, category text,
  faceplate_type text, faceplate_text text, faceplate_bg text,
  faceplate_color text, faceplate_font text, faceplate_image text,
  similarity float
)
language sql stable as $$
  select e.id, e.title, e.category,
         e.faceplate_type, e.faceplate_text, e.faceplate_bg,
         e.faceplate_color, e.faceplate_font, e.faceplate_image,
         1 - (e.embedding <=> t.embedding) as similarity
  from entries e, (select embedding from entries where id = target_id) t
  where e.id <> target_id
    and e.embedding is not null
    and t.embedding is not null
  order by e.embedding <=> t.embedding
  limit limit_n;
$$;
