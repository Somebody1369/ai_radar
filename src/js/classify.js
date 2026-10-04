// Heuristic pricing / access classifier.
// FreeSerp has no pricing or auth fields, so we read the homepage text (content=1) plus the
// LLM summary and look for explicit phrases. Every verdict keeps the phrases that produced it,
// so the UI can show "why" instead of pretending to know.
import { BRANDS } from './config.js';

// Idioms where "free" says nothing about the price ("feel free", "hands-free", "risk-free"…).
const NOT_PRICE = '(?<!(?:feel|hands|royalty|risk|hassle|toll|sugar|gluten|carbon|duty|tax|stress|worry|cruelty|error|bug|spam|ad|distraction|cookie)[- ])';
// "free" that only sets a trial length ("free 7-day trial", "try free for 14 days") is not a free tier.
const NOT_TRIAL = '(?!\\s+(?:trial|shipping|delivery|consultation|quote|demo|estimate|returns)\\b|\\s+(?:for\\s+)?\\d+[- ]?(?:days?|weeks?|months?)\\b)';
// Zero prices ("$0", "€0.00") mean a free tier; amounts followed by M/B/k are funding, not prices.
const ZERO = '[$€£]\\s?0(?:[.,]0+)?(?![\\d.,])';
const PRICE = '[$€£]\\s?(?!0(?:[.,]0+)?(?![\\d.,]))\\d+(?:[.,]\\d+)*(?![\\d.,]|\\s?(?:[mbk]\\b|mn\\b|bn\\b|million|billion))';

const RX = {
  // Explicit "free" phrasing. A bare "free" only counts when it is not part of trial/shipping/etc.
  free: new RegExp(`\\b(?:100% free|free forever|completely free|totally free|absolutely free|free to use|free plan|free tier|free version|free account|free online|it'?s free|free credits?|free download|no cost)\\b|\\b(?:for free|start (?:for )?free|try (?:it )?(?:for )?free|get started (?:for )?free)\\b${NOT_TRIAL}|${ZERO}|${NOT_PRICE}\\bfree\\b${NOT_TRIAL}`, 'gi'),
  trial: /\b((?:free )?\d+[- ]day (?:free )?trial|free trial|trial period|(?:try (?:it )?)?free for \d+ (?:days?|weeks?|months?)|free \d+[- ]?(?:days?|weeks?|months?))\b/gi,
  // Strong paid signals: a non-zero price or explicit billing words. "No subscription needed" and
  // "credits rather than a subscription" deny it (suno.com showed «subscription» as its evidence).
  paid: new RegExp(`(${PRICE}|\\b\\d+(?:[.,]\\d+)?\\s?(?:usd|eur|uah)\\b|\\bper (?:user|seat)\\b|\\b(?:(?<!\\b(?:no|without|not|rather than|instead of)(?: a)?(?: monthly| recurring)? )subscription|paid plans?|pro plan|upgrade to pro|buy now|billed (?:monthly|annually|yearly)|one-time payment|lifetime deal)\\b)`, 'gi'),
  // Weak signals: a "Pricing" menu link, "premium", "subscribe" (not to a newsletter), "/month"…
  // Most freemium sites have them, so one weak signal only confirms a free tier (→ freemium);
  // without any "free" it takes two different weak signals to call a site paid.
  weakPaid: /\b(pricing|premium|purchase|upgrade|choose (?:your|a) plan|per (?:month|year)|subscribe(?!\s+(?:to\s+)?(?:our\s+|the\s+)?(?:newsletter|updates|channel|blog)))\b|\/\s?(?:mo|month|yr|year)\b/gi,
  noauth: /\b(no (sign[- ]?up|signup|login|log[- ]in|registration|account)( required| needed)?|without (sign[- ]?up|signing up|registration|registering|login|logging in|an account)|no account (needed|required)|no registration)\b/gi,
  waitlist: /\b(join (the |our )?wait ?list|wait ?list|early access|coming soon|request access|request a demo)\b/gi,
  account: /\b(sign[- ]?up|log[- ]?in|sign[- ]?in|create (an |your )?account|register)\b/gi,
  // "API keys" is usually a client asking for yours (bring your own key), not an API on offer.
  api: /\b(api(?!\s*keys?\b)|sdk|developer docs)\b/gi,
  opensource: /\b(open[- ]source|self[- ]host(ed|able)?|github\.com\/[\w-]+)\b/gi,
};

