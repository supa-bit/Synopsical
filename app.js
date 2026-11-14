/* ═══════════════════════════════════════════════════════════════════
   Synopsical — application logic

   A cloud version of the original single-page app. Same features, same
   feel; the data lives in Supabase instead of browser storage, so it
   follows you between devices.

   One deliberate difference from the original: nothing here builds HTML
   by concatenating strings around your text. Every value goes in through
   textContent or a property. The original interpolated escaped titles
   into inline onclick handlers, where the browser decoded the escaping
   again before running the code — a live injection path through your own
   entry titles.
   ═══════════════════════════════════════════════════════════════════ */

'use strict';

// Pure text-parsing and formatting logic lives outside this file on purpose,
// so it can be unit-tested without booting the whole app — see lib/*.mjs.
import { parseImportBlock, parseImportText } from './lib/import-parser.mjs';
import { parseRichBlocks, extractWikiLinks, entriesToMarkdown } from './lib/rich-text.mjs';
import { cloneSampleCompendium } from './lib/sample-compendium.mjs';
import {
  findWikiReferences, findUnlinkedMentions, linkFirstMention,
  wikiQueryAt, rankTitleMatches, applyWikiCompletion,
} from './lib/backlinks.mjs';
import {
  slugify, validateHandle, buildPublicShareUrl, parsePublicHash,
  buildStripeCheckoutUrl, normalizeAnalyticsEvent,
} from './lib/sharing.mjs';
import {
  pickRandomEntry, selectResurfacedEntries, appendRevisionSnapshot,
  parseQuickCaptureParams, buildBookmarkletHref,
} from './lib/retention.mjs';

/* ── Tiny DOM helpers ──────────────────────────────────────────── */

function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else if (k === 'html') throw new Error('Refusing to set raw HTML');
    else if (k === 'style' && typeof v === 'object') Object.assign(node.style, v);
    else if (k === 'dataset') Object.assign(node.dataset, v);
    else if (k.startsWith('on') && typeof v === 'function') {
      node.addEventListener(k.slice(2).toLowerCase(), v);
    } else if (k === 'value') node.value = v;
    else if (v === true) node.setAttribute(k, '');
    else node.setAttribute(k, String(v));
  }
  for (const c of [].concat(children)) {
    if (c === null || c === undefined || c === false) continue;
    node.append(typeof c === 'string' || typeof c === 'number' ? String(c) : c);
  }
  return node;
}

const $ = (id) => document.getElementById(id);
const clear = (node) => { while (node.firstChild) node.removeChild(node.firstChild); };

function toast(message, isError = false) {
  const t = $('toast');
  t.textContent = message;
  t.classList.toggle('error', isError);
  t.hidden = false;
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => { t.hidden = true; }, isError ? 6000 : 2600);
}

function confirmDialog(title, body, confirmLabel = 'Confirm') {
  return new Promise((resolve) => {
    $('modal-title').textContent = title;
    $('modal-body').textContent = body;
    const actions = $('modal-actions');
    clear(actions);

    const close = (answer) => { $('modal-overlay').hidden = true; resolve(answer); };
    actions.append(
      el('button', { class: 'btn', type: 'button', onClick: () => close(false) }, 'Cancel'),
      el('button', {
        class: 'btn btn-danger', type: 'button', onClick: () => close(true),
      }, confirmLabel)
    );
    $('modal-overlay').hidden = false;
    actions.lastChild.focus();
  });
}

/* ── Themes ────────────────────────────────────────────────────── */

const THEME_KEYS = [
  'bg0','bg1','bg2','bg3','bg4','border','border2',
  'text0','text1','text2','text3','accent','accent2','teal','coral','purple','accent_ink',
];

const THEME_PRESETS = [
  { name: 'Folio', bg0:'#f3f5f7', bg1:'#ffffff', bg2:'#eef1f4', bg3:'#e3e8ed', bg4:'#d3dae1',
    border:'#dde2e8', border2:'#c3cbd4', text0:'#14181f', text1:'#333a45', text2:'#565f6e',
    text3:'#65707d', accent:'#0a29fa', accent2:'#0821c9', teal:'#0e7a5f', coral:'#c23b2e', purple:'#6a4fc4',
    accent_ink:'#ffffff' },
  { name: 'Card Catalog', bg0:'#141a24', bg1:'#1b2330', bg2:'#212b3a', bg3:'#283445', bg4:'#303e52',
    border:'#34435a', border2:'#445674', text0:'#eef1f6', text1:'#c7d0dd', text2:'#93a0b5',
    text3:'#6b7691', accent:'#6f9bd1', accent2:'#4f7ab8', teal:'#5c7a52', coral:'#c1503d', purple:'#5a6b8c',
    accent_ink:'#141a24' },
  { name: 'Ember', bg0:'#0e0d0b', bg1:'#161410', bg2:'#1e1b16', bg3:'#28241c', bg4:'#332e24',
    border:'#3a342a', border2:'#4a4236', text0:'#f0ead8', text1:'#c8bfa8', text2:'#8a7f6a',
    text3:'#5a5244', accent:'#c9a84c', accent2:'#a07830', teal:'#5a9e8f', coral:'#c46a52', purple:'#8b7ec8',
    accent_ink:'#0e0d0b' },
  { name: 'Slate', bg0:'#0a0c10', bg1:'#111418', bg2:'#181d24', bg3:'#202730', bg4:'#28303c',
    border:'#2e3844', border2:'#3a4858', text0:'#dde8f4', text1:'#9fb4cc', text2:'#607080',
    text3:'#3a4a58', accent:'#4a9ede', accent2:'#2a7ab8', teal:'#4ab8a0', coral:'#e07060', purple:'#9080d0',
    accent_ink:'#0a0c10' },
  { name: 'Forest', bg0:'#090d0a', bg1:'#101510', bg2:'#161e16', bg3:'#1e281e', bg4:'#263226',
    border:'#2e3c2e', border2:'#3a4c3a', text0:'#ddeedd', text1:'#9abba0', text2:'#607060',
    text3:'#3a4a3a', accent:'#68c080', accent2:'#449060', teal:'#50b0c8', coral:'#d08060', purple:'#a080c0',
    accent_ink:'#090d0a' },
  { name: 'Parchment', bg0:'#f4eeda', bg1:'#ebe3ca', bg2:'#e2d7b4', bg3:'#d6c99c', bg4:'#cabb88',
    border:'#b8a469', border2:'#9a8449', text0:'#1a1208', text1:'#302010', text2:'#6a5222',
    text3:'#8f7846', accent:'#8a4614', accent2:'#6a3004', teal:'#205838', coral:'#8a3423', purple:'#4f2a6e',
    accent_ink:'#f4eeda' },
  { name: 'Void', bg0:'#000000', bg1:'#080808', bg2:'#101010', bg3:'#181818', bg4:'#202020',
    border:'#282828', border2:'#383838', text0:'#ffffff', text1:'#cccccc', text2:'#888888',
    text3:'#585858', accent:'#ffffff', accent2:'#aaaaaa', teal:'#40c0b0', coral:'#e06050', purple:'#9060e0',
    accent_ink:'#000000' },
  { name: 'Rose', bg0:'#0f0a0c', bg1:'#18100f', bg2:'#221516', bg3:'#2e1c1e', bg4:'#3a2428',
    border:'#4a2c30', border2:'#5e3840', text0:'#fce8ec', text1:'#d4a8b0', text2:'#885860',
    text3:'#5a3038', accent:'#e0607a', accent2:'#b04060', teal:'#60a890', coral:'#e09060', purple:'#9868c8',
    accent_ink:'#0f0a0c' },
];

const FONT_STACKS = {
  serif: "Georgia, 'Iowan Old Style', serif",
  sans: "'Segoe UI', -apple-system, BlinkMacSystemFont, Helvetica, Arial, sans-serif",
  mono: "'Cascadia Code', Consolas, 'Courier New', monospace",
  whimsical: "'Fredoka', 'Comic Sans MS', sans-serif",
  lab: "'IBM Plex Mono', 'Cascadia Code', Consolas, monospace",
  commanding: "'Space Grotesk', 'Segoe UI', sans-serif",
  alegreya: "'Alegreya', Georgia, serif",
  worksans: "'Work Sans', 'Segoe UI', -apple-system, sans-serif",
};

const GOOGLE_FONTS = {
  whimsical: 'Fredoka:wght@400;600',
  lab: 'IBM+Plex+Mono:wght@400;500;600',
  commanding: 'Space+Grotesk:wght@400;600;700',
  alegreya: 'Alegreya:wght@400;700;900',
  worksans: 'Work+Sans:wght@400;600',
};

// Alegreya and Work Sans are already loaded in <head> of index.html, so
// pre-seed _loadedFonts to avoid injecting duplicate stylesheet <link>s.
const _loadedFonts = new Set(['alegreya', 'worksans']);

function ensureGoogleFont(key) {
  const spec = GOOGLE_FONTS[key];
  if (!spec || _loadedFonts.has(key)) return;
  _loadedFonts.add(key);
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = `https://fonts.googleapis.com/css2?family=${spec}&display=swap`;
  document.head.appendChild(link);
}

/**
 * Returns default faceplate background and text colors matching the active
 * theme (e.g. #eef1f4 and #0a29fa in Folio) instead of hardcoding old Ember
 * colors on brand-new or imported entries.
 */
function defaultFaceplateColors() {
  const t = State.settings.theme ?? THEME_PRESETS[0];
  return {
    bg: t.bg2 || '#eef1f4',
    color: t.accent || '#0a29fa',
  };
}

/* ── Application state ─────────────────────────────────────────── */

const State = {
  sb: null,
  user: null,
  demo: false,          // true while exploring the logged-out Sample Compendium
  entries: [],          // entries with their tags and link counts attached
  links: [],
  view: { name: 'list' },
  settings: {
    theme: { ...THEME_PRESETS[0] }, fontUi: 'worksans', fontBody: 'alegreya', fontSize: 15, customFonts: [],
    fontTitle: null, fontSummary: null, fontTags: null, fontCategories: null,
  },
  form: null,           // working draft while the editor is open
  prefillNew: null,     // optional { title, linkFromId } when clicking an unresolved [[wiki-link]]
  profile: null,
};

/* ── Data access ───────────────────────────────────────────────── */

