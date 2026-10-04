// Tiny static server for local preview that mimics the Netlify rules from netlify.toml.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIST = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../dist');
const PORT = Number(process.env.PORT) || 8080;
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.xml': 'application/xml', '.txt': 'text/plain', '.json': 'application/json' };

async function file(p) {
  try { const s = await stat(p); return s.isDirectory() ? file(path.join(p, 'index.html')) : p; } catch { return null; }
}

createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x');
  if (u.pathname === '/api/fs') {
    // Mirrors the Netlify proxy rule for /api/fs.
    try {
      const up = await fetch(`https://freeserp.ai/api.php${u.search}`);
      res.writeHead(up.status, { 'Content-Type': up.headers.get('content-type') || 'application/json' });
      res.end(Buffer.from(await up.arrayBuffer()));
    } catch {
      res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end('{"ok":false,"error":"proxy"}');
    }
    return;
  }
  const url = decodeURIComponent(u.pathname);
  const target = path.join(DIST, path.normalize(url).replace(/^(\.\.[/\\])+/, ''));
  let found = await file(target);
  let status = 200;
  if (!found && /^\/(en\/)?site\/[^/]+/.test(url)) found = path.join(DIST, url.startsWith('/en/') ? 'en/site/index.html' : 'site/index.html');
  if (!found) { status = 404; found = path.join(DIST, url.startsWith('/en/') ? 'en/404.html' : '404.html'); }
  res.writeHead(status, { 'Content-Type': TYPES[path.extname(found)] || 'application/octet-stream' });
  res.end(await readFile(found));
}).listen(PORT, () => console.log(`AI Radar → http://localhost:${PORT}`));
