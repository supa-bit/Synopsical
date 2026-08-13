-- ═══════════════════════════════════════════════════════════════════
--  Synopsical — 04: custom font uploads
--
--  Run this the same way as the earlier scripts. Mirrors the existing
--  `faceplates` bucket exactly — private storage, one folder per user,
--  enforced by policy rather than by convention. Font metadata (name,
--  the CSS font-family it's registered under, and its storage path)
--  lives in the existing `settings.data` JSON blob alongside theme and
--  font choices — there's no need for a whole new table for a short,
--  per-user list like this.
-- ═══════════════════════════════════════════════════════════════════

insert into storage.buckets (id, name, public)
values ('fonts', 'fonts', false)
on conflict (id) do nothing;

drop policy if exists fonts_own on storage.objects;
create policy fonts_own on storage.objects for all
  using (bucket_id = 'fonts' and owner = auth.uid())
  with check (bucket_id = 'fonts' and owner = auth.uid());
