// Pure, zero-dependency rich-text and [[wiki-link]] parser for entry notes,
// plus portable Markdown export formatting.
//
// Like lib/import-parser.mjs, this file never touches the DOM — it turns raw
// text into plain token objects (`{ type, ... }`), which app.js then turns
// into real DOM nodes via `el()` and `textContent`. That preserves the
// codebase's strict "never set raw HTML / innerHTML" XSS guarantee while
// giving entries real encyclopedic typography: subheadings, bullet lists,
// blockquotes, bold/italic/code spans, and clickable [[Entry Title]]
// cross-references.

const INLINE_RE = /\[\[([^\][\n|]+?)(?:\|([^\][\n]+?))?\]\]|\*\*([^*\n]+?)\*\*|\*([^*\n]+?)\*|`([^`\n]+?)`/g;

/**
 * Parses a single line of text into an array of inline token objects:
 *   - { type: 'text', text }
 *   - { type: 'wikilink', target, label }
 *   - { type: 'bold', text }
 *   - { type: 'italic', text }
 *   - { type: 'code', text }
 */
export function parseInlineTokens(line) {
  const str = String(line ?? '');
  if (!str) return [];
  const tokens = [];
  let lastIndex = 0;

  for (const m of str.matchAll(INLINE_RE)) {
    const idx = m.index ?? 0;
    if (idx > lastIndex) {
      tokens.push({ type: 'text', text: str.slice(lastIndex, idx) });
    }
    if (m[1] !== undefined) {
      const target = m[1].trim();
      const label = (m[2] !== undefined ? m[2] : m[1]).trim();
      if (target) {
        tokens.push({ type: 'wikilink', target, label: label || target });
      } else {
        tokens.push({ type: 'text', text: m[0] });
      }
    } else if (m[3] !== undefined) {
      tokens.push({ type: 'bold', text: m[3] });
    } else if (m[4] !== undefined) {
      tokens.push({ type: 'italic', text: m[4] });
    } else if (m[5] !== undefined) {
      tokens.push({ type: 'code', text: m[5] });
    }
    lastIndex = idx + m[0].length;
  }

  if (lastIndex < str.length) {
    tokens.push({ type: 'text', text: str.slice(lastIndex) });
  }
  return tokens;
}

/**
 * Parses multi-line prose into structured block objects:
 *   - { type: 'heading', level: 2 | 3, inlines }
 *   - { type: 'list', items: [inlines, ...] }
 *   - { type: 'quote', lines: [inlines, ...] }
 *   - { type: 'paragraph', lines: [inlines, ...] }
 */
export function parseRichBlocks(text) {
  const raw = String(text ?? '').replace(/\r\n/g, '\n').trim();
  if (!raw) return [];

  const lines = raw.split('\n');
  const blocks = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Skip blank lines between blocks
    if (!line.trim()) {
      i++;
      continue;
    }

    // Heading: #, ##, or ###
    const headingMatch = line.match(/^\s*(#{1,3})\s+(.+?)\s*$/);
    if (headingMatch) {
      const level = headingMatch[1].length <= 2 ? 2 : 3;
      blocks.push({
        type: 'heading',
        level,
        inlines: parseInlineTokens(headingMatch[2]),
      });
      i++;
      continue;
    }

    // Unordered list: contiguous - / * / • lines
    if (/^\s*[-*•]\s+.+/.test(line)) {
      const items = [];
      while (i < lines.length && /^\s*[-*•]\s+.+/.test(lines[i])) {
        const itemText = lines[i].replace(/^\s*[-*•]\s+/, '').trim();
        items.push(parseInlineTokens(itemText));
        i++;
      }
      blocks.push({ type: 'list', items });
      continue;
    }

    // Blockquote: contiguous > lines
    if (/^\s*>\s?/.test(line)) {
      const quoteLines = [];
      while (i < lines.length && /^\s*>\s?/.test(lines[i])) {
        const qText = lines[i].replace(/^\s*>\s?/, '').trim();
        if (qText) quoteLines.push(parseInlineTokens(qText));
        i++;
      }
      if (quoteLines.length) blocks.push({ type: 'quote', lines: quoteLines });
      continue;
    }

    // Paragraph: contiguous non-blank, non-special lines
    const paraLines = [];
    while (
      i < lines.length
      && lines[i].trim()
      && !/^\s*(#{1,3})\s+.+/.test(lines[i])
      && !/^\s*[-*•]\s+.+/.test(lines[i])
      && !/^\s*>\s?/.test(lines[i])
    ) {
      paraLines.push(parseInlineTokens(lines[i]));
      i++;
    }
    if (paraLines.length) {
      blocks.push({ type: 'paragraph', lines: paraLines });
    }
  }

  return blocks;
}

/**
 * Extracts unique target entry titles referenced via `[[Target]]` or
 * `[[Target|Label]]` in the given text, preserving first-seen casing.
 */
export function extractWikiLinks(text) {
  const str = String(text ?? '');
  if (!str) return [];
  const seen = new Set();
  const out = [];
  for (const m of str.matchAll(/\[\[([^\][\n|]+?)(?:\|([^\][\n]+?))?\]\]/g)) {
    const target = m[1].trim();
    const key = target.toLowerCase();
    if (target && !seen.has(key)) {
      seen.add(key);
      out.push(target);
    }
  }
  return out;
}

/**
 * Formats a collection of entries (and their satellite fields, tags, and links)
 * into a clean, human-readable Markdown document that also round-trips through
 * Synopsical's own Import screen (`---` separated blocks with `Title:` headers).
 */
export function entriesToMarkdown(entries = [], fields = [], tags = [], links = []) {
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
  const titleById = new Map(entries.map((e) => [e.id, e.title]));
  const linksBy = new Map();
  for (const l of links) {
    if (!linksBy.has(l.from_entry_id)) linksBy.set(l.from_entry_id, []);
    const targetTitle = titleById.get(l.to_entry_id);
    if (targetTitle) {
      linksBy.get(l.from_entry_id).push({ targetTitle, relation: l.relation || '' });
    }
  }

  return entries.map((e) => {
    const header = [];
    header.push(`Title: ${e.title}`);
    header.push(`Category: ${e.category || 'Uncategorized'}`);
    if (e.subcategory) header.push(`Subcategory: ${e.subcategory}`);
    const eTags = tagsBy.get(e.id) ?? e.tags ?? [];
    if (eTags.length) header.push(`Tags: ${eTags.join(', ')}`);
    if (e.summary) header.push(`Summary: ${e.summary.replace(/\s+/g, ' ').trim()}`);
    if (e.source) header.push(`Source: ${e.source}`);
    for (const f of fieldsBy.get(e.id) ?? []) {
      header.push(`Field: ${f.field_name} = ${f.field_value ?? ''}`);
    }
    for (const l of linksBy.get(e.id) ?? []) {
      header.push(`Link: ${l.targetTitle}${l.relation ? ` | ${l.relation}` : ''}`);
    }
    const body = (e.body ?? '').trim();
    return body ? `${header.join('\n')}\n\n${body}` : header.join('\n');
  }).join('\n\n---\n\n') + (entries.length ? '\n' : '');
}