const Data = {
  async loadAll() {
    if (State.demo) {
      const linkCount = new Map();
      for (const l of State.links ?? []) {
        linkCount.set(l.from_entry_id, (linkCount.get(l.from_entry_id) ?? 0) + 1);
        linkCount.set(l.to_entry_id, (linkCount.get(l.to_entry_id) ?? 0) + 1);
      }
      State.entries = (State.entries ?? []).map((e) => ({
        ...e,
        tags: [...(e.tags ?? [])].sort(),
        linkCount: linkCount.get(e.id) ?? 0,
      }));
      return;
    }

    const { data: entries, error } = await State.sb
      .from('entries').select('*').order('updated_at', { ascending: false });
    if (error) throw error;

    const [{ data: tags }, { data: links }] = await Promise.all([
      State.sb.from('tags').select('entry_id, tag'),
      State.sb.from('links').select('id, from_entry_id, to_entry_id, relation'),
    ]);

    const tagsBy = new Map();
    for (const t of tags ?? []) {
      if (!tagsBy.has(t.entry_id)) tagsBy.set(t.entry_id, []);
      tagsBy.get(t.entry_id).push(t.tag);
    }
    const linkCount = new Map();
    for (const l of links ?? []) {
      linkCount.set(l.from_entry_id, (linkCount.get(l.from_entry_id) ?? 0) + 1);
      linkCount.set(l.to_entry_id, (linkCount.get(l.to_entry_id) ?? 0) + 1);
    }

    State.entries = (entries ?? []).map((e) => ({
      ...e,
      tags: (tagsBy.get(e.id) ?? []).sort(),
      linkCount: linkCount.get(e.id) ?? 0,
    }));
    State.links = links ?? [];
  },

  async getDetail(id) {
    if (State.demo) {
      const entry = State.entries.find((e) => e.id === id);
      const fields = (entry?.fields ?? []).map((f, i) => ({
        field_name: f.field_name ?? f.name ?? '',
        field_value: f.field_value ?? f.value ?? '',
        sort_order: f.sort_order ?? i,
      }));
      const tags = (entry?.tags ?? []).map((t) => ({ entry_id: id, tag: t }));
      const links = (State.links ?? []).filter(
        (l) => l.from_entry_id === id || l.to_entry_id === id
      );
      return { fields, tags, links };
    }

    const [{ data: fields }, { data: tags }, { data: links }] = await Promise.all([
      State.sb.from('entry_fields').select('*').eq('entry_id', id).order('sort_order'),
      State.sb.from('tags').select('*').eq('entry_id', id),
      State.sb.from('links').select('*')
        .or(`from_entry_id.eq.${id},to_entry_id.eq.${id}`),
    ]);
    return { fields: fields ?? [], tags: tags ?? [], links: links ?? [] };
  },

  async save(draft, fields, tagList, linkList, editId) {
    const cleanFields = fields
      .filter((f) => f.name.trim())
      .map((f, i) => ({ field_name: f.name.trim(), field_value: f.value ?? '', sort_order: i }));
    const cleanTagStrings = [...new Set(tagList.map((t) => t.trim()).filter(Boolean))];

    const now = new Date().toISOString();
    const entrySlug = slugify(draft.title) || null;
    if (State.demo) {
      const id = editId || ('demo-' + crypto.randomUUID());
      const existingEntry = editId ? State.entries.find((e) => e.id === editId) : null;
      const row = {
        id,
        title: draft.title,
        slug: entrySlug,
        is_public: draft.is_public ?? existingEntry?.is_public ?? false,
        category: draft.category,
        subcategory: draft.subcategory || null,
        summary: draft.summary || null,
        body: draft.body || null,
        source: draft.source || null,
        faceplate_type: draft.fp.type,
        faceplate_text: draft.fp.text || null,
        faceplate_bg: draft.fp.bg,
        faceplate_color: draft.fp.color,
        faceplate_font: draft.fp.font,
        faceplate_image: draft.fp.image || null,
        created_at: existingEntry?.created_at ?? now,
        updated_at: now,
        tags: cleanTagStrings,
        fields: cleanFields,
      };
      if (editId && existingEntry) {
        this.recordRevision(editId, existingEntry);
      }
      this.recordRevision(id, row);
      if (editId) {
        State.entries = State.entries.map((e) => (e.id === editId ? row : e));
      } else {
        State.entries = [row, ...State.entries];
      }
      State.links = (State.links ?? []).filter(
        (l) => l.from_entry_id !== id && l.to_entry_id !== id
      );
      for (const l of linkList.filter((x) => x.id && x.id !== id)) {
        State.links.push({
          id: 'dlink-' + crypto.randomUUID(),
          from_entry_id: id,
          to_entry_id: l.id,
          relation: l.relation || null,
        });
      }
      return id;
    }

    const row = {
      title: draft.title,
      category: draft.category,
      subcategory: draft.subcategory || null,
      summary: draft.summary || null,
      body: draft.body || null,
      source: draft.source || null,
      faceplate_type: draft.fp.type,
      faceplate_text: draft.fp.text || null,
      faceplate_bg: draft.fp.bg,
      faceplate_color: draft.fp.color,
      faceplate_font: draft.fp.font,
      faceplate_image: draft.fp.image || null,
    };

    let id = editId;
    if (editId) {
      const { error } = await State.sb.from('entries').update(row).eq('id', editId);
      if (error) throw error;
    } else {
      const { data, error } = await State.sb.from('entries').insert(row).select('id').single();
      if (error) throw error;
      id = data.id;
    }

    // Best-effort save of optional `slug` / `is_public` columns added in
    // supabase-schema-06-sharing-and-analytics.sql so older databases that
    // haven't run migration 06 yet continue to save entries cleanly.
    const sharePatch = { slug: entrySlug };
    if (typeof draft.is_public === 'boolean') sharePatch.is_public = draft.is_public;
    await State.sb.from('entries').update(sharePatch).eq('id', id).then(() => {}, () => {});

    // Record the previous state in the local revision history ring buffer
    // before overwriting it, so the user can always view or restore earlier
    // versions of an entry (#6 Revision History).
    if (editId) {
      const prevEntry = State.entries.find((e) => e.id === editId);
      if (prevEntry) {
        this.recordRevision(editId, prevEntry);
      }
    }
    this.recordRevision(id, {
      title: draft.title,
      category: draft.category,
      subcategory: draft.subcategory || '',
      summary: draft.summary || '',
      body: draft.body || '',
      source: draft.source || '',
    });

    // Replace the satellite rows wholesale — simplest correct approach at
    // this scale, and it matches what the original did.
    await Promise.all([
      State.sb.from('entry_fields').delete().eq('entry_id', id),
      State.sb.from('tags').delete().eq('entry_id', id),
      State.sb.from('links').delete().or(`from_entry_id.eq.${id},to_entry_id.eq.${id}`),
    ]);

    const dbFields = cleanFields.map((f) => ({ entry_id: id, ...f }));
    const cleanTags = cleanTagStrings.map((tag) => ({ entry_id: id, tag }));
    const cleanLinks = linkList
      .filter((l) => l.id !== id)
      .map((l) => ({ from_entry_id: id, to_entry_id: l.id, relation: l.relation || null }));

    const jobs = [];
    if (dbFields.length) jobs.push(State.sb.from('entry_fields').insert(dbFields));
    if (cleanTags.length) jobs.push(State.sb.from('tags').insert(cleanTags));
    if (cleanLinks.length) jobs.push(State.sb.from('links').insert(cleanLinks));
    const results = await Promise.all(jobs);
    for (const r of results) if (r.error) throw r.error;

    return id;
  },

  async remove(id) {
    if (State.demo) {
      State.entries = State.entries.filter((e) => e.id !== id);
      State.links = (State.links ?? []).filter(
        (l) => l.from_entry_id !== id && l.to_entry_id !== id
      );
      return;
    }
    const { error } = await State.sb.from('entries').delete().eq('id', id);
    if (error) throw error;
  },

  // Turns a plain-text mention into a real link: rewrites one text field
  // (summary/body) of the mentioning entry and adds a link row if the two
  // entries aren't connected yet. Deliberately narrower than save(), which
  // replaces every field, tag and link of the entry.
  async linkMention(sourceId, field, newText, targetId) {
    if (field !== 'summary' && field !== 'body') throw new Error('Unsupported field');
    const alreadyLinked = (State.links ?? []).some((l) =>
      (l.from_entry_id === sourceId && l.to_entry_id === targetId)
      || (l.from_entry_id === targetId && l.to_entry_id === sourceId));

    if (State.demo) {
      State.entries = State.entries.map((e) =>
        e.id === sourceId ? { ...e, [field]: newText, updated_at: new Date().toISOString() } : e);
      const updated = State.entries.find((e) => e.id === sourceId);
      if (updated) this.recordRevision(sourceId, updated);
      if (!alreadyLinked) {
        State.links.push({
          id: 'dlink-' + crypto.randomUUID(),
          from_entry_id: sourceId, to_entry_id: targetId, relation: 'Referenced in notes',
        });
      }
      return;
    }

    const { error } = await State.sb.from('entries').update({ [field]: newText }).eq('id', sourceId);
    if (error) throw error;
    const prev = State.entries.find((e) => e.id === sourceId);
    if (prev) this.recordRevision(sourceId, { ...prev, [field]: newText });
    if (!alreadyLinked) {
      const { error: linkErr } = await State.sb.from('links').insert({
        from_entry_id: sourceId, to_entry_id: targetId, relation: 'Referenced in notes',
      });
      if (linkErr) throw linkErr;
    }
  },

  async search(query) {
    const q = query.trim();
    if (!q) return [];
    if (State.demo) {
      const lower = q.toLowerCase();
      return State.entries.filter((e) =>
        (e.title ?? '').toLowerCase().includes(lower)
        || (e.category ?? '').toLowerCase().includes(lower)
        || (e.summary ?? '').toLowerCase().includes(lower)
        || (e.body ?? '').toLowerCase().includes(lower)
        || (e.tags ?? []).some((t) => t.toLowerCase().includes(lower))
      );
    }
    const { data, error } = await State.sb
      .from('entries').select('*')
      .textSearch('search_tsv', q, { type: 'websearch', config: 'english' })
      .limit(60);
    if (error) {
      const { data: alt } = await State.sb
        .from('entries').select('*')
        .or(`title.ilike.%${q}%,body.ilike.%${q}%,summary.ilike.%${q}%,category.ilike.%${q}%`)
        .limit(60);
      return alt ?? [];
    }
    return data ?? [];
  },

  async loadSettings() {
    if (State.demo) return;
    const { data } = await State.sb.from('settings').select('data').maybeSingle();
    if (data?.data && Object.keys(data.data).length) {
      State.settings = { ...State.settings, ...data.data };
    }
  },

  async saveSettings() {
    if (State.demo) return;
    const { error } = await State.sb.from('settings')
      .upsert({ owner_id: State.user.id, data: State.settings });
    if (error) throw error;
  },

  async loadProfile() {
    if (State.demo) {
      State.profile = State.profile ?? {
        id: 'demo-user',
        plan: 'free',
        handle: 'sample',
        display_name: 'Sample Scholar',
        bio: 'Eight interconnected reference entries across History, Biology, Physics, and Architecture.',
        is_public: true,
      };
      return;
    }
    const { data } = await State.sb.from('profiles').select('*').maybeSingle();
    State.profile = data ?? null;
  },

  async updatePublishing({ handle, display_name, bio, is_public }) {
    const cleanHandle = (handle ?? '').trim().toLowerCase().replace(/^@+/, '');
    if (cleanHandle) {
      const v = validateHandle(cleanHandle);
      if (!v.ok) throw new Error(v.error);
    }
    if (State.demo) {
      State.profile = {
        ...(State.profile ?? { id: 'demo-user', plan: 'free' }),
        handle: cleanHandle || null,
        display_name: (display_name ?? '').trim() || null,
        bio: (bio ?? '').trim() || null,
        is_public: !!is_public,
      };
      return State.profile;
    }
    const { data, error } = await State.sb.rpc('update_own_publishing', {
      new_handle: cleanHandle || null,
      new_display_name: (display_name ?? '').trim() || null,
      new_bio: (bio ?? '').trim() || null,
      new_is_public: !!is_public,
    });
    if (error) throw error;
    State.profile = data ?? State.profile;
    return State.profile;
  },

  async setEntryPublic(entryId, isPublic) {
    const entry = State.entries.find((e) => e.id === entryId);
    const slug = entry ? (entry.slug || slugify(entry.title)) : null;
    if (State.demo) {
      State.entries = State.entries.map((e) =>
        e.id === entryId ? { ...e, is_public: !!isPublic, slug } : e
      );
      return { is_public: !!isPublic, slug };
    }
    const { error } = await State.sb
      .from('entries')
      .update({ is_public: !!isPublic, slug })
      .eq('id', entryId);
    if (error) throw error;
    State.entries = State.entries.map((e) =>
      e.id === entryId ? { ...e, is_public: !!isPublic, slug } : e
    );
    return { is_public: !!isPublic, slug };
  },

  async loadPublicView(route) {
    // Built-in `@sample` handle or `sample-*` entry IDs resolve directly from
    // `cloneSampleCompendium()` (plus any in-memory edits in Sample Mode) so
    // public sharing links can be previewed and verified with zero network.
    const isSampleHandle = route.handle === 'sample'
      || (State.demo && route.handle && route.handle === State.profile?.handle);
    const isSampleEntryId = route.entryId?.startsWith('sample-')
      || (State.demo && State.entries.some((e) => e.id === route.entryId));

    if (isSampleHandle || isSampleEntryId) {
      const sample = State.demo && State.entries.length
        ? { entries: State.entries, links: State.links }
        : cloneSampleCompendium();
      const entriesWithSlugs = sample.entries.map((e) => ({
        ...e,
        slug: e.slug || slugify(e.title),
        is_public: e.is_public ?? true,
      }));
      const profile = State.demo && State.profile
        ? State.profile
        : {
          handle: 'sample',
          display_name: 'Synopsical Sample Compendium',
          bio: 'An illustrated, cross-referenced specimen compendium across History, Biology, Physics, and Architecture.',
          is_public: true,
        };
      let targetEntry = null;
      if (route.mode === 'handle-entry') {
        targetEntry = entriesWithSlugs.find(
          (e) => e.slug === route.entrySlug || e.id === route.entrySlug
        ) ?? null;
      } else if (route.mode === 'entry-id') {
        targetEntry = entriesWithSlugs.find((e) => e.id === route.entryId) ?? null;
      }
      return {
        profile,
        entries: entriesWithSlugs,
        links: sample.links ?? [],
        targetEntry,
      };
    }

    if (!State.sb) return null;

    if (route.mode === 'entry-id') {
      const { data: entry, error } = await State.sb
        .from('entries')
        .select('*')
        .eq('id', route.entryId)
        .maybeSingle();
      if (error || !entry) return null;
      const [{ data: fields }, { data: tags }, { data: profile }] = await Promise.all([
        State.sb.from('entry_fields').select('*').eq('entry_id', entry.id).order('sort_order'),
        State.sb.from('tags').select('*').eq('entry_id', entry.id),
        State.sb.from('profiles').select('handle, display_name, bio, is_public').eq('id', entry.owner_id).maybeSingle(),
      ]);
      const enriched = {
        ...entry,
        slug: entry.slug || slugify(entry.title),
        fields: fields ?? [],
        tags: (tags ?? []).map((t) => t.tag),
      };
      return {
        profile: profile ?? { handle: null, display_name: 'Shared Entry', is_public: false },
        entries: [enriched],
        links: [],
        targetEntry: enriched,
      };
    }

    // Handle-based lookup (`#/@handle` or `#/@handle/slug`)
    const { data: profile } = await State.sb
      .from('profiles')
      .select('id, handle, display_name, bio, is_public')
      .ilike('handle', route.handle)
      .maybeSingle();
    if (!profile) return null;

    const { data: rawEntries } = await State.sb
      .from('entries')
      .select('*')
      .eq('owner_id', profile.id)
      .order('updated_at', { ascending: false });
    const entriesList = (rawEntries ?? []).map((e) => ({
      ...e,
      slug: e.slug || slugify(e.title),
    }));
    const entryIds = entriesList.map((e) => e.id);
    let fields = [], tags = [], links = [];
    if (entryIds.length) {
      const [fRes, tRes, lRes] = await Promise.all([
        State.sb.from('entry_fields').select('*').in('entry_id', entryIds).order('sort_order'),
        State.sb.from('tags').select('*').in('entry_id', entryIds),
        State.sb.from('links').select('*').in('from_entry_id', entryIds),
      ]);
      fields = fRes.data ?? [];
      tags = tRes.data ?? [];
      links = lRes.data ?? [];
    }
    const fieldsBy = new Map();
    for (const f of fields) {
      if (!fieldsBy.has(f.entry_id)) fieldsBy.set(f.entry_id, []);
      fieldsBy.get(f.entry_id).push(f);
    }
    const tagsBy = new Map();
    for (const t of tags) {
      if (!tagsBy.has(t.entry_id)) tagsBy.set(t.entry_id, []);
      tagsBy.get(t.entry_id).push(t.tag);
    }
    const enrichedEntries = entriesList.map((e) => ({
      ...e,
      fields: fieldsBy.get(e.id) ?? [],
      tags: (tagsBy.get(e.id) ?? []).sort(),
    }));
    const targetEntry = route.mode === 'handle-entry'
      ? enrichedEntries.find((e) => e.slug === route.entrySlug || e.id === route.entrySlug) ?? null
      : null;

    return {
      profile,
      entries: enrichedEntries,
      links,
      targetEntry,
    };
  },

  trackEvent(eventName, meta = {}) {
    const normalized = normalizeAnalyticsEvent(eventName, meta);
    if (!normalized) return;
    try {
      const key = 'synopsical_funnel_events';
      const buf = JSON.parse(sessionStorage.getItem(key) || '[]');
      buf.push({ ...normalized, ts: new Date().toISOString() });
      sessionStorage.setItem(key, JSON.stringify(buf.slice(-50)));
    } catch { /* ignore storage restrictions */ }
    try {
      if (typeof State.sb?.rpc === 'function' && !State.demo) {
        Promise.resolve(
          State.sb.rpc('log_analytics_event', {
            p_event: normalized.event,
            p_meta: normalized.meta,
          })
        ).catch(() => {});
      }
    } catch { /* non-fatal */ }
  },

  getRevisions(entryId) {
    if (!entryId) return [];
    try {
      const store = JSON.parse(localStorage.getItem('synopsical_revisions_v1') || '{}');
      return Array.isArray(store[entryId]) ? store[entryId] : [];
    } catch {
      return [];
    }
  },

  recordRevision(entryId, snapshot) {
    if (!entryId || !snapshot) return [];
    try {
      const key = 'synopsical_revisions_v1';
      const store = JSON.parse(localStorage.getItem(key) || '{}');
      const next = appendRevisionSnapshot(store[entryId] ?? [], snapshot);
      store[entryId] = next;
      localStorage.setItem(key, JSON.stringify(store));
      return next;
    } catch {
      return [];
    }
  },

  async restoreRevision(entryId, rev) {
    const current = State.entries.find((e) => e.id === entryId);
    if (!current || !rev) throw new Error('Revision not found');
    this.recordRevision(entryId, current);
    const patch = {
      title: rev.title || current.title,
      category: rev.category || current.category,
      subcategory: rev.subcategory || null,
      summary: rev.summary || null,
      body: rev.body || null,
      source: rev.source || null,
    };
    if (State.demo) {
      State.entries = State.entries.map((e) =>
        e.id === entryId ? { ...e, ...patch, updated_at: new Date().toISOString() } : e
      );
      this.recordRevision(entryId, { ...current, ...patch });
      return;
    }
    const { error } = await State.sb.from('entries').update(patch).eq('id', entryId);
    if (error) throw error;
    this.recordRevision(entryId, { ...current, ...patch });
  },

  async uploadFaceplate(file) {
    if (State.demo) {
      return URL.createObjectURL(file);
    }
    const ext = (file.name.split('.').pop() || 'png').toLowerCase();
    const path = `${State.user.id}/${crypto.randomUUID()}.${ext}`;
    const { error } = await State.sb.storage.from('faceplates')
      .upload(path, file, { upsert: false, contentType: file.type });
    if (error) throw error;
    return path;
  },

  async faceplateUrl(path) {
    if (!path) return null;
    if (path.startsWith('blob:') || path.startsWith('data:')) return path;
    if (State.demo) return null;
    const { data } = await State.sb.storage.from('faceplates').createSignedUrl(path, 3600);
    return data?.signedUrl ?? null;
  },

  async uploadFont(file) {
    if (State.demo) throw new Error('Create a free account to upload custom font files');
    const ext = (file.name.split('.').pop() || 'ttf').toLowerCase();
    const path = `${State.user.id}/${crypto.randomUUID()}.${ext}`;
    const { error } = await State.sb.storage.from('fonts')
      .upload(path, file, { upsert: false, contentType: file.type || `font/${ext}` });
    if (error) throw error;
    return path;
  },

  async fontUrl(path) {
    if (!path || State.demo) return null;
    const { data } = await State.sb.storage.from('fonts').createSignedUrl(path, 3600);
    return data?.signedUrl ?? null;
  },

  async requestEmbedding(entryId) {
    if (State.demo) return;
    const { error } = await State.sb.functions.invoke('embed-entry', {
      body: { entryId },
    });
    if (error) throw error;
  },

  async deleteAccount() {
    if (State.demo) return;
    const { error } = await State.sb.functions.invoke('delete-account');
    if (error) throw error;
  },

  async relatedEntries(entryId, limit = 5) {
    if (State.demo) return [];
    const { data, error } = await State.sb.rpc('related_entries', {
      target_id: entryId, limit_n: limit,
    });
    if (error) throw error;
    return data ?? [];
  },
};

function isPaidPlan() {
  return State.profile?.plan === 'paid';
}

/* ── Theme application ─────────────────────────────────────────── */

function applyTheme() {
  const root = document.documentElement;
  const t = State.settings.theme ?? THEME_PRESETS[0];
  for (const key of THEME_KEYS) {
    if (t[key]) root.style.setProperty(`--${key.replace('_', '-')}`, t[key]);
  }
  root.style.setProperty('--accent-dim', (t.accent ?? '#0a29fa') + '22');
  root.style.setProperty('--teal-dim', (t.teal ?? '#0e7a5f') + '25');
  root.style.setProperty('--coral-dim', (t.coral ?? '#c23b2e') + '25');
  root.style.setProperty('--purple-dim', (t.purple ?? '#6a4fc4') + '25');
  ensureGoogleFont(State.settings.fontUi);
  ensureGoogleFont(State.settings.fontBody);
  root.style.setProperty('--font-ui', resolveFontStack(State.settings.fontUi));
  root.style.setProperty('--font-body', resolveFontStack(State.settings.fontBody));

  for (const [cssVar, key] of [
    ['--font-title', 'fontTitle'], ['--font-summary', 'fontSummary'],
    ['--font-tags', 'fontTags'], ['--font-categories', 'fontCategories'],
  ]) {
    const chosen = State.settings[key];
    if (chosen) { ensureGoogleFont(chosen); root.style.setProperty(cssVar, resolveFontStack(chosen)); }
    else root.style.removeProperty(cssVar);
  }

  root.style.fontSize = `${State.settings.fontSize ?? 15}px`;
}

function resolveFontStack(key) {
  if (FONT_STACKS[key]) return FONT_STACKS[key];
  const custom = (State.settings.customFonts ?? []).find((f) => f.family === key);
  if (custom) return `'${custom.family}', Georgia, serif`;
  return FONT_STACKS.serif;
}

async function applyCustomFontFaces() {
  const fonts = State.settings.customFonts ?? [];
  let styleEl = document.getElementById('custom-fonts-style');
  if (!styleEl) {
    styleEl = document.createElement('style');
    styleEl.id = 'custom-fonts-style';
    document.head.appendChild(styleEl);
  }
  if (!fonts.length) { styleEl.textContent = ''; return; }
  const rules = await Promise.all(fonts.map(async (f) => {
    const url = await Data.fontUrl(f.path);
    return url ? `@font-face { font-family: '${f.family}'; src: url('${url}'); }` : '';
  }));
  styleEl.textContent = rules.filter(Boolean).join('\n');
}

/* ── Faceplate rendering ───────────────────────────────────────── */

function faceplate(entry, size = 'sm') {
  const defaults = defaultFaceplateColors();
  const node = el('div', { class: `faceplate fp-${size}`, 'aria-hidden': 'true' });
  node.style.background = entry.faceplate_bg || defaults.bg;

  if (entry.faceplate_type === 'image' && entry.faceplate_image) {
    const img = el('img', { alt: '' });
    Data.faceplateUrl(entry.faceplate_image).then((url) => { if (url) img.src = url; });
    node.append(img);
    return node;
  }

  node.style.color = entry.faceplate_color || defaults.color;
  node.style.fontFamily = FONT_STACKS[entry.faceplate_font] ?? 'var(--font-body)';
  node.textContent = entry.faceplate_text || (entry.title || '?').slice(0, 2).toUpperCase();
  return node;
}

/* ── Category stamp ──────────────────────────────────────────────── */
function categoryStamp(category) {
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 60 60');
  svg.setAttribute('aria-hidden', 'true');

  let hash = 0;
  for (let i = 0; i < category.length; i++) hash = (hash * 31 + category.charCodeAt(i)) | 0;
  const varName = Math.abs(hash) % 2 === 0 ? '--accent' : '--coral';
  const ink = getComputedStyle(document.documentElement).getPropertyValue(varName).trim()
    || (varName === '--accent' ? '#0a29fa' : '#c23b2e');

  const ringId = `stampring-${Math.random().toString(36).slice(2, 9)}`;
  const defs = document.createElementNS(NS, 'defs');
  const path = document.createElementNS(NS, 'path');
  path.setAttribute('id', ringId);
  path.setAttribute('d', 'M6,30 A24,24 0 1,1 54,30');
  path.setAttribute('fill', 'none');
  defs.append(path);

  const ring2 = document.createElementNS(NS, 'circle');
  ring2.setAttribute('cx', '30'); ring2.setAttribute('cy', '30'); ring2.setAttribute('r', '18.5');
  ring2.setAttribute('fill', 'none'); ring2.setAttribute('stroke', ink);
  ring2.setAttribute('stroke-width', '0.8'); ring2.setAttribute('opacity', '0.5');

  const label = category.length > 8 ? category.slice(0, 8).toUpperCase() + '…' : category.toUpperCase();
  const curvedText = document.createElementNS(NS, 'text');
  curvedText.setAttribute('font-family', 'var(--font-mono)');
  curvedText.setAttribute('font-size', '6');
  curvedText.setAttribute('fill', ink);
  curvedText.setAttribute('letter-spacing', '2');
  const textPath = document.createElementNS(NS, 'textPath');
  textPath.setAttributeNS('http://www.w3.org/1999/xlink', 'href', `#${ringId}`);
  textPath.setAttribute('href', `#${ringId}`);
  textPath.setAttribute('startOffset', '2');
  textPath.textContent = label;
  curvedText.append(textPath);

  const abbrev = (category.match(/[A-Za-z]/g) || []).slice(0, 3).join('').toUpperCase() || '•';
  const centerText = document.createElementNS(NS, 'text');
  centerText.setAttribute('x', '30'); centerText.setAttribute('y', '35');
  centerText.setAttribute('text-anchor', 'middle');
  centerText.setAttribute('font-family', 'var(--font-body)');
  centerText.setAttribute('font-weight', '700');
  centerText.setAttribute('font-size', '12');
  centerText.setAttribute('fill', ink);
  centerText.textContent = abbrev;

  svg.append(defs, ring2, curvedText, centerText);
  return el('div', { class: 'detail-stamp' }, [svg]);
}

