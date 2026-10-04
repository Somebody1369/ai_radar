// Heuristic pricing / access classifier.
// FreeSerp has no pricing or auth fields, so we read the homepage text (content=1) plus the
// LLM summary and look for explicit phrases. Every verdict keeps the phrases that produced it,
// so the UI can show "why" instead of pretending to know.

const RX = {
  // Explicit "free" phrasing. A bare "free" only counts when it is not part of trial/shipping/etc.
  free: /\b(100% free|free forever|completely free|totally free|absolutely free|free to use|free plan|free tier|free version|free account|free online|for free|it'?s free|start (for )?free|try (it )?(for )?free|get started (for )?free|free credits?|free download|no cost)\b|\bfree\b(?! (trial|shipping|delivery|consultation|quote|demo|estimate|returns))/gi,
  trial: /\b(free trial|\d+[- ]day (free )?trial|trial period|try free for \d+)\b/gi,
  paid: /([$€£]\s?\d+(?:[.,]\d+)?|\b\d+(?:[.,]\d+)?\s?(?:usd|eur|uah|грн)\b|\/\s?(?:mo|month|yr|year)\b|\bper (?:month|year|user|seat)\b|\b(?:subscribe|subscription|premium|pro plan|upgrade to pro|buy now|purchase|billed (?:monthly|annually|yearly)|one-time payment|lifetime deal)\b)/gi,
  // A "Pricing" menu link alone is weak: most freemium sites have one. It only confirms other signals.
  pricingLink: /\bpricing\b/gi,
  noauth: /\b(no (sign[- ]?up|signup|login|log[- ]in|registration|account)( required| needed)?|without (sign[- ]?up|signing up|registration|registering|login|logging in|an account)|no account (needed|required)|no registration)\b/gi,
  waitlist: /\b(join (the |our )?wait ?list|wait ?list|early access|coming soon|request access|request a demo)\b/gi,
  account: /\b(sign[- ]?up|log[- ]?in|sign[- ]?in|create (an |your )?account|register)\b/gi,
  api: /\b(api|sdk|developer docs)\b/gi,
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
  // "free" + a pricing page is the classic freemium pattern; "pricing" without "free" proves nothing.
  const hasPaid = ev.paid.length > 0 || (hasFree && ev.pricingLink.length > 0);
  if (!ev.paid.length && hasPaid) ev.paid = ev.pricingLink;

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

// Filter predicates used by the deep-scan mode of list pages.
export function matchesMetaFilters(meta, f) {
  if (f.pricing === 'hasfree' && !['free', 'freemium'].includes(meta.pricing)) return false;
  if (f.pricing && f.pricing !== 'hasfree' && meta.pricing !== f.pricing) return false;
  if (f.access && meta.access !== f.access) return false;
  if (f.api && !meta.api) return false;
  if (f.oss && !meta.opensource) return false;
  return true;
}
