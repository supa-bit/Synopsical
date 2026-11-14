// Unit tests for lib/sharing.mjs (#1 Public Sharing, #2 Plus Checkout, #4 Analytics).

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  slugify,
  validateHandle,
  buildPublicShareUrl,
  parsePublicHash,
  buildStripeCheckoutUrl,
  normalizeAnalyticsEvent,
} from '../lib/sharing.mjs';

test('slugify: normalizes accents, punctuation, and length', () => {
  assert.equal(slugify('Hagia Sophia (537 AD)'), 'hagia-sophia-537-ad');
  assert.equal(slugify('  Über Café — Principia! '), 'uber-cafe-principia');
  assert.equal(slugify('---'), '');
  assert.equal(slugify('a'.repeat(80), 20).length, 20);
});

test('validateHandle: accepts lowercase alphanumeric + single hyphens and rejects reserved/invalid handles', () => {
  assert.deepEqual(validateHandle('@Alex-Archive'), { ok: true, handle: 'alex-archive' });
  assert.deepEqual(validateHandle('scholar42'), { ok: true, handle: 'scholar42' });
  assert.equal(validateHandle('ab').ok, false, 'too short');
  assert.equal(validateHandle('-bad').ok, false, 'leading hyphen');
  assert.equal(validateHandle('bad--name').ok, false, 'double hyphen');
  assert.equal(validateHandle('settings').ok, false, 'reserved word');
  assert.equal(validateHandle('pricing').ok, false, 'reserved word');
});

test('buildPublicShareUrl & parsePublicHash: round-trip compendium, handle-entry, and direct share ID routes', () => {
  const comp = buildPublicShareUrl('https://synopsical.com/', { handle: 'byzantium' });
  assert.equal(comp.hash, '#/@byzantium');
  assert.equal(comp.url, 'https://synopsical.com/#/@byzantium');
  assert.deepEqual(parsePublicHash(comp.hash), {
    name: 'public',
    mode: 'compendium',
    handle: 'byzantium',
    entrySlug: null,
    entryId: null,
  });

  const entry = buildPublicShareUrl('https://synopsical.com', {
    handle: '@byzantium',
    entrySlug: 'hagia-sophia',
  });
  assert.equal(entry.hash, '#/@byzantium/hagia-sophia');
  assert.deepEqual(parsePublicHash(entry.hash), {
    name: 'public',
    mode: 'handle-entry',
    handle: 'byzantium',
    entrySlug: 'hagia-sophia',
    entryId: null,
  });

  const direct = buildPublicShareUrl('https://synopsical.com', { entryId: 'sample-hagia-sophia' });
  assert.equal(direct.hash, '#/share/sample-hagia-sophia');
  assert.deepEqual(parsePublicHash(direct.hash), {
    name: 'public',
    mode: 'entry-id',
    handle: null,
    entrySlug: null,
    entryId: 'sample-hagia-sophia',
  });

  assert.equal(parsePublicHash('#/entry/123'), null);
  assert.equal(parsePublicHash('#/'), null);
});

test('buildStripeCheckoutUrl: appends client_reference_id and prefilled_email safely', () => {
  const url = buildStripeCheckoutUrl('https://buy.stripe.com/test_123', {
    userId: 'user-uuid-1',
    email: 'reader@example.com',
  });
  assert.equal(
    url,
    'https://buy.stripe.com/test_123?client_reference_id=user-uuid-1&prefilled_email=reader%40example.com'
  );
  assert.equal(buildStripeCheckoutUrl('', { userId: 'x' }), null);
  assert.equal(buildStripeCheckoutUrl('not-a-url', { userId: 'x' }), null);
});

test('normalizeAnalyticsEvent: allows whitelisted funnel events and strips non-whitelisted metadata', () => {
  const ev = normalizeAnalyticsEvent('sample_start', {
    source: 'hero-cta',
    count: 8,
    email: 'secret@example.com',
    title: 'Private Note Title',
  });
  assert.deepEqual(ev, {
    event: 'sample_start',
    meta: { source: 'hero-cta', count: 8 },
  });
  assert.equal(normalizeAnalyticsEvent('unknown_event', {}), null);
});
