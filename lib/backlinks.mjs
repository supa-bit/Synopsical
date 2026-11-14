// Pure, zero-dependency logic for backlinks, unlinked mentions, and the
// editor's `[[` autocomplete.
//
// Like the other lib/*.mjs files this never touches the DOM. It works on
// plain entry objects ({ id, title, summary, body, ... }) and returns plain
// data, which app.js turns into DOM nodes via el() + textContent.

const WIKI_RE = /\[\[([^\][\n|]+?)(?:\|([^\][\n]+?))?\]\]/g;

// Titles shorter than this are too likely to match ordinary words ("Ra",
// "Io") to be useful as unlinked-mention suggestions.
const MIN_MENTION_TITLE_LENGTH = 3;

const TEXT_FIELDS = ['summary', 'body'];

const norm = (s) => String(s ?? '').trim().toLowerCase();

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** [start, end) index ranges of every [[...]] span in the text. */
function wikiSpans(text) {
  const spans = [];
  for (const m of text.matchAll(WIKI_RE)) {
    spans.push([m.index, m.index + m[0].length]);
  }
  return spans;
}

/**
 * A short, single-line excerpt around [index, index + length), split into
 * parts so the UI can emphasise the match without building HTML.
 */
export function makeSnippet(text, index, length, radius = 60) {
  const str = String(text ?? '');
  const startRaw = Math.max(0, index - radius);
  const endRaw = Math.min(str.length, index + length + radius);
  const flat = (s) => s.replace(/\s+/g, ' ');
  let before = flat(str.slice(startRaw, index));
  let after = flat(str.slice(index + length, endRaw));
  // Trim to whole words where we cut mid-text.
  if (startRaw > 0) before = '…' + before.replace(/^\S*\s/, '');
  if (endRaw < str.length) after = after.replace(/\s\S*$/, '') + '…';
  return { before, match: flat(str.slice(index, index + length)), after };
}

/**
 * Plain-text (not already wiki-linked) occurrences of `title` in `text`,
 * matched case-insensitively on whole words.
 * Returns [{ index, length }].
 */
export function findPlainMentions(text, title) {
  const str = String(text ?? '');
  const t = String(title ?? '').trim();
  if (!str || t.length < MIN_MENTION_TITLE_LENGTH) return [];
  const re = new RegExp(
    `(?<![\\p{L}\\p{N}_])${escapeRegExp(t)}(?![\\p{L}\\p{N}_])`,
    'giu'
  );
  const spans = wikiSpans(str);
  const out = [];
  for (const m of str.matchAll(re)) {
    const s = m.index;
    const e = s + m[0].length;
    if (spans.some(([a, b]) => s < b && e > a)) continue;
    out.push({ index: s, length: m[0].length });
  }
  return out;
}

/**
 * Entries that reference `target` through an explicit [[Target]] or
 * [[Target|Label]] in their summary or notes.
 * Returns [{ entry, snippet }], one per referencing entry.
 */
export function findWikiReferences(entries, target) {
  const key = norm(target?.title);
  if (!key) return [];
  const out = [];
  for (const entry of entries ?? []) {
    if (entry.id === target.id) continue;
    let hit = null;
    for (const field of TEXT_FIELDS) {
      const text = String(entry[field] ?? '');
      for (const m of text.matchAll(WIKI_RE)) {
        if (norm(m[1]) === key) {
          hit = { entry, field, snippet: makeSnippet(text, m.index, m[0].length) };
          break;
        }
      }
      if (hit) break;
    }
    if (hit) out.push(hit);
  }
  return out;
}

/**
 * Entries that mention `target`'s title in plain text without linking to it.
 * `excludeIds` lets the caller skip entries that are already linked.
 * Returns [{ entry, field, count, snippet }], one per mentioning entry.
 */
export function findUnlinkedMentions(entries, target, excludeIds = new Set()) {
  const title = String(target?.title ?? '').trim();
  if (title.length < MIN_MENTION_TITLE_LENGTH) return [];
  const out = [];
  for (const entry of entries ?? []) {
    if (entry.id === target.id || excludeIds.has(entry.id)) continue;
    let first = null;
    let count = 0;
    for (const field of TEXT_FIELDS) {
      const text = String(entry[field] ?? '');
      const hits = findPlainMentions(text, title);
      if (hits.length && !first) {
        first = { field, snippet: makeSnippet(text, hits[0].index, hits[0].length) };
      }
      count += hits.length;
    }
    if (first) out.push({ entry, field: first.field, count, snippet: first.snippet });
  }
  return out.sort((a, b) => b.count - a.count || a.entry.title.localeCompare(b.entry.title));
}

/**
 * Wraps the first plain-text mention of `title` in [[ ]], keeping the
 * original wording and casing (links resolve case-insensitively).
 * Returns the text unchanged when there is nothing to link.
 */
export function linkFirstMention(text, title) {
  const str = String(text ?? '');
  const [hit] = findPlainMentions(str, title);
  if (!hit) return str;
  const original = str.slice(hit.index, hit.index + hit.length);
  return str.slice(0, hit.index) + `[[${original}]]` + str.slice(hit.index + hit.length);
}

/* ── [[ autocomplete ───────────────────────────────────────────────── */

/**
 * If the caret sits inside an unfinished `[[...` on the current line,
 * returns { start, query } where `start` is the index just after `[[`.
 * Returns null otherwise.
 */
export function wikiQueryAt(text, caret) {
  const str = String(text ?? '');
  const pos = Math.max(0, Math.min(caret ?? str.length, str.length));
  const open = str.lastIndexOf('[[', pos - 2);
  if (open === -1 || open + 2 > pos) return null;
  const query = str.slice(open + 2, pos);
  if (/[\]\n|[]/.test(query) || query.length > 80) return null;
  return { start: open + 2, query };
}

/**
 * Ranks entries by how well their title matches `query`:
 * exact, then prefix, then word-prefix, then substring. Ties break on
 * shorter titles, then alphabetically.
 */
export function rankTitleMatches(entries, query, { excludeId = null, limit = 8 } = {}) {
  const q = norm(query);
  const scored = [];
  for (const e of entries ?? []) {
    if (!e?.title || e.id === excludeId) continue;
    const t = norm(e.title);
    let score;
    if (!q) score = 4;
    else if (t === q) score = 0;
    else if (t.startsWith(q)) score = 1;
    else if (t.split(/[\s\-–—_/]+/).some((w) => w.startsWith(q))) score = 2;
    else if (t.includes(q)) score = 3;
    else continue;
    scored.push({ e, score, t });
  }
  scored.sort((a, b) =>
    a.score - b.score || a.t.length - b.t.length || a.t.localeCompare(b.t));
  return scored.slice(0, limit).map((s) => s.e);
}

/**
 * Replaces the in-progress query between `start` and `caret` with `title`
 * and closes the link. Reuses a `]]` that already follows the caret.
 * Returns { text, caret } with the caret placed after the closing `]]`.
 */
export function applyWikiCompletion(text, start, caret, title) {
  const str = String(text ?? '');
  let rest = str.slice(caret);
  // If the user had typed a partial label before an existing "]]", drop it.
  const closeIdx = rest.search(/\]\]/);
  const lineEnd = rest.search(/\n/);
  if (closeIdx !== -1 && (lineEnd === -1 || closeIdx < lineEnd) && !/[[|]/.test(rest.slice(0, closeIdx))) {
    rest = rest.slice(closeIdx + 2);
  }
  const insert = `${title}]]`;
  return { text: str.slice(0, start) + insert + rest, caret: start + insert.length };
}
