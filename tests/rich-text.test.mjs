// Unit tests for lib/rich-text.mjs and lib/sample-compendium.mjs.

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseInlineTokens,
  parseRichBlocks,
  extractWikiLinks,
  entriesToMarkdown,
} from '../lib/rich-text.mjs';
import { parseImportText } from '../lib/import-parser.mjs';
import { SAMPLE_ENTRIES, SAMPLE_LINKS, cloneSampleCompendium } from '../lib/sample-compendium.mjs';

test('parseInlineTokens: parses plain text, [[wikilinks]], **bold**, *italic*, and `code`', () => {
  const tokens = parseInlineTokens(
    'See [[Hagia Sophia]] and [[Principia Mathematica|Newton’s Principia]] for **bold**, *italic*, and `70S`.'
  );
  assert.deepEqual(tokens, [
    { type: 'text', text: 'See ' },
    { type: 'wikilink', target: 'Hagia Sophia', label: 'Hagia Sophia' },
    { type: 'text', text: ' and ' },
    { type: 'wikilink', target: 'Principia Mathematica', label: 'Newton’s Principia' },
    { type: 'text', text: ' for ' },
    { type: 'bold', text: 'bold' },
    { type: 'text', text: ', ' },
    { type: 'italic', text: 'italic' },
    { type: 'text', text: ', and ' },
    { type: 'code', text: '70S' },
    { type: 'text', text: '.' },
  ]);
});

test('parseRichBlocks: parses headings, bullet lists, blockquotes, and multi-line paragraphs', () => {
  const blocks = parseRichBlocks(
    'Intro paragraph line 1\nIntro line 2\n\n'
    + '## Section Two\n\n'
    + '- First item with [[Link A]]\n'
    + '- Second item\n\n'
    + '> A quoted remark\n\n'
    + '### Subsection Three'
  );
  assert.equal(blocks.length, 5);
  assert.equal(blocks[0].type, 'paragraph');
  assert.equal(blocks[0].lines.length, 2);
  assert.equal(blocks[1].type, 'heading');
  assert.equal(blocks[1].level, 2);
  assert.equal(blocks[2].type, 'list');
  assert.equal(blocks[2].items.length, 2);
  assert.equal(blocks[3].type, 'quote');
  assert.equal(blocks[4].type, 'heading');
  assert.equal(blocks[4].level, 3);
});

test('extractWikiLinks: extracts unique [[Target]] titles case-insensitively', () => {
  const links = extractWikiLinks(
    'Links to [[Hagia Sophia]], [[hagia sophia|the church]], and [[Opticks]].'
  );
  assert.deepEqual(links, ['Hagia Sophia', 'Opticks']);
});

test('entriesToMarkdown: round-trips through parseImportText()', () => {
  const entries = [
    {
      id: '1',
      title: 'Byzantine Iconoclasm',
      category: 'History',
      subcategory: 'Byzantium',
      summary: 'Two periods of icon bans.',
      source: 'Brubaker 2011',
      body: 'Full prose body here.',
    },
    {
      id: '2',
      title: 'Hagia Sophia',
      category: 'Architecture',
      body: 'Built in 537 AD.',
    },
  ];
  const fields = [{ entry_id: '1', field_name: 'First Period', field_value: '726-787 AD' }];
  const tags = [{ entry_id: '1', tag: 'byzantine-empire' }, { entry_id: '1', tag: 'theology' }];
  const links = [{ from_entry_id: '1', to_entry_id: '2', relation: 'Mosaics altered' }];

  const md = entriesToMarkdown(entries, fields, tags, links);
  const parsed = parseImportText(md);
  assert.equal(parsed.length, 2);
  assert.equal(parsed[0].title, 'Byzantine Iconoclasm');
  assert.equal(parsed[0].category, 'History');
  assert.deepEqual(parsed[0].tags, ['byzantine-empire', 'theology']);
  assert.deepEqual(parsed[0].fields, [{ name: 'First Period', value: '726-787 AD' }]);
  assert.deepEqual(parsed[0].links, [{ targetTitle: 'Hagia Sophia', relation: 'Mosaics altered' }]);
  assert.equal(parsed[0].body, 'Full prose body here.');
});

test('cloneSampleCompendium: returns 8 interconnected entries with valid link counts', () => {
  const { entries, links } = cloneSampleCompendium();
  assert.equal(entries.length, SAMPLE_ENTRIES.length);
  assert.equal(links.length, SAMPLE_LINKS.length);
  const iconoclasm = entries.find((e) => e.id === 'sample-iconoclasm');
  assert.ok(iconoclasm);
  assert.ok(iconoclasm.linkCount >= 2);
});
