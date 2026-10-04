// Same-origin proxy to FreeSerp. A plain Netlify rewrite forwarded any query (index=web, size=100,
// someone else's agent…), so anyone could use this site's domain as an open FreeSerp relay.
// Here only the parameters the UI sends get through, values are checked, the identity is ours and
// the answer is always JSON. scripts/serve.mjs runs this same handler locally.
import { API_BASE, API_IDENTITY, isDate } from '../../src/js/config.js';
import { classify } from '../../src/js/classify.js';

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
  // Impossible dates (2026-02-31) make FreeSerp answer 502.
  from_date: isDate,
  to_date: isDate,
  sort: /^(relevance|dr|went_live)$/,
  order: /^(asc|desc)$/,
  size: intIn(1, 100),
  from: intIn(0, 10000),
  content_max: intIn(1, 4000),
};

// Whatever FreeSerp sends (e.g. its Cloudflare HTML error page), the browser gets JSON that cannot
// render as a page on this origin. Function responses do not get the CSP from netlify.toml.
const SAFE = {
  'Content-Type': 'application/json; charset=utf-8',
  'X-Content-Type-Options': 'nosniff',
  'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
};
const json = (status, body, extra = {}) => new Response(JSON.stringify(body), { status, headers: { ...SAFE, 'Cache-Control': 'no-store', ...extra } });

export default async function handler(req) {
  try {
    if (req.method !== 'GET') return json(405, { ok: false, error: 'method' }, { Allow: 'GET' });
    const out = new URLSearchParams();
    for (const [k, v] of new URL(req.url).searchParams) {
      // Own keys only: `__proto__`, `constructor`, `toString`… are not parameters.
      if (!Object.hasOwn(ALLOWED, k)) continue; // unknown keys (index, agent, project…) are dropped, not forwarded
      const check = ALLOWED[k];
      if (!(typeof check === 'function' ? check(v) : check.test(v))) return json(400, { ok: false, error: `bad ${k}` });
      out.set(k, v);
    }
    for (const [k, v] of Object.entries(API_IDENTITY)) out.set(k, v);

    const up = await fetch(`${API_BASE}?${out}`, { signal: AbortSignal.timeout(15000) });
    const text = await up.text();
    let data = null;
    try { data = JSON.parse(text); } catch { /* an HTML error page, an empty body… */ }
    // Only a real answer is passed on and cached: a FreeSerp hiccup must not stick in the CDN.
    if (!up.ok || !data || data.ok === false) {
      return json(up.status === 429 ? 429 : 502, { ok: false, error: data?.error || `upstream ${up.status}` });
    }
    // Page text (content=1) only feeds the pricing/access heuristic: classify it here with the same
    // module the build uses and send the verdict instead. A 100-result scan is ~90 KB instead of
    // ~450 KB, and the proxy never relays raw page text, the costliest thing to abuse it for.
    for (const r of Array.isArray(data.results) ? data.results : []) {
      if (r && typeof r.content === 'string') { r.radar = classify(r); delete r.content; }
    }
    // FreeSerp itself caches for 30 s; a short shared cache keeps repeated filter clicks off the API.
    return new Response(JSON.stringify(data), {
      status: 200,
      headers: { ...SAFE, 'Cache-Control': 'public, max-age=300', 'Netlify-CDN-Cache-Control': 'public, max-age=300, stale-while-revalidate=600', 'Netlify-Vary': 'query' },
    });
  } catch {
    return json(502, { ok: false, error: 'proxy' });
  }
}

// Enforced by Netlify at the edge (all plans; scripts/serve.mjs ignores it). A visitor browsing makes
// a few requests a minute; a script hammering the proxy gets 429 before it reaches FreeSerp or uses
// up the site's function quota.
export const config = {
  path: '/api/fs',
  rateLimit: { windowLimit: 60, windowSize: 60, aggregateBy: ['ip', 'domain'] },
};
