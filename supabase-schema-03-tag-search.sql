-- ═══════════════════════════════════════════════════════════════════
--  Synopsical — 03: tag search
--
--  Run this in the SQL Editor the same way as the earlier scripts.
--
--  The original search_tsv column was a GENERATED ALWAYS AS expression,
--  which can only see columns on the SAME row — it has no way to reach
--  into the separate `tags` table. Since tags genuinely live in their
--  own table (one entry can have many), the fix is to convert search_tsv
--  from a generated column into an ordinary one that a trigger keeps in
--  sync whenever either the entry itself OR any of its tags change.
-- ═══════════════════════════════════════════════════════════════════

-- Detach the generated expression, keeping the column (and its data,
-- and its GIN index) intact rather than dropping and rebuilding it.
alter table entries alter column search_tsv drop expression if exists;

create or replace function entries_refresh_search_tsv(target_id uuid)
returns void language plpgsql as $$
declare
  tag_text text;
begin
  select coalesce(string_agg(tag, ' '), '') into tag_text
    from tags where entry_id = target_id;

  update entries e set search_tsv =
    setweight(to_tsvector('english', coalesce(e.title, '')),    'A') ||
    setweight(to_tsvector('english', coalesce(tag_text, '')),   'A') ||
    setweight(to_tsvector('english', coalesce(e.category, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(e.summary, '')),  'B') ||
    setweight(to_tsvector('english', coalesce(e.body, '')),     'C')
  where e.id = target_id;
end $$;

-- Refresh when the entry's own searchable fields change.
create or replace function entries_search_tsv_trigger()
returns trigger language plpgsql as $$
begin
  perform entries_refresh_search_tsv(new.id);
  return new;
end $$;

drop trigger if exists entries_search_tsv_update on entries;
create trigger entries_search_tsv_update
  after insert or update of title, category, summary, body on entries
  for each row execute function entries_search_tsv_trigger();

-- Refresh the *parent entry's* search when a tag is added or removed.
-- This is what a generated column structurally cannot do.
create or replace function tags_search_tsv_trigger()
returns trigger language plpgsql as $$
begin
  if TG_OP = 'DELETE' then
    perform entries_refresh_search_tsv(old.entry_id);
    return old;
  else
    perform entries_refresh_search_tsv(new.entry_id);
    return new;
  end if;
end $$;

drop trigger if exists tags_search_tsv_update on tags;
create trigger tags_search_tsv_update
  after insert or update or delete on tags
  for each row execute function tags_search_tsv_trigger();

-- Backfill: entries created before this migration have a search_tsv that
-- was computed without tags. Recompute every row once, now.
select entries_refresh_search_tsv(id) from entries;