/* ── Safe Rich-Text & [[Wiki-Link]] DOM Renderer ──────────────────
   Builds structured headings, paragraphs, bullet lists, blockquotes,
   and inline [[Entry Title]] cross-references strictly via el() and
   textContent — never innerHTML. */
function renderInlineNodes(tokens, currentEntryId) {
  return tokens.map((tok) => {
    if (tok.type === 'bold') return el('strong', { text: tok.text });
    if (tok.type === 'italic') return el('em', { text: tok.text });
    if (tok.type === 'code') return el('code', { text: tok.text });
    if (tok.type === 'wikilink') {
      const target = State.entries.find(
        (e) => e.title.trim().toLowerCase() === tok.target.toLowerCase()
      );
      if (target) {
        return el('button', {
          class: 'wiki-link',
          type: 'button',
          title: `Open entry: ${target.title}`,
          onClick: () => go({ name: 'detail', id: target.id }),
        }, tok.label);
      }
      return el('button', {
        class: 'wiki-link unresolved',
        type: 'button',
        title: `Create new entry: “${tok.target}”`,
        onClick: () => {
          State.form = null;
          State.prefillNew = { title: tok.target, linkFromId: currentEntryId };
          go({ name: 'new' });
        },
      }, tok.label);
    }
    return tok.text;
  });
}

function renderRichBody(text, currentEntryId, extraClass = '') {
  const blocks = parseRichBlocks(text);
  const container = el('div', {
    class: ('body-text rich-body ' + extraClass).trim(),
  });
  for (const b of blocks) {
    if (b.type === 'heading') {
      const tag = b.level === 2 ? 'h2' : 'h3';
      container.append(
        el(tag, { class: `rich-heading-${b.level}` }, renderInlineNodes(b.inlines, currentEntryId))
      );
    } else if (b.type === 'list') {
      const ul = el('ul', { class: 'rich-list' });
      for (const itemInlines of b.items) {
        ul.append(el('li', {}, renderInlineNodes(itemInlines, currentEntryId)));
      }
      container.append(ul);
    } else if (b.type === 'quote') {
      const q = el('blockquote', { class: 'rich-quote' });
      b.lines.forEach((lineTokens, idx) => {
        if (idx > 0) q.append(el('br'));
        for (const node of renderInlineNodes(lineTokens, currentEntryId)) q.append(node);
      });
      container.append(q);
    } else if (b.type === 'paragraph') {
      const p = el('p', { class: 'rich-para' });
      b.lines.forEach((lineTokens, idx) => {
        if (idx > 0) p.append(el('br'));
        for (const node of renderInlineNodes(lineTokens, currentEntryId)) p.append(node);
      });
      container.append(p);
    }
  }
  return container;
}

/* ── Navigation ────────────────────────────────────────────────── */

function setSidebarOpen(open) {
  $('sidebar').classList.toggle('open', open);
  $('sidebar-backdrop').hidden = !open;
}

function go(view) {
  setSidebarOpen(false);
  State.view = view;
  let hash;
  if (view.name === 'public') {
    const built = buildPublicShareUrl(window.location.origin, {
      handle: view.handle,
      entrySlug: view.entrySlug,
      entryId: view.entryId,
    });
    hash = built.hash;
  } else {
    hash = view.name === 'detail' ? `#/entry/${view.id}`
      : view.name === 'edit' ? `#/edit/${view.id}`
      : view.name === 'new' ? '#/new'
      : view.name === 'import' ? '#/import'
      : view.name === 'settings' ? '#/settings'
      : view.name === 'graph' ? '#/graph'
      : view.name === 'category' ? `#/category/${encodeURIComponent(view.category)}`
      : view.name === 'tag' ? `#/tag/${encodeURIComponent(view.tag)}`
      : view.name === 'recent' ? '#/recent'
      : view.name === 'search' ? `#/search?q=${encodeURIComponent(view.query)}`
      : State.demo ? '#/sample'
      : '#/';
  }
  if (window.location.hash !== hash) {
    window.location.hash = hash;
  } else {
    render();
  }
}

function readHash() {
  const pub = parsePublicHash(window.location.hash);
  if (pub) return pub;
  const raw = window.location.hash.replace(/^#\/?/, '');
  const [path, qs] = raw.split('?');
  const parts = path.split('/').filter(Boolean).map(decodeURIComponent);
  const params = new URLSearchParams(qs ?? '');
  switch (parts[0]) {
    case 'entry': return parts[1] ? { name: 'detail', id: parts[1] } : { name: 'list' };
    case 'edit': return parts[1] ? { name: 'edit', id: parts[1] } : { name: 'list' };
    case 'new': return { name: 'new' };
    case 'import': return { name: 'import' };
    case 'settings': return { name: 'settings' };
    case 'graph': return { name: 'graph' };
    case 'recent': return { name: 'recent' };
    case 'category': return parts[1] ? { name: 'category', category: parts[1] } : { name: 'list' };
    case 'tag': return parts[1] ? { name: 'tag', tag: parts[1] } : { name: 'list' };
    case 'search': return { name: 'search', query: params.get('q') ?? '' };
    default: return { name: 'list' };
  }
}

/* ── Sidebar ───────────────────────────────────────────────────── */

function renderSidebar() {
  $('count-all').textContent = State.entries.length;
  $('stats-pill').textContent =
    `${State.entries.length} ${State.entries.length === 1 ? 'entry' : 'entries'}`;

  const counts = new Map();
  for (const e of State.entries) {
    if (!e.category) continue;
    counts.set(e.category, (counts.get(e.category) ?? 0) + 1);
  }
  const catList = $('cat-list');
  clear(catList);
  if (counts.size === 0) {
    catList.append(el('div', {
      class: 'hint', style: { padding: '4px 10px' }, text: 'None yet',
    }));
  } else {
    for (const [cat, n] of [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))) {
      catList.append(el('button', {
        class: 'side-item' + (State.view.name === 'category' && State.view.category === cat ? ' active' : ''),
        type: 'button',
        onClick: () => go({ name: 'category', category: cat }),
      }, [el('span', { text: cat }), el('span', { class: 'side-count', text: String(n) })]));
    }
  }

  const tagCounts = new Map();
  for (const e of State.entries) {
    for (const t of e.tags) tagCounts.set(t, (tagCounts.get(t) ?? 0) + 1);
  }
  const tagList = $('tag-list');
  clear(tagList);
  $('tag-section').hidden = tagCounts.size === 0;
  for (const [tag, n] of [...tagCounts].sort((a, b) => b[1] - a[1]).slice(0, 12)) {
    tagList.append(el('button', {
      class: 'side-item' + (State.view.name === 'tag' && State.view.tag === tag ? ' active' : ''),
      type: 'button',
      onClick: () => go({ name: 'tag', tag }),
    }, [el('span', { text: tag }), el('span', { class: 'side-count', text: String(n) })]));
  }

  $('nav-all').classList.toggle('active', State.view.name === 'list');
  $('nav-recent').classList.toggle('active', State.view.name === 'recent');
  $('nav-graph').classList.toggle('active', State.view.name === 'graph');
}

/* ── Views ─────────────────────────────────────────────────────── */

function entryCard(entry) {
  const card = el('button', {
    class: 'entry-card', type: 'button',
    onClick: () => go({ name: 'detail', id: entry.id }),
  });

  const body = el('div', { class: 'entry-card-body' }, [
    el('div', { class: 'entry-card-top' }, [
      el('span', { class: 'entry-card-title', text: entry.title }),
      entry.category ? el('span', { class: 'pill', text: entry.category }) : null,
    ]),
    entry.summary ? el('div', { class: 'entry-card-summary', text: entry.summary }) : null,
  ]);

  const tags = entry.tags ?? [];
  const linkCount = entry.linkCount ?? 0;
  if (tags.length || linkCount) {
    const foot = el('div', { class: 'entry-card-foot' });
    for (const t of tags.slice(0, 5)) foot.append(el('span', { class: 'tag-pill', text: t }));
    if (linkCount) {
      foot.append(el('span', {
        class: 'link-count',
        text: `${linkCount} link${linkCount === 1 ? '' : 's'}`,
      }));
    }
    body.append(foot);
  }

  card.append(faceplate(entry), body);
  return card;
}

async function loadStarterEntries(btn) {
  btn.disabled = true;
  btn.textContent = 'Loading sample entries…';
  try {
    const { entries, links } = cloneSampleCompendium();
    const idMap = new Map();
    for (const sample of entries) {
      const newId = await Data.save(
        {
          title: sample.title,
          category: sample.category,
          subcategory: sample.subcategory,
          summary: sample.summary,
          body: sample.body,
          source: sample.source,
          fp: {
            type: sample.faceplate_type,
            text: sample.faceplate_text,
            bg: sample.faceplate_bg,
            color: sample.faceplate_color,
            font: sample.faceplate_font,
            image: null,
          },
        },
        sample.fields.map((f) => ({ name: f.field_name, value: f.field_value })),
        sample.tags,
        [],
        null
      );
      idMap.set(sample.id, newId);
      Data.requestEmbedding(newId).catch(() => {});
    }
    // Restore sample inter-entry links
    if (!State.demo) {
      const linkRows = links
        .map((l) => ({
          from_entry_id: idMap.get(l.from_entry_id),
          to_entry_id: idMap.get(l.to_entry_id),
          relation: l.relation || null,
        }))
        .filter((l) => l.from_entry_id && l.to_entry_id);
      if (linkRows.length) {
        await State.sb.from('links').insert(linkRows);
      }
    }
    await Data.loadAll();
    toast('Loaded 8 starter entries — edit or delete any of them as you go');
    await render();
  } catch (err) {
    toast(err.message || 'Could not load starter entries', true);
    btn.disabled = false;
    btn.textContent = 'Load 8 sample entries';
  }
}

function viewList(title, subtitle, entries, emptyText) {
  const panel = el('div', { class: 'panel' }, [
    el('div', { class: 'page-head' }, [
      el('h1', { class: 'page-title', text: title }),
      subtitle ? el('span', { class: 'page-sub', text: subtitle }) : null,
    ]),
  ]);

  if (!entries.length) {
    const isTotalEmpty = State.entries.length === 0 && State.view.name === 'list';
    const emptyBox = el('div', { class: 'empty' }, [
      el('div', { class: 'empty-title', text: 'Nothing here yet' }),
      el('p', {
        text: emptyText ?? 'Start with a blank entry, import existing notes, or load a starter compendium to see how cross-references and the link map work.',
      }),
    ]);
    if (isTotalEmpty) {
      const starterBtn = el('button', { class: 'btn', type: 'button' }, 'Load 8 sample entries');
      starterBtn.addEventListener('click', () => loadStarterEntries(starterBtn));
      emptyBox.append(el('div', { class: 'empty-actions' }, [
        el('button', {
          class: 'btn btn-primary', type: 'button',
          onClick: () => { State.form = null; go({ name: 'new' }); },
        }, '+ New entry'),
        starterBtn,
        el('button', {
          class: 'btn', type: 'button',
          onClick: () => go({ name: 'import' }),
        }, 'Import entries'),
      ]));
    }
    panel.append(emptyBox);
  } else {
    // #5 Resurfacing: on the main "All entries" view, surface 1–2 "On this day"
    // or daily rediscovery entries plus a "Random entry" button.
    if (State.view.name === 'list' && entries.length >= 3) {
      const resurfaced = selectResurfacedEntries(entries, new Date(), 2);
      if (resurfaced.length) {
        const spotGrid = el('div', { class: 'resurface-grid' });
        for (const { entry: rEntry, reason } of resurfaced) {
          spotGrid.append(el('button', {
            class: 'linked-entry resurface-card',
            type: 'button',
            onClick: () => go({ name: 'detail', id: rEntry.id }),
          }, [
            faceplate(rEntry),
            el('div', { class: 'linked-entry-info' }, [
              el('div', { class: 'linked-entry-title', text: rEntry.title }),
              el('div', { class: 'linked-entry-rel', text: reason }),
            ]),
            rEntry.category ? el('span', { class: 'pill', text: rEntry.category }) : null,
          ]));
        }
        panel.append(el('div', { class: 'resurface-box' }, [
          el('div', { class: 'resurface-head' }, [
            el('span', { class: 'section-label', style: { margin: 0, border: 0, padding: 0 }, text: 'Rediscover from your compendium' }),
            el('button', {
              class: 'linkish',
              type: 'button',
              onClick: () => {
                const pick = pickRandomEntry(entries);
                if (pick) go({ name: 'detail', id: pick.id });
              },
            }, 'Random entry →'),
          ]),
          spotGrid,
        ]));
      }
    }
    for (const e of entries) panel.append(entryCard(e));
  }
  return panel;
}

