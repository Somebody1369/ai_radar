// Same-origin proxy to FreeSerp. A plain Netlify rewrite forwarded any query (index=web, size=100,
// someone else's agent…), so anyone could use this site's domain as an open FreeSerp relay.
// Here only the parameters the UI sends get through, values are checked, and the identity is ours.
// scripts/serve.mjs runs this same handler locally.
import { API_BASE, API_IDENTITY } from '../../src/js/config.js';

const flag = /^1$/;
const intIn = (min, max) => (v) => /^\d{1,5}$/.test(v) && +v >= min && +v <= max;
const ALLOWED = {
  q: (v) => v.length <= 200,
  ai_startups: flag,
  ai: flag,
  all: flag,
  content: flag,
  stats: flag,
  category: /^ai$/,
  ai_categories: (v) => v.length <= 60,
  ai_source: /^[a-z0-9_]{1,20}$/,
  tld: /^[a-z]{2,12}$/,
  dr_min: intIn(0, 100),
  dr_max: intIn(0, 100),
  from_date: /^\d{4}-\d{2}-\d{2}$/,
  to_date: /^\d{4}-\d{2}-\d{2}$/,
  sort: /^(relevance|dr|went_live)$/,
  order: /^(asc|desc)$/,
  size: intIn(1, 100),
  from: intIn(0, 10000),
  content_max: intIn(1, 4000),
};

const json = (status, body, extra = {}) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', ...extra } });

export default async function handler(req) {
  if (req.method !== 'GET') return json(405, { ok: false, error: 'method' }, { Allow: 'GET' });
  const out = new URLSearchParams();
  for (const [k, v] of new URL(req.url).searchParams) {
    const check = ALLOWED[k];
    if (!check) continue; // unknown keys (index, agent, project…) are dropped, not forwarded
    if (!(typeof check === 'function' ? check(v) : check.test(v))) return json(400, { ok: false, error: `bad ${k}` });
    out.set(k, v);
  }
  for (const [k, v] of Object.entries(API_IDENTITY)) out.set(k, v);

  try {
    const up = await fetch(`${API_BASE}?${out}`, { signal: AbortSignal.timeout(15000) });
    // FreeSerp itself caches for 30 s; a short shared cache keeps repeated filter clicks off the API.
    // Errors are never cached, so a FreeSerp hiccup does not stick for five minutes.
    const cache = up.ok
      ? { 'Cache-Control': 'public, max-age=300', 'Netlify-CDN-Cache-Control': 'public, max-age=300, stale-while-revalidate=600', 'Netlify-Vary': 'query' }
      : { 'Cache-Control': 'no-store' };
    return new Response(await up.arrayBuffer(), {
      status: up.status,
      headers: { 'Content-Type': up.headers.get('content-type') || 'application/json', ...cache },
    });
  } catch {
    return json(502, { ok: false, error: 'proxy' });
  }
}

export const config = { path: '/api/fs' };
