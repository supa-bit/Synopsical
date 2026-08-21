#!/usr/bin/env node
// Synopsical pre-push safety net — deliberately zero runtime dependencies
// (package.json exists only to mark app.js/newsletter.js as ES modules for
// Node, same as <script type="module"> does for the browser — nothing is
// `npm install`ed, nothing is bundled into what ships). Catches the class
// of bug this codebase can actually have given it's plain static HTML/CSS/JS
// with no bundler and no type checker: a JS syntax error, a `$('some-id')`
// referencing an element that doesn't (or no longer) exist in the HTML, an
// `import` pointing at a module file that isn't there, a <script>/<link>
// tag pointing at a file that isn't there, or a duplicate id.
//
// Run directly:   node scripts/check.mjs   (or: npm run check)
// Wired into .githooks/pre-push so `git push` runs it automatically —
// see README for the one-time `git config core.hooksPath .githooks`.
// Also runs in GitHub Actions on every push — .github/workflows/check.yml.
//
// This is structural checking only (does it wire up correctly). Behavioral
// correctness of the pure logic pulled into lib/*.mjs is covered separately
// by tests/*.test.mjs (`npm test`) — the pre-push hook and CI run both.

import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname, relative, posix } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const HTML_FILES = ['index.html', 'info.html', 'pricing.html', 'privacy.html'];
const LIB_FILES = existsSync(join(ROOT, 'lib'))
  ? readdirSync(join(ROOT, 'lib')).filter((f) => f.endsWith('.mjs')).map((f) => `lib/${f}`)
  : [];
const JS_FILES = ['app.js', 'newsletter.js', 'homepage.js', 'config.js', ...LIB_FILES];

let failures = 0;
const fail = (msg) => { console.log(`  ✗ ${msg}`); failures++; };
const ok = (msg) => console.log(`  ✓ ${msg}`);

function section(title) { console.log(`\n${title}`); }

// ── 1. JS syntax ──────────────────────────────────────────────────────
section('JS syntax (node --check)');
for (const f of JS_FILES) {
  const path = join(ROOT, f);
  if (!existsSync(path)) { fail(`${f} — file listed in JS_FILES but missing`); continue; }
  try {
    execFileSync(process.execPath, ['--check', path], { stdio: 'pipe' });
    ok(f);
  } catch (err) {
    fail(`${f} — syntax error:\n${err.stderr?.toString().trim().split('\n').map((l) => '      ' + l).join('\n')}`);
  }
}

// ── 2. Collect ids actually declared in the HTML ────────────────────────
section('HTML id references from JS ($(...) / getElementById(...))');

const htmlIds = new Map(); // id -> [files it appears in]
for (const f of HTML_FILES) {
  const path = join(ROOT, f);
  if (!existsSync(path)) continue;
  const html = readFileSync(path, 'utf8');
  const seenInThisFile = new Set();
  for (const m of html.matchAll(/\bid=["']([^"']+)["']/g)) {
    const id = m[1];
    if (seenInThisFile.has(id)) fail(`${f} — duplicate id="${id}"`);
    seenInThisFile.add(id);
    if (!htmlIds.has(id)) htmlIds.set(id, []);
    htmlIds.get(id).push(f);
  }
}

// ids the JS creates itself at runtime (el({id: '...'}) or node.id = '...')
// rather than expecting them to already be in the HTML — exempt from the
// "must exist in HTML" check below.
const jsCreatedIds = new Set();
for (const f of JS_FILES) {
  const path = join(ROOT, f);
  if (!existsSync(path)) continue;
  const js = readFileSync(path, 'utf8');
  for (const m of js.matchAll(/\bid:\s*'([^']+)'/g)) jsCreatedIds.add(m[1]);
  for (const m of js.matchAll(/\.id\s*=\s*'([^']+)'/g)) jsCreatedIds.add(m[1]);
}

let checkedCount = 0;
for (const f of JS_FILES) {
  const path = join(ROOT, f);
  if (!existsSync(path)) continue;
  const js = readFileSync(path, 'utf8');
  const refs = new Set();
  for (const m of js.matchAll(/\$\('([^']+)'\)/g)) refs.add(m[1]);
  for (const m of js.matchAll(/getElementById\('([^']+)'\)/g)) refs.add(m[1]);
  for (const id of refs) {
    checkedCount++;
    if (!htmlIds.has(id) && !jsCreatedIds.has(id)) {
      fail(`${f} references $('${id}') / getElementById('${id}') — no id="${id}" in any of ${HTML_FILES.join(', ')}, and it's not created dynamically in JS either`);
    }
  }
}
if (failures === 0) ok(`${checkedCount} id reference(s) across ${JS_FILES.filter((f) => existsSync(join(ROOT, f))).length} JS files all resolve`);

// ── 3. Local <script src>/<link href> targets actually exist ───────────
section('Local <script src> / <link href> targets exist on disk');
let assetChecks = 0;
for (const f of HTML_FILES) {
  const path = join(ROOT, f);
  if (!existsSync(path)) continue;
  const html = readFileSync(path, 'utf8');
  const refs = [
    ...html.matchAll(/<script[^>]+src=["']([^"']+)["']/g),
    ...html.matchAll(/<link[^>]+href=["']([^"']+)["']/g),
  ].map((m) => m[1]);
  for (const ref of refs) {
    if (/^https?:\/\//.test(ref)) continue; // remote (CDN, Google Fonts) — not ours to check
    assetChecks++;
    if (!existsSync(join(ROOT, ref))) fail(`${f} references "${ref}" — file not found in repo`);
  }
}
if (failures === 0) ok(`${assetChecks} local asset reference(s) all exist`);

// ── 4. import '...' targets in JS files resolve to a real file ─────────
section("JS import statements resolve to a real file");
let importChecks = 0;
for (const f of JS_FILES) {
  const path = join(ROOT, f);
  if (!existsSync(path)) continue;
  const js = readFileSync(path, 'utf8');
  for (const m of js.matchAll(/^\s*import\s+(?:.+?\s+from\s+)?['"](\.[^'"]+)['"]/gm)) {
    const spec = m[1];
    importChecks++;
    const resolved = join(dirname(path), spec);
    if (!existsSync(resolved)) {
      fail(`${f} — import "${spec}" does not resolve to a real file (looked for ${posix.join(dirname(relative(ROOT, path)), spec)})`);
    }
  }
}
if (failures === 0) ok(`${importChecks} import statement(s) all resolve`);

// ── Summary ──────────────────────────────────────────────────────────
console.log();
if (failures > 0) {
  console.log(`FAILED — ${failures} issue(s) found. Fix before pushing.`);
  process.exit(1);
} else {
  console.log('All checks passed.');
  process.exit(0);
}