async function viewDetail(id) {
  const entry = State.entries.find((e) => e.id === id);
  if (!entry) {
    return el('div', { class: 'panel' }, [
      el('div', { class: 'empty' }, [
        el('div', { class: 'empty-title', text: 'Entry not found' }),
        el('p', { text: 'It may have been deleted.' }),
      ]),
    ]);
  }

  const { fields, tags, links } = await Data.getDetail(id);
  const panel = el('div', { class: 'panel' });

  panel.append(el('button', {
    class: 'back-link', type: 'button', onClick: () => go({ name: 'list' }),
  }, '← All entries'));

  panel.append(el('div', { class: 'detail-hero' }, [
    faceplate(entry, 'lg'),
    el('div', { style: { flex: '1', minWidth: '0' } }, [
      el('h1', { class: 'detail-title', text: entry.title }),
      el('div', { class: 'detail-meta' }, [
        entry.subcategory ? el('span', { text: entry.subcategory }) : null,
        el('span', {
          text: 'Added ' + new Date(entry.created_at).toLocaleDateString(undefined, {
            year: 'numeric', month: 'short', day: 'numeric',
          }),
        }),
      ]),
    ]),
    entry.category ? categoryStamp(entry.category) : null,
  ]));

  const isEntryShared = !!(entry.is_public || State.profile?.is_public);
  const shareUrlObj = buildPublicShareUrl(window.location.origin, {
    handle: State.profile?.handle || (State.demo ? 'sample' : ''),
    entrySlug: (State.profile?.handle || State.demo) ? (entry.slug || slugify(entry.title)) : '',
    entryId: entry.id,
  });

  const shareDrawer = el('div', { class: 'share-drawer', hidden: !isEntryShared });
  const paintShareDrawer = () => {
    clear(shareDrawer);
    const activePublic = !!(entry.is_public || State.profile?.is_public);
    const currentUrl = buildPublicShareUrl(window.location.origin, {
      handle: State.profile?.handle || (State.demo ? 'sample' : ''),
      entrySlug: (State.profile?.handle || State.demo) ? (entry.slug || slugify(entry.title)) : '',
      entryId: entry.id,
    });
    if (!activePublic) {
      shareDrawer.hidden = true;
      return;
    }
    shareDrawer.hidden = false;
    const urlInput = el('input', {
      class: 'input share-url-input',
      type: 'text',
      value: currentUrl.url,
      readonly: true,
      'aria-label': 'Public share URL',
    });
    urlInput.addEventListener('click', () => urlInput.select());
    shareDrawer.append(
      el('div', { class: 'share-drawer-head' }, [
        el('span', { class: 'pill share-badge', text: 'Public link active' }),
        el('span', {
          class: 'hint',
          style: { marginTop: 0 },
          text: State.profile?.handle
            ? `Published under @${State.profile.handle}`
            : 'Anyone with this link can read this entry (set a custom @handle in Appearance)',
        }),
      ]),
      el('div', { class: 'share-drawer-row' }, [
        urlInput,
        el('button', {
          class: 'btn btn-sm btn-primary',
          type: 'button',
          onClick: async () => {
            try {
              await navigator.clipboard.writeText(currentUrl.url);
              toast('Public link copied to clipboard');
            } catch {
              urlInput.select();
              toast('Select and copy the public link');
            }
          },
        }, 'Copy link'),
        el('button', {
          class: 'btn btn-sm',
          type: 'button',
          onClick: () => {
            window.location.hash = currentUrl.hash;
          },
        }, 'Preview public page →'),
      ])
    );
  };
  paintShareDrawer();

  const shareBtn = el('button', {
    class: 'btn',
    type: 'button',
  }, isEntryShared ? 'Shared · Copy link' : 'Share');
  shareBtn.addEventListener('click', async () => {
    try {
      if (!entry.is_public && !State.profile?.is_public) {
        const res = await Data.setEntryPublic(id, true);
        entry.is_public = res.is_public;
        entry.slug = res.slug;
        Data.trackEvent('share_enable', { category: entry.category || '' });
        shareBtn.textContent = 'Shared · Copy link';
      }
      paintShareDrawer();
      const latestUrl = buildPublicShareUrl(window.location.origin, {
        handle: State.profile?.handle || (State.demo ? 'sample' : ''),
        entrySlug: (State.profile?.handle || State.demo) ? (entry.slug || slugify(entry.title)) : '',
        entryId: entry.id,
      });
      await navigator.clipboard.writeText(latestUrl.url).catch(() => {});
      toast('Entry published — shareable link copied');
    } catch (err) {
      toast(err.message || 'Could not update sharing settings', true);
    }
  });

  panel.append(el('div', { class: 'actions' }, [
    el('button', {
      class: 'btn btn-primary', type: 'button',
      onClick: () => go({ name: 'edit', id }),
    }, 'Edit'),
    shareBtn,
    el('button', {
      class: 'btn', type: 'button',
      onClick: () => window.print(),
    }, 'Print / PDF'),
    el('button', {
      class: 'btn btn-danger', type: 'button',
      onClick: async () => {
        const ok = await confirmDialog(
          'Delete this entry?',
          `"${entry.title}" will be permanently removed, along with its fields, tags and links. This cannot be undone.`,
          'Delete'
        );
        if (!ok) return;
        try {
          await Data.remove(id);
          await Data.loadAll();
          toast('Entry deleted');
          go({ name: 'list' });
        } catch (err) {
          toast(err.message || 'Could not delete', true);
        }
      },
    }, 'Delete'),
  ]), shareDrawer);

  const section = (label, content) =>
    el('div', { class: 'section' }, [el('div', { class: 'section-label', text: label }), content]);

  if (entry.summary) {
    panel.append(section('Summary', renderRichBody(entry.summary, id, 'body-text-lead entry-summary-text')));
  }
  if (entry.body) {
    panel.append(section('Notes', renderRichBody(entry.body, id, entry.summary ? '' : 'body-text-lead')));
  }

  if (fields.length) {
    const wrap = el('div');
    for (const f of fields) {
      wrap.append(el('div', { class: 'field-row' }, [
        el('div', { class: 'field-name', text: f.field_name }),
        el('div', { class: 'field-val', text: f.field_value || '—' }),
      ]));
    }
    panel.append(section('Details', wrap));
  }

  if (tags.length) {
    const wrap = el('div', { class: 'tags-wrap' });
    for (const t of tags) {
      wrap.append(el('button', {
        class: 'tag-pill', type: 'button',
        style: { cursor: 'pointer' },
        onClick: () => go({ name: 'tag', tag: t.tag }),
      }, t.tag));
    }
    panel.append(section('Tags', wrap));
  }

  if (entry.source) panel.append(section('Source', el('div', { class: 'body-text', style: { fontSize: '13.5px' }, text: entry.source })));

  const linkedIds = new Set();
  if (links.length) {
    const wrap = el('div');
    for (const l of links) {
      const otherId = l.from_entry_id === id ? l.to_entry_id : l.from_entry_id;
      const other = State.entries.find((e) => e.id === otherId);
      if (!other) continue;
      linkedIds.add(otherId);
      wrap.append(el('button', {
        class: 'linked-entry', type: 'button',
        onClick: () => go({ name: 'detail', id: otherId }),
      }, [
        faceplate(other),
        el('div', { class: 'linked-entry-info' }, [
          el('div', { class: 'linked-entry-title', text: other.title }),
          l.relation ? el('div', { class: 'linked-entry-rel', text: l.relation }) : null,
        ]),
        other.category ? el('span', { class: 'pill', text: other.category }) : null,
      ]));
    }
    if (wrap.childElementCount) panel.append(section(`Linked entries (${wrap.childElementCount})`, wrap));
  }

  // Backlinks: entries whose notes reference this one with [[Title]] but
  // have no link row (typically written before this entry existed).
  const snippetEl = (s) => el('div', { class: 'mention-snippet' }, [
    s.before, el('mark', { text: s.match }), s.after,
  ]);
  const wikiRefs = findWikiReferences(State.entries, entry)
    .filter((r) => !linkedIds.has(r.entry.id));
  if (wikiRefs.length) {
    const wrap = el('div');
    for (const { entry: other, snippet } of wikiRefs) {
      linkedIds.add(other.id);
      wrap.append(el('button', {
        class: 'linked-entry', type: 'button',
        onClick: () => go({ name: 'detail', id: other.id }),
      }, [
        faceplate(other),
        el('div', { class: 'linked-entry-info' }, [
          el('div', { class: 'linked-entry-title', text: other.title }),
          snippetEl(snippet),
        ]),
        other.category ? el('span', { class: 'pill', text: other.category }) : null,
      ]));
    }
    panel.append(section(`Mentioned in (${wikiRefs.length})`, wrap));
  }

  // Unlinked mentions: other entries that name this one in plain text.
  // "Link" wraps the first mention in [[ ]] and connects the two entries.
  const unlinked = findUnlinkedMentions(State.entries, entry, linkedIds);
  if (unlinked.length) {
    const wrap = el('div');
    for (const m of unlinked.slice(0, 10)) {
      const other = m.entry;
      const linkBtn = el('button', { class: 'btn btn-sm', type: 'button' }, 'Link');
      linkBtn.addEventListener('click', async (ev) => {
        ev.stopPropagation();
        linkBtn.disabled = true;
        linkBtn.textContent = 'Linking…';
        try {
          const newText = linkFirstMention(other[m.field] ?? '', entry.title);
          await Data.linkMention(other.id, m.field, newText, id);
          await Data.loadAll();
          toast(`Linked from “${other.title}”`);
          await render();
          Data.requestEmbedding(other.id).catch(() => {});
        } catch (err) {
          toast(err.message || 'Could not link', true);
          linkBtn.disabled = false;
          linkBtn.textContent = 'Link';
        }
      });
      wrap.append(el('div', { class: 'linked-entry mention-row' }, [
        el('button', {
          class: 'mention-open', type: 'button',
          onClick: () => go({ name: 'detail', id: other.id }),
        }, [
          faceplate(other),
          el('div', { class: 'linked-entry-info' }, [
            el('div', { class: 'linked-entry-title', text: other.title }),
            snippetEl(m.snippet),
          ]),
        ]),
        linkBtn,
      ]));
    }
    panel.append(section(`Unlinked mentions (${unlinked.length})`, el('div', {}, [
      el('div', { class: 'hint mention-hint', text: `These entries name “${entry.title}” without linking to it.` }),
      wrap,
    ])));
  }

  // Related entries: combines free, explainable tag/category overlap with
  // semantic embedding similarity (when available) so every entry with
  // neighbors in the compendium surfaces useful connections immediately.
  try {
    const myTags = new Set(tags.map((t) => t.tag.toLowerCase()));
    const myCat = (entry.category ?? '').trim().toLowerCase();
    const relatedItems = [];
    const seenRelated = new Set([id, ...linkedIds]);

    for (const other of State.entries) {
      if (seenRelated.has(other.id)) continue;
      const shared = (other.tags ?? []).filter((t) => myTags.has(t.toLowerCase()));
      const sameCat = myCat && (other.category ?? '').trim().toLowerCase() === myCat;
      const score = shared.length * 10 + (sameCat ? 1 : 0);
      if (score <= 0) continue;
      const reason = shared.length
        ? `Shares tag${shared.length > 1 ? 's' : ''}: ${shared.slice(0, 2).join(', ')}`
        : `Same category: ${other.category}`;
      relatedItems.push({ entry: other, reason, score });
      seenRelated.add(other.id);
    }
    relatedItems.sort((a, b) => b.score - a.score);

    const semantic = await Data.relatedEntries(id);
    for (const r of semantic) {
      if (seenRelated.has(r.id)) continue;
      seenRelated.add(r.id);
      relatedItems.push({
        entry: r,
        reason: `${Math.round(r.similarity * 100)}% related`,
        score: r.similarity,
      });
    }

    if (relatedItems.length) {
      const wrap = el('div');
      for (const { entry: r, reason } of relatedItems.slice(0, 5)) {
        wrap.append(el('button', {
          class: 'linked-entry', type: 'button',
          onClick: () => go({ name: 'detail', id: r.id }),
        }, [
          faceplate(r),
          el('div', { class: 'linked-entry-info' }, [
            el('div', { class: 'linked-entry-title', text: r.title }),
            el('div', { class: 'linked-entry-rel', text: reason }),
          ]),
          r.category ? el('span', { class: 'pill', text: r.category }) : null,
        ]));
      }
      panel.append(section('Related entries', wrap));
    }
  } catch { /* non-fatal */ }

  // #6 Revision history: shows saved snapshots for this entry and lets the
  // user restore any previous version with one click.
  const revisions = Data.getRevisions(id);
  if (revisions.length > 1) {
    const revWrap = el('div');
    revisions.slice(1, 8).forEach((rev) => {
      const stamp = new Date(rev.savedAt).toLocaleString(undefined, {
        month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
      });
      const preview = (rev.body || rev.summary || '').replace(/\s+/g, ' ').trim().slice(0, 90);
      const restoreBtn = el('button', {
        class: 'btn btn-sm',
        type: 'button',
        onClick: async () => {
          const ok = await confirmDialog(
            'Restore this revision?',
            `Replace the current notes of “${entry.title}” with the version saved on ${stamp}? (Your current version will also be kept in revision history.)`,
            'Restore revision'
          );
          if (!ok) return;
          try {
            await Data.restoreRevision(id, rev);
            await Data.loadAll();
            toast('Revision restored');
            await render();
          } catch (err) {
            toast(err.message || 'Could not restore revision', true);
          }
        },
      }, 'Restore');
      revWrap.append(el('div', { class: 'linked-entry mention-row revision-row' }, [
        el('div', { class: 'linked-entry-info' }, [
          el('div', { class: 'linked-entry-title', text: `${rev.title || entry.title} · ${stamp}` }),
          preview ? el('div', { class: 'mention-snippet', text: preview + (preview.length >= 90 ? '…' : '') }) : null,
        ]),
        restoreBtn,
      ]));
    });
    panel.append(section(`Revision history (${revisions.length - 1})`, revWrap));
  }

  return panel;
}

/* ── Editor ────────────────────────────────────────────────────── */

// Typing "[[" in a textarea opens a list of matching entry titles.
// ↑/↓ move, Enter or Tab inserts, Esc closes. Picking "New entry" just
// writes the [[Title]]; it renders as an unresolved link you can click
// later to create that entry.
function attachWikiAutocomplete(textarea, excludeId) {
  const listId = 'wiki-ac-' + Math.random().toString(36).slice(2, 8);
  const box = el('div', { class: 'wiki-ac', role: 'listbox', id: listId, hidden: true });
  textarea.setAttribute('aria-autocomplete', 'list');
  textarea.setAttribute('aria-controls', listId);
  textarea.parentNode.classList.add('wiki-ac-host');
  textarea.insertAdjacentElement('afterend', box);

  let items = [];
  let active = 0;
  let ctx = null;

  const close = () => {
    box.hidden = true;
    items = [];
    ctx = null;
    textarea.removeAttribute('aria-activedescendant');
  };

  const choose = (i) => {
    const item = items[i];
    if (!item || !ctx) return;
    const { text, caret } = applyWikiCompletion(
      textarea.value, ctx.start, textarea.selectionStart, item.title
    );
    textarea.value = text;
    textarea.setSelectionRange(caret, caret);
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    close();
    textarea.focus();
  };

  const paint = () => {
    clear(box);
    items.forEach((item, i) => {
      const opt = el('div', {
        class: 'wiki-ac-item' + (i === active ? ' active' : '') + (item.isNew ? ' is-new' : ''),
        role: 'option', id: `${listId}-${i}`,
        'aria-selected': i === active ? 'true' : 'false',
        onMousedown: (ev) => { ev.preventDefault(); choose(i); },
      }, item.isNew
        ? [el('span', { class: 'wiki-ac-new', text: 'New entry' }), el('span', { text: `“${item.title}”` })]
        : [el('span', { class: 'wiki-ac-title', text: item.title }),
          item.category ? el('span', { class: 'wiki-ac-cat', text: item.category }) : null]);
      box.append(opt);
    });
    textarea.setAttribute('aria-activedescendant', `${listId}-${active}`);
    box.querySelector('.active')?.scrollIntoView({ block: 'nearest' });
  };

  const update = () => {
    ctx = wikiQueryAt(textarea.value, textarea.selectionStart);
    if (!ctx || textarea.selectionStart !== textarea.selectionEnd) { close(); return; }
    const q = ctx.query.trim();
    items = rankTitleMatches(State.entries, q, { excludeId, limit: 7 })
      .map((e) => ({ title: e.title, category: e.category }));
    if (q && !items.some((it) => it.title.trim().toLowerCase() === q.toLowerCase())) {
      items.push({ title: q, isNew: true });
    }
    if (!items.length) { close(); return; }
    active = Math.min(active, items.length - 1);
    box.hidden = false;
    paint();
  };

  textarea.addEventListener('input', () => { active = 0; update(); });
  textarea.addEventListener('click', update);
  textarea.addEventListener('keyup', (ev) => {
    if (ev.key === 'ArrowLeft' || ev.key === 'ArrowRight' || ev.key === 'Home' || ev.key === 'End') update();
  });
  textarea.addEventListener('keydown', (ev) => {
    if (box.hidden || !items.length) return;
    if (ev.key === 'ArrowDown') { ev.preventDefault(); active = (active + 1) % items.length; paint(); }
    else if (ev.key === 'ArrowUp') { ev.preventDefault(); active = (active - 1 + items.length) % items.length; paint(); }
    else if (ev.key === 'Enter' || ev.key === 'Tab') { ev.preventDefault(); choose(active); }
    else if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); close(); }
  });
  textarea.addEventListener('blur', () => setTimeout(close, 120));
}

