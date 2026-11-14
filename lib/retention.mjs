// Pure, zero-dependency helpers for Tier 2 Retention features:
//   - #5 Resurfacing ("Random entry" & "On this day / Rediscover")
//   - #6 Entry Revision History (local snapshot ring buffer + diff-free restore)
//   - #8 Quick Capture (`?capture=1&title=...&text=...&source=...` URL parser
//        and portable browser bookmarklet generator).

/**
 * Picks a random entry from `entries`, optionally excluding `excludeId`
 * (when there is more than one entry) so clicking "Random entry" while
 * reading an entry always takes you somewhere new.
 * `rng` defaults to `Math.random` and can be injected in unit tests.
 */
export function pickRandomEntry(entries = [], excludeId = null, rng = Math.random) {
  const list = Array.isArray(entries) ? entries.filter((e) => e && e.id) : [];
  if (!list.length) return null;
  const pool = list.length > 1 && excludeId
    ? list.filter((e) => e.id !== excludeId)
    : list;
  const idx = Math.min(pool.length - 1, Math.max(0, Math.floor(rng() * pool.length)));
  return pool[idx] ?? null;
}

/**
 * Selects up to `limit` entries to resurface on the compendium home view:
 *   1. "On this day": entries created on the same month & day in an earlier
 *      year, or on the same day-of-month in an earlier month.
 *   2. "From your archive": a deterministic daily rotation across the user's
 *      entries (seeded by the current `YYYY-MM-DD` date string) so the
 *      spotlight stays stable throughout a day and rotates automatically
 *      each morning.
 * Returns `[{ entry, reason }]`.
 */
export function selectResurfacedEntries(entries = [], now = new Date(), limit = 2) {
  const list = Array.isArray(entries) ? entries.filter((e) => e && e.id && e.title) : [];
  if (list.length < 2 || limit <= 0) return [];

  const d = now instanceof Date ? now : new Date(now);
  const year = d.getUTCFullYear();
  const month = d.getUTCMonth();
  const date = d.getUTCDate();

  const out = [];
  const used = new Set();

  // 1. Check for same month/day in a prior year, or same day-of-month in an earlier month
  for (const e of list) {
    if (out.length >= limit) break;
    if (!e.created_at) continue;
    const cd = new Date(e.created_at);
    if (Number.isNaN(cd.getTime())) continue;
    if (cd.getUTCMonth() === month && cd.getUTCDate() === date && cd.getUTCFullYear() < year) {
      out.push({ entry: e, reason: `On this day (${cd.getUTCFullYear()})` });
      used.add(e.id);
    } else if (cd.getUTCDate() === date && (cd.getUTCFullYear() < year || cd.getUTCMonth() < month)) {
      const mName = cd.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' });
      out.push({ entry: e, reason: `Written on the ${date}th (${mName} ${cd.getUTCFullYear()})` });
      used.add(e.id);
    }
  }

  // 2. Deterministic daily spotlight for remaining slots
  const remaining = list.filter((e) => !used.has(e.id));
  if (remaining.length && out.length < limit) {
    const daySeed = year * 10000 + (month + 1) * 100 + date;
    let hash = daySeed;
    hash = ((hash >> 16) ^ hash) * 0x45d9f3b;
    hash = Math.abs(hash | 0);
    const startIdx = hash % remaining.length;
    for (let i = 0; i < remaining.length && out.length < limit; i++) {
      const pick = remaining[(startIdx + i * 3) % remaining.length];
      if (!used.has(pick.id)) {
        out.push({ entry: pick, reason: 'Daily rediscovery' });
        used.add(pick.id);
      }
    }
  }

  return out;
}

/* ── #6 Entry Revision History (bounded snapshot list) ───────────── */

export const MAX_REVISIONS_PER_ENTRY = 15;

/**
 * Appends a revision snapshot `{ revId, savedAt, title, category, subcategory,
 * summary, body, source }` to an entry's existing revision array, skipping
 * no-op saves where the text has not changed since the latest snapshot and
 * capping the history at `maxRevisions` (newest first).
 */
export function appendRevisionSnapshot(
  existingRevisions = [],
  entrySnapshot = {},
  nowIso = new Date().toISOString(),
  maxRevisions = MAX_REVISIONS_PER_ENTRY
) {
  const prev = Array.isArray(existingRevisions) ? existingRevisions : [];
  const snap = {
    revId: 'rev-' + String(nowIso).replace(/[^0-9]/g, '').slice(0, 14) + '-' + Math.random().toString(36).slice(2, 6),
    savedAt: nowIso,
    title: String(entrySnapshot.title ?? '').trim(),
    category: String(entrySnapshot.category ?? '').trim(),
    subcategory: String(entrySnapshot.subcategory ?? '').trim(),
    summary: String(entrySnapshot.summary ?? ''),
    body: String(entrySnapshot.body ?? ''),
    source: String(entrySnapshot.source ?? '').trim(),
  };

  if (!snap.title && !snap.body && !snap.summary) return prev;

  const head = prev[0];
  if (
    head
    && head.title === snap.title
    && head.category === snap.category
    && head.subcategory === snap.subcategory
    && head.summary === snap.summary
    && head.body === snap.body
    && head.source === snap.source
  ) {
    return prev;
  }

  return [snap, ...prev].slice(0, maxRevisions);
}

/* ── #8 Quick Capture (URL parameter parser & bookmarklet) ───────── */

/**
 * Parses a URL query string (`?capture=1&title=...&text=...&source=...&category=...`)
 * or hash query string into a pre-filled entry draft `{ title, category, summary,
 * body, source }`, or returns `null` if no capture parameters are present.
 */
export function parseQuickCaptureParams(searchStr = '') {
  const raw = String(searchStr ?? '').replace(/^[?#]/, '');
  if (!raw) return null;
  const params = new URLSearchParams(raw);
  const hasCaptureFlag = params.has('capture')
    || params.has('clip')
    || (params.has('title') && (params.has('text') || params.has('source') || params.has('url')));
  if (!hasCaptureFlag) return null;

  const title = (params.get('title') ?? '').trim().slice(0, 180);
  const category = (params.get('category') ?? '').trim().slice(0, 80) || 'Captured';
  const selectedText = (params.get('text') ?? params.get('body') ?? '').trim();
  const sourceUrl = (params.get('source') ?? params.get('url') ?? '').trim().slice(0, 500);

  const body = selectedText
    ? selectedText.split('\n').map((line) => `> ${line}`).join('\n')
    : '';

  return {
    title: title || 'Captured Note',
    category,
    summary: '',
    body,
    source: sourceUrl,
  };
}

/**
 * Builds a single-line `javascript:...` bookmarklet URL that captures the
 * current webpage's `document.title`, `window.getSelection()`, and
 * `location.href` and opens Synopsical's editor pre-filled with those fields.
 */
export function buildBookmarkletHref(appOrigin = 'https://synopsical.com') {
  const base = String(appOrigin ?? 'https://synopsical.com').replace(/\/+$/, '');
  const code = [
    '(function(){',
    'var s=window.getSelection?String(window.getSelection()):"";',
    `var u=${JSON.stringify(base)}+"/?capture=1&title="+encodeURIComponent(document.title||"")+"&source="+encodeURIComponent(location.href)+"&text="+encodeURIComponent(s.slice(0,2500));`,
    'window.open(u,"_blank","noopener");',
    '})();',
  ].join('');
  return `javascript:${code}`;
}
