// Pure parsing logic for the Import screen — no DOM, no app state, nothing
// but text in and drafts out. Pulled out of app.js into its own ES module
// specifically so it can be unit-tested directly (see tests/import-parser.test.mjs)
// without booting the whole app, and imported back into app.js the same way
// (`<script type="module" src="app.js">` in index.html makes `import` valid
// there — see README's "Before pushing" section for why this file exists).

export const IMPORT_HEADER_RE = /^(Title|Category|Subcategory|Tags|Summary|Source|Field)\s*:\s*(.*)$/i;

/**
 * One block of pasted text -> one draft entry. Recognized header lines
 * only count while contiguous from the very start of the block; the
 * first line that doesn't match ends the header, and everything after it
 * becomes the body untouched. A block with no recognized header at all
 * still gets a title — taken from its own first line, since guessing a
 * category from prose isn't honest, so that's left blank for the preview
 * screen to flag instead of inventing one.
 */
export function parseImportBlock(block) {
  const lines = block.split('\n');
  const draft = {
    title: '', category: '', subcategory: '', tags: [], summary: '', source: '', fields: [], body: '',
    _include: true,
  };
  let i = 0;
  while (i < lines.length) {
    const m = lines[i].match(IMPORT_HEADER_RE);
    if (!m) break;
    const key = m[1].toLowerCase();
    const value = m[2].trim();
    if (key === 'title') draft.title = value;
    else if (key === 'category') draft.category = value;
    else if (key === 'subcategory') draft.subcategory = value;
    else if (key === 'summary') draft.summary = value;
    else if (key === 'source') draft.source = value;
    else if (key === 'tags') draft.tags = value.split(',').map((t) => t.trim()).filter(Boolean);
    else if (key === 'field') {
      const eq = value.indexOf('=');
      if (eq > -1) draft.fields.push({ name: value.slice(0, eq).trim(), value: value.slice(eq + 1).trim() });
    }
    i++;
  }
  const rest = lines.slice(i).join('\n').trim();
  if (draft.title) {
    draft.body = rest;
  } else {
    const restLines = rest.split('\n');
    draft.title = (restLines[0] ?? '').trim();
    draft.body = restLines.slice(1).join('\n').trim();
  }
  return draft;
}

/** Splits on any line that's just three-or-more dashes, however it's
 *  padded — at the start, middle, or end of the paste — then parses each
 *  surviving block. One block with no delimiter at all is one entry. */
export function parseImportText(text) {
  return text
    .split(/^[ \t]*-{3,}[ \t]*$/m)
    .map((b) => b.trim())
    .filter(Boolean)
    .map(parseImportBlock);
}