async function viewForm(editId) {
  const existing = editId ? State.entries.find((e) => e.id === editId) : null;
  if (editId && !existing) return viewList('Not found', '', []);

  if (!State.form || State.form.forId !== (editId ?? 'new')) {
    let fields = [], tags = [], links = [];
    if (existing) {
      const detail = await Data.getDetail(editId);
      fields = detail.fields.map((f) => ({ name: f.field_name, value: f.field_value ?? '' }));
      tags = detail.tags.map((t) => t.tag);
      links = detail.links.map((l) => {
        const otherId = l.from_entry_id === editId ? l.to_entry_id : l.from_entry_id;
        const other = State.entries.find((e) => e.id === otherId);
        return { id: otherId, title: other?.title ?? '(missing)', relation: l.relation ?? '' };
      }).filter((l) => l.id);
    } else if (State.prefillNew) {
      if (State.prefillNew.linkFromId) {
        const origin = State.entries.find((e) => e.id === State.prefillNew.linkFromId);
        if (origin) links.push({ id: origin.id, title: origin.title, relation: '' });
      }
    }
    const fpDefaults = defaultFaceplateColors();
    State.form = {
      forId: editId ?? 'new',
      title: existing?.title ?? State.prefillNew?.title ?? '',
      category: existing?.category ?? State.prefillNew?.category ?? '',
      subcategory: existing?.subcategory ?? '',
      summary: existing?.summary ?? State.prefillNew?.summary ?? '',
      body: existing?.body ?? State.prefillNew?.body ?? '',
      source: existing?.source ?? State.prefillNew?.source ?? '',
      fp: {
        type: existing?.faceplate_type ?? 'text',
        text: existing?.faceplate_text ?? '',
        bg: existing?.faceplate_bg ?? fpDefaults.bg,
        color: existing?.faceplate_color ?? fpDefaults.color,
        font: existing?.faceplate_font ?? 'default',
        image: existing?.faceplate_image ?? null,
      },
      fields, tags, links,
    };
    State.prefillNew = null;
  }

  const F = State.form;
  const panel = el('div', { class: 'panel' });

  panel.append(el('button', {
    class: 'back-link', type: 'button',
    onClick: () => { State.form = null; editId ? go({ name: 'detail', id: editId }) : go({ name: 'list' }); },
  }, existing ? '← Back to entry' : '← Cancel'));

  panel.append(el('div', { class: 'page-head' }, [
    el('h1', { class: 'page-title', text: existing ? 'Edit entry' : 'New entry' }),
  ]));

  const textField = (labelText, key, opts = {}) => {
    const id = 'f-' + key;
    const input = opts.multiline
      ? el('textarea', { class: 'textarea', id, style: opts.style ?? {} })
      : el('input', { class: 'input', id, type: 'text' });
    input.value = F[key] ?? '';
    input.placeholder = opts.placeholder ?? '';
    input.addEventListener('input', () => { F[key] = input.value; });
    if (opts.onBlur) input.addEventListener('blur', opts.onBlur);
    if (opts.list) input.setAttribute('list', opts.list);
    return el('div', { class: 'field' }, [
      el('label', { class: 'field-label', for: id, text: labelText }),
      input,
      opts.hint ? el('div', { class: 'hint', text: opts.hint }) : null,
    ]);
  };

  panel.append(textField('Title *', 'title', { placeholder: 'Name of this entry' }));

  const categories = [...new Set(State.entries.map((e) => e.category).filter(Boolean))];
  const datalist = el('datalist', { id: 'cat-options' });
  for (const c of categories) datalist.append(el('option', { value: c }));
  panel.append(datalist);

  let suggestions;

  const categoryField = textField('Category *', 'category', {
    placeholder: 'e.g. Biology, History', list: 'cat-options',
    onBlur: () => suggestions?.refresh(),
  });
  panel.append(el('div', { class: 'form-grid' }, [
    categoryField,
    textField('Subcategory', 'subcategory', { placeholder: 'Optional' }),
  ]));

  panel.append(faceplateBuilder(F));
  const summaryField = textField('Summary', 'summary', {
    multiline: true, style: { minHeight: '76px' },
    placeholder: 'A sentence or two, shown in lists.',
    onBlur: () => suggestions?.refresh(),
  });
  const bodyField = textField('Notes', 'body', {
    multiline: true, style: { minHeight: '220px' },
    placeholder: 'Everything you want to keep about this topic. Supports ## subheadings, - bullet lists, **bold**, *italic*, and [[Entry Title]] inline links.',
    hint: 'Tip: type [[ to link another entry right inside a sentence.',
    onBlur: () => suggestions?.refresh(),
  });
  attachWikiAutocomplete(summaryField.querySelector('textarea'), editId);
  attachWikiAutocomplete(bodyField.querySelector('textarea'), editId);
  panel.append(summaryField, bodyField);

  /* Custom fields */
  const fieldsWrap = el('div', { class: 'fields-list' });
  const renderFields = () => {
    clear(fieldsWrap);
    F.fields.forEach((f, i) => {
      const name = el('input', { placeholder: 'Label', value: f.name });
      const value = el('input', { placeholder: 'Value', value: f.value });
      name.addEventListener('input', () => { F.fields[i].name = name.value; });
      value.addEventListener('input', () => { F.fields[i].value = value.value; });
      fieldsWrap.append(el('div', { class: 'field-input-row' }, [
        name, value,
        el('button', {
          class: 'icon-btn', type: 'button', 'aria-label': 'Remove field',
          onClick: () => { F.fields.splice(i, 1); renderFields(); },
        }, '×'),
      ]));
    });
    fieldsWrap.hidden = F.fields.length === 0;
  };
  renderFields();
  panel.append(el('div', { class: 'field' }, [
    el('label', { class: 'field-label', text: 'Custom fields' }),
    fieldsWrap,
    el('button', {
      class: 'add-btn', type: 'button',
      onClick: () => { F.fields.push({ name: '', value: '' }); renderFields(); },
    }, '+ Add field'),
  ]));

  /* Tags */
  const tagBox = el('div', { class: 'tags-input' });
  const tagInput = el('input', { placeholder: 'Type a tag, press Enter…' });
  const renderTags = () => {
    clear(tagBox);
    F.tags.forEach((t, i) => {
      tagBox.append(el('span', { class: 'tag-chip' }, [
        t,
        el('button', {
          class: 'chip-x', type: 'button', 'aria-label': `Remove tag ${t}`,
          onClick: () => { F.tags.splice(i, 1); renderTags(); suggestions?.refresh(); },
        }, '×'),
      ]));
    });
    tagBox.append(tagInput);
  };
  tagInput.addEventListener('keydown', (ev) => {
    if (ev.key !== 'Enter' && ev.key !== ',') return;
    ev.preventDefault();
    const val = tagInput.value.replace(',', '').trim();
    if (val && !F.tags.includes(val)) F.tags.push(val);
    tagInput.value = '';
    renderTags();
    tagInput.focus();
    suggestions?.refresh();
  });
  renderTags();
  panel.append(el('div', { class: 'field' }, [
    el('label', { class: 'field-label', text: 'Tags' }), tagBox,
  ]));

  const linkPickerResult = linkPicker(F, editId, () => suggestions?.refresh());
  suggestions = suggestedLinksSection(F, editId, linkPickerResult.renderChips);
  panel.append(suggestions.el, linkPickerResult.el);

  panel.append(textField('Source', 'source', { placeholder: 'URL, book, paper or reference' }));

  const publicCheck = el('input', {
    type: 'checkbox',
    checked: !!(F.is_public ?? existing?.is_public),
  });
  publicCheck.addEventListener('change', () => { F.is_public = publicCheck.checked; });
  panel.append(el('div', { class: 'field' }, [
    el('label', { class: 'auth-legal-check', style: { display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' } }, [
      publicCheck,
      el('span', { text: 'Publish this entry at a shareable read-only link' }),
    ]),
  ]));

  const saveBtn = el('button', { class: 'btn btn-primary', type: 'button' }, existing ? 'Save changes' : 'Create entry');
  saveBtn.addEventListener('click', async () => {
    if (!F.title.trim()) { toast('A title is required', true); return; }
    if (!F.category.trim()) { toast('A category is required', true); return; }
    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving…';
    try {
      // Automatically include any [[Entry Title]] wiki-links written in Summary/Notes
      // that match an existing entry and aren't already in F.links.
      const mentionedTitles = extractWikiLinks((F.summary ?? '') + '\n' + (F.body ?? ''));
      for (const mTitle of mentionedTitles) {
        const target = State.entries.find(
          (e) => e.id !== editId && e.title.trim().toLowerCase() === mTitle.toLowerCase()
        );
        if (target && !F.links.some((l) => l.id === target.id)) {
          F.links.push({ id: target.id, title: target.title, relation: 'Referenced in notes' });
        }
      }

      const id = await Data.save(
        { ...F, title: F.title.trim(), category: F.category.trim(), is_public: publicCheck.checked },
        F.fields, F.tags, F.links, editId
      );
      State.form = null;
      await Data.loadAll();
      if (!existing) {
        Data.trackEvent('entry_create', { category: F.category.trim(), count: State.entries.length });
        if (State.entries.length === 10) {
          Data.trackEvent('entry_milestone_10', { count: 10 });
        }
      }
      toast(existing ? 'Changes saved' : 'Entry created');
      go({ name: 'detail', id });
      Data.requestEmbedding(id).catch(() => {});
    } catch (err) {
      toast(err.message || 'Could not save', true);
      saveBtn.disabled = false;
      saveBtn.textContent = existing ? 'Save changes' : 'Create entry';
    }
  });

  panel.append(el('div', { class: 'form-actions' }, [
    saveBtn,
    el('button', {
      class: 'btn', type: 'button',
      onClick: () => { State.form = null; editId ? go({ name: 'detail', id: editId }) : go({ name: 'list' }); },
    }, 'Cancel'),
  ]));

  return panel;
}

/* ── Import ──────────────────────────────────────────────────────── */

const AI_IMPORT_PROMPT = `I'm writing entries for my knowledge base app, Synopsical. I need your reply in a specific plain-text format so I can paste it straight into the app's import box with no edits. Please follow this exactly.

FORMAT

For each entry, start with header lines — one per line, back-to-back with NO blank lines between them. Skip any header you have nothing for; don't leave it blank.

Title: <the entry's title>
Category: <one category>
Subcategory: <optional>
Tags: <comma-separated tags>
Summary: <one or two sentence summary>
Source: <optional URL or citation>
Field: <name> = <value>
Link: <other entry title> | <how they relate>

("Field:" and "Link:" can repeat, one line per custom field or cross-reference.)

Right after the last header line, leave exactly one blank line, then write the entry's full body. You may use ## subheadings, - bullet points, **bold**, *italic*, and [[Entry Title]] inline cross-references.

Title and Category are REQUIRED on every entry — never omit them.

If I ask for more than one entry, separate each complete entry (headers + body) with a line containing only three dashes:

---

Output ONLY the entries in this format. No intro, no "Here you go", no code fences, no notes before or after — just the raw text, ready to paste.

WHAT TO WRITE

Replace this section with your own title(s) and a short description of what each entry should cover — one per line if you want more than one, e.g.:
Byzantine Iconoclasm: the two periods of imperial bans on religious icons in the Byzantine Empire
Mycorrhizal Networks: how fungal networks let trees share nutrients and signals`;

function viewImport() {
  const panel = el('div', { class: 'panel' });

  panel.append(el('button', {
    class: 'back-link', type: 'button',
    onClick: () => { State.importDrafts = null; go({ name: 'list' }); },
  }, '← Cancel'));

  const aiPromptBtn = el('button', { class: 'btn btn-sm', type: 'button' }, '⧉ Copy AI prompt');
  aiPromptBtn.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(AI_IMPORT_PROMPT);
      toast('Prompt copied — paste it into your AI, add what you want written, then paste its reply into the box below');
    } catch {
      toast('Could not copy — your browser may be blocking clipboard access', true);
    }
  });

  panel.append(el('div', { class: 'page-head' }, [
    el('h1', { class: 'page-title', text: 'Import entries' }),
    el('span', { class: 'page-sub', text: 'Paste entries, or upload a .json backup or .md / .txt file' }),
    aiPromptBtn,
  ]));

  panel.append(el('div', { class: 'hint', style: { marginBottom: '14px', lineHeight: '1.7' } }, [
    'Recognized headers (all optional): ',
    el('code', { text: 'Title:' }), ' ', el('code', { text: 'Category:' }), ' ',
    el('code', { text: 'Subcategory:' }), ' ', el('code', { text: 'Tags:' }), ' ',
    el('code', { text: 'Summary:' }), ' ', el('code', { text: 'Source:' }), ' ',
    el('code', { text: 'Field: Name = Value' }), ' ',
    el('code', { text: 'Link: Target Title | Relation' }), '. ',
    'You can also restore a full ', el('code', { text: 'synopsical-export' }), ' JSON backup file below.',
  ]));

  const textarea = el('textarea', {
    class: 'textarea', style: { minHeight: '220px' },
    placeholder: 'Title: Byzantine Iconoclasm\nCategory: History\nTags: byzantine-empire, theology\n\n'
      + 'Two periods of imperial bans on religious icons...\n\n---\n\n'
      + 'Title: Mycorrhizal Networks\nCategory: Biology\n...',
  });

  const fileInput = el('input', {
    type: 'file', accept: '.json,.md,.txt,application/json,text/plain,text/markdown',
    multiple: true, style: { display: 'none' },
  });
  fileInput.addEventListener('change', async () => {
    const files = Array.from(fileInput.files ?? []);
    fileInput.value = '';
    if (!files.length) return;
    try {
      const texts = await Promise.all(files.map((f) => f.text()));
      const allDrafts = [];
      for (const t of texts) {
        allDrafts.push(...parseImportText(t));
      }
      if (!allDrafts.length) {
        toast('No valid entries found in the selected file(s)', true);
        return;
      }
      State.importDrafts = allDrafts;
      renderPreview();
      toast(`Loaded ${allDrafts.length} ${allDrafts.length === 1 ? 'entry' : 'entries'} from file`);
    } catch (err) {
      toast(err.message || 'Could not read file', true);
    }
  });

  panel.append(el('div', { class: 'import-file-bar' }, [
    el('button', {
      class: 'btn btn-sm', type: 'button', onClick: () => fileInput.click(),
    }, 'Upload .json backup or .md / .txt file'),
    fileInput,
    el('span', { class: 'hint', style: { marginTop: 0 } },
      'Restores exported JSON backups (including fields, tags, and links) or plain-text/Markdown files.'),
  ]));

  panel.append(el('div', { class: 'field' }, [textarea]));

  const previewHost = el('div');
  panel.append(previewHost);

  function renderPreview() {
    clear(previewHost);
    const drafts = State.importDrafts;
    if (!drafts?.length) return;

    previewHost.append(el('div', {
      class: 'section-label', text: `${drafts.length} ${drafts.length === 1 ? 'entry' : 'entries'} found`,
    }));

    for (const d of drafts) {
      const row = el('div', { class: 'import-row' });

      const titleInput = el('input', { class: 'input', value: d.title, placeholder: 'Title (required)' });
      const categoryInput = el('input', {
        class: 'input', value: d.category, placeholder: 'Category (required)', list: 'cat-options',
      });
      const warn = el('span', { class: 'import-warn' });

      function refreshWarn() {
        const missing = [];
        if (!d.title.trim()) missing.push('title');
        if (!d.category.trim()) missing.push('category');
        warn.textContent = missing.length ? `Needs a ${missing.join(' and a ')} before this can be imported` : '';
      }
      titleInput.addEventListener('input', () => { d.title = titleInput.value; refreshWarn(); });
      categoryInput.addEventListener('input', () => { d.category = categoryInput.value; refreshWarn(); });
      refreshWarn();

      const includeToggle = el('input', { type: 'checkbox' });
      includeToggle.checked = d._include;
      includeToggle.addEventListener('change', () => {
        d._include = includeToggle.checked;
        row.style.opacity = d._include ? '1' : '0.45';
      });

      row.append(
        el('div', { class: 'import-row-head' }, [
          includeToggle,
          el('div', { class: 'form-grid', style: { flex: '1' } }, [titleInput, categoryInput]),
        ]),
        d.tags.length
          ? el('div', { class: 'tags-wrap' }, d.tags.map((t) => el('span', { class: 'tag-pill', text: t })))
          : null,
        d.summary ? el('div', { class: 'hint', text: d.summary }) : null,
        d.body ? el('div', { class: 'hint', text: d.body.slice(0, 160) + (d.body.length > 160 ? '…' : '') }) : null,
        warn,
      );
      previewHost.append(row);
    }

    const importBtn = el('button', { class: 'btn btn-primary', type: 'button' }, 'Import entries');
    importBtn.addEventListener('click', () => runImport(drafts, importBtn));
    previewHost.append(el('div', { class: 'form-actions' }, [importBtn]));
  }

  const previewBtn = el('button', { class: 'btn btn-primary', type: 'button' }, 'Preview');
  previewBtn.addEventListener('click', () => {
    if (!textarea.value.trim()) { toast('Paste something or upload a file first', true); return; }
    State.importDrafts = parseImportText(textarea.value);
    renderPreview();
  });
  panel.append(el('div', { class: 'form-actions' }, [previewBtn]));

  if (State.importDrafts?.length) renderPreview();

  return panel;
}

async function runImport(drafts, btn) {
  const included = drafts.filter((d) => d._include);
  const invalid = included.filter((d) => !d.title.trim() || !d.category.trim());
  if (invalid.length) {
    toast(`${invalid.length} ${invalid.length === 1 ? 'entry needs' : 'entries need'} a title and category first`, true);
    return;
  }
  if (!included.length) { toast('Nothing selected to import', true); return; }

  btn.disabled = true;
  let done = 0, failed = 0;
  const fpDefaults = defaultFaceplateColors();
  const oldIdToNewId = new Map();
  const titleToNewId = new Map();
  for (const existing of State.entries) {
    titleToNewId.set(existing.title.trim().toLowerCase(), existing.id);
  }
  const savedDrafts = [];

  for (const d of included) {
    btn.textContent = `Importing ${done + failed + 1} of ${included.length}…`;
    try {
      const id = await Data.save(
        {
          title: d.title.trim(), category: d.category.trim(), subcategory: d.subcategory,
          summary: d.summary, body: d.body, source: d.source,
          fp: d.fp ?? { type: 'text', text: '', bg: fpDefaults.bg, color: fpDefaults.color, font: 'default', image: null },
        },
        d.fields, d.tags, [], null
      );
      if (d._originalId) oldIdToNewId.set(d._originalId, id);
      titleToNewId.set(d.title.trim().toLowerCase(), id);
      savedDrafts.push({ id, draft: d });
      Data.requestEmbedding(id).catch(() => {});
      done++;
    } catch {
      failed++;
    }
  }

  // Second pass: wire up any Link: headers, JSON bundle links, or [[Wiki-Links]]
  const pendingLinks = [];
  for (const { id: fromId, draft: d } of savedDrafts) {
    const rawLinks = [...(d.links ?? [])];
    for (const wikiTarget of extractWikiLinks((d.summary ?? '') + '\n' + (d.body ?? ''))) {
      if (!rawLinks.some((l) => (l.targetTitle ?? '').toLowerCase() === wikiTarget.toLowerCase())) {
        rawLinks.push({ targetTitle: wikiTarget, relation: 'Referenced in notes' });
      }
    }
    for (const l of rawLinks) {
      const toId = (l.targetId && oldIdToNewId.get(l.targetId))
        || (l.targetTitle && titleToNewId.get(l.targetTitle.trim().toLowerCase()));
      if (toId && toId !== fromId) {
        pendingLinks.push({ from_entry_id: fromId, to_entry_id: toId, relation: l.relation || null });
      }
    }
  }

  if (pendingLinks.length) {
    if (State.demo) {
      for (const pl of pendingLinks) {
        State.links.push({ id: 'dlink-' + crypto.randomUUID(), ...pl });
      }
    } else {
      try {
        await State.sb.from('links').insert(pendingLinks);
      } catch { /* ignore duplicate link constraint errors */ }
    }
  }

  State.importDrafts = null;
  await Data.loadAll();
  toast(failed ? `Imported ${done}, ${failed} failed — check your connection and try again for those` : `Imported ${done} ${done === 1 ? 'entry' : 'entries'}`, !!failed);
  go({ name: 'list' });
}

