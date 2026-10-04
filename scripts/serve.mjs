// Tiny static server for local preview that mimics netlify.toml: the /api/fs function, the site-page
// shells, 404 pages and the response headers (read from netlify.toml so they cannot drift apart).
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import proxy from '../netlify/functions/fs.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');
const PORT = Number(process.env.PORT) || 8080;
// Loopback only: a dev server (with a working API proxy) should not be reachable from the LAN.
const HOST = process.env.HOST || '127.0.0.1';
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.xml': 'application/xml', '.txt': 'text/plain', '.json': 'application/json' };

// Just enough TOML for the [[headers]] blocks: `for = "/x/*"` plus `Key = "value"` lines.
function headerRules(toml) {
  const rules = [];
  let cur = null;
  for (const line of toml.split('\n').map((l) => l.trim())) {
    if (line === '[[headers]]') { cur = { prefix: '', values: {} }; rules.push(cur); continue; }
    if (line.startsWith('[[')) { cur = null; continue; }
    const m = cur && line.match(/^([\w-]+)\s*=\s*"(.*)"$/);
    if (!m) continue;
    if (m[1] === 'for') cur.prefix = m[2].replace(/\*$/, '');
    else cur.values[m[1]] = m[2];
  }
  return rules;
}
const RULES = headerRules(await readFile(path.join(ROOT, 'netlify.toml'), 'utf8'));
const headersFor = (p) => Object.assign({}, ...RULES.filter((r) => p.startsWith(r.prefix)).map((r) => r.values));

async function file(p) {
  try { const s = await stat(p); return s.isDirectory() ? file(path.join(p, 'index.html')) : p; } catch { return null; }
}

createServer(async (req, res) => {
  try {
    const u = new URL(req.url, 'http://localhost');
    if (u.pathname === '/api/fs') {
      const r = await proxy(new Request(u, { method: req.method }));
      res.writeHead(r.status, Object.fromEntries(r.headers));
      res.end(Buffer.from(await r.arrayBuffer()));
      return;
    }
    let url;
    try { url = decodeURIComponent(u.pathname); } catch { res.writeHead(400, { 'Content-Type': 'text/plain' }); res.end('Bad request'); return; }
    const target = path.join(DIST, path.normalize(url).replace(/^(\.\.[/\\])+/, ''));
    let found = await file(target);
    let status = 200;
    if (!found && /^\/(en\/)?site\/[^/]+/.test(url)) found = path.join(DIST, url.startsWith('/en/') ? 'en/site/index.html' : 'site/index.html');
    if (!found) { status = 404; found = path.join(DIST, url.startsWith('/en/') ? 'en/404.html' : '404.html'); }
    const body = await readFile(found);
    res.writeHead(status, { ...headersFor(u.pathname), 'Content-Type': TYPES[path.extname(found)] || 'application/octet-stream' });
    res.end(body);
  } catch (e) {
    // One bad request must never take the server down.
    console.error(e);
    if (!res.headersSent) res.writeHead(500, { 'Content-Type': 'text/plain' });
    res.end('Server error');
  }
}).listen(PORT, HOST, () => console.log(`AI Radar → http://localhost:${PORT}`));
