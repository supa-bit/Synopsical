// Unit tests for lib/backlinks.mjs.

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  makeSnippet,
  findPlainMentions,
  findWikiReferences,
  findUnlinkedMentions,
  linkFirstMention,
  wikiQueryAt,
  rankTitleMatches,
  applyWikiCompletion,
} from '../lib/backlinks.mjs';

const E = (id, title, body = '', summary = '') => ({ id, title, body, summary });

test('findPlainMentions: whole-word, case-insensitive, skips text inside [[ ]]', () => {
  const text = 'Hagia Sophia rose. [[Hagia Sophia]] again; hagia sophia; HagiaSophiaX no.';
  const hits = findPlainMentions(text, 'Hagia Sophia');
  assert.deepEqual(hits.map((h) => text.slice(h.index, h.index + h.length)),
    ['Hagia Sophia', 'hagia sophia']);
});

test('findPlainMentions: ignores titles under 3 characters and escapes regex characters', () => {
  assert.deepEqual(findPlainMentions('Io is a moon', 'Io'), []);
  const text = 'Using C++ (the language) daily';
  assert.equal(findPlainMentions(text, 'C++').length, 1, 'regex chars are escaped');
  const t2 = 'The (Re)Naissance era';
  assert.equal(findPlainMentions(t2, '(Re)Naissance').length, 1);
});

test('findPlainMentions: handles non-ASCII word boundaries', () => {
  assert.equal(findPlainMentions('Über Café culture', 'Café').length, 1);
  assert.equal(findPlainMentions('Cafés everywhere', 'Café').length, 0);
});

test('makeSnippet: splits around the match, collapses whitespace, adds ellipses', () => {
  const text = 'word '.repeat(40) + 'TARGET\n\nhere ' + 'tail '.repeat(40);
  const s = makeSnippet(text, text.indexOf('TARGET'), 6, 20);
  assert.equal(s.match, 'TARGET');
  assert.ok(s.before.startsWith('…'));
  assert.ok(s.after.endsWith('…'));
  assert.ok(!/\n/.test(s.after));
  const short = makeSnippet('a TARGET b', 2, 6);
  assert.deepEqual(short, { before: 'a ', match: 'TARGET', after: ' b' });
});

test('findWikiReferences: finds entries whose notes [[link]] the target, ignoring self', () => {
  const target = E('t', 'Opticks', 'See [[Opticks]] (self)');
  const entries = [
    target,
    E('a', 'Newton', 'He wrote [[opticks|his Opticks]] in 1704.'),
    E('b', 'Light', '', 'Summary cites [[ Opticks ]].'),
    E('c', 'Other', 'Mentions Opticks without a link.'),
  ];
  const refs = findWikiReferences(entries, target);
  assert.deepEqual(refs.map((r) => r.entry.id), ['a', 'b']);
  assert.equal(refs[1].field, 'summary');
  assert.equal(refs[0].snippet.match, '[[opticks|his Opticks]]');
});

test('findUnlinkedMentions: plain mentions only, honours excludeIds, sorted by count', () => {
  const target = E('t', 'Royal Society');
  const entries = [
    target,
    E('a', 'Newton', 'President of the Royal Society. The Royal Society again.'),
    E('b', 'Hooke', 'Curator at the royal society.'),
    E('c', 'Linked', 'Already [[Royal Society]] linked.'),
    E('d', 'Excluded', 'Royal Society too.'),
  ];
  const res = findUnlinkedMentions(entries, target, new Set(['d']));
  assert.deepEqual(res.map((r) => [r.entry.id, r.count]), [['a', 2], ['b', 1]]);
  assert.equal(res[1].snippet.match, 'royal society');
});

test('linkFirstMention: wraps only the first plain mention, preserving casing', () => {
  assert.equal(
    linkFirstMention('The hagia sophia and Hagia Sophia.', 'Hagia Sophia'),
    'The [[hagia sophia]] and Hagia Sophia.'
  );
  assert.equal(
    linkFirstMention('[[Hagia Sophia]] then Hagia Sophia', 'Hagia Sophia'),
    '[[Hagia Sophia]] then [[Hagia Sophia]]'
  );
  assert.equal(linkFirstMention('nothing here', 'Hagia Sophia'), 'nothing here');
});

test('wikiQueryAt: detects an open [[ before the caret on the same line', () => {
  assert.deepEqual(wikiQueryAt('See [[Hag', 9), { start: 6, query: 'Hag' });
  assert.deepEqual(wikiQueryAt('See [[', 6), { start: 6, query: '' });
  assert.equal(wikiQueryAt('See [[Hagia]] done', 18), null, 'already closed');
  assert.equal(wikiQueryAt('See [[Hag\nnext', 14), null, 'different line');
  assert.equal(wikiQueryAt('See [[A|lab', 11), null, 'typing a label');
  assert.equal(wikiQueryAt('no link', 7), null);
  assert.equal(wikiQueryAt('[', 1), null);
});

test('rankTitleMatches: exact > prefix > word-prefix > substring, excludes current entry', () => {
  const entries = [
    E('1', 'Symbiogenesis'),
    E('2', 'Mycorrhizal Networks'),
    E('3', 'Networks'),
    E('4', 'Neural Networks Theory'),
    E('5', 'Subnetworks'),
    E('6', 'Networks of Trade'),
  ];
  const ids = rankTitleMatches(entries, 'networks', { excludeId: '6' }).map((e) => e.id);
  assert.deepEqual(ids, ['3', '2', '4', '5']);
  assert.equal(rankTitleMatches(entries, '', { limit: 2 }).length, 2);
  assert.deepEqual(rankTitleMatches(entries, 'zzz'), []);
});

test('applyWikiCompletion: closes the link and places the caret after ]]', () => {
  const r1 = applyWikiCompletion('See [[Hag and more', 6, 9, 'Hagia Sophia');
  assert.deepEqual(r1, { text: 'See [[Hagia Sophia]] and more', caret: 20 });
  // Existing closer right after a partial word is reused, not duplicated.
  const r2 = applyWikiCompletion('See [[Hagia So]] ok', 6, 9, 'Hagia Sophia');
  assert.deepEqual(r2, { text: 'See [[Hagia Sophia]] ok', caret: 20 });
  // A later, unrelated link on the line is left alone.
  const r3 = applyWikiCompletion('[[Op and [[Other]]', 2, 4, 'Opticks');
  assert.equal(r3.text, '[[Opticks]] and [[Other]]');
});
