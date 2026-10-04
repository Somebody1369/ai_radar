// Thin FreeSerp client shared by the browser and the build script.
import { API_BASE, API_PROXY, API_IDENTITY, BLOCKLIST, SAFETY_TOOL, ADULT_MAKER, NOT_A_PRODUCT, CONTENT_MAX } from './config.js';
import { classify, lookalike } from './classify.js';

// Optional cache injected by the environment: { get(key), set(key, value) }. It keeps what the
// functions below return (page text already classified and dropped), not raw API responses, so a
// 100-result deep scan is ~100 KB instead of ~450 KB.
let cache = null;
export const setCache = (c) => { cache = c; };
// Part of every key: bump it when the cached shape changes, so old entries are never read back.
const CACHE_VERSION = 'v3';

export class ApiError extends Error {
  constructor(message, status = 0) {
    super(message);
    this.status = status;
  }
}

export function buildUrl(params) {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...params, ...API_IDENTITY })) {
    if (v !== undefined && v !== null && v !== '') sp.set(k, String(v));
  }
  return `${typeof window === 'undefined' ? API_BASE : API_PROXY}?${sp}`;
}

async function getJson(params, { signal, retries = 1 } = {}) {
  const url = buildUrl(params);
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, { signal });
      // Bad params never error per the docs, but malformed ones (e.g. arrays) return non-JSON.
      const data = await res.json().catch(() => null);
      if (!res.ok || !data || data.ok === false) throw new ApiError(data?.error || `HTTP ${res.status}`, res.status);
      return data;
    } catch (e) {
      if (e.name === 'AbortError') throw e;
      lastErr = e;
      if (e.status >= 400 && e.status < 500) break; // bad params or rate limited: a retry only repeats it
      if (attempt < retries) await new Promise((r) => setTimeout(r, 600));
    }
  }
  throw lastErr instanceof ApiError ? lastErr : new ApiError(lastErr?.message || 'network');
}

// Cached by request URL. Values are wrapped, so a cached "not found" (null) is still a hit.
async function cached(params, opts, build) {
  const key = `${CACHE_VERSION} ${buildUrl(params)}`;
  const hit = cache && (await cache.get(key));
  if (hit && 'value' in hit) return hit.value;
  const value = build(await getJson(params, opts));
  if (cache) await cache.set(key, { value });
  return value;
}

// Text-only on purpose: the API's category=betting/casino has false positives (e.g. favicon.io).
// Moderation and child-safety tools mention the same words and stay (config.SAFETY_TOOL).
export function isBlocked(s) {
  const text = `${s.domain} ${s.title || ''} ${s.ai_summary || ''}`;
  return BLOCKLIST.test(text) && !(SAFETY_TOOL.test(s.ai_summary || '') && !ADULT_MAKER.test(text));
}
// Not a tool (agency, portfolio, empty or template page): left out of lists, still found by lookup().
export function isNoise(s) {
  const summary = s.ai_summary || '';
  if (!s.title && !summary) return true;
  if (NOT_A_PRODUCT.title.test((s.title || '').trim())) return true;
  return NOT_A_PRODUCT.agency.test(summary) || (NOT_A_PRODUCT.personal.test(summary) && !NOT_A_PRODUCT.builder.test(summary));
}

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
    lookalike: lookalike(r.domain, `${r.title || ''} ${r.ai_summary || ''}`),
    // The proxy classifies the page text itself and sends only the verdict (netlify/functions/fs.mjs);
    // the build calls the API directly and classifies here.
    meta: r.radar || classify(r),
  };
}

export function search(params, opts) {
  return cached({ content: 1, content_max: CONTENT_MAX, ...params }, opts, (data) => {
    const raw = data.results || [];
    const hide = (r) => isBlocked(r) || isNoise(r);
    // Hidden domains, not a count: the deep scan merges two answers and must not count a site twice.
    return { total: data.total || 0, results: raw.filter((r) => !hide(r)).map(normalize), hidden: raw.filter(hide).map((r) => r.domain) };
  });
}

// There is no "get by domain" endpoint: search the domain itself and confirm the first hit.
export function lookup(domain, opts) {
  const d = domain.toLowerCase().trim();
  return cached({ q: d, all: 1, size: 1, content: 1, content_max: CONTENT_MAX }, opts, (data) => {
    const r = data.results?.[0];
    return !r || r.domain !== d || isBlocked(r) ? null : normalize(r);
  });
}

// Autocomplete: no page text, just enough to render a suggestion row.
export function suggest(q, preset = {}, opts) {
  return cached({ ...preset, q, size: 8 }, { ...opts, retries: 0 }, (data) => (data.results || [])
    .filter((r) => !isBlocked(r)).slice(0, 6)
    .map((r) => ({ domain: r.domain, title: r.title || r.domain, dr: typeof r.dr === 'number' ? r.dr : null })));
}

export const stats = (opts) => cached({ stats: 1 }, opts, (data) => data);
