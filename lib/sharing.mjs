// Pure, zero-dependency helpers for Public Sharing (#1), Stripe Plus
// Checkout URLs (#2), and privacy-friendly funnel analytics (#4).
//
// Like the other lib/*.mjs modules, this file never touches the DOM or
// browser globals so it can be unit-tested in Node with `npm test`.

/**
 * Turns any free-form text (an entry title or a user display name) into a
 * URL-safe lowercase slug (`"Hagia Sophia (537 AD)"` -> `"hagia-sophia-537-ad"`).
 */
export function slugify(text, maxLength = 60) {
  const raw = String(text ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (!raw) return '';
  return raw.slice(0, maxLength).replace(/-+$/g, '');
}

/**
 * Validates a public compendium handle (e.g. `alex` or `byzantine-notes`):
 *   - 3 to 32 characters
 *   - lowercase letters, digits, and single internal hyphens
 *   - must start and end with a letter or digit
 * Returns `{ ok: true, handle }` or `{ ok: false, error }`.
 */
const RESERVED_HANDLES = new Set([
  'admin', 'api', 'app', 'auth', 'billing', 'edit', 'entry', 'explore',
  'graph', 'help', 'home', 'import', 'info', 'login', 'logout', 'new',
  'plus', 'pricing', 'privacy', 'public', 'recent', 'reset', 'sample',
  'search', 'settings', 'share', 'sign-in', 'sign-up', 'signup', 'signin',
  'stripe', 'support', 'synopsical', 'tag', 'category', 'u',
]);

export function validateHandle(input) {
  const clean = String(input ?? '').trim().toLowerCase().replace(/^@+/, '');
  if (!clean) {
    return { ok: false, error: 'Choose a public handle (3–32 characters).' };
  }
  if (clean.length < 3 || clean.length > 32) {
    return { ok: false, error: 'Handles must be between 3 and 32 characters.' };
  }
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(clean)) {
    return {
      ok: false,
      error: 'Use only lowercase letters, numbers, and single hyphens (e.g. "alex-archive").',
    };
  }
  if (RESERVED_HANDLES.has(clean)) {
    return { ok: false, error: `“${clean}” is reserved — please pick another handle.` };
  }
  return { ok: true, handle: clean };
}

/**
 * Builds the canonical hash route and full shareable URL for a public
 * compendium or a single published entry:
 *   - Compendium: `#/@handle`
 *   - Entry:      `#/@handle/entry-slug` (or `#/share/<entryId>` when the
 *                 author hasn't claimed a handle yet)
 */
export function buildPublicShareUrl(origin, { handle = '', entrySlug = '', entryId = '' } = {}) {
  const base = String(origin ?? 'https://synopsical.com').replace(/\/+$/, '');
  const cleanHandle = String(handle ?? '').trim().toLowerCase().replace(/^@+/, '');
  const cleanSlug = String(entrySlug ?? '').trim().toLowerCase();
  const cleanId = String(entryId ?? '').trim();

  if (cleanHandle && cleanSlug) {
    const hash = `#/@${encodeURIComponent(cleanHandle)}/${encodeURIComponent(cleanSlug)}`;
    return { hash, url: `${base}/${hash}` };
  }
  if (cleanHandle) {
    const hash = `#/@${encodeURIComponent(cleanHandle)}`;
    return { hash, url: `${base}/${hash}` };
  }
  if (cleanId) {
    const hash = `#/share/${encodeURIComponent(cleanId)}`;
    return { hash, url: `${base}/${hash}` };
  }
  return { hash: '#/', url: `${base}/` };
}

/**
 * Parses a URL hash string (`#/@handle`, `#/@handle/slug`, or `#/share/id`)
 * into a public route descriptor, or returns `null` if the hash is not a
 * public share route.
 */
export function parsePublicHash(hashStr) {
  const raw = String(hashStr ?? '').replace(/^#\/?/, '');
  if (!raw) return null;
  const [path] = raw.split('?');
  const parts = path.split('/').filter(Boolean).map((p) => {
    try { return decodeURIComponent(p); } catch { return p; }
  });
  if (!parts.length) return null;

  if (parts[0].startsWith('@') && parts[0].length > 1) {
    const handle = parts[0].slice(1).toLowerCase();
    const entrySlug = parts[1] ? parts[1].toLowerCase() : null;
    return {
      name: 'public',
      mode: entrySlug ? 'handle-entry' : 'compendium',
      handle,
      entrySlug,
      entryId: null,
    };
  }
  if (parts[0] === 'u' && parts[1]) {
    const handle = parts[1].toLowerCase().replace(/^@+/, '');
    const entrySlug = parts[2] ? parts[2].toLowerCase() : null;
    return {
      name: 'public',
      mode: entrySlug ? 'handle-entry' : 'compendium',
      handle,
      entrySlug,
      entryId: null,
    };
  }
  if (parts[0] === 'share' && parts[1]) {
    return {
      name: 'public',
      mode: 'entry-id',
      handle: null,
      entrySlug: null,
      entryId: parts[1],
    };
  }
  return null;
}

/**
 * Builds a Stripe Payment Link URL pre-populated with the signed-in user's
 * `client_reference_id` (their Supabase user UUID) and `prefilled_email` so
 * the `stripe-webhook` Edge Function can reliably match the completed
 * checkout session back to `profiles.id`.
 */
export function buildStripeCheckoutUrl(baseUrl, { userId = '', email = '' } = {}) {
  const raw = String(baseUrl ?? '').trim();
  if (!raw) return null;
  let url;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (userId) url.searchParams.set('client_reference_id', String(userId));
  if (email) url.searchParams.set('prefilled_email', String(email));
  return url.toString();
}

/* ── Privacy-friendly funnel analytics ───────────────────────────── */

export const ALLOWED_ANALYTICS_EVENTS = new Set([
  'home_view',
  'sample_start',
  'sample_entry_view',
  'signup_view',
  'signup_complete',
  'entry_create',
  'entry_milestone_10',
  'share_enable',
  'public_view',
  'plus_checkout_click',
]);

/**
 * Validates and normalizes an analytics event payload before it is sent to
 * Supabase (`log_analytics_event`) or buffered locally. Strips any unexpected
 * keys or PII-like fields (emails, bodies, titles) so only anonymous funnel
 * counters and safe metadata (`category`, `source`, `count`, `theme`) remain.
 */
const SAFE_META_KEYS = new Set(['source', 'category', 'count', 'theme', 'mode', 'step']);

export function normalizeAnalyticsEvent(eventName, meta = {}) {
  const name = String(eventName ?? '').trim().toLowerCase();
  if (!ALLOWED_ANALYTICS_EVENTS.has(name)) return null;
  const cleanMeta = {};
  if (meta && typeof meta === 'object') {
    for (const [k, v] of Object.entries(meta)) {
      if (!SAFE_META_KEYS.has(k)) continue;
      if (typeof v === 'number' && Number.isFinite(v)) {
        cleanMeta[k] = v;
      } else if (typeof v === 'boolean') {
        cleanMeta[k] = v;
      } else if (typeof v === 'string') {
        cleanMeta[k] = v.slice(0, 64);
      }
    }
  }
  return { event: name, meta: cleanMeta };
}
