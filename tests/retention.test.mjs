// Unit tests for lib/retention.mjs (#5 Resurfacing, #6 Revision History, #8 Quick Capture).

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  pickRandomEntry,
  selectResurfacedEntries,
  appendRevisionSnapshot,
  parseQuickCaptureParams,
  buildBookmarkletHref,
} from '../lib/retention.mjs';

test('pickRandomEntry: returns null on empty list and avoids excludeId when possible', () => {
  assert.equal(pickRandomEntry([]), null);
  const items = [{ id: 'a', title: 'A' }, { id: 'b', title: 'B' }];
  assert.equal(pickRandomEntry(items, 'a', () => 0).id, 'b');
  assert.equal(pickRandomEntry([{ id: 'only', title: 'Only' }], 'only', () => 0).id, 'only');
});

test('selectResurfacedEntries: prioritizes On-this-day matches and fills with deterministic daily picks', () => {
  const entries = [
    { id: '1', title: 'Old Anniversary', created_at: '2025-11-13T10:00:00Z' },
    { id: '2', title: 'Second Entry', created_at: '2026-08-01T10:00:00Z' },
    { id: '3', title: 'Third Entry', created_at: '2026-08-04T10:00:00Z' },
  ];
  const now = new Date('2026-11-13T12:00:00Z');
  const picks = selectResurfacedEntries(entries, now, 2);
  assert.equal(picks.length, 2);
  assert.equal(picks[0].entry.id, '1');
  assert.match(picks[0].reason, /On this day \(2025\)/);
  assert.equal(picks[1].reason, 'Daily rediscovery');
});

test('appendRevisionSnapshot: records snapshots, deduplicates identical consecutive states, and caps length', () => {
  let revs = [];
  revs = appendRevisionSnapshot(revs, {
    title: 'Opticks',
    category: 'Physics',
    body: 'First draft',
  }, '2026-11-13T10:00:00Z');
  assert.equal(revs.length, 1);

  // Identical content does not create a duplicate revision
  revs = appendRevisionSnapshot(revs, {
    title: 'Opticks',
    category: 'Physics',
    body: 'First draft',
  }, '2026-11-13T10:05:00Z');
  assert.equal(revs.length, 1);

  // Updated body creates a newer revision at index 0
  revs = appendRevisionSnapshot(revs, {
    title: 'Opticks',
    category: 'Physics',
    body: 'Second draft with prism experiment',
  }, '2026-11-13T10:10:00Z');
  assert.equal(revs.length, 2);
  assert.equal(revs[0].body, 'Second draft with prism experiment');
  assert.equal(revs[1].body, 'First draft');
});

test('parseQuickCaptureParams & buildBookmarkletHref: parses highlighted quotes and source URLs cleanly', () => {
  const parsed = parseQuickCaptureParams(
    '?capture=1&title=Byzantine%20Architecture&text=Forty%20arched%20windows&source=https%3A%2F%2Fexample.com%2Fhagia'
  );
  assert.deepEqual(parsed, {
    title: 'Byzantine Architecture',
    category: 'Captured',
    summary: '',
    body: '> Forty arched windows',
    source: 'https://example.com/hagia',
  });
  assert.equal(parseQuickCaptureParams('?q=search'), null);

  const bm = buildBookmarkletHref('https://synopsical.com/');
  assert.ok(bm.startsWith('javascript:(function(){'));
  assert.ok(bm.includes('https://synopsical.com'));
  assert.ok(bm.includes('capture=1'));
});
