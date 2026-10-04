// Thin FreeSerp client shared by the browser and the build script.
import { API_BASE, API_PROXY, API_IDENTITY, BLOCKLIST, CONTENT_MAX } from './config.js';
import { classify } from './classify.js';

// Optional cache injected by the environment: { get(url), set(url, data) }.
let cache = null;
export const setCache = (c) => { cache = c; };

export class ApiError extends Error {}

export function buildUrl(params) {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...params, ...API_IDENTITY })) {
    if (v !== undefined && v !== null && v !== '') sp.set(k, String(v));
  }
  return `${typeof window === 'undefined' ? API_BASE : API_PROXY}?${sp}`;
}

async function getJson(params, { signal, retries = 1 } = {}) {
  const url = buildUrl(params);
  const hit = cache && (await cache.get(url));
  if (hit) return hit;
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, { signal });
      // Bad params never error per the docs, but malformed ones (e.g. arrays) return non-JSON.
      const data = await res.json().catch(() => null);
      if (!res.ok || !data || data.ok === false) throw new ApiError(data?.error || `HTTP ${res.status}`);
      if (cache) await cache.set(url, data);
      return data;
    } catch (e) {
      if (e.name === 'AbortError') throw e;
      lastErr = e;
      if (attempt < retries) await new Promise((r) => setTimeout(r, 600));
    }
  }
  throw lastErr instanceof ApiError ? lastErr : new ApiError(lastErr?.message || 'network');
}

// Text-only on purpose: the API's category=betting/casino has false positives (e.g. favicon.io).
export const isBlocked = (s) => BLOCKLIST.test(`${s.domain} ${s.title || ''} ${s.ai_summary || ''}`);

// Keep only what the UI needs; the page text is used for classification and then dropped.
export function normalize(r) {
  const categories = Array.isArray(r.ai_categories) ? r.ai_categories : r.ai_categories ? [r.ai_categories] : [];
  return {
    domain: r.domain,
    url: r.url || `https://${r.domain}`,
    title: r.title || r.domain,
    summary: r.ai_summary || '',
    categories,
    // Lookups use all=1 and can return any site (google.com): only call it an AI service when the API does.
    isAi: r.category === 'ai' || categories.length > 0,
    source: r.ai_source || null,
    dr: typeof r.dr === 'number' ? r.dr : null,
    wentLive: r.went_live || null,
    firstSeen: r.first_seen || null,
    tld: r.tld || null,
    server: r.webserver || null,
    meta: classify(r),
  };
}

export async function search(params, opts) {
  const data = await getJson({ content: 1, content_max: CONTENT_MAX, ...params }, opts);
  const raw = data.results || [];
  const results = raw.filter((r) => !isBlocked(r)).map(normalize);
  return { total: data.total || 0, results, hidden: raw.length - results.length };
}

// There is no "get by domain" endpoint: search the domain itself and confirm the first hit.
export async function lookup(domain, opts) {
  const d = domain.toLowerCase().trim();
  const data = await getJson({ q: d, all: 1, size: 1, content: 1, content_max: CONTENT_MAX }, opts);
  const r = data.results?.[0];
  if (!r || r.domain !== d || isBlocked(r)) return null;
  return normalize(r);
}

// Autocomplete: no page text, just enough to render a suggestion row.
export async function suggest(q, preset = {}, opts) {
  const data = await getJson({ ...preset, q, size: 8 }, { ...opts, retries: 0 });
  return (data.results || []).filter((r) => !isBlocked(r)).slice(0, 6)
    .map((r) => ({ domain: r.domain, title: r.title || r.domain, dr: typeof r.dr === 'number' ? r.dr : null }));
}

export const stats = (opts) => getJson({ stats: 1 }, opts);
