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

// Pure text-parsing logic lives outside this file on purpose, so it can be
// unit-tested without booting the whole app — see lib/import-parser.mjs.
import { parseImportBlock, parseImportText } from './lib/import-parser.mjs';

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

// accent_ink is the text color .btn-primary sits on top of its accent fill
// with — a separate field, not derived from bg0/text0 at paint time, because
// which one reads legibly depends on whether a given preset's accent is
// bright or dark, and a dark-accent preset (an earlier Card Catalog
// iteration had one) needs the opposite of what every preset here needs.
// All seven happen to use their own bg0 right now, since all seven accents
// are currently bright/light — but this field exists, rather than every
// preset just hardcoding bg0 in style.css, specifically so a future dark
// accent doesn't quietly repeat that bug.
const THEME_PRESETS = [
  // Default as of the "Card Catalog" redesign. Ground moved off the
  // original kraft-brown to a quiet, cool blue-black — direct feedback
  // was that brown read as "not eye-catching" once sky blue (itself
  // chosen from a side-by-side after a rust red called "horrendous" and
  // a "denim" that read as too washed-out) was sitting on it. The actual
  // fix wasn't a bolder ground, though — two saturated fields (a loud
  // background AND a loud accent) compete rather than either one popping;
  // a single accent reads as more "eye-catching" against a calm field
  // than two competing hues do against each other. So: the ground stays
  // quiet, and red gets a real but small role instead of a dominant
  // one — it's the danger color already, and now also the second ink
  // categoryStamp() (below) alternates with blue, instead of sage.
  // Kept in the same THEME_KEYS shape as every other preset (see below)
  // so the existing custom-color editor in Settings works on it unchanged.
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
  // The Card Catalog default's pairing: a literary book-serif for titles and
  // reading text, a quiet workhorse sans for UI chrome.
  alegreya: "'Alegreya', Georgia, serif",
  worksans: "'Work Sans', 'Segoe UI', -apple-system, sans-serif",
};

// The three new options above are hosted on Google Fonts — free to use
// (all three are open-licensed) but not installed on anyone's computer, so
// the actual font files have to be fetched. GOOGLE_FONTS maps each key to
// the exact family/weight string Google's stylesheet endpoint expects.
const GOOGLE_FONTS = {
  whimsical: 'Fredoka:wght@400;600',
  lab: 'IBM+Plex+Mono:wght@400;500;600',
  commanding: 'Space+Grotesk:wght@400;600;700',
  alegreya: 'Alegreya:wght@400;700;900',
  worksans: 'Work+Sans:wght@400;600',
};

const _loadedFonts = new Set();

/**
 * Fetches a Google Font's stylesheet only the first time it's actually
 * selected. Loading all three upfront would cost every visitor a handful
 * of network requests for fonts most of them will never choose — this
 * keeps the page fast for everyone by default.
 */
function ensureGoogleFont(key) {
  const spec = GOOGLE_FONTS[key];
  if (!spec || _loadedFonts.has(key)) return;
  _loadedFonts.add(key);
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = `https://fonts.googleapis.com/css2?family=${spec}&display=swap`;
  document.head.appendChild(link);
}

/* ── Application state ─────────────────────────────────────────── */

const State = {
  sb: null,
  user: null,
  entries: [],          // entries with their tags and link counts attached
  view: { name: 'list' },
  settings: { theme: { ...THEME_PRESETS[0] }, fontUi: 'worksans', fontBody: 'alegreya', fontSize: 15, customFonts: [] },
  form: null,           // working draft while the editor is open
  profile: null,        // { plan: 'free' | 'paid', ... } — null until loaded, or if
                         // supabase-schema-02-profiles.sql hasn't been run yet
};

/* ── Data access ───────────────────────────────────────────────── */

