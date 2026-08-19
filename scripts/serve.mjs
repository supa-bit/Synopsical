#!/usr/bin/env node
// Tiny zero-dependency static file server for local testing.
//
// Why this exists: app.js/newsletter.js are now `<script type="module">`
// (see the "Testing" section of README.md — that's what lets app.js
// `import` lib/import-parser.mjs). Browsers block ES module imports from
// a file:// URL with a CORS error -- double-clicking index.html (or
// opening it directly) will show a blank/broken app, even though the same
// file works fine once GitHub Pages serves it over https://. Classic
// <script src> tags never had this restriction, which is why this problem
// didn't exist before today. Serving over plain http://, even from
// localhost, sidesteps it entirely.
//
// Run:   node scripts/serve.mjs   (or: npm start)
// Then open the printed http://localhost:PORT URL — not the file:// path.

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname, normalize } from 'node:path';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT) || 8080;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.sql': 'text/plain; charset=utf-8',
};

const server = createServer(async (req, res) => {
  try {
    const urlPath = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    let rel = urlPath === '/' ? '/index.html' : urlPath;
    const filePath = normalize(join(ROOT, rel));

    // Refuse to serve anything outside the project root (blocks ../../ traversal).
    if (!filePath.startsWith(ROOT)) { res.writeHead(403); res.end('Forbidden'); return; }

    const st = await stat(filePath).catch(() => null);
    if (!st || !st.isFile()) { res.writeHead(404); res.end('Not found: ' + rel); return; }

    const body = await readFile(filePath);
    res.writeHead(200, { 'Content-Type': MIME[extname(filePath)] || 'application/octet-stream' });
    res.end(body);
  } catch (err) {
    res.writeHead(500);
    res.end('Server error: ' + err.message);
  }
});

server.listen(PORT, () => {
  console.log(`Serving ${ROOT} at http://localhost:${PORT}/`);
  console.log('(Open that URL, not the file:// path -- app.js is a module and needs a real origin.)');
});
