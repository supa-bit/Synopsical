// Unit tests for lib/import-parser.mjs — the text -> draft parsing behind
// the Import screen. Pure functions, no DOM, so these run in plain Node:
//   node --test tests/
// or:
//   npm test

import test from 'node:test';
import assert from 'node:assert/strict';
import { parseImportBlock, parseImportText } from '../lib/import-parser.mjs';

test('parseImportBlock: all header fields recognized', () => {
  const d = parseImportBlock(
    'Title: Byzantine Iconoclasm\n'
    + 'Category: History\n'
    + 'Subcategory: Byzantine Empire\n'
    + 'Tags: byzantine-empire, theology, icons\n'
    + 'Summary: Two periods of imperial bans on religious icons.\n'
    + 'Source: https://example.com/iconoclasm\n'
    + 'Field: Duration = 726-842 AD\n'
    + '\n'
    + 'The body text goes here.\nAcross multiple lines.'
  );
  assert.equal(d.title, 'Byzantine Iconoclasm');
  assert.equal(d.category, 'History');
  assert.equal(d.subcategory, 'Byzantine Empire');
  assert.deepEqual(d.tags, ['byzantine-empire', 'theology', 'icons']);
  assert.equal(d.summary, 'Two periods of imperial bans on religious icons.');
  assert.equal(d.source, 'https://example.com/iconoclasm');
  assert.deepEqual(d.fields, [{ name: 'Duration', value: '726-842 AD' }]);
  assert.equal(d.body, 'The body text goes here.\nAcross multiple lines.');
  assert.equal(d._include, true);
});

test('parseImportBlock: header parsing is case-insensitive', () => {
  const d = parseImportBlock('title: lowercase works\ncategory: Also Fine\n\nBody.');
  assert.equal(d.title, 'lowercase works');
  assert.equal(d.category, 'Also Fine');
});

test('parseImportBlock: a blank line between header lines ends the header early', () => {
  // Header parsing stops at the first non-matching line, including a blank
  // one -- everything from there on (even a later "Category:" line) is
  // just body text, not parsed as a header. This is the exact behavior a
  // pasted entry with a stray blank line in its header block would hit.
  const d = parseImportBlock('Title: Something\n\nCategory: This never gets read as a header\nMore body.');
  assert.equal(d.title, 'Something');
  assert.equal(d.category, ''); // never reached
  assert.equal(d.body, 'Category: This never gets read as a header\nMore body.');
});

test('parseImportBlock: no recognized header at all -- first line becomes the title', () => {
  const d = parseImportBlock('Just a plain paste with no headers\nSecond line is body.\nThird line too.');
  assert.equal(d.title, 'Just a plain paste with no headers');
  assert.equal(d.category, '');
  assert.equal(d.body, 'Second line is body.\nThird line too.');
});

test('parseImportBlock: no header and only one line -- title set, body empty', () => {
  const d = parseImportBlock('Only one line');
  assert.equal(d.title, 'Only one line');
  assert.equal(d.body, '');
});

test('parseImportBlock: tags are trimmed and empty entries dropped', () => {
  const d = parseImportBlock('Title: T\nTags: a,  b ,, c\n\nBody.');
  assert.deepEqual(d.tags, ['a', 'b', 'c']);
});

test('parseImportBlock: Field splits on the FIRST "=" only, so "=" can appear in the value', () => {
  const d = parseImportBlock('Title: T\nField: Equation = E=mc^2\n\nBody.');
  assert.deepEqual(d.fields, [{ name: 'Equation', value: 'E=mc^2' }]);
});

test('parseImportBlock: Field repeats, one entry per line', () => {
  const d = parseImportBlock('Title: T\nField: A = 1\nField: B = 2\n\nBody.');
  assert.deepEqual(d.fields, [{ name: 'A', value: '1' }, { name: 'B', value: '2' }]);
});

test('parseImportBlock: a Field line with no "=" is silently dropped, not errored', () => {
  const d = parseImportBlock('Title: T\nField: no equals sign here\n\nBody.');
  assert.deepEqual(d.fields, []);
});

test('parseImportBlock: headers with no body at all leave body empty, not undefined', () => {
  const d = parseImportBlock('Title: T\nCategory: C');
  assert.equal(d.body, '');
});

test('parseImportText: single block with no --- delimiter is one entry', () => {
  const drafts = parseImportText('Title: Solo Entry\nCategory: Misc\n\nJust the one.');
  assert.equal(drafts.length, 1);
  assert.equal(drafts[0].title, 'Solo Entry');
});

test('parseImportText: splits multiple entries on a lone --- line', () => {
  const drafts = parseImportText(
    'Title: First\nCategory: A\n\nFirst body.\n\n---\n\nTitle: Second\nCategory: B\n\nSecond body.'
  );
  assert.equal(drafts.length, 2);
  assert.equal(drafts[0].title, 'First');
  assert.equal(drafts[1].title, 'Second');
});

test('parseImportText: the dash delimiter accepts more than 3 dashes and surrounding whitespace', () => {
  const drafts = parseImportText('Title: A\n\nOne.\n   -------   \nTitle: B\n\nTwo.');
  assert.equal(drafts.length, 2);
});

test('parseImportText: a two-dash line does NOT split (needs 3+)', () => {
  const drafts = parseImportText('Title: A\n\nSome text\n--\nmore text on the same entry.');
  assert.equal(drafts.length, 1);
  assert.match(drafts[0].body, /--/);
});

test('parseImportText: blank/whitespace-only entries between delimiters are dropped', () => {
  const drafts = parseImportText('Title: A\n\nBody.\n\n---\n\n   \n\n---\n\nTitle: B\n\nBody.');
  assert.equal(drafts.length, 2);
});

test('parseImportText: empty input produces no drafts', () => {
  assert.deepEqual(parseImportText(''), []);
  assert.deepEqual(parseImportText('   \n  '), []);
});