const Data = {
  async loadAll() {
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
    const [{ data: fields }, { data: tags }, { data: links }] = await Promise.all([
      State.sb.from('entry_fields').select('*').eq('entry_id', id).order('sort_order'),
      State.sb.from('tags').select('*').eq('entry_id', id),
      State.sb.from('links').select('*')
        .or(`from_entry_id.eq.${id},to_entry_id.eq.${id}`),
    ]);
    return { fields: fields ?? [], tags: tags ?? [], links: links ?? [] };
  },

  async save(draft, fields, tagList, linkList, editId) {
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

    // Replace the satellite rows wholesale — simplest correct approach at
    // this scale, and it matches what the original did.
    await Promise.all([
      State.sb.from('entry_fields').delete().eq('entry_id', id),
      State.sb.from('tags').delete().eq('entry_id', id),
      State.sb.from('links').delete().or(`from_entry_id.eq.${id},to_entry_id.eq.${id}`),
    ]);

    const cleanFields = fields
      .filter((f) => f.name.trim())
      .map((f, i) => ({ entry_id: id, field_name: f.name.trim(), field_value: f.value ?? '', sort_order: i }));
    const cleanTags = [...new Set(tagList.map((t) => t.trim()).filter(Boolean))]
      .map((tag) => ({ entry_id: id, tag }));
    const cleanLinks = linkList
      .filter((l) => l.id !== id)
      .map((l) => ({ from_entry_id: id, to_entry_id: l.id, relation: l.relation || null }));

    const jobs = [];
    if (cleanFields.length) jobs.push(State.sb.from('entry_fields').insert(cleanFields));
    if (cleanTags.length) jobs.push(State.sb.from('tags').insert(cleanTags));
    if (cleanLinks.length) jobs.push(State.sb.from('links').insert(cleanLinks));
    const results = await Promise.all(jobs);
    for (const r of results) if (r.error) throw r.error;

    return id;
  },

  async remove(id) {
    const { error } = await State.sb.from('entries').delete().eq('id', id);
    if (error) throw error;
  },

  async search(query) {
    const q = query.trim();
    if (!q) return [];
    const { data, error } = await State.sb
      .from('entries').select('*')
      .textSearch('search_tsv', q, { type: 'websearch', config: 'english' })
      .limit(60);
    if (error) {
      // websearch syntax can reject odd input; fall back to a plain scan.
      const { data: alt } = await State.sb
        .from('entries').select('*')
        .or(`title.ilike.%${q}%,body.ilike.%${q}%,summary.ilike.%${q}%,category.ilike.%${q}%`)
        .limit(60);
      return alt ?? [];
    }
    return data ?? [];
  },

  async loadSettings() {
    const { data } = await State.sb.from('settings').select('data').maybeSingle();
    if (data?.data && Object.keys(data.data).length) {
      State.settings = { ...State.settings, ...data.data };
    }
  },

  async saveSettings() {
    const { error } = await State.sb.from('settings')
      .upsert({ owner_id: State.user.id, data: State.settings });
    if (error) throw error;
  },

  // The row is created automatically by a database trigger the moment an
  // account signs up (see supabase-schema-02-profiles.sql), so this is a
  // read — the app never writes to `plan` itself.
  async loadProfile() {
    const { data } = await State.sb.from('profiles').select('*').maybeSingle();
    State.profile = data ?? null;
  },

  async uploadFaceplate(file) {
    const ext = (file.name.split('.').pop() || 'png').toLowerCase();
    const path = `${State.user.id}/${crypto.randomUUID()}.${ext}`;
    const { error } = await State.sb.storage.from('faceplates')
      .upload(path, file, { upsert: false, contentType: file.type });
    if (error) throw error;
    return path;
  },

  async faceplateUrl(path) {
    if (!path) return null;
    const { data } = await State.sb.storage.from('faceplates').createSignedUrl(path, 3600);
    return data?.signedUrl ?? null;
  },

  async uploadFont(file) {
    const ext = (file.name.split('.').pop() || 'ttf').toLowerCase();
    const path = `${State.user.id}/${crypto.randomUUID()}.${ext}`;
    const { error } = await State.sb.storage.from('fonts')
      .upload(path, file, { upsert: false, contentType: file.type || `font/${ext}` });
    if (error) throw error;
    return path;
  },

  async fontUrl(path) {
    if (!path) return null;
    const { data } = await State.sb.storage.from('fonts').createSignedUrl(path, 3600);
    return data?.signedUrl ?? null;
  },

  // Fire-and-forget on purpose. This calls the embed-entry Edge Function,
  // which is the only place the embeddings-provider API key ever exists —
  // never in this file, never in the browser. A failure here (no key
  // configured yet, provider hiccup) must never block or appear to break
  // saving an entry, so callers should not let this reject their own flow.
  async requestEmbedding(entryId) {
    const { error } = await State.sb.functions.invoke('embed-entry', {
      body: { entryId },
    });
    if (error) throw error;
  },

  // Permanently deletes the signed-in user's own account — see
  // supabase/functions/delete-account/index.ts for what actually runs
  // server-side. Every entries/tags/links/settings row (and profiles, if
  // that migration has been run) cascades away automatically once the
  // auth user is gone; this call is what makes that happen.
  async deleteAccount() {
    const { error } = await State.sb.functions.invoke('delete-account');
    if (error) throw error;
  },

  // Semantic neighbours of one entry, via the related_entries() Postgres
  // function — looks up that entry's own stored embedding and orders
  // everything else in the account by vector distance to it. Returns
  // nothing for entries that don't have an embedding yet.
  async relatedEntries(entryId, limit = 5) {
    const { data, error } = await State.sb.rpc('related_entries', {
      target_id: entryId, limit_n: limit,
    });
    if (error) throw error;
    return data ?? [];
  },
};

/* ── Plan / subscription check-point ─────────────────────────────
   No paid features exist yet, so this always returns false today. The
   point of having it now is that a future paid feature checks this one
   function rather than every call site being rewritten later to learn
   about plans at all. */
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
  root.style.setProperty('--accent-dim', (t.accent ?? '#c9a84c') + '22');
  root.style.setProperty('--teal-dim', (t.teal ?? '#5a9e8f') + '25');
  root.style.setProperty('--coral-dim', (t.coral ?? '#c46a52') + '25');
  root.style.setProperty('--purple-dim', (t.purple ?? '#8b7ec8') + '25');
  ensureGoogleFont(State.settings.fontUi);
  ensureGoogleFont(State.settings.fontBody);
  root.style.setProperty('--font-ui', resolveFontStack(State.settings.fontUi));
  root.style.setProperty('--font-body', resolveFontStack(State.settings.fontBody));
  // Every font-size in style.css is in rem, so this one line scales the
  // whole app's text — see the comment on `html` in style.css.
  root.style.fontSize = `${State.settings.fontSize ?? 15}px`;
}

/**
 * Resolves a font key to an actual CSS font stack. Built-in keys (serif,
 * sans, mono, and the three Google-hosted options) come straight from
 * FONT_STACKS. Anything else is checked against the signed-in user's own
 * uploaded fonts — this is the one place a font choice actually becomes
 * usable CSS, so both the built-ins and custom uploads flow through here.
 */
function resolveFontStack(key) {
  if (FONT_STACKS[key]) return FONT_STACKS[key];
  const custom = (State.settings.customFonts ?? []).find((f) => f.family === key);
  if (custom) return `'${custom.family}', Georgia, serif`;
  return FONT_STACKS.serif;
}

/**
 * Keeps a single <style> tag containing an @font-face rule for every
 * installed custom font. Runs once at startup and again whenever a font
 * is added or removed. Signed URLs expire after an hour, same trade-off
 * already accepted for faceplate images — a page reload refreshes it.
 */
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
  const node = el('div', { class: `faceplate fp-${size}`, 'aria-hidden': 'true' });
  node.style.background = entry.faceplate_bg || '#28241c';

  if (entry.faceplate_type === 'image' && entry.faceplate_image) {
    const img = el('img', { alt: '' });
    Data.faceplateUrl(entry.faceplate_image).then((url) => { if (url) img.src = url; });
    node.append(img);
    return node;
  }

  node.style.color = entry.faceplate_color || '#c9a84c';
  node.style.fontFamily = FONT_STACKS[entry.faceplate_font] ?? 'var(--font-body)';
  node.textContent = entry.faceplate_text || (entry.title || '?').slice(0, 2).toUpperCase();
  return node;
}

