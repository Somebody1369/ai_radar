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

export function toApiParams(cfg, s) {
  const p = { ...cfg.preset };
  const deep = isDeep(s);
  const words = [cfg.preset.q, s.q];
  // Nudge the text search towards pages that can actually satisfy the heuristic filter.
  if (deep && ['hasfree', 'free'].includes(s.pricing)) words.push('free');
  if (deep && s.access === 'noauth') words.push('no sign up');
  const q = words.filter(Boolean).join(' ').trim();
  if (q) p.q = q; else delete p.q;

  if (s.cat === 'all') delete p.ai_categories;
  else if (s.cat) {
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

  // A typed query defaults to relevance; otherwise each page keeps its own default order.
  Object.assign(p, SORTS[s.sort || (s.q ? 'relevance' : cfg.sort)] || SORTS.relevance);
  if (deep) { p.size = DEEP_SCAN_SIZE; p.from = 0; }
  else { p.size = PAGE_SIZE; p.from = ((s.page || 1) - 1) * PAGE_SIZE; }
  return p;
}

export const pageCount = (total) => Math.min(Math.ceil(total / PAGE_SIZE), MAX_PAGE);