function faceplateBuilder(F) {
  const wrap = el('div', { class: 'fp-builder' });
  const preview = el('div');

  const refreshPreview = () => {
    clear(preview);
    preview.append(faceplate({
      faceplate_type: F.fp.type, faceplate_text: F.fp.text, faceplate_bg: F.fp.bg,
      faceplate_color: F.fp.color, faceplate_font: F.fp.font, faceplate_image: F.fp.image,
      title: F.title || '?',
    }, 'lg'));
  };

  const build = () => {
    clear(wrap);
    const tabs = el('div', { class: 'fp-tabs' });
    for (const type of ['text', 'image']) {
      tabs.append(el('button', {
        class: 'fp-tab' + (F.fp.type === type ? ' active' : ''), type: 'button',
        onClick: () => { F.fp.type = type; build(); },
      }, type === 'text' ? 'Initials' : 'Image'));
    }

    const controls = el('div', { class: 'fp-controls' });

    const colourRow = (labelText, key) => {
      const swatch = el('input', { type: 'color', class: 'fp-color', value: F.fp[key] });
      const hex = el('input', { class: 'fp-input', value: F.fp[key], style: { maxWidth: '110px' } });
      swatch.addEventListener('input', () => { F.fp[key] = swatch.value; hex.value = swatch.value; refreshPreview(); });
      hex.addEventListener('input', () => {
        if (/^#[0-9a-f]{6}$/i.test(hex.value)) { F.fp[key] = hex.value; swatch.value = hex.value; refreshPreview(); }
      });
      return el('div', { class: 'fp-row' }, [el('span', { class: 'fp-label', text: labelText }), swatch, hex]);
    };

    controls.append(colourRow('Background', 'bg'));

    if (F.fp.type === 'text') {
      const textInput = el('input', { class: 'fp-input', value: F.fp.text, placeholder: 'e.g. MY' });
      textInput.addEventListener('input', () => { F.fp.text = textInput.value.slice(0, 4); refreshPreview(); });
      controls.append(el('div', { class: 'fp-row' }, [el('span', { class: 'fp-label', text: 'Initials' }), textInput]));
      controls.append(colourRow('Text colour', 'color'));
    } else {
      const handleImageFile = async (file) => {
        if (!file) return;
        if (!file.type.startsWith('image/')) { toast('That file isn’t an image', true); return; }
        if (file.size > 3 * 1024 * 1024) { toast('Please choose an image under 3 MB', true); return; }
        toast('Uploading…');
        try {
          F.fp.image = await Data.uploadFaceplate(file);
          refreshPreview();
          build();
          toast('Image uploaded');
        } catch (err) {
          toast(err.message || 'Upload failed', true);
        }
      };

      const fileInput = el('input', { type: 'file', accept: 'image/*', style: { display: 'none' } });
      fileInput.addEventListener('change', () => handleImageFile(fileInput.files?.[0]));

      const pick = el('button', {
        class: 'btn btn-sm', type: 'button', onClick: () => fileInput.click(),
      }, F.fp.image ? 'Replace image' : 'Choose image');

      const dropzone = el('div', { class: 'fp-dropzone', tabindex: '0' }, [
        el('span', { class: 'fp-dropzone-text' }, 'Drop an image, or paste one (Ctrl+V), or:'),
        el('div', { class: 'fp-row', style: { marginTop: '8px' } }, [pick, fileInput]),
      ]);

      dropzone.addEventListener('dragover', (ev) => {
        ev.preventDefault();
        dropzone.classList.add('drag-active');
      });
      dropzone.addEventListener('dragleave', () => dropzone.classList.remove('drag-active'));
      dropzone.addEventListener('drop', (ev) => {
        ev.preventDefault();
        dropzone.classList.remove('drag-active');
        handleImageFile(ev.dataTransfer?.files?.[0]);
      });

      dropzone.addEventListener('paste', (ev) => {
        const item = [...(ev.clipboardData?.items ?? [])].find((it) => it.type.startsWith('image/'));
        if (!item) return;
        ev.preventDefault();
        handleImageFile(item.getAsFile());
      });

      const row = el('div', { class: 'fp-row' }, [
        el('span', { class: 'fp-label', text: 'Image' }), dropzone,
      ]);
      if (F.fp.image) {
        row.append(el('button', {
          class: 'add-btn', type: 'button',
          onClick: () => { F.fp.image = null; refreshPreview(); build(); },
        }, 'Remove'));
      }
      controls.append(row);
    }

    wrap.append(tabs, el('div', { class: 'fp-row-main' }, [preview, controls]));
    refreshPreview();
  };

  build();
  return el('div', { class: 'field' }, [
    el('label', { class: 'field-label', text: 'Faceplate' }), wrap,
  ]);
}

function suggestedLinksSection(F, editId, onLinkAdded) {
  const list = el('div');
  const wrap = el('div', { class: 'field', hidden: true }, [
    el('label', { class: 'field-label', text: 'Suggested links' }),
    list,
  ]);

  function overlapCandidates() {
    const linkedIds = new Set(F.links.map((l) => l.id));
    const myTags = new Set(F.tags.map((t) => t.toLowerCase()));
    const myCategory = F.category.trim().toLowerCase();
    const mentioned = new Set(
      extractWikiLinks((F.summary ?? '') + '\n' + (F.body ?? '')).map((t) => t.toLowerCase())
    );
    const out = [];
    for (const e of State.entries) {
      if (e.id === editId || linkedIds.has(e.id)) continue;
      const isMentioned = mentioned.has(e.title.trim().toLowerCase());
      const shared = (e.tags ?? []).filter((t) => myTags.has(t.toLowerCase()));
      const sameCategory = myCategory && e.category && e.category.trim().toLowerCase() === myCategory;
      const score = (isMentioned ? 50 : 0) + shared.length * 10 + (sameCategory ? 1 : 0);
      if (score <= 0) continue;
      const reason = isMentioned
        ? `Mentioned in notes: [[${e.title}]]`
        : shared.length
          ? `Shares tag${shared.length > 1 ? 's' : ''}: ${shared.slice(0, 2).join(', ')}`
          : `Same category: ${e.category}`;
      out.push({ id: e.id, title: e.title, category: e.category, reason, score });
    }
    return out.sort((a, b) => b.score - a.score).slice(0, 5);
  }

  async function semanticCandidates(excludeIds) {
    if (!editId) return [];
    try {
      const related = await Data.relatedEntries(editId, 6);
      return related
        .filter((r) => !excludeIds.has(r.id) && !F.links.some((l) => l.id === r.id))
        .slice(0, 3)
        .map((r) => ({
          id: r.id, title: r.title, category: r.category,
          reason: `${Math.round(r.similarity * 100)}% related`,
        }));
    } catch { return []; }
  }

  function addSuggestion(c) {
    const relation = window.prompt('How are they related? (optional)') ?? '';
    F.links.push({ id: c.id, title: c.title, relation: relation.trim() });
    onLinkAdded();
    refresh();
  }

  function render(items) {
    clear(list);
    wrap.hidden = items.length === 0;
    for (const c of items) {
      list.append(el('div', { class: 'linked-entry suggestion-row' }, [
        el('div', { class: 'linked-entry-info' }, [
          el('div', { class: 'linked-entry-title', text: c.title }),
          el('div', { class: 'linked-entry-rel', text: c.reason }),
        ]),
        c.category ? el('span', { class: 'pill', text: c.category }) : null,
        el('button', {
          class: 'btn btn-sm', type: 'button',
          onClick: () => addSuggestion(c),
        }, '+ Add'),
      ]));
    }
  }

  async function refresh() {
    const overlap = overlapCandidates();
    const semantic = await semanticCandidates(new Set(overlap.map((c) => c.id)));
    render([...overlap, ...semantic]);
  }

  refresh();
  return { el: wrap, refresh };
}

function linkPicker(F, editId, onChange) {
  const chips = el('div', { class: 'linked-chips' });
  const dropdown = el('div', { class: 'link-dropdown', hidden: true });
  const input = el('input', { class: 'input', placeholder: 'Search entries to link…', autocomplete: 'off' });

  const renderChips = () => {
    clear(chips);
    F.links.forEach((l, i) => {
      chips.append(el('span', { class: 'linked-chip' }, [
        l.title + (l.relation ? ` · ${l.relation}` : ''),
        el('button', {
          class: 'chip-x', type: 'button', 'aria-label': `Unlink ${l.title}`,
          onClick: () => { F.links.splice(i, 1); renderChips(); onChange?.(); },
        }, '×'),
      ]));
    });
  };

  input.addEventListener('input', () => {
    const q = input.value.trim().toLowerCase();
    clear(dropdown);
    if (!q) { dropdown.hidden = true; return; }
    const matches = State.entries
      .filter((e) => e.id !== editId
        && !F.links.some((l) => l.id === e.id)
        && (e.title.toLowerCase().includes(q) || (e.category ?? '').toLowerCase().includes(q)))
      .slice(0, 8);
    if (!matches.length) { dropdown.hidden = true; return; }
    for (const m of matches) {
      dropdown.append(el('button', {
        class: 'link-option', type: 'button',
        onClick: () => {
          const relation = window.prompt('How are they related? (optional)') ?? '';
          F.links.push({ id: m.id, title: m.title, relation: relation.trim() });
          input.value = '';
          dropdown.hidden = true;
          renderChips();
          onChange?.();
        },
      }, [el('span', { text: m.title }), m.category ? el('span', { class: 'pill', text: m.category }) : null]));
    }
    dropdown.hidden = false;
  });

  input.addEventListener('keydown', (ev) => { if (ev.key === 'Escape') dropdown.hidden = true; });
  document.addEventListener('click', (ev) => {
    if (!dropdown.contains(ev.target) && ev.target !== input) dropdown.hidden = true;
  });

  renderChips();
  return {
    el: el('div', { class: 'field' }, [
      el('label', { class: 'field-label', text: 'Linked entries' }),
      el('div', { class: 'link-wrap' }, [input, dropdown]),
      chips,
    ]),
    renderChips,
  };
}

/* ── Settings ──────────────────────────────────────────────────── */

function viewSettings() {
  const panel = el('div', { class: 'panel' });
  panel.append(el('div', { class: 'page-head' }, [
    el('h1', { class: 'page-title', text: 'Appearance' }),
    el('span', { class: 'page-sub', text: State.demo ? 'Live preview in Sample Mode' : 'Synced with your account' }),
  ]));

  const presets = el('div', { class: 'theme-presets' });
  THEME_PRESETS.forEach((p) => {
    const swatch = el('button', {
      class: 'theme-preset' + (State.settings.theme?.name === p.name ? ' selected' : ''),
      type: 'button', title: p.name, 'aria-label': `${p.name} theme`,
      onClick: async () => {
        State.settings.theme = { ...p };
        applyTheme();
        try { await Data.saveSettings(); toast(`${p.name} applied`); }
        catch (err) { toast(err.message || 'Could not save theme', true); }
        render();
      },
    });
    swatch.style.background = p.bg1;
    swatch.append(
      el('span', { style: { position: 'absolute', inset: 'auto 0 0 0', height: '38%', background: p.bg0 } }),
      el('span', { style: { position: 'absolute', top: '5px', left: '5px', right: '5px', height: '6px', borderRadius: '2px', background: p.accent } })
    );
    presets.append(swatch);
  });

  panel.append(el('div', { class: 'section' }, [
    el('div', { class: 'section-label', text: 'Theme' }), presets,
  ]));

  const fontRow = (labelText, key, withDefault = false) => {
    const select = el('select', { class: 'select' });
    const current = State.settings[key] || '';
    if (withDefault) {
      const opt = el('option', { value: '', text: 'Match theme' });
      if (current === '') opt.selected = true;
      select.append(opt);
    }
    for (const [value, label] of [
      ['alegreya', 'Alegreya (default)'],
      ['worksans', 'Work Sans (default)'],
      ['serif', 'Serif (Georgia)'],
      ['sans', 'Sans-serif'],
      ['mono', 'Monospace'],
      ['whimsical', 'Whimsical (Fredoka)'],
      ['lab', 'Lab notebook (IBM Plex Mono)'],
      ['commanding', 'Commanding (Space Grotesk)'],
    ]) {
      const opt = el('option', { value, text: label });
      if (current === value) opt.selected = true;
      select.append(opt);
    }
    for (const f of State.settings.customFonts ?? []) {
      const opt = el('option', { value: f.family, text: `${f.name} (uploaded)` });
      if (current === f.family) opt.selected = true;
      select.append(opt);
    }
    select.addEventListener('change', async () => {
      State.settings[key] = select.value;
      applyTheme();
      try { await Data.saveSettings(); } catch { /* non-fatal */ }
    });
    return el('div', { class: 'field' }, [
      el('label', { class: 'field-label', text: labelText }), select,
    ]);
  };

  const fontSizeRow = () => {
    const MIN = 12, MAX = 22;
    const readout = el('span', { class: 'hint', style: { marginTop: 0 }, text: `${State.settings.fontSize ?? 15}px` });
    const slider = el('input', {
      type: 'range', min: MIN, max: MAX, step: 0.5,
      value: State.settings.fontSize ?? 15,
      'aria-label': 'Text size',
      style: { width: '100%', accentColor: 'var(--accent)' },
    });
    slider.addEventListener('input', () => {
      State.settings.fontSize = Number(slider.value);
      readout.textContent = `${slider.value}px`;
      applyTheme();
    });
    slider.addEventListener('change', async () => {
      try { await Data.saveSettings(); } catch { /* non-fatal */ }
    });
    return el('div', { class: 'field' }, [
      el('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' } }, [
        el('label', { class: 'field-label', text: 'Text size' }), readout,
      ]),
      slider,
    ]);
  };

  panel.append(el('div', { class: 'section' }, [
    el('div', { class: 'section-label', text: 'Fonts' }),
    el('div', { class: 'form-grid' }, [
      fontRow('Interface', 'fontUi'), fontRow('Reading', 'fontBody'),
    ]),
    el('div', { class: 'hint', style: { margin: '14px 0 8px' } },
      'Override the font for one specific kind of text — leave any of these on "Match theme" to keep using Interface/Reading above.'),
    el('div', { class: 'form-grid' }, [
      fontRow('Titles', 'fontTitle', true),
      fontRow('Summaries', 'fontSummary', true),
      fontRow('Tags', 'fontTags', true),
      fontRow('Categories', 'fontCategories', true),
    ]),
    fontSizeRow(),
  ]));

  panel.append(customFontsSection());

  const colours = el('div', { class: 'color-grid' });
  const labels = {
    bg0: 'Background', bg1: 'Panels', bg2: 'Inputs', bg3: 'Raised',
    border: 'Borders', text0: 'Headings', text1: 'Body text', text2: 'Muted',
    accent: 'Accent', teal: 'Tags', coral: 'Danger', purple: 'Links',
  };
  for (const [key, label] of Object.entries(labels)) {
    const picker = el('input', { type: 'color', value: State.settings.theme?.[key] ?? '#000000' });
    picker.addEventListener('input', () => {
      State.settings.theme = { ...State.settings.theme, [key]: picker.value, name: 'Custom' };
      applyTheme();
    });
    picker.addEventListener('change', async () => {
      try { await Data.saveSettings(); } catch { /* non-fatal */ }
    });
    colours.append(el('div', { class: 'color-row' }, [
      el('label', { text: label }), picker,
    ]));
  }
  panel.append(el('div', { class: 'section' }, [
    el('div', { class: 'section-label', text: 'Fine tuning' }), colours,
  ]));

  panel.append(publishingSettingsSection());
  panel.append(quickCaptureSettingsSection());
  panel.append(billingSettingsSection());

  if (!State.demo) {
    panel.append(el('div', { class: 'section' }, [
      el('div', { class: 'section-label', text: 'Account' }),
      el('p', { class: 'hint', style: { marginBottom: '12px' } },
        'Deleting your account removes every entry, tag, link, custom field, uploaded font and faceplate image — permanently.'),
      el('button', {
        class: 'btn btn-danger', type: 'button',
        onClick: async () => {
          const ok = await confirmDialog(
            'Delete your account?',
            'Every entry, tag, link, custom field, uploaded font and faceplate image will be permanently removed. This cannot be undone.',
            'Delete my account'
          );
          if (!ok) return;
          try {
            await Data.deleteAccount();
            State.user = null;
            State.entries = [];
            toast('Your account and all its data have been deleted');
            showHomepage();
          } catch (err) {
            toast(err.message || 'Could not delete your account', true);
          }
        },
      }, 'Delete my account'),
    ]));
  }

  return panel;
}

function publishingSettingsSection() {
  const wrap = el('div', { class: 'section' });
  wrap.append(el('div', { class: 'section-label', text: 'Public sharing' }));

  const prof = State.profile ?? {
    handle: State.demo ? 'sample' : '',
    display_name: State.demo ? 'Sample Scholar' : '',
    bio: '',
    is_public: State.demo,
  };

  const handleInput = el('input', {
    class: 'input',
    type: 'text',
    value: prof.handle ?? '',
    placeholder: 'e.g. byzantine-notes',
    'aria-label': 'Public handle',
  });
  const nameInput = el('input', {
    class: 'input',
    type: 'text',
    value: prof.display_name ?? '',
    placeholder: 'e.g. Dr. Elena Rostova',
    'aria-label': 'Public display name',
  });
  const bioInput = el('input', {
    class: 'input',
    type: 'text',
    value: prof.bio ?? '',
    placeholder: 'Optional one-line description shown on your public compendium page',
    'aria-label': 'Public compendium bio',
  });
  const publicToggle = el('input', {
    type: 'checkbox',
    checked: !!prof.is_public,
  });

  const previewUrlBox = el('div', { class: 'hint', style: { marginTop: '6px' } });
  const updatePreviewText = () => {
    const h = handleInput.value.trim().toLowerCase().replace(/^@+/, '');
    if (h) {
      const built = buildPublicShareUrl(window.location.origin, { handle: h });
      previewUrlBox.textContent = `Public URL: ${built.url}`;
    } else {
      previewUrlBox.textContent = 'Choose a handle to get a shareable URL like synopsical.com/#/@your-handle';
    }
  };
  handleInput.addEventListener('input', updatePreviewText);
  updatePreviewText();

  const savePubBtn = el('button', { class: 'btn btn-sm btn-primary', type: 'button' }, 'Save sharing settings');
  const openPubBtn = el('button', {
    class: 'btn btn-sm',
    type: 'button',
    hidden: !(prof.handle || State.demo),
    onClick: () => {
      const h = handleInput.value.trim().toLowerCase().replace(/^@+/, '') || (State.demo ? 'sample' : '');
      if (h) go({ name: 'public', mode: 'compendium', handle: h, entrySlug: null, entryId: null });
    },
  }, 'Preview public compendium →');

  savePubBtn.addEventListener('click', async () => {
    savePubBtn.disabled = true;
    savePubBtn.textContent = 'Saving…';
    try {
      const updated = await Data.updatePublishing({
        handle: handleInput.value,
        display_name: nameInput.value,
        bio: bioInput.value,
        is_public: publicToggle.checked,
      });
      if (updated?.is_public || updated?.handle) {
        Data.trackEvent('share_enable', { mode: updated.is_public ? 'compendium' : 'handle' });
      }
      openPubBtn.hidden = !(updated?.handle || State.demo);
      toast('Public sharing settings saved');
    } catch (err) {
      toast(err.message || 'Could not save sharing settings', true);
    } finally {
      savePubBtn.disabled = false;
      savePubBtn.textContent = 'Save sharing settings';
    }
  });

  wrap.append(
    el('div', { class: 'form-grid' }, [
      el('div', { class: 'field' }, [
        el('label', { class: 'field-label', text: 'Public @handle' }),
        handleInput,
        previewUrlBox,
      ]),
      el('div', { class: 'field' }, [
        el('label', { class: 'field-label', text: 'Curator / Compendium title' }),
        nameInput,
      ]),
    ]),
    el('div', { class: 'field' }, [
      el('label', { class: 'field-label', text: 'Compendium subtitle / bio' }),
      bioInput,
    ]),
    el('label', { class: 'auth-legal-check', style: { marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' } }, [
      publicToggle,
      el('span', { text: 'Publish entire compendium as a read-only reference at this @handle (otherwise only entries you individually Share are public).' }),
    ]),
    el('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap' } }, [savePubBtn, openPubBtn])
  );
  return wrap;
}

function billingSettingsSection() {
  const wrap = el('div', { class: 'section' });
  wrap.append(el('div', { class: 'section-label', text: 'Plan & Plus membership' }));

  const paid = isPaidPlan();
  const cfg = window.SYNOPSICAL_CONFIG ?? {};
  const checkoutUrl = buildStripeCheckoutUrl(cfg.STRIPE_PLUS_PAYMENT_LINK, {
    userId: State.user?.id || '',
    email: State.user?.email || '',
  });
  const portalUrl = (cfg.STRIPE_CUSTOMER_PORTAL_URL || '').trim();

  const statusRow = el('div', { class: 'field-row', style: { alignItems: 'center', justifyContent: 'space-between' } }, [
    el('div', {}, [
      el('div', {
        style: { fontWeight: '600', color: 'var(--text0)' },
        text: paid ? 'Synopsical Plus (Active)' : 'Synopsical Free',
      }),
      el('div', {
        class: 'hint',
        text: paid
          ? 'Thank you for supporting independent software. All Plus capabilities are unlocked.'
          : 'Core personal compendium is free forever. Upgrade to Plus ($5/mo) for custom @handle publishing, AI Archivist synthesis, and book export.',
      }),
    ]),
    el('span', { class: 'pill', text: paid ? 'PLUS' : 'FREE' }),
  ]);
  wrap.append(statusRow);

  const btnRow = el('div', { style: { display: 'flex', gap: '8px', marginTop: '12px', flexWrap: 'wrap' } });
  if (paid && portalUrl) {
    btnRow.append(el('a', {
      class: 'btn btn-sm',
      href: portalUrl,
      target: '_blank',
      rel: 'noopener',
    }, 'Manage billing in Stripe →'));
  } else if (!paid) {
    btnRow.append(el('button', {
      class: 'btn btn-sm btn-primary',
      type: 'button',
      onClick: () => {
        Data.trackEvent('plus_checkout_click', { source: State.demo ? 'demo-settings' : 'settings' });
        if (checkoutUrl) {
          window.open(checkoutUrl, '_blank', 'noopener');
        } else {
          window.location.href = 'pricing.html';
        }
      },
    }, checkoutUrl ? 'Upgrade to Plus ($5/mo) →' : 'View Plus plan & pricing →'));
  }
  wrap.append(btnRow);
  return wrap;
}