/* ── Category stamp ────────────────────────────────────────────────
   A circular ink-stamp badge for an entry's category, used once — on the
   detail page only, replacing the old flat pill there. Deliberately not
   reused on every list card: the faceplate already owns that "circular
   badge" role in a dense list, and a second circle per row would compete
   with it rather than add anything.

   Every node here is built with createElementNS + textContent, never a
   template string. Category names are free text a user typed, and go
   inside an SVG <textPath> — string-built SVG would reopen exactly the
   injection path the top-of-file comment on this app already warns about
   for entry titles. This keeps the same guarantee for categories.

   The curved label follows a top-only semicircle (not a full circle) on
   purpose: an earlier version used a closed ring, and long category names
   wrapped past the top and rendered upside-down along the bottom half —
   confirmed with a throwaway test page before writing this, not assumed. */
function categoryStamp(category) {
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 60 60');
  svg.setAttribute('aria-hidden', 'true');

  // Stable per-category choice between the theme's two "ink" colors, so
  // the same category always lands on the same one across a visit. Blue
  // and red, not blue and sage — sage stays the tag color everywhere else,
  // but the stamp specifically is where red gets its small, real role
  // instead of being confined to the danger button (see THEME_PRESETS).
  let hash = 0;
  for (let i = 0; i < category.length; i++) hash = (hash * 31 + category.charCodeAt(i)) | 0;
  const varName = Math.abs(hash) % 2 === 0 ? '--accent' : '--coral';
  const ink = getComputedStyle(document.documentElement).getPropertyValue(varName).trim()
    || (varName === '--accent' ? '#6f9bd1' : '#c1503d');

  const ringId = `stampring-${Math.random().toString(36).slice(2, 9)}`;
  const defs = document.createElementNS(NS, 'defs');
  const path = document.createElementNS(NS, 'path');
  path.setAttribute('id', ringId);
  // Top semicircle only (sweep-flag 1) — see comment above.
  path.setAttribute('d', 'M6,30 A24,24 0 1,1 54,30');
  path.setAttribute('fill', 'none');
  defs.append(path);

  const ring2 = document.createElementNS(NS, 'circle');
  ring2.setAttribute('cx', '30'); ring2.setAttribute('cy', '30'); ring2.setAttribute('r', '18.5');
  ring2.setAttribute('fill', 'none'); ring2.setAttribute('stroke', ink);
  ring2.setAttribute('stroke-width', '0.8'); ring2.setAttribute('opacity', '0.5');

  // Truncated to a length verified (via getStartPositionOfChar on the real
  // path) to stay inside the top arc at this font-size/letter-spacing —
  // longer than this and characters run off the end of the path.
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
  textPath.textContent = label; // textContent — never markup — see comment above
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

/* ── Navigation ────────────────────────────────────────────────── */

/* Mobile drawer (see the 780px breakpoint in style.css) — #sidebar sits
 * fixed off-canvas there instead of being a permanent grid column, so it
 * needs an explicit open/closed state rather than just always being
 * visible. No-ops harmlessly above the breakpoint, where .open/the
 * backdrop are never shown regardless of this class/hidden state. */
function setSidebarOpen(open) {
  $('sidebar').classList.toggle('open', open);
  $('sidebar-backdrop').hidden = !open;
}

function go(view) {
  setSidebarOpen(false); // picking anywhere to go to should close the drawer
  State.view = view;
  const hash = view.name === 'detail' ? `#/entry/${view.id}`
    : view.name === 'edit' ? `#/edit/${view.id}`
    : view.name === 'new' ? '#/new'
    : view.name === 'import' ? '#/import'
    : view.name === 'settings' ? '#/settings'
    : view.name === 'graph' ? '#/graph'
    : view.name === 'category' ? `#/category/${encodeURIComponent(view.category)}`
    : view.name === 'tag' ? `#/tag/${encodeURIComponent(view.tag)}`
    : view.name === 'recent' ? '#/recent'
    : view.name === 'search' ? `#/search?q=${encodeURIComponent(view.query)}`
    : '#/';
  if (window.location.hash !== hash) {
    window.location.hash = hash;   // triggers hashchange → render
  } else {
    render();
  }
}

function readHash() {
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

function viewList(title, subtitle, entries, emptyText) {
  const panel = el('div', { class: 'panel' }, [
    el('div', { class: 'page-head' }, [
      el('h1', { class: 'page-title', text: title }),
      subtitle ? el('span', { class: 'page-sub', text: subtitle }) : null,
    ]),
  ]);

  if (!entries.length) {
    panel.append(el('div', { class: 'empty' }, [
      el('div', { class: 'empty-title', text: 'Nothing here yet' }),
      el('p', { text: emptyText ?? 'Create your first entry with the button above.' }),
    ]));
  } else {
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
    // The category's own badge, moved out of the small meta text row and
    // given the one circular "stamp" moment on the page — see categoryStamp().
    entry.category ? categoryStamp(entry.category) : null,
  ]));

  panel.append(el('div', { class: 'actions' }, [
    el('button', {
      class: 'btn btn-primary', type: 'button',
      onClick: () => go({ name: 'edit', id }),
    }, 'Edit'),
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
  ]));

  const section = (label, content) =>
    el('div', { class: 'section' }, [el('div', { class: 'section-label', text: label }), content]);

  // The illuminated-capital treatment (see .body-text-lead in style.css)
  // goes on whichever block reads first — Summary if there is one, else
  // Notes — never both, so the page gets one drop cap, not a stack of them.
  if (entry.summary) panel.append(section('Summary', el('div', { class: 'body-text body-text-lead', text: entry.summary })));
  if (entry.body) panel.append(section('Notes', el('div', { class: 'body-text' + (entry.summary ? '' : ' body-text-lead'), text: entry.body })));

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

  if (links.length) {
    const wrap = el('div');
    for (const l of links) {
      const otherId = l.from_entry_id === id ? l.to_entry_id : l.from_entry_id;
      const other = State.entries.find((e) => e.id === otherId);
      if (!other) continue;
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

  // Silently skipped, not surfaced as an error, if supabase-schema-05
  // hasn't been run yet or this entry has no embedding yet (brand new,
  // or the embed-entry function isn't configured/deployed yet).
  try {
    const related = await Data.relatedEntries(id);
    if (related.length) {
      const wrap = el('div');
      for (const r of related) {
        wrap.append(el('button', {
          class: 'linked-entry', type: 'button',
          onClick: () => go({ name: 'detail', id: r.id }),
        }, [
          faceplate({
            faceplate_type: r.faceplate_type, faceplate_text: r.faceplate_text,
            faceplate_bg: r.faceplate_bg, faceplate_color: r.faceplate_color,
            faceplate_font: r.faceplate_font, faceplate_image: r.faceplate_image,
            title: r.title,
          }),
          el('div', { class: 'linked-entry-info' }, [
            el('div', { class: 'linked-entry-title', text: r.title }),
            el('div', {
              class: 'linked-entry-rel',
              text: `${Math.round(r.similarity * 100)}% related`,
            }),
          ]),
          r.category ? el('span', { class: 'pill', text: r.category }) : null,
        ]));
      }
      panel.append(section('Related entries', wrap));
    }
  } catch { /* feature not set up yet — say nothing */ }

  return panel;
}

/* ── Editor ────────────────────────────────────────────────────── */

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
    }
    State.form = {
      forId: editId ?? 'new',
      title: existing?.title ?? '',
      category: existing?.category ?? '',
      subcategory: existing?.subcategory ?? '',
      summary: existing?.summary ?? '',
      body: existing?.body ?? '',
      source: existing?.source ?? '',
      fp: {
        type: existing?.faceplate_type ?? 'text',
        text: existing?.faceplate_text ?? '',
        bg: existing?.faceplate_bg ?? '#28241c',
        color: existing?.faceplate_color ?? '#c9a84c',
        font: existing?.faceplate_font ?? 'default',
        image: existing?.faceplate_image ?? null,
      },
      fields, tags, links,
    };
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

  // Kept as a direct reference rather than looked up later — the panel
  // isn't attached to the live document until viewForm() returns, so a
  // document.getElementById() call from later in this same function
  // would search a document that doesn't contain it yet and silently
  // find nothing.
  const categoryField = textField('Category *', 'category', { placeholder: 'e.g. Biology, History', list: 'cat-options' });
  panel.append(el('div', { class: 'form-grid' }, [
    categoryField,
    textField('Subcategory', 'subcategory', { placeholder: 'Optional' }),
  ]));

  panel.append(faceplateBuilder(F));
  panel.append(textField('Summary', 'summary', {
    multiline: true, style: { minHeight: '76px' }, placeholder: 'A sentence or two, shown in lists.',
  }));
  panel.append(textField('Notes', 'body', {
    multiline: true, style: { minHeight: '220px' }, placeholder: 'Everything you want to keep about this topic.',
  }));

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

  // Assigned below, after the suggestions section exists — declared here so
  // the tag handlers (defined first, since Tags appears above Links in the
  // form) can safely reference it. By the time a person actually adds or
  // removes a tag, the whole form has finished rendering and this is set.
  let suggestions;

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

  /* Links — suggestions first (free, explainable matches on tags/category,
     backed by a semantic fallback once an entry has been saved at least
     once), then the manual search-and-add picker for anything they miss. */
  const linkPickerResult = linkPicker(F, editId);
  suggestions = suggestedLinksSection(F, editId, linkPickerResult.renderChips);
  panel.append(suggestions.el, linkPickerResult.el);

  // Category has no dedicated change hook like tags does — this input is
  // built generically by textField(), so hook its blur here instead of
  // threading a callback through that shared helper for one field.
  categoryField.querySelector('input')?.addEventListener('blur', () => suggestions.refresh());

  panel.append(textField('Source', 'source', { placeholder: 'URL, book, paper or reference' }));

  const saveBtn = el('button', { class: 'btn btn-primary', type: 'button' }, existing ? 'Save changes' : 'Create entry');
  saveBtn.addEventListener('click', async () => {
    if (!F.title.trim()) { toast('A title is required', true); return; }
    if (!F.category.trim()) { toast('A category is required', true); return; }
    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving…';
    try {
      const id = await Data.save(
        { ...F, title: F.title.trim(), category: F.category.trim() },
        F.fields, F.tags, F.links, editId
      );
      State.form = null;
      await Data.loadAll();
      toast(existing ? 'Changes saved' : 'Entry created');
      go({ name: 'detail', id });
      // Best-effort — the entry is already saved and the user has already
      // moved on by the time this resolves or fails either way.
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

/* ── Import ────────────────────────────────────────────────────────
   Paste-a-whole-entry-at-once, as an alternative to viewForm()'s
   field-by-field editor — for bringing in content written somewhere
   else, or several entries in one go. Reuses Data.save() exactly as
   viewForm() does, rather than a separate insert path, so imported
   entries are never a second-class kind of row in the database.

   The actual text -> draft parsing (parseImportBlock/parseImportText)
   lives in lib/import-parser.mjs, not here — pulled out into its own
   module so it can be unit-tested without booting the whole app. See
   tests/import-parser.test.mjs and the README's "Before pushing" section. */

/**
 * Handed to the user via "Copy AI prompt" on the import screen. Written so
 * they can paste it into any AI chat, tack on what they actually want at
 * the bottom, and get back text that pastes into the import box above with
 * zero cleanup — matching parseImportBlock/parseImportText exactly (header
 * lines contiguous from the top of the block, one blank line, then body;
 * entries separated by a lone "---" line).
 */
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

("Field:" can repeat, one line per custom field.)

Right after the last header line, leave exactly one blank line, then write the entry's full body as plain prose paragraphs — no markdown, no headings, no bullet points, just text.

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
    el('span', { class: 'page-sub', text: 'Paste one entry, or several separated by a line of ---' }),
    aiPromptBtn,
  ]));

  panel.append(el('div', { class: 'hint', style: { marginBottom: '14px', lineHeight: '1.7' } }, [
    'Recognized lines (all optional): ',
    el('code', { text: 'Title:' }), ' ', el('code', { text: 'Category:' }), ' ',
    el('code', { text: 'Subcategory:' }), ' ', el('code', { text: 'Tags:' }), ' (comma-separated) ',
    el('code', { text: 'Summary:' }), ' ', el('code', { text: 'Source:' }), ' ',
    el('code', { text: 'Field: Name = Value' }), ' (repeat for more). ',
    'Everything else is the body. No header at all? The first line becomes the title.',
  ]));

  const textarea = el('textarea', {
    class: 'textarea', style: { minHeight: '220px' },
    placeholder: 'Title: Byzantine Iconoclasm\nCategory: History\nTags: byzantine-empire, theology\n\n'
      + 'Two periods of imperial bans on religious icons...\n\n---\n\n'
      + 'Title: Mycorrhizal Networks\nCategory: Biology\n...',
  });
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
    if (!textarea.value.trim()) { toast('Paste something first', true); return; }
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
  for (const d of included) {
    btn.textContent = `Importing ${done + failed + 1} of ${included.length}…`;
    try {
      // Same default faceplate viewForm() gives a brand-new entry — kept
      // identical rather than diverging, so an imported entry doesn't look
      // like a second-class citizen next to one made by hand.
      const id = await Data.save(
        {
          title: d.title.trim(), category: d.category.trim(), subcategory: d.subcategory,
          summary: d.summary, body: d.body, source: d.source,
          fp: { type: 'text', text: '', bg: '#28241c', color: '#c9a84c', font: 'default', image: null },
        },
        d.fields, d.tags, [], null
      );
      Data.requestEmbedding(id).catch(() => {}); // best-effort, same as a normal save
      done++;
    } catch {
      failed++;
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
      const fileInput = el('input', { type: 'file', accept: 'image/*', style: { display: 'none' } });
      fileInput.addEventListener('change', async () => {
        const file = fileInput.files?.[0];
        if (!file) return;
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
      });
      const pick = el('button', {
        class: 'btn btn-sm', type: 'button', onClick: () => fileInput.click(),
      }, F.fp.image ? 'Replace image' : 'Choose image');
      const row = el('div', { class: 'fp-row' }, [
        el('span', { class: 'fp-label', text: 'Image' }), pick, fileInput,
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

/**
 * Suggested links — deliberately NOT AI-first. Shared tags and matching
 * category are free, instant, and explainable, so they're the primary
 * signal and run entirely client-side against State.entries, no request
 * at all. Semantic similarity (the embedding pipeline) only ever supplies
 * a secondary layer, for entries that share no tag or category but are
 * still plausibly related — and only once this entry has been saved at
 * least once, since a brand-new entry has no stored embedding yet to
 * compare against.
 */
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
    const out = [];
    for (const e of State.entries) {
      if (e.id === editId || linkedIds.has(e.id)) continue;
      const shared = (e.tags ?? []).filter((t) => myTags.has(t.toLowerCase()));
      const sameCategory = myCategory && e.category && e.category.trim().toLowerCase() === myCategory;
      const score = shared.length * 10 + (sameCategory ? 1 : 0);
      if (score <= 0) continue;
      const reason = shared.length
        ? `Shares tag${shared.length > 1 ? 's' : ''}: ${shared.slice(0, 2).join(', ')}`
        : `Same category: ${e.category}`;
      out.push({ id: e.id, title: e.title, category: e.category, reason, score });
    }
    return out.sort((a, b) => b.score - a.score).slice(0, 5);
  }

  async function semanticCandidates(excludeIds) {
    if (!editId) return []; // nothing saved yet — no embedding exists to compare
    try {
      const related = await Data.relatedEntries(editId, 6);
      return related
        .filter((r) => !excludeIds.has(r.id) && !F.links.some((l) => l.id === r.id))
        .slice(0, 3)
        .map((r) => ({
          id: r.id, title: r.title, category: r.category,
          reason: `${Math.round(r.similarity * 100)}% related`,
        }));
    } catch { return []; } // schema-05 not run yet, or no embedding yet — say nothing
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

function linkPicker(F, editId) {
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
          onClick: () => { F.links.splice(i, 1); renderChips(); },
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
    el('span', { class: 'page-sub', text: 'Synced with your account' }),
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

  const fontRow = (labelText, key) => {
    const select = el('select', { class: 'select' });
    for (const [value, label] of [
      ['alegreya', 'Alegreya (Card Catalog default)'],
      ['worksans', 'Work Sans (Card Catalog default)'],
      ['serif', 'Serif (Georgia)'],
      ['sans', 'Sans-serif'],
      ['mono', 'Monospace'],
      ['whimsical', 'Whimsical (Fredoka)'],
      ['lab', 'Lab notebook (IBM Plex Mono)'],
      ['commanding', 'Commanding (Space Grotesk)'],
    ]) {
      const opt = el('option', { value, text: label });
      if (State.settings[key] === value) opt.selected = true;
      select.append(opt);
    }
    for (const f of State.settings.customFonts ?? []) {
      const opt = el('option', { value: f.family, text: `${f.name} (uploaded)` });
      if (State.settings[key] === f.family) opt.selected = true;
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
      applyTheme(); // live preview — no reload needed to see the new size
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

  return panel;
}

/**
 * Real custom font upload — .otf/.ttf/.woff/.woff2 to Supabase Storage,
 * distinct from the six preset fonts above. This is what the original
 * beta had that the rewrite was missing: those presets are convenient
 * defaults, this is "bring your own font file."
 */
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
  const wrap = el('div');
  const canvas = el('canvas', { id: 'graph-canvas' });
  wrap.append(canvas);

  requestAnimationFrame(() => {
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const W = canvas.clientWidth, H = canvas.clientHeight;
    canvas.width = W * dpr; canvas.height = H * dpr;
    ctx.scale(dpr, dpr);

    const style = getComputedStyle(document.documentElement);
    const col = (n, fallback) => (style.getPropertyValue(n).trim() || fallback);

    const entries = State.entries;
    if (!entries.length) {
      ctx.fillStyle = col('--text3', '#5a5244');
      ctx.font = '16px Georgia'; ctx.textAlign = 'center';
      ctx.fillText('No entries yet', W / 2, H / 2);
      return;
    }

    // Only the most-linked entries are drawn. Beyond about a hundred
    // nodes a force layout stops being readable, so the rest are omitted
    // rather than rendered into an unreadable mat.
    const CAP = 100;
    const shown = [...entries].sort((a, b) => b.linkCount - a.linkCount).slice(0, CAP);
    const ids = new Set(shown.map((e) => e.id));
    const omitted = entries.length - shown.length;

    const nodes = shown.map((e, i) => {
      const a = (i / shown.length) * Math.PI * 2;
      return { e, x: W / 2 + Math.cos(a) * Math.min(W, H) * 0.33,
                  y: H / 2 + Math.sin(a) * Math.min(W, H) * 0.33, vx: 0, vy: 0 };
    });
    const byId = new Map(nodes.map((n) => [n.e.id, n]));
    const edges = (State.links ?? []).filter((l) => ids.has(l.from_entry_id) && ids.has(l.to_entry_id));

    let dragging = null, frame = 0, raf = 0;

    const step = () => {
      for (const a of nodes) {
        for (const b of nodes) {
          if (a === b) continue;
          const dx = a.x - b.x, dy = a.y - b.y;
          const d2 = Math.max(dx * dx + dy * dy, 25);
          const f = 2600 / d2, d = Math.sqrt(d2);
          a.vx += (dx / d) * f; a.vy += (dy / d) * f;
        }
        a.vx += (W / 2 - a.x) * 0.004; a.vy += (H / 2 - a.y) * 0.004;
      }
      for (const l of edges) {
        const a = byId.get(l.from_entry_id), b = byId.get(l.to_entry_id);
        if (!a || !b) continue;
        const dx = b.x - a.x, dy = b.y - a.y;
        const d = Math.max(Math.hypot(dx, dy), 1), f = (d - 130) * 0.05;
        a.vx += (dx / d) * f; a.vy += (dy / d) * f;
        b.vx -= (dx / d) * f; b.vy -= (dy / d) * f;
      }
      for (const n of nodes) {
        if (n === dragging) continue;
        n.vx *= 0.78; n.vy *= 0.78;
        n.x = Math.max(40, Math.min(W - 40, n.x + n.vx));
        n.y = Math.max(30, Math.min(H - 30, n.y + n.vy));
      }
    };

    const draw = () => {
      ctx.fillStyle = col('--bg0', '#0e0d0b');
      ctx.fillRect(0, 0, W, H);

      ctx.strokeStyle = col('--border', '#3a342a');
      ctx.lineWidth = 1;
      for (const l of edges) {
        const a = byId.get(l.from_entry_id), b = byId.get(l.to_entry_id);
        if (!a || !b) continue;
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      }

      for (const n of nodes) {
        const r = 9 + Math.min(n.e.linkCount * 2, 13);
        ctx.beginPath(); ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
        ctx.fillStyle = n.e.faceplate_bg || '#28241c'; ctx.fill();
        ctx.strokeStyle = (n.e.faceplate_color || col('--accent', '#c9a84c')); ctx.lineWidth = 1.5; ctx.stroke();

        ctx.fillStyle = n.e.faceplate_color || col('--accent', '#c9a84c');
        ctx.font = `bold ${Math.max(9, r * 0.7)}px Georgia`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText((n.e.faceplate_text || n.e.title.slice(0, 2)).toUpperCase().slice(0, 3), n.x, n.y);

        ctx.fillStyle = col('--text1', '#c8bfa8');
        ctx.font = '11px Georgia'; ctx.textBaseline = 'alphabetic';
        const label = n.e.title.length > 22 ? n.e.title.slice(0, 20) + '…' : n.e.title;
        ctx.fillText(label, n.x, n.y + r + 13);
      }

      if (omitted > 0) {
        ctx.fillStyle = col('--text3', '#5a5244');
        ctx.font = '12px Georgia'; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
        ctx.fillText(`Showing the ${shown.length} most-linked entries · ${omitted} not drawn`, 14, 12);
      }
    };

    const loop = () => { if (frame++ < 260) step(); draw(); raf = requestAnimationFrame(loop); };
    loop();

    const at = (ev) => {
      const r = canvas.getBoundingClientRect();
      return { x: ev.clientX - r.left, y: ev.clientY - r.top };
    };
    let downPos = null;
    canvas.addEventListener('pointerdown', (ev) => {
      const p = at(ev); downPos = p;
      dragging = nodes.find((n) => Math.hypot(p.x - n.x, p.y - n.y) < 26) ?? null;
      if (dragging) canvas.setPointerCapture(ev.pointerId);
    });
    canvas.addEventListener('pointermove', (ev) => {
      if (!dragging) return;
      const p = at(ev); dragging.x = p.x; dragging.y = p.y; frame = 0;
    });
    canvas.addEventListener('pointerup', (ev) => {
      const p = at(ev);
      if (dragging && downPos && Math.hypot(p.x - downPos.x, p.y - downPos.y) < 4) {
        const id = dragging.e.id;
        cancelAnimationFrame(raf);
        go({ name: 'detail', id });
        return;
      }
      dragging = null; downPos = null;
    });

    // Stop the loop when this view is replaced.
    const observer = new MutationObserver(() => {
      if (!document.body.contains(canvas)) { cancelAnimationFrame(raf); observer.disconnect(); }
    });
    observer.observe($('view'), { childList: true });
  });

  return wrap;
}

/* ── Export ────────────────────────────────────────────────────── */

async function exportEverything() {
  toast('Preparing export…');
  try {
    const [{ data: entries }, { data: fields }, { data: tags }, { data: links }] = await Promise.all([
      State.sb.from('entries').select('*').order('created_at'),
      State.sb.from('entry_fields').select('*'),
      State.sb.from('tags').select('*'),
      State.sb.from('links').select('*'),
    ]);

    const bundle = {
      format: 'synopsical-export',
      version: 1,
      exportedAt: new Date().toISOString(),
      counts: {
        entries: entries?.length ?? 0, fields: fields?.length ?? 0,
        tags: tags?.length ?? 0, links: links?.length ?? 0,
      },
      entries: entries ?? [], entry_fields: fields ?? [],
      tags: tags ?? [], links: links ?? [],
    };

    const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = el('a', { href: url, download: `synopsical-${new Date().toISOString().slice(0, 10)}.json` });
    document.body.append(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
    toast(`Exported ${bundle.counts.entries} entries`);
  } catch (err) {
    toast(err.message || 'Export failed', true);
  }
}

/* ── Render ────────────────────────────────────────────────────── */

async function render() {
  renderSidebar();
  const host = $('view');
  const v = State.view;
  let node;

  switch (v.name) {
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

/* ── Authentication ────────────────────────────────────────────── */

/**
 * True when this page load is a bounce-back from clicking a "confirm your
 * email" link. Supabase marks that redirect with `type=signup`, placed in
 * the URL hash for the default sign-in flow or in the query string for a
 * PKCE-configured project — so both are checked. This is the documented
 * shape of the redirect; if it ever doesn't fire for your project, the
 * quickest fix is to open the browser console right after clicking the
 * link, run `location.href`, and see what the URL actually looked like.
 */
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

/**
 * Shown when supabase-js fires the PASSWORD_RECOVERY auth event — the
 * signal that this page load is a bounce-back from a "reset your
 * password" email link, already exchanged for a short-lived session by
 * the time this fires. Unlike isEmailConfirmationRedirect() above, this
 * doesn't need to parse the URL itself: PASSWORD_RECOVERY is the
 * documented Supabase event for exactly this, and covers both the hash-
 * based and PKCE-code-based link formats without caring which one a given
 * project is configured for.
 */
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

/**
 * Maps a pre-auth screen to the hash that should be in the address bar for
 * it, and back. Same shape as go()/readHash() below for the signed-in app
 * — kept as a separate pair rather than folded into those, since the two
 * routers are only ever active at different times (before vs. after a
 * session exists) and readHash()'s switch has no pre-auth cases at all.
 */
function authHashFor(mode) {
  return mode === 'signin' ? '#/sign-in'
    : mode === 'signup' ? '#/sign-up'
    : mode === 'forgot' ? '#/forgot-password'
    : '#/'; // homepage
}
function readAuthHash() {
  const raw = window.location.hash.replace(/^#\/?/, '');
  if (raw === 'sign-in') return 'signin';
  if (raw === 'sign-up') return 'signup';
  if (raw === 'forgot-password') return 'forgot';
  return null; // homepage
}

/**
 * Public entry point for switching pre-auth screens — pushes the matching
 * hash (so the address bar actually changes, and back/forward actually
 * works) the same way go() does for the signed-in app, then either lets
 * the resulting hashchange do the painting or paints immediately if the
 * hash was already right. Never call paintAuth() directly from a click
 * handler; call this.
 */
function showAuth(mode = 'signin') {
  const hash = authHashFor(mode);
  if (window.location.hash !== hash) window.location.hash = hash;
  else paintAuth(mode);
}

function paintAuth(mode = 'signin') {
  $('auth-screen').hidden = false;
  $('homepage').hidden = true;
  $('app').hidden = true;
  $('setup-screen').hidden = true;
  $('verified-screen').hidden = true;
  $('reset-screen').hidden = true;
  $('auth-sub').textContent = mode === 'signin' ? 'Sign in to reach your entries.'
    : mode === 'signup' ? 'Create an account to get started.'
    : 'Enter your email and we’ll send you a reset link.'; // forgot
  $('auth-submit').textContent = mode === 'signin' ? 'Sign in'
    : mode === 'signup' ? 'Create account' : 'Send reset link';
  $('auth-toggle').textContent = mode === 'signin' ? 'Need an account? Create one'
    : mode === 'signup' ? 'Already have an account? Sign in' : 'Back to sign in';
  $('auth-password').autocomplete = mode === 'signin' ? 'current-password' : 'new-password';
  $('auth-form').dataset.mode = mode;

  // The confirm-password field only makes sense when creating an account.
  const isSignup = mode === 'signup';
  $('auth-confirm-label').hidden = !isSignup;
  $('auth-confirm-wrap').hidden = !isSignup;
  if (!isSignup) $('auth-password-confirm').value = '';

  // Forgot-password mode needs only the email field — no password to sign
  // in with yet. Clearing `required` here matters: a hidden-but-required
  // field silently blocks form submission (the browser's native validation
  // popup can't even be seen), not just a cosmetic hide.
  const isForgot = mode === 'forgot';
  const passwordWrap = $('auth-password').closest('.password-wrap');
  passwordWrap.hidden = isForgot;
  passwordWrap.previousElementSibling.hidden = isForgot; // its <label>
  $('auth-password').required = !isForgot;
  if (isForgot) $('auth-password').value = '';
  $('auth-forgot').hidden = mode !== 'signin';

  // Re-mask both fields on every mode switch, so a password shown before
  // switching forms doesn't stay visible without the person noticing.
  setPasswordVisible('auth-password', false);
  setPasswordVisible('auth-password-confirm', false);
}

/** Same push-then-paint pattern as showAuth() above, for going back to the
 *  public homepage — e.g. pressing browser back from #/sign-in. */
function showHomepage() {
  const hash = '#/';
  if (window.location.hash !== hash && window.location.hash !== '') window.location.hash = hash;
  else paintHomepage();
}
function paintHomepage() {
  $('homepage').hidden = false;
  $('auth-screen').hidden = true;
  $('verified-screen').hidden = true;
  $('reset-screen').hidden = true;
  $('app').hidden = true;
}

/** Shared by both password fields — flips one input between masked and plain text. */
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
      // Same message either way an address exists or not — Supabase's
      // resetPasswordForEmail doesn't reveal that, on purpose (it's how
      // this form avoids becoming a way to check who has an account), and
      // this follows suit rather than branching on data/error here.
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
    // The recovery link already left them signed in (that's what the
    // PASSWORD_RECOVERY session is) — updateUser() just turned that
    // temporary session into a normal one, so there's nothing left to sign
    // in again for. Straight into the app, same as any other sign-in.
    toast('Password updated');
    await start(data.user);
  });

  $('btn-signout').addEventListener('click', async () => {
    await State.sb.auth.signOut();
    State.user = null;
    State.entries = [];
    showAuth('signin');
  });
}

/* ── Boot ──────────────────────────────────────────────────────── */

async function start(user) {
  State.user = user;
  $('homepage').hidden = true;
  $('auth-screen').hidden = true;
  $('setup-screen').hidden = true;
  $('verified-screen').hidden = true;
  $('app').hidden = false;

  // A stale #/sign-in (etc.) from before this session existed — e.g. a
  // bookmark made while logged out, opened again after signing in
  // elsewhere — means nothing to the signed-in app's own router and would
  // just sit there unexplained. readHash() would silently fall through to
  // its 'list' default either way; this just makes the address bar match
  // what's actually on screen.
  if (readAuthHash()) history.replaceState(null, '', window.location.pathname);

  try {
    await Data.loadSettings();
    applyTheme();
    await applyCustomFontFaces();
    await Data.loadAll();
  } catch (err) {
    toast(err.message || 'Could not load your entries', true);
  }

  // Kept separate from the block above on purpose: until
  // supabase-schema-02-profiles.sql has been run, this table doesn't
  // exist yet, and that should never produce a scary, unrelated-looking
  // error about your entries.
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
  $('btn-new').addEventListener('click', () => { State.form = null; go({ name: 'new' }); });
  $('btn-import').addEventListener('click', () => go({ name: 'import' }));
  $('btn-settings').addEventListener('click', () => go({ name: 'settings' }));
  $('btn-export').addEventListener('click', exportEverything);

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

  // Guarded on State.user because the pre-auth screens have their own
  // hashchange listener (see wireHomepage()) — without the guard, a
  // logged-out visitor's #/sign-in etc. would also run render() into the
  // (hidden) #app, harmlessly wasted work at best.
  window.addEventListener('hashchange', async () => {
    if (!State.user) return;
    State.view = readHash();
    await render();
  });
}

/**
 * The public homepage's own four exits — all of them just hand off to the
 * existing auth machinery via showAuth(), which now owns updating the
 * hash itself. Also owns the pre-auth side of hash routing: back/forward
 * between the homepage and the sign-in/sign-up/forgot-password screens
 * (previously neither the address bar nor the browser's back button did
 * anything for these screens, since nothing ever touched the hash).
 */
function wireHomepage() {
  $('home-signin').addEventListener('click', () => showAuth('signin'));
  $('home-cta-signin').addEventListener('click', () => showAuth('signin'));
  $('home-cta-start').addEventListener('click', () => showAuth('signup'));
  $('home-cta-start-2').addEventListener('click', () => showAuth('signup'));

  // Guarded the opposite way from wireChrome()'s listener above — once
  // State.user is set, the signed-in app owns hash routing entirely, and
  // this must not fight it (e.g. by repainting the homepage over #app).
  window.addEventListener('hashchange', () => {
    if (State.user) return;
    const mode = readAuthHash();
    if (mode) paintAuth(mode);
    else paintHomepage();
  });
}

async function boot() {
  const cfg = window.SYNOPSICAL_CONFIG ?? {};
  if (!cfg.SUPABASE_URL || !cfg.SUPABASE_ANON_KEY) {
    $('homepage').hidden = true;
    $('setup-screen').hidden = false;
    return;
  }

  State.sb = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);

  // Registered before anything else touches auth, so it's already in place
  // before supabase-js finishes processing a "reset your password" link's
  // token from the URL and fires this. See showResetScreen() for why this
  // event, rather than parsing the URL the way isEmailConfirmationRedirect()
  // below does — a recovery link leaves a real, valid session (that's the
  // whole mechanism), so without this the plain `data.session?.user` check
  // near the bottom would just drop them into the app with their old
  // password still live, instead of onto the "choose a new password" form.
  let isRecovery = false;
  State.sb.auth.onAuthStateChange((event) => {
    if (event === 'PASSWORD_RECOVERY') isRecovery = true;
  });

  wireAuth();
  wireChrome();
  wireHomepage();

  const confirming = isEmailConfirmationRedirect();
  const { data } = await State.sb.auth.getSession();

  // Both link types leave a token sitting in the address bar that
  // supabase-js has already read by the time we get here, so it serves no
  // further purpose — and leaving it visible is a needless way to leak a
  // session if that URL is ever copied, screenshotted, or shared.
  if (confirming || isRecovery) {
    history.replaceState(null, '', window.location.pathname);
  }

  if (confirming) {
    showVerified(!!data.session?.user);
    return;
  }
  if (isRecovery) {
    showResetScreen();
    return;
  }

  if (data.session?.user) {
    await start(data.session.user);
    return;
  }

  // No forced showAuth('signin') here on purpose — #homepage is already
  // the visible-by-default state in the raw HTML (see its comment in
  // index.html). The one thing still needed: honoring a bookmarked or
  // refreshed #/sign-in (etc.) URL, so it opens straight to that screen
  // instead of flashing the homepage first and jumping a moment later.
  const mode = readAuthHash();
  if (mode) paintAuth(mode);
}

boot();
