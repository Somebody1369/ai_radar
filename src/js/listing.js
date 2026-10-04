// List state <-> URL <-> FreeSerp params. Shared so the prerendered first page matches the client.
import { PAGE_SIZE, DEEP_SCAN_SIZE, MAX_WINDOW, TLDS, BUILDERS, ALL_CATEGORIES } from './config.js';

export const SORTS = {
  relevance: { sort: 'relevance' },
  new: { sort: 'went_live', order: 'desc' },
  dr: { sort: 'dr', order: 'desc' },
};

const PRICING = ['hasfree', 'free', 'freemium', 'trial', 'paid'];
const ACCESS = ['noauth', 'account', 'waitlist'];
const DATE = /^\d{4}-\d{2}-\d{2}$/;
export const MAX_PAGE = Math.floor((MAX_WINDOW - PAGE_SIZE) / PAGE_SIZE) + 1;

const int = (v, min, max) => {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : undefined;
};

// Only known keys with valid values survive, so arbitrary URLs cannot produce odd API calls.
export function readState(sp) {
  const g = (k) => (sp.get(k) || '').trim();
  const s = {};
  if (g('q')) s.q = g('q').slice(0, 100);
  // 'all' clears a page's preset niche (e.g. a task page widened to every niche).
  if (g('cat') === 'all' || ALL_CATEGORIES.includes(g('cat'))) s.cat = g('cat');
  if (BUILDERS.includes(g('builder'))) s.builder = g('builder');
  if (TLDS.includes(g('tld'))) s.tld = g('tld');
  const drMin = int(g('dr_min'), 0, 100); if (drMin) s.dr_min = drMin;
  const drMax = int(g('dr_max'), 0, 100); if (drMax !== undefined && g('dr_max') !== '' && drMax < 100) s.dr_max = drMax;
  if (DATE.test(g('from'))) s.from = g('from');
  if (DATE.test(g('to'))) s.to = g('to');
  // Reversed ranges would always return nothing: swap them instead.
  if (s.dr_min !== undefined && s.dr_max !== undefined && s.dr_min > s.dr_max) [s.dr_min, s.dr_max] = [s.dr_max, s.dr_min];
  if (s.from && s.to && s.from > s.to) [s.from, s.to] = [s.to, s.from];
  if (PRICING.includes(g('pricing'))) s.pricing = g('pricing');
  if (ACCESS.includes(g('access'))) s.access = g('access');
  if (g('api') === '1') s.api = true;
  if (g('oss') === '1') s.oss = true;
  if (SORTS[g('sort')]) s.sort = g('sort');
  const page = int(g('page'), 1, MAX_PAGE); if (page > 1) s.page = page;
  return s;
}

export function writeState(s) {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(s)) {
    if (v === undefined || v === '' || v === false) continue;
    sp.set(k, v === true ? '1' : String(v));
  }
  return sp.toString();
}

export const isDeep = (s) => Boolean(s.pricing || s.access || s.api || s.oss);

// A niche-based task switched to "all niches" searches AI startups by the task's keyword instead.
const widened = (cfg, s) => s.cat === 'all' && Boolean(cfg.widenQ) && !cfg.preset.q;
// "Relevance" only means something when there is a text query (preset, widening keyword or the user's).
export const hasQuery = (cfg, s) => Boolean(cfg.preset.q || s.q || widened(cfg, s));
// A typed query (or a widened task) defaults to relevance; otherwise each page keeps its own order.
export const defaultSort = (cfg, s) => (s.q || widened(cfg, s) ? 'relevance' : cfg.sort);
export function effectiveSort(cfg, s) {
  const sort = s.sort || defaultSort(cfg, s);
  return sort === 'relevance' && !hasQuery(cfg, s) ? 'dr' : sort;
}

// `nudge: false` gives the same request without the hint words, so the deep scan can merge both.
export function toApiParams(cfg, s, { nudge = true } = {}) {
  const p = { ...cfg.preset };
  const deep = isDeep(s);
  const words = [cfg.preset.q, widened(cfg, s) && cfg.widenQ, s.q];
  // Nudge the text search towards pages that can actually satisfy the heuristic filter.
  if (nudge && deep && ['hasfree', 'free'].includes(s.pricing)) words.push('free');
  if (nudge && deep && s.access === 'noauth') words.push('no sign up');
  const q = words.filter(Boolean).join(' ').trim();
  if (q) p.q = q; else delete p.q;

  if (s.cat === 'all') {
    delete p.ai_categories;
    // A task widened to every niche must stay inside the AI part of the index, not all 17M sites.
    if (cfg.preset.ai_categories && !p.ai_startups && !p.category) p.ai_startups = 1;
  } else if (s.cat) {
    p.ai_categories = s.cat;
    // A specific niche is a stronger filter than ai_startups, which drops media niches.
    delete p.ai_startups;
  }
  if (s.builder === 'ai') p.ai = 1;
  else if (s.builder) p.ai_source = s.builder;
  if (s.tld) p.tld = s.tld;
  if (s.dr_min) p.dr_min = s.dr_min;
  if (s.dr_max !== undefined) p.dr_max = s.dr_max;
  if (s.from) p.from_date = s.from;
  if (s.to) p.to_date = s.to;

  Object.assign(p, SORTS[effectiveSort(cfg, s)] || SORTS.dr);
  if (deep) { p.size = DEEP_SCAN_SIZE; p.from = 0; }
  else { p.size = PAGE_SIZE; p.from = ((s.page || 1) - 1) * PAGE_SIZE; }
  return p;
}

export const pageCount = (total) => Math.min(Math.ceil(total / PAGE_SIZE), MAX_PAGE);