function quickCaptureSettingsSection() {
  const wrap = el('div', { class: 'section' });
  wrap.append(el('div', { class: 'section-label', text: 'Quick capture & offline app' }));
  wrap.append(el('p', { class: 'hint', style: { marginBottom: '12px' } },
    'Drag the bookmarklet below to your browser bookmarks bar. Highlighting any passage on the web and clicking "Clip to Synopsical" opens a new entry pre-filled with the page title, quoted selection, and source URL.'));

  const bookmarkletHref = buildBookmarkletHref(window.location.origin);
  const bookmarkletLink = el('a', {
    class: 'btn btn-sm btn-primary bookmarklet-pill',
    href: bookmarkletHref,
    onClick: (ev) => {
      ev.preventDefault();
      toast('Drag this button to your browser bookmarks bar to clip from any webpage');
    },
  }, '✦ Clip to Synopsical');

  const testClipBtn = el('button', {
    class: 'btn btn-sm',
    type: 'button',
    onClick: () => {
      State.prefillNew = {
        title: 'Clipped: On the Method of Commonplace Books',
        category: 'Captured',
        summary: '',
        body: '> A commonplace book is not a diary of passing impressions, but a working index of enduring arguments and sources.',
        source: 'https://example.org/commonplace-method',
      };
      State.form = null;
      go({ name: 'new' });
      toast('Opened quick-capture draft');
    },
  }, 'Try sample clip →');

  wrap.append(
    el('div', { style: { display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' } }, [
      bookmarkletLink,
      testClipBtn,
    ]),
    el('div', { class: 'hint', style: { marginTop: '10px' } },
      'Tip: You can also install Synopsical as an offline-ready desktop or mobile app via your browser’s "Install app" / "Add to Home Screen" menu.')
  );
  return wrap;
}

async function viewPublic(route) {
  const panel = el('div', { class: 'panel public-reader-panel' });
  const loaded = await Data.loadPublicView(route);

  if (!loaded || (!loaded.entries.length && !loaded.targetEntry)) {
    panel.append(el('div', { class: 'empty' }, [
      el('div', { class: 'empty-title', text: 'Public page not found' }),
      el('p', { text: 'This entry or compendium is private or does not exist.' }),
      el('div', { class: 'empty-actions' }, [
        el('button', {
          class: 'btn btn-primary',
          type: 'button',
          onClick: () => (State.user || State.demo ? go({ name: 'list' }) : showHomepage()),
        }, State.user || State.demo ? '← Back to compendium' : '← Back to Synopsical'),
      ]),
    ]));
    return panel;
  }

  const { profile, entries, targetEntry } = loaded;
  const handle = profile?.handle || route.handle || 'sample';
  const curatorTitle = profile?.display_name || `@${handle}`;

  Data.trackEvent('public_view', {
    mode: targetEntry ? 'entry' : 'compendium',
    count: entries.length,
  });

  // Top reader attribution bar with "Make your own compendium" growth CTA
  const readerBanner = el('div', { class: 'public-reader-bar' }, [
    el('div', { class: 'public-reader-meta' }, [
      el('span', { class: 'pill', text: 'Public Edition' }),
      el('button', {
        class: 'linkish',
        type: 'button',
        onClick: () => go({ name: 'public', mode: 'compendium', handle, entrySlug: null, entryId: null }),
      }, curatorTitle),
      profile?.bio ? el('span', { class: 'hint', style: { marginTop: 0 }, text: `— ${profile.bio}` }) : null,
    ]),
    el('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap' } }, [
      (State.user || State.demo)
        ? el('button', {
          class: 'btn btn-sm',
          type: 'button',
          onClick: () => go({ name: 'list' }),
        }, '← Back to editor')
        : el('button', {
          class: 'btn btn-sm btn-primary',
          type: 'button',
          onClick: () => showAuth('signup'),
        }, 'Start your own compendium — free'),
    ]),
  ]);
  panel.append(readerBanner);

  if (targetEntry) {
    if (entries.length > 1 && handle) {
      panel.append(el('button', {
        class: 'back-link',
        type: 'button',
        onClick: () => go({ name: 'public', mode: 'compendium', handle, entrySlug: null, entryId: null }),
      }, `← All published entries in ${curatorTitle}`));
    }

    panel.append(el('div', { class: 'detail-hero' }, [
      faceplate(targetEntry, 'lg'),
      el('div', { style: { flex: '1', minWidth: '0' } }, [
        el('h1', { class: 'detail-title', text: targetEntry.title }),
        el('div', { class: 'detail-meta' }, [
          targetEntry.subcategory ? el('span', { text: targetEntry.subcategory }) : null,
          el('span', {
            text: 'Published in ' + curatorTitle,
          }),
        ]),
      ]),
      targetEntry.category ? categoryStamp(targetEntry.category) : null,
    ]));

    const section = (label, content) =>
      el('div', { class: 'section' }, [el('div', { class: 'section-label', text: label }), content]);

    if (targetEntry.summary) {
      panel.append(section('Summary', renderRichBody(targetEntry.summary, targetEntry.id, 'body-text-lead entry-summary-text')));
    }
    if (targetEntry.body) {
      panel.append(section('Notes', renderRichBody(targetEntry.body, targetEntry.id, targetEntry.summary ? '' : 'body-text-lead')));
    }
    if ((targetEntry.fields ?? []).length) {
      const wrap = el('div');
      for (const f of targetEntry.fields) {
        wrap.append(el('div', { class: 'field-row' }, [
          el('div', { class: 'field-name', text: f.field_name ?? f.name }),
          el('div', { class: 'field-val', text: (f.field_value ?? f.value) || '—' }),
        ]));
      }
      panel.append(section('Details', wrap));
    }
    if ((targetEntry.tags ?? []).length) {
      const wrap = el('div', { class: 'tags-wrap' });
      for (const t of targetEntry.tags) {
        wrap.append(el('span', { class: 'tag-pill', text: typeof t === 'string' ? t : t.tag }));
      }
      panel.append(section('Tags', wrap));
    }
    if (targetEntry.source) {
      panel.append(section('Source', el('div', { class: 'body-text', style: { fontSize: '13.5px' }, text: targetEntry.source })));
    }
    return panel;
  }

  // Compendium index view (`#/@handle`)
  panel.append(el('div', { class: 'page-head' }, [
    el('h1', { class: 'page-title', text: curatorTitle }),
    el('span', { class: 'page-sub', text: `@${handle} · ${entries.length} published ${entries.length === 1 ? 'entry' : 'entries'}` }),
  ]));
  if (profile?.bio) {
    panel.append(el('p', { class: 'body-text', style: { marginBottom: '18px', color: 'var(--text2)' }, text: profile.bio }));
  }

  for (const e of entries) {
    const slug = e.slug || slugify(e.title);
    const card = el('button', {
      class: 'entry-card',
      type: 'button',
      onClick: () => go({
        name: 'public',
        mode: 'handle-entry',
        handle,
        entrySlug: slug,
        entryId: null,
      }),
    });
    const body = el('div', { class: 'entry-card-body' }, [
      el('div', { class: 'entry-card-top' }, [
        el('span', { class: 'entry-card-title', text: e.title }),
        e.category ? el('span', { class: 'pill', text: e.category }) : null,
      ]),
      e.summary ? el('div', { class: 'entry-card-summary', text: e.summary }) : null,
    ]);
    card.append(faceplate(e), body);
    panel.append(card);
  }

  return panel;
}

function customFontsSection() {
  const wrap = el('div', { class: 'section' });
  wrap.append(el('div', { class: 'section-label', text: 'Custom fonts' }));

  const list = el('div', { style: { marginBottom: '10px' } });
  const fonts = State.settings.customFonts ?? [];
  if (!fonts.length) {
    list.append(el('div', { class: 'hint', text: 'No custom fonts installed yet.' }));
  } else {
    for (const f of fonts) {
      list.append(el('div', { class: 'field-row' }, [
        el('div', { class: 'field-name', text: f.name }),
        el('div', {
          class: 'field-val', style: { fontFamily: `'${f.family}', Georgia, serif` },
          text: 'AaBbCc 123',
        }),
        el('button', {
          class: 'btn btn-sm btn-danger', type: 'button',
          onClick: () => void removeCustomFont(f),
        }, 'Remove'),
      ]));
    }
  }
  wrap.append(list);

  const fileInput = el('input', {
    type: 'file', accept: '.otf,.ttf,.woff,.woff2', multiple: true, style: { display: 'none' },
  });
  fileInput.addEventListener('change', async () => {
    const files = Array.from(fileInput.files ?? []);
    fileInput.value = '';
    for (const file of files) {
      if (file.size > 3 * 1024 * 1024) { toast(`${file.name} is over 3 MB — skipped`, true); continue; }
      toast(`Uploading ${file.name}…`);
      try {
        const path = await Data.uploadFont(file);
        const family = 'CustomFont_' + crypto.randomUUID().replace(/-/g, '');
        const name = file.name.replace(/\.(otf|ttf|woff2?)$/i, '');
        State.settings.customFonts = [...(State.settings.customFonts ?? []), { name, family, path }];
        await Data.saveSettings();
        await applyCustomFontFaces();
        toast(`${name} installed`);
        render();
      } catch (err) {
        toast(err.message || `Could not upload ${file.name}`, true);
      }
    }
  });

  wrap.append(
    el('button', {
      class: 'btn btn-sm', type: 'button', onClick: () => fileInput.click(),
    }, '+ Upload font file'),
    fileInput,
    el('div', { class: 'hint', text: '.otf, .ttf, .woff, or .woff2 — up to 3 MB each' })
  );
  return wrap;
}

async function removeCustomFont(f) {
  const ok = await confirmDialog(
    'Remove this font?',
    `"${f.name}" will no longer be available. Any theme currently using it falls back to the default serif.`,
    'Remove'
  );
  if (!ok) return;

  State.settings.customFonts = (State.settings.customFonts ?? []).filter((x) => x.family !== f.family);
  if (State.settings.fontUi === f.family) State.settings.fontUi = 'serif';
  if (State.settings.fontBody === f.family) State.settings.fontBody = 'serif';
  for (const key of ['fontTitle', 'fontSummary', 'fontTags', 'fontCategories']) {
    if (State.settings[key] === f.family) State.settings[key] = null;
  }

  try {
    await Data.saveSettings();
    await State.sb.storage.from('fonts').remove([f.path]);
  } catch (err) {
    toast(err.message || 'Removed locally, but the stored file may remain', true);
  }
  applyTheme();
  await applyCustomFontFaces();
  toast('Font removed');
  render();
}

/* ── Link map ──────────────────────────────────────────────────── */

function viewGraph() {
  const wrap = el('div', { class: 'graph-wrap' });
  const toolbar = el('div', { class: 'graph-toolbar' });
  const filterBar = el('div', { class: 'graph-filters' });
  const controlsBar = el('div', { class: 'graph-controls' });
  const canvas = el('canvas', { id: 'graph-canvas' });

  toolbar.append(filterBar, controlsBar);
  wrap.append(toolbar, canvas);

  let activeCategory = null;
  let zoom = 1, panX = 0, panY = 0;

  const categories = [...new Set(State.entries.map((e) => e.category).filter(Boolean))].slice(0, 7);
  const rebuildFilterButtons = (onPick) => {
    clear(filterBar);
    filterBar.append(el('button', {
      class: 'graph-filter-btn' + (activeCategory === null ? ' active' : ''),
      type: 'button',
      onClick: () => { activeCategory = null; onPick(); rebuildFilterButtons(onPick); },
    }, 'All categories'));
    for (const cat of categories) {
      filterBar.append(el('button', {
        class: 'graph-filter-btn' + (activeCategory === cat ? ' active' : ''),
        type: 'button',
        onClick: () => { activeCategory = cat; onPick(); rebuildFilterButtons(onPick); },
      }, cat));
    }
  };

  requestAnimationFrame(() => {
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const W = canvas.clientWidth, H = canvas.clientHeight;
    canvas.width = W * dpr; canvas.height = H * dpr;

    const style = getComputedStyle(document.documentElement);
    const col = (n, fallback) => (style.getPropertyValue(n).trim() || fallback);
    const fontBody = col('--font-body', 'Georgia, serif');
    const fontMono = col('--font-mono', 'monospace');

    const entries = State.entries;
    if (!entries.length) {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = col('--text3', '#65707d');
      ctx.font = `16px ${fontBody}`; ctx.textAlign = 'center';
      ctx.fillText('No entries yet', W / 2, H / 2);
      return;
    }

    const CAP = 100;
    const shown = [...entries].sort((a, b) => b.linkCount - a.linkCount).slice(0, CAP);
    const ids = new Set(shown.map((e) => e.id));
    const omitted = entries.length - shown.length;

    const nodes = shown.map((e, i) => {
      const a = (i / shown.length) * Math.PI * 2;
      return { e, x: W / 2 + Math.cos(a) * Math.min(W, H) * 0.28,
                  y: H / 2 + Math.sin(a) * Math.min(W, H) * 0.28, vx: 0, vy: 0 };
    });
    const byId = new Map(nodes.map((n) => [n.e.id, n]));
    const edges = (State.links ?? []).filter((l) => ids.has(l.from_entry_id) && ids.has(l.to_entry_id));

    let dragging = null, panning = false, panStart = null, hovered = null, frame = 0, raf = 0;

    controlsBar.append(
      el('button', {
        class: 'graph-filter-btn', type: 'button', title: 'Zoom in',
        onClick: () => { zoom = Math.min(2.5, zoom * 1.2); draw(); },
      }, '+'),
      el('button', {
        class: 'graph-filter-btn', type: 'button', title: 'Zoom out',
        onClick: () => { zoom = Math.max(0.45, zoom / 1.2); draw(); },
      }, '−'),
      el('button', {
        class: 'graph-filter-btn', type: 'button',
        onClick: () => { zoom = 1; panX = 0; panY = 0; frame = 0; draw(); },
      }, 'Reset')
    );

    rebuildFilterButtons(() => draw());

    const step = () => {
      for (const a of nodes) {
        for (const b of nodes) {
          if (a === b) continue;
          const dx = a.x - b.x, dy = a.y - b.y;
          const d2 = Math.max(dx * dx + dy * dy, 36);
          const f = 3200 / d2, d = Math.sqrt(d2);
          a.vx += (dx / d) * f; a.vy += (dy / d) * f;
        }
        a.vx += (W / 2 - a.x) * 0.0045; a.vy += (H / 2 - a.y) * 0.0045;
      }
      for (const l of edges) {
        const a = byId.get(l.from_entry_id), b = byId.get(l.to_entry_id);
        if (!a || !b) continue;
        const dx = b.x - a.x, dy = b.y - a.y;
        const d = Math.max(Math.hypot(dx, dy), 1), f = (d - 145) * 0.05;
        a.vx += (dx / d) * f; a.vy += (dy / d) * f;
        b.vx -= (dx / d) * f; b.vy -= (dy / d) * f;
      }
      for (const n of nodes) {
        if (n === dragging) continue;
        n.vx *= 0.78; n.vy *= 0.78;
        n.x = Math.max(50, Math.min(W - 50, n.x + n.vx));
        n.y = Math.max(60, Math.min(H - 40, n.y + n.vy));
      }
    };

    const draw = () => {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = col('--bg0', '#f3f5f7');
      ctx.fillRect(0, 0, W, H);

      ctx.save();
      ctx.translate(W / 2 + panX, H / 2 + panY);
      ctx.scale(zoom, zoom);
      ctx.translate(-W / 2, -H / 2);

      const neighborIds = new Set();
      if (hovered) {
        neighborIds.add(hovered.e.id);
        for (const l of edges) {
          if (l.from_entry_id === hovered.e.id) neighborIds.add(l.to_entry_id);
          if (l.to_entry_id === hovered.e.id) neighborIds.add(l.from_entry_id);
        }
      }

      for (const l of edges) {
        const a = byId.get(l.from_entry_id), b = byId.get(l.to_entry_id);
        if (!a || !b) continue;
        const isHighlighted = hovered && (l.from_entry_id === hovered.e.id || l.to_entry_id === hovered.e.id);
        const catDim = activeCategory && a.e.category !== activeCategory && b.e.category !== activeCategory;
        ctx.globalAlpha = catDim ? 0.14 : hovered ? (isHighlighted ? 0.95 : 0.2) : 0.75;
        ctx.strokeStyle = isHighlighted ? col('--accent', '#0a29fa') : col('--border2', '#c3cbd4');
        ctx.lineWidth = isHighlighted ? 2 : 1.2;
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();

        if (isHighlighted && l.relation) {
          const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
          ctx.font = `10px ${fontMono}`;
          ctx.fillStyle = col('--accent', '#0a29fa');
          ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
          ctx.fillText(l.relation.slice(0, 38), mx, my - 4);
        }
      }

      const fpDefaults = defaultFaceplateColors();
      for (const n of nodes) {
        const catMatch = !activeCategory || n.e.category === activeCategory;
        const hoverMatch = !hovered || neighborIds.has(n.e.id);
        ctx.globalAlpha = catMatch && hoverMatch ? 1 : 0.22;

        const r = 12 + Math.min(n.e.linkCount * 2, 12);
        ctx.beginPath(); ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
        ctx.fillStyle = n.e.faceplate_bg || fpDefaults.bg; ctx.fill();
        ctx.strokeStyle = (n === hovered)
          ? col('--accent', '#0a29fa')
          : (n.e.faceplate_color || fpDefaults.color);
        ctx.lineWidth = (n === hovered) ? 2.5 : 1.5;
        ctx.stroke();

        ctx.fillStyle = n.e.faceplate_color || fpDefaults.color;
        ctx.font = `bold ${Math.max(9, r * 0.65)}px ${fontBody}`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText((n.e.faceplate_text || n.e.title.slice(0, 2)).toUpperCase().slice(0, 3), n.x, n.y);

        ctx.fillStyle = col('--text0', '#14181f');
        ctx.font = `600 11.5px ${fontBody}`; ctx.textBaseline = 'alphabetic';
        const label = n.e.title.length > 24 ? n.e.title.slice(0, 22) + '…' : n.e.title;
        ctx.fillText(label, n.x, n.y + r + 14);
      }

      ctx.restore();
      ctx.globalAlpha = 1;

      if (omitted > 0) {
        ctx.fillStyle = col('--text3', '#65707d');
        ctx.font = `12px ${fontMono}`; ctx.textAlign = 'left'; ctx.textBaseline = 'bottom';
        ctx.fillText(`Showing the ${shown.length} most-linked entries · ${omitted} not drawn`, 16, H - 14);
      }
    };

    const loop = () => { if (frame++ < 260) step(); draw(); raf = requestAnimationFrame(loop); };
    loop();

    const toWorld = (ev) => {
      const r = canvas.getBoundingClientRect();
      const sx = ev.clientX - r.left, sy = ev.clientY - r.top;
      return {
        sx, sy,
        x: (sx - W / 2 - panX) / zoom + W / 2,
        y: (sy - H / 2 - panY) / zoom + H / 2,
      };
    };

    let downPos = null;
    canvas.addEventListener('pointerdown', (ev) => {
      const p = toWorld(ev);
      downPos = { sx: p.sx, sy: p.sy };
      dragging = nodes.find((n) => Math.hypot(p.x - n.x, p.y - n.y) < 26) ?? null;
      if (dragging) {
        canvas.setPointerCapture(ev.pointerId);
      } else {
        panning = true;
        panStart = { x: p.sx - panX, y: p.sy - panY };
        canvas.setPointerCapture(ev.pointerId);
      }
    });
    canvas.addEventListener('pointermove', (ev) => {
      const p = toWorld(ev);
      if (dragging) {
        dragging.x = p.x; dragging.y = p.y; frame = 0;
        return;
      }
      if (panning && panStart) {
        panX = p.sx - panStart.x;
        panY = p.sy - panStart.y;
        return;
      }
      const hit = nodes.find((n) => Math.hypot(p.x - n.x, p.y - n.y) < 24) ?? null;
      if (hit !== hovered) {
        hovered = hit;
        canvas.style.cursor = hit ? 'pointer' : 'grab';
      }
    });
    canvas.addEventListener('pointerup', (ev) => {
      const p = toWorld(ev);
      if (dragging && downPos && Math.hypot(p.sx - downPos.sx, p.sy - downPos.sy) < 5) {
        const id = dragging.e.id;
        cancelAnimationFrame(raf);
        go({ name: 'detail', id });
        return;
      }
      dragging = null; panning = false; panStart = null; downPos = null;
    });
    canvas.addEventListener('wheel', (ev) => {
      ev.preventDefault();
      const factor = ev.deltaY < 0 ? 1.1 : 0.9;
      zoom = Math.max(0.45, Math.min(2.5, zoom * factor));
    }, { passive: false });

    const observer = new MutationObserver(() => {
      if (!document.body.contains(canvas)) { cancelAnimationFrame(raf); observer.disconnect(); }
    });
    observer.observe($('view'), { childList: true });
  });

  return wrap;
}

/* ── Export ────────────────────────────────────────────────────── */

async function collectExportData() {
  if (State.demo) {
    const entries = State.entries;
    const fields = [];
    const tags = [];
    for (const e of entries) {
      for (const f of e.fields ?? []) {
        fields.push({ entry_id: e.id, field_name: f.field_name, field_value: f.field_value, sort_order: f.sort_order });
      }
      for (const t of e.tags ?? []) {
        tags.push({ entry_id: e.id, tag: t });
      }
    }
    return { entries, fields, tags, links: State.links ?? [] };
  }
  const [{ data: entries }, { data: fields }, { data: tags }, { data: links }] = await Promise.all([
    State.sb.from('entries').select('*').order('created_at'),
    State.sb.from('entry_fields').select('*'),
    State.sb.from('tags').select('*'),
    State.sb.from('links').select('*'),
  ]);
  return {
    entries: entries ?? [],
    fields: fields ?? [],
    tags: tags ?? [],
    links: links ?? [],
  };
}

