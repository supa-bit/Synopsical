// Pure parsing logic for the Import screen — no DOM, no app state, nothing
// but text in and drafts out. Pulled out of app.js into its own ES module
// specifically so it can be unit-tested directly (see tests/import-parser.test.mjs)
// without booting the whole app, and imported back into app.js the same way
// (`<script type="module" src="app.js">` in index.html makes `import` valid
// there — see README's "Before pushing" section for why this file exists).

export const IMPORT_HEADER_RE = /^(Title|Category|Subcategory|Tags|Summary|Source|Field|Link)\s*:\s*(.*)$/i;

/**
 * One block of pasted text -> one draft entry. Recognized header lines
 * only count while contiguous from the very start of the block; the
 * first line that doesn't match ends the header, and everything after it
 * becomes the body untouched. A block with no recognized header at all
 * still gets a title — taken from its own first line (stripping a leading
 * Markdown `# ` heading marker if present), since guessing a category from
 * prose isn't honest, so that's left blank for the preview screen to flag
 * instead of inventing one.
 */
export function parseImportBlock(block) {
  const lines = block.split('\n');
  const draft = {
    title: '', category: '', subcategory: '', tags: [], summary: '', source: '', fields: [], links: [], body: '',
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
    } else if (key === 'link') {
      const pipe = value.indexOf('|');
      const targetTitle = (pipe > -1 ? value.slice(0, pipe) : value).trim();
      const relation = pipe > -1 ? value.slice(pipe + 1).trim() : '';
      if (targetTitle) draft.links.push({ targetTitle, relation });
    }
    i++;
  }
  const rest = lines.slice(i).join('\n').trim();
  if (draft.title) {
    draft.body = rest;
  } else {
    const restLines = rest.split('\n');
    const firstLine = (restLines[0] ?? '').trim().replace(/^#{1,6}\s+/, '');
    draft.title = firstLine;
    draft.body = restLines.slice(1).join('\n').trim();
  }
  return draft;
}

/**
 * Parses a JSON backup produced by "Export everything" (`format: "synopsical-export"`)
 * back into importable draft entries, preserving fields, tags, faceplate colors,
 * and cross-references between entries in the bundle. Returns null if the input
 * is not a valid Synopsical export bundle.
 */
export function parseExportBundle(jsonText) {
  let parsed;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.entries)) return null;

  const fieldsByEntry = new Map();
  for (const f of parsed.entry_fields ?? []) {
    if (!f?.entry_id || !f?.field_name) continue;
    if (!fieldsByEntry.has(f.entry_id)) fieldsByEntry.set(f.entry_id, []);
    fieldsByEntry.get(f.entry_id).push(f);
  }
  for (const list of fieldsByEntry.values()) {
    list.sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  }

  const tagsByEntry = new Map();
  for (const t of parsed.tags ?? []) {
    if (!t?.entry_id || !t?.tag) continue;
    if (!tagsByEntry.has(t.entry_id)) tagsByEntry.set(t.entry_id, []);
    tagsByEntry.get(t.entry_id).push(String(t.tag).trim());
  }

  const titleById = new Map();
  for (const e of parsed.entries) {
    if (e?.id && e?.title) titleById.set(e.id, String(e.title).trim());
  }

  const linksByFrom = new Map();
  for (const l of parsed.links ?? []) {
    if (!l?.from_entry_id || !l?.to_entry_id) continue;
    const targetTitle = titleById.get(l.to_entry_id);
    if (!targetTitle) continue;
    if (!linksByFrom.has(l.from_entry_id)) linksByFrom.set(l.from_entry_id, []);
    linksByFrom.get(l.from_entry_id).push({
      targetId: l.to_entry_id,
      targetTitle,
      relation: l.relation ? String(l.relation).trim() : '',
    });
  }

  return parsed.entries
    .filter((e) => e && typeof e === 'object' && (e.title || e.body))
    .map((e) => ({
      _originalId: e.id ?? null,
      title: String(e.title ?? '').trim(),
      category: String(e.category ?? '').trim(),
      subcategory: e.subcategory ? String(e.subcategory).trim() : '',
      summary: e.summary ? String(e.summary).trim() : '',
      body: e.body ? String(e.body).trim() : '',
      source: e.source ? String(e.source).trim() : '',
      fp: {
        type: e.faceplate_type === 'image' ? 'image' : 'text',
        text: e.faceplate_text ?? '',
        bg: e.faceplate_bg ?? '#eef1f4',
        color: e.faceplate_color ?? '#0a29fa',
        font: e.faceplate_font ?? 'default',
        image: e.faceplate_image ?? null,
      },
      fields: (fieldsByEntry.get(e.id) ?? []).map((f) => ({
        name: String(f.field_name).trim(),
        value: String(f.field_value ?? ''),
      })),
      tags: [...new Set((tagsByEntry.get(e.id) ?? []).filter(Boolean))],
      links: linksByFrom.get(e.id) ?? [],
      _include: true,
    }));
}

/** Splits on any line that's just three-or-more dashes, however it's
 *  padded — at the start, middle, or end of the paste — then parses each
 *  surviving block. One block with no delimiter at all is one entry.
 *  If the input is a JSON export bundle (`synopsical-export`), delegates
 *  to parseExportBundle() automatically. */
export function parseImportText(text) {
  const trimmed = text.trim();
  if (!trimmed) return [];
  if (trimmed.startsWith('{')) {
    const bundleDrafts = parseExportBundle(trimmed);
    if (bundleDrafts) return bundleDrafts;
  }
  return text
    .split(/^[ \t]*-{3,}[ \t]*$/m)
    .map((b) => b.trim())
    .filter(Boolean)
    .map(parseImportBlock);
}