function matches(text, rx, limit = 3) {
  const found = [];
  for (const m of text.matchAll(rx)) {
    const v = m[0].toLowerCase().trim();
    if (!found.includes(v)) found.push(v);
    if (found.length >= limit) break;
  }
  return found;
}

export function classify(site) {
  const text = [site.title, site.ai_summary, site.content].filter(Boolean).join(' \n ');
  const ev = {};
  for (const key of Object.keys(RX)) ev[key] = matches(text, RX[key]);

  const hasFree = ev.free.length > 0;
  const hasTrial = ev.trial.length > 0;
  const hasPaid = ev.paid.length > 0 || ev.weakPaid.length >= (hasFree ? 1 : 2);
  if (!ev.paid.length && hasPaid) ev.paid = ev.weakPaid;

  let pricing = 'unknown';
  let pricingEvidence = [];
  if (hasFree && hasPaid) { pricing = 'freemium'; pricingEvidence = [...ev.free.slice(0, 2), ...ev.paid.slice(0, 2)]; }
  else if (hasTrial) { pricing = 'trial'; pricingEvidence = [...ev.trial, ...ev.paid.slice(0, 1)]; }
  else if (hasPaid) { pricing = 'paid'; pricingEvidence = ev.paid; }
  else if (hasFree) { pricing = 'free'; pricingEvidence = ev.free; }

  let access = 'unknown';
  let accessEvidence = [];
  if (ev.noauth.length) { access = 'noauth'; accessEvidence = ev.noauth; }
  else if (ev.waitlist.some((w) => /wait ?list|coming soon/.test(w))) { access = 'waitlist'; accessEvidence = ev.waitlist; }
  else if (ev.account.length) { access = 'account'; accessEvidence = ev.account; }

  return {
    pricing,
    access,
    api: ev.api.length > 0,
    opensource: ev.opensource.length > 0,
    evidence: { pricing: pricingEvidence, access: accessEvidence, api: ev.api, opensource: ev.opensource },
  };
}

// A domain named after a famous brand that is not one of its official domains (config.BRANDS):
// { brand, token, official } for the "unofficial site" label, or null. `text` (title + summary) is
// needed for brands with a `context`; without it (a compare column still loading) they never match.
const OFFICIAL = BRANDS.flatMap((b) => b.official);
const BRAND_RX = BRANDS.map((b) => ({ ...b, rx: b.match || new RegExp(b.token) }));
export function lookalike(domain, text = '') {
  const d = String(domain || '').toLowerCase();
  if (OFFICIAL.some((o) => d === o || d.endsWith(`.${o}`))) return null;
  const name = d.split('.').slice(0, -1).join('.').replace(/-/g, '');
  const b = BRAND_RX.find((x) => x.rx.test(name) && (!x.context || x.context.test(text)));
  return b ? { brand: b.name, token: b.token, official: b.official[0] } : null;
}

// Filter predicates used by the deep-scan mode of list pages.
export function matchesMetaFilters(meta, f) {
  if (f.pricing === 'hasfree' && !['free', 'freemium'].includes(meta.pricing)) return false;
  if (f.pricing && f.pricing !== 'hasfree' && meta.pricing !== f.pricing) return false;
  if (f.access && meta.access !== f.access) return false;
  if (f.api && !meta.api) return false;
  if (f.oss && !meta.opensource) return false;
  return true;
}