async function exportEverything() {
  toast('Preparing JSON export…');
  try {
    const { entries, fields, tags, links } = await collectExportData();
    const bundle = {
      format: 'synopsical-export',
      version: 1,
      exportedAt: new Date().toISOString(),
      counts: {
        entries: entries.length, fields: fields.length,
        tags: tags.length, links: links.length,
      },
      entries, entry_fields: fields, tags, links,
    };

    const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = el('a', { href: url, download: `synopsical-${new Date().toISOString().slice(0, 10)}.json` });
    document.body.append(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
    toast(`Exported ${bundle.counts.entries} entries as JSON`);
  } catch (err) {
    toast(err.message || 'Export failed', true);
  }
}

async function exportMarkdown() {
  toast('Preparing Markdown export…');
  try {
    const { entries, fields, tags, links } = await collectExportData();
    const md = entriesToMarkdown(entries, fields, tags, links);
    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = el('a', { href: url, download: `synopsical-${new Date().toISOString().slice(0, 10)}.md` });
    document.body.append(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
    toast(`Exported ${entries.length} entries as Markdown`);
  } catch (err) {
    toast(err.message || 'Markdown export failed', true);
  }
}

/* ── Render ────────────────────────────────────────────────────── */

async function render() {
  if (State.user || State.demo) renderSidebar();
  const host = $('view');
  const v = State.view;
  let node;

  switch (v.name) {
    case 'public': node = await viewPublic(v); break;
    case 'detail': node = await viewDetail(v.id); break;
    case 'edit':   node = await viewForm(v.id); break;
    case 'new':    node = await viewForm(null); break;
    case 'import': node = viewImport(); break;
    case 'settings': node = viewSettings(); break;
    case 'graph':  node = viewGraph(); break;
    case 'recent':
      node = viewList('Recently added', 'newest first',
        [...State.entries].sort((a, b) => b.created_at.localeCompare(a.created_at)));
      break;
    case 'category': {
      const list = State.entries.filter((e) => e.category === v.category);
      node = viewList(v.category, `${list.length} ${list.length === 1 ? 'entry' : 'entries'}`, list);
      break;
    }
    case 'tag': {
      const list = State.entries.filter((e) => e.tags.includes(v.tag));
      node = viewList(`#${v.tag}`, `${list.length} ${list.length === 1 ? 'entry' : 'entries'}`, list);
      break;
    }
    case 'search': {
      const rows = await Data.search(v.query);
      const enriched = rows.map((r) => State.entries.find((e) => e.id === r.id) ?? r);
      node = viewList('Search', `“${v.query}” — ${enriched.length} found`, enriched,
        'Nothing matched that search.');
      break;
    }
    default:
      node = viewList('All entries', `${State.entries.length} total`, State.entries);
  }

  clear(host);
  host.append(node);
  if (v.name !== 'graph') host.parentElement.scrollTop = 0;
}

/* ── Authentication & Sample Mode ──────────────────────────────── */

function isEmailConfirmationRedirect() {
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  const search = new URLSearchParams(window.location.search);
  return hash.get('type') === 'signup' || search.get('type') === 'signup';
}

function showVerified(hasSession) {
  $('verified-screen').hidden = false;
  $('homepage').hidden = true;
  $('auth-screen').hidden = true;
  $('setup-screen').hidden = true;
  $('app').hidden = true;
  $('verified-sub').textContent = hasSession
    ? 'Your email is confirmed, and you’re signed in.'
    : 'Your email is confirmed. Sign in below to continue.';
  $('verified-continue').onclick = async () => {
    if (hasSession) {
      const { data } = await State.sb.auth.getSession();
      if (data.session?.user) { await start(data.session.user); return; }
    }
    showAuth('signin');
  };
}

function showResetScreen() {
  $('reset-screen').hidden = false;
  $('homepage').hidden = true;
  $('auth-screen').hidden = true;
  $('setup-screen').hidden = true;
  $('verified-screen').hidden = true;
  $('app').hidden = true;
  $('reset-password').value = '';
  $('reset-password-confirm').value = '';
  $('reset-error').hidden = true;
  setPasswordVisible('reset-password', false);
  setPasswordVisible('reset-password-confirm', false);
}

function authHashFor(mode) {
  return mode === 'signin' ? '#/sign-in'
    : mode === 'signup' ? '#/sign-up'
    : mode === 'forgot' ? '#/forgot-password'
    : '#/';
}
function readAuthHash() {
  const raw = window.location.hash.replace(/^#\/?/, '');
  if (raw === 'sign-in') return 'signin';
  if (raw === 'sign-up') return 'signup';
  if (raw === 'forgot-password') return 'forgot';
  return null;
}

function showAuth(mode = 'signin') {
  exitDemo(false);
  $('app').classList.remove('public-mode');
  const hash = authHashFor(mode);
  if (window.location.hash !== hash) window.location.hash = hash;
  else paintAuth(mode);
}

function paintAuth(mode = 'signin') {
  $('app').classList.remove('public-mode');
  $('auth-screen').hidden = false;
  $('homepage').hidden = true;
  $('app').hidden = true;
  $('setup-screen').hidden = true;
  $('verified-screen').hidden = true;
  $('reset-screen').hidden = true;
  if (mode === 'signup') Data.trackEvent('signup_view', { source: 'auth-screen' });
  $('auth-sub').textContent = mode === 'signin' ? 'Sign in to reach your entries.'
    : mode === 'signup' ? 'Create an account to get started.'
    : 'Enter your email and we’ll send you a reset link.';
  $('auth-submit').textContent = mode === 'signin' ? 'Sign in'
    : mode === 'signup' ? 'Create account' : 'Send reset link';
  $('auth-toggle').textContent = mode === 'signin' ? 'Need an account? Create one'
    : mode === 'signup' ? 'Already have an account? Sign in' : 'Back to sign in';
  $('auth-password').autocomplete = mode === 'signin' ? 'current-password' : 'new-password';
  $('auth-form').dataset.mode = mode;

  const isSignup = mode === 'signup';
  $('auth-confirm-label').hidden = !isSignup;
  $('auth-confirm-wrap').hidden = !isSignup;
  if (!isSignup) $('auth-password-confirm').value = '';

  $('auth-legal-wrap').hidden = !isSignup;
  $('auth-privacy-check').required = isSignup;
  if (!isSignup) $('auth-privacy-check').checked = false;

  const isForgot = mode === 'forgot';
  const passwordWrap = $('auth-password').closest('.password-wrap');
  passwordWrap.hidden = isForgot;
  passwordWrap.previousElementSibling.hidden = isForgot;
  $('auth-password').required = !isForgot;
  if (isForgot) $('auth-password').value = '';
  $('auth-forgot').hidden = mode !== 'signin';

  setPasswordVisible('auth-password', false);
  setPasswordVisible('auth-password-confirm', false);
}

function showHomepage() {
  exitDemo(false);
  $('app').classList.remove('public-mode');
  const hash = '#/';
  if (window.location.hash !== hash && window.location.hash !== '') window.location.hash = hash;
  else paintHomepage();
}
function paintHomepage() {
  $('app').classList.remove('public-mode');
  $('homepage').hidden = false;
  $('auth-screen').hidden = true;
  $('verified-screen').hidden = true;
  $('reset-screen').hidden = true;
  $('app').hidden = true;
}

async function showPublicRoute(pubRoute) {
  $('homepage').hidden = true;
  $('auth-screen').hidden = true;
  $('setup-screen').hidden = true;
  $('verified-screen').hidden = true;
  $('reset-screen').hidden = true;
  $('app').hidden = false;
  if (!State.user && !State.demo) {
    $('app').classList.add('public-mode');
  }
  applyTheme();
  State.view = pubRoute;
  await render();
}

/**
 * Enters the interactive Sample Compendium without requiring an account.
 * Visitors can browse 8 interconnected entries, click [[wiki-links]], test
 * the Link map, switch themes, or draft an entry in memory.
 */
async function startDemo(initialEntryId = null) {
  State.demo = true;
  $('app').classList.remove('public-mode');
  const { entries, links } = cloneSampleCompendium();
  State.entries = entries.map((e) => ({
    ...e,
    slug: e.slug || slugify(e.title),
    is_public: true,
  }));
  State.links = links;
  await Data.loadProfile();
  await Data.loadAll();

  Data.trackEvent('sample_start', {
    source: initialEntryId ? 'proof-card' : 'cta',
    count: State.entries.length,
  });

  $('homepage').hidden = true;
  $('auth-screen').hidden = true;
  $('setup-screen').hidden = true;
  $('verified-screen').hidden = true;
  $('reset-screen').hidden = true;
  $('app').hidden = false;
  $('app').classList.add('demo-mode');
  $('demo-banner').hidden = false;

  applyTheme();
  if (initialEntryId === 'new') {
    go({ name: 'new' });
  } else if (initialEntryId) {
    go({ name: 'detail', id: initialEntryId });
  } else {
    go({ name: 'list' });
  }
}

function exitDemo(goHome = true) {
  if (!State.demo) return;
  State.demo = false;
  State.entries = [];
  State.links = [];
  State.form = null;
  $('app').classList.remove('demo-mode');
  $('demo-banner').hidden = true;
  if (goHome) showHomepage();
}

function setPasswordVisible(inputId, visible) {
  const input = $(inputId);
  const toggle = $(inputId + '-toggle');
  input.type = visible ? 'text' : 'password';
  toggle.textContent = visible ? 'Hide' : 'Show';
  toggle.setAttribute('aria-pressed', String(visible));
  toggle.setAttribute('aria-label', visible ? 'Hide password' : 'Show password');
}

function wireAuth() {
  $('auth-logo-home').addEventListener('click', () => showHomepage());

  $('auth-toggle').addEventListener('click', () => {
    const mode = $('auth-form').dataset.mode;
    showAuth(mode === 'forgot' ? 'signin' : mode === 'signin' ? 'signup' : 'signin');
    $('auth-error').hidden = true;
  });

  $('auth-forgot').addEventListener('click', () => {
    showAuth('forgot');
    $('auth-error').hidden = true;
  });

  for (const id of ['auth-password', 'auth-password-confirm', 'reset-password', 'reset-password-confirm']) {
    $(id + '-toggle').addEventListener('click', () => {
      setPasswordVisible(id, $(id).type === 'password');
    });
  }

  $('auth-form').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const mode = $('auth-form').dataset.mode;
    const email = $('auth-email').value.trim();
    const errBox = $('auth-error');
    const submit = $('auth-submit');

    errBox.hidden = true;

    if (mode === 'forgot') {
      submit.disabled = true;
      submit.textContent = 'Sending…';
      const { error } = await State.sb.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin + window.location.pathname,
      });
      submit.disabled = false;
      submit.textContent = 'Send reset link';
      errBox.textContent = error ? error.message
        : 'If that email has an account, a reset link is on its way.';
      errBox.hidden = false;
      if (!error) showAuth('signin');
      return;
    }

    const password = $('auth-password').value;

    if (mode === 'signup' && password !== $('auth-password-confirm').value) {
      errBox.textContent = 'Those two passwords don’t match.';
      errBox.hidden = false;
      $('auth-password-confirm').focus();
      return;
    }

    submit.disabled = true;
    submit.textContent = mode === 'signin' ? 'Signing in…' : 'Creating…';

    const { data, error } = mode === 'signin'
      ? await State.sb.auth.signInWithPassword({ email, password })
      : await State.sb.auth.signUp({ email, password });

    submit.disabled = false;
    submit.textContent = mode === 'signin' ? 'Sign in' : 'Create account';

    if (error) {
      errBox.textContent = error.message;
      errBox.hidden = false;
      return;
    }
    if (mode === 'signup') {
      Data.trackEvent('signup_complete', { source: 'auth-form' });
    }
    if (mode === 'signup' && !data.session) {
      errBox.textContent = 'Check your email for a confirmation link, then sign in.';
      errBox.hidden = false;
      showAuth('signin');
      return;
    }
    await start(data.session.user);
  });

  $('reset-form').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const password = $('reset-password').value;
    const confirm = $('reset-password-confirm').value;
    const errBox = $('reset-error');
    const submit = $('reset-submit');

    errBox.hidden = true;
    if (password !== confirm) {
      errBox.textContent = 'Those two passwords don’t match.';
      errBox.hidden = false;
      $('reset-password-confirm').focus();
      return;
    }

    submit.disabled = true;
    submit.textContent = 'Setting…';
    const { data, error } = await State.sb.auth.updateUser({ password });
    submit.disabled = false;
    submit.textContent = 'Set new password';

    if (error) {
      errBox.textContent = error.message;
      errBox.hidden = false;
      return;
    }
    toast('Password updated');
    await start(data.user);
  });

  $('btn-signout').addEventListener('click', async () => {
    if (State.demo) {
      exitDemo(true);
      return;
    }
    await State.sb.auth.signOut();
    State.user = null;
    State.entries = [];
    showAuth('signin');
  });
}

/* ── Boot ──────────────────────────────────────────────────────── */

async function start(user) {
  exitDemo(false);
  $('app').classList.remove('public-mode');
  State.user = user;
  $('homepage').hidden = true;
  $('auth-screen').hidden = true;
  $('setup-screen').hidden = true;
  $('verified-screen').hidden = true;
  $('app').hidden = false;

  if (readAuthHash()) history.replaceState(null, '', window.location.pathname);

  try {
    await Data.loadSettings();
    applyTheme();
    await applyCustomFontFaces();
    await Data.loadAll();
  } catch (err) {
    toast(err.message || 'Could not load your entries', true);
  }

  try {
    await Data.loadProfile();
  } catch {
    State.profile = null;
  }

  State.view = readHash();
  await render();
}

function wireChrome() {
  $('nav-home').addEventListener('click', () => go({ name: 'list' }));
  $('nav-all').addEventListener('click', () => go({ name: 'list' }));
  $('nav-recent').addEventListener('click', () => go({ name: 'recent' }));
  $('nav-graph').addEventListener('click', () => go({ name: 'graph' }));
  $('nav-random').addEventListener('click', () => {
    const excludeId = State.view.name === 'detail' ? State.view.id : null;
    const picked = pickRandomEntry(State.entries, excludeId);
    if (!picked) {
      toast('Add an entry first to jump to a random note');
      return;
    }
    go({ name: 'detail', id: picked.id });
  });
  $('btn-new').addEventListener('click', () => { State.form = null; go({ name: 'new' }); });
  $('btn-import').addEventListener('click', () => go({ name: 'import' }));
  $('btn-settings').addEventListener('click', () => go({ name: 'settings' }));
  $('btn-export').addEventListener('click', exportEverything);
  $('btn-export-md').addEventListener('click', exportMarkdown);

  $('demo-signup').addEventListener('click', () => showAuth('signup'));
  $('demo-exit').addEventListener('click', () => exitDemo(true));

  let searchTimer = 0;
  $('search').addEventListener('input', (ev) => {
    clearTimeout(searchTimer);
    const q = ev.target.value;
    searchTimer = setTimeout(() => {
      if (q.trim()) go({ name: 'search', query: q.trim() });
      else if (State.view.name === 'search') go({ name: 'list' });
    }, 250);
  });

  $('btn-menu').addEventListener('click', () => setSidebarOpen(!$('sidebar').classList.contains('open')));
  $('sidebar-backdrop').addEventListener('click', () => setSidebarOpen(false));

  $('modal-overlay').addEventListener('click', (ev) => {
    if (ev.target === $('modal-overlay')) $('modal-overlay').hidden = true;
  });
  document.addEventListener('keydown', (ev) => {
    if (ev.key !== 'Escape') return;
    if (!$('modal-overlay').hidden) $('modal-overlay').hidden = true;
    if ($('sidebar').classList.contains('open')) setSidebarOpen(false);
  });

  window.addEventListener('hashchange', async () => {
    if (!State.user && !State.demo) return;
    if (State.demo) {
      const authMode = readAuthHash();
      if (authMode) {
        exitDemo(false);
        paintAuth(authMode);
        return;
      }
      if (window.location.hash === '#/' || window.location.hash === '') {
        exitDemo(false);
        paintHomepage();
        return;
      }
    }
    State.view = readHash();
    await render();
  });
}

function wireHomepage() {
  $('home-signin').addEventListener('click', () => showAuth('signin'));
  $('home-cta-signin').addEventListener('click', () => showAuth('signin'));
  $('home-cta-start').addEventListener('click', () => showAuth('signup'));
  $('home-cta-start-2').addEventListener('click', () => showAuth('signup'));
  $('home-cta-demo').addEventListener('click', () => startDemo());
  $('home-cta-demo-2').addEventListener('click', () => startDemo());

  for (const card of document.querySelectorAll('.home-proof-card[data-sample-id]')) {
    const sampleId = card.dataset.sampleId;
    card.addEventListener('click', () => startDemo(sampleId));
    card.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter' || ev.key === ' ') {
        ev.preventDefault();
        startDemo(sampleId);
      }
    });
  }

  window.addEventListener('hashchange', () => {
    if (State.user || State.demo) return;
    const pubRoute = parsePublicHash(window.location.hash);
    if (pubRoute) {
      showPublicRoute(pubRoute);
      return;
    }
    if (window.location.hash === '#/sample') {
      startDemo();
      return;
    }
    const mode = readAuthHash();
    if (mode) paintAuth(mode);
    else paintHomepage();
  });
}

async function boot() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => { /* offline SW optional */ });
  }

  const cfg = window.SYNOPSICAL_CONFIG ?? {};
  if (!cfg.SUPABASE_URL || !cfg.SUPABASE_ANON_KEY) {
    $('homepage').hidden = true;
    $('setup-screen').hidden = false;
    return;
  }

  State.sb = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);

  let isRecovery = false;
  State.sb.auth.onAuthStateChange((event) => {
    if (event === 'PASSWORD_RECOVERY') isRecovery = true;
  });

  wireAuth();
  wireChrome();
  wireHomepage();

  const capturedDraft = parseQuickCaptureParams(window.location.search);
  const confirming = isEmailConfirmationRedirect();
  const { data } = await State.sb.auth.getSession();

  if (confirming || isRecovery || capturedDraft) {
    history.replaceState(null, '', window.location.pathname + window.location.hash);
  }

  if (confirming) {
    showVerified(!!data.session?.user);
    return;
  }
  if (isRecovery) {
    showResetScreen();
    return;
  }

  if (capturedDraft) {
    State.prefillNew = capturedDraft;
    State.form = null;
    if (data.session?.user) {
      window.location.hash = '#/new';
      await start(data.session.user);
    } else {
      await startDemo('new');
    }
    toast('Clipped passage ready — review and save to your compendium');
    return;
  }

  if (data.session?.user) {
    await start(data.session.user);
    return;
  }

  const pubRoute = parsePublicHash(window.location.hash);
  if (pubRoute) {
    await showPublicRoute(pubRoute);
    return;
  }

  if (window.location.hash === '#/sample') {
    await startDemo();
    return;
  }

  const mode = readAuthHash();
  if (mode) {
    paintAuth(mode);
    return;
  }

  Data.trackEvent('home_view', { source: 'landing' });
}

boot();
