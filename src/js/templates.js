// Isomorphic HTML templates: the build script prerenders with them, the browser re-renders with them.
import { NICHES, ALL_CATEGORIES, AI_BUILDERS, slugify } from './config.js';
import { t, categoryName, fmtDate, fmtNum, localePath } from './i18n.js';

export const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const safeUrl = (u) => (/^https?:\/\//i.test(u || '') ? u : '#');
// ai_source mixes builder ids (lovable) with raw generator tags ("gen:gridsome v0.7.23").
const builderName = (src, lang) => (src ? t(lang).builders[src] || src.replace(/^gen:/, '') : '—');

const ICON_PATHS = {
  music: '<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>',
  audio: '<path d="M2 10v3M6 6v11M10 3v18M14 8v7M18 5v13M22 10v3"/>',
  mic: '<rect x="9" y="2" width="6" height="12" rx="3"/><path d="M19 10v1a7 7 0 0 1-14 0v-1M12 18v4"/>',
  copy: '<rect x="8" y="8" width="13" height="13" rx="2"/><path d="M4 16V5a1 1 0 0 1 1-1h11"/>',
  captions: '<rect x="2" y="5" width="20" height="14" rx="3"/><path d="M7 15h4M15 15h2M7 11h2M13 11h4"/>',
  video: '<rect x="2" y="4" width="20" height="16" rx="3"/><path d="m10 9 5 3-5 3z"/>',
  scissors: '<circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M20 4 8.1 15.9M14.5 14.5 20 20M8.1 8.1 12 12"/>',
  image: '<rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21"/>',
  maximize: '<path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/>',
  sparkles: '<path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3Z"/>',
  eraser: '<path d="m7 21-4.3-4.3a1 1 0 0 1 0-1.4l10-10a1 1 0 0 1 1.4 0l5.6 5.6a1 1 0 0 1 0 1.4L13 21M22 21H7M5 11l9 9"/>',
  hexagon: '<path d="M12 2 21 7v10l-9 5-9-5V7z"/>',
  palette: '<circle cx="13.5" cy="6.5" r="1"/><circle cx="17.5" cy="10.5" r="1"/><circle cx="8.5" cy="7.5" r="1"/><circle cx="6.5" cy="12.5" r="1"/><path d="M12 2a10 10 0 0 0 0 20 2 2 0 0 0 2-2v-.5a2 2 0 0 1 2-2h1.5a4.5 4.5 0 0 0 4.5-4.5C22 6.5 17.5 2 12 2z"/>',
  favicon: '<rect x="3" y="3" width="18" height="18" rx="5"/><path d="M8 12h8M12 8v8"/>',
  grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  box: '<path d="M21 8 12 3 3 8v8l9 5 9-5z"/><path d="m3 8 9 5 9-5M12 13v8"/>',
  layout: '<rect x="3" y="3" width="18" height="18" rx="3"/><path d="M3 9h18M9 21V9"/>',
  pen: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
  languages: '<path d="m5 8 6 6M4 14l6-6 2-3M2 5h12M7 2h1M22 22l-5-10-5 10M14 18h6"/>',
  home: '<path d="M3 10.5 12 3l9 7.5V21H3z"/><path d="M9 21v-6h6v6"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  arrow: '<path d="M7 17 17 7M8 7h9v9"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  check: '<path d="m5 12 5 5L20 7"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  columns: '<rect x="3" y="3" width="18" height="18" rx="3"/><path d="M9 3v18M15 3v18"/>',
  radar: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><path d="M12 12 19 5"/><circle cx="12" cy="12" r="1.2" fill="currentColor"/>',
};

export const icon = (name, cls = 'icon') =>
  `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON_PATHS[name] || ''}</svg>`;

export const favicon = (domain, size = 32) =>
  `<span class="fav" style="--s:${size}px" data-letter="${esc(domain[0]?.toUpperCase() || '?')}"><img src="https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&amp;sz=64" alt="" width="${size}" height="${size}" loading="lazy" decoding="async"></span>`;

export const sitePath = (lang, domain) => localePath(lang, `/site/${encodeURIComponent(domain)}/`);

export function categoryHref(lang, c) {
  return NICHES.includes(c) ? localePath(lang, `/niche/${slugify(c)}/`) : localePath(lang, `/sites/?cat=${encodeURIComponent(c)}`);
}

function whyText(lang, list) {
  return list?.length ? `${t(lang).why.title}: «${list.join('», «')}»` : t(lang).why.none;
}

export const pricingBadge = (meta, lang) =>
  `<span class="badge b-${meta.pricing}" tabindex="0" data-why="${esc(whyText(lang, meta.evidence.pricing))}">${esc(t(lang).pricing[meta.pricing])}</span>`;

export const accessBadge = (meta, lang) =>
  `<span class="badge a-${meta.access}" tabindex="0" data-why="${esc(whyText(lang, meta.evidence.access))}">${esc(t(lang).access[meta.access])}</span>`;

export function badges(meta, lang, { source, withUnknown = true } = {}) {
  const out = [];
  if (meta.pricing !== 'unknown' || withUnknown) out.push(pricingBadge(meta, lang));
  if (meta.access !== 'unknown' || withUnknown) out.push(accessBadge(meta, lang));
  if (meta.api) out.push(`<span class="badge b-tag" tabindex="0" data-why="${esc(whyText(lang, meta.evidence.api))}">API</span>`);
  if (meta.opensource) out.push(`<span class="badge b-tag" tabindex="0" data-why="${esc(whyText(lang, meta.evidence.opensource))}">Open source</span>`);
  if (source && AI_BUILDERS.includes(source)) out.push(`<span class="badge b-ai">${icon('sparkles', 'icon icon-xs')}${esc(t(lang).builders[source] || source)}</span>`);
  return out.join('');
}

export function card(s, lang) {
  const L = t(lang);
  const cats = s.categories.slice(0, 2).map((c) => `<a class="chip" href="${categoryHref(lang, c)}">${esc(categoryName(c, lang))}</a>`).join('');
  return `<article class="card" data-domain="${esc(s.domain)}">
  <div class="card-head">
    ${favicon(s.domain)}
    <div class="card-id">
      <h3 class="card-title"><a href="${sitePath(lang, s.domain)}">${esc(s.domain)}</a></h3>
      <p class="card-sub">${esc(s.title)}</p>
    </div>
    <span class="dr" title="Domain Rating">${L.card.dr} ${s.dr ?? '—'}</span>
  </div>
  <p class="card-summary">${esc(s.summary)}</p>
  <div class="badges">${badges(s.meta, lang, { source: s.source, withUnknown: false })}</div>
  ${cats ? `<div class="chips">${cats}</div>` : ''}
  <div class="card-foot">
    <span class="muted small">${L.card.live} ${fmtDate(s.wentLive, lang)}</span>
    <div class="card-actions">
      <button type="button" class="btn btn-sm btn-ghost" data-compare="${esc(s.domain)}" aria-pressed="false">${icon('plus', 'icon icon-xs')}<span>${L.card.compare}</span></button>
      <a class="btn btn-sm btn-ghost" href="${esc(safeUrl(s.url))}" target="_blank" rel="noopener nofollow">${L.card.open}${icon('arrow', 'icon icon-xs')}</a>
    </div>
  </div>
</article>`;
}

export const grid = (sites, lang) => `<div class="grid">${sites.map((s) => card(s, lang)).join('')}</div>`;

export function pagination(page, pages, hrefFor, lang) {
  if (pages <= 1) return '';
  const L = t(lang).list;
  const nums = new Set([1, pages, page - 1, page, page + 1].filter((n) => n >= 1 && n <= pages));
  const sorted = [...nums].sort((a, b) => a - b);
  let html = '';
  let prev = 0;
  for (const n of sorted) {
    if (n - prev > 1) html += '<span class="pg-gap">…</span>';
    html += n === page
      ? `<span class="pg pg-cur" aria-current="page">${n}</span>`
      : `<a class="pg" href="${esc(hrefFor(n))}" data-page="${n}" aria-label="${L.page} ${n}">${n}</a>`;
    prev = n;
  }
  const prevLink = page > 1 ? `<a class="pg pg-nav" href="${esc(hrefFor(page - 1))}" data-page="${page - 1}" rel="prev">${L.prev}</a>` : '';
  const nextLink = page < pages ? `<a class="pg pg-nav" href="${esc(hrefFor(page + 1))}" data-page="${page + 1}" rel="next">${L.next}</a>` : '';
  return `<nav class="pagination" aria-label="${L.page}">${prevLink}${html}${nextLink}</nav>`;
}

export function message(text, { retry = false, lang = 'uk' } = {}) {
  return `<div class="msg">${esc(text)}${retry ? ` <button type="button" class="btn btn-sm btn-ghost" data-retry>${t(lang).list.retry}</button>` : ''}</div>`;
}

export function skeleton(n = 6) {
  return `<div class="grid" aria-hidden="true">${'<div class="card card-skel"></div>'.repeat(n)}</div>`;
}

const row = (label, value) => `<div class="fact"><dt>${esc(label)}</dt><dd>${value}</dd></div>`;

export function siteDetail(s, lang) {
  const L = t(lang);
  const S = L.site;
  const why = (k) => `<span class="muted small">${esc(whyText(lang, s.meta.evidence[k]))}</span>`;
  const cats = s.categories.map((c) => `<a class="chip" href="${categoryHref(lang, c)}">${esc(categoryName(c, lang))}</a>`).join('') || '—';
  const builder = esc(builderName(s.source, lang));
  return `<article class="site" data-domain="${esc(s.domain)}">
  <div class="site-head">
    ${favicon(s.domain, 56)}
    <div class="site-id">
      <h1 class="site-title">${esc(s.domain)}</h1>
      <p class="site-sub">${esc(s.title)}</p>
    </div>
    <div class="site-actions">
      <a class="btn btn-primary" href="${esc(safeUrl(s.url))}" target="_blank" rel="noopener nofollow">${S.visit}${icon('arrow', 'icon icon-sm')}</a>
      <button type="button" class="btn btn-ghost" data-compare="${esc(s.domain)}" aria-pressed="false">${icon('plus', 'icon icon-sm')}<span>${L.card.compare}</span></button>
    </div>
  </div>
  <p class="site-summary">${esc(s.summary)}</p>
  <div class="badges badges-lg">${badges(s.meta, lang, { source: s.source })}</div>
  <h2 class="h3">${S.facts}</h2>
  <dl class="facts">
    ${row('Domain Rating', `<strong>${s.dr ?? '—'}</strong> / 100`)}
    ${row(S.pricing, `${esc(L.pricing[s.meta.pricing])}<br>${why('pricing')}`)}
    ${row(S.access, `${esc(L.access[s.meta.access])}<br>${why('access')}`)}
    ${row(S.niches, `<span class="chips">${cats}</span>`)}
    ${row(S.stack, builder)}
    ${row(S.server, esc(s.server || '—'))}
    ${row(S.tld, s.tld ? `.${esc(s.tld)}` : '—')}
    ${row(S.wentLive, fmtDate(s.wentLive, lang))}
    ${row(S.firstSeen, fmtDate(s.firstSeen, lang))}
  </dl>
</article>`;
}

export function compareTable(sites, lang) {
  const L = t(lang);
  const S = L.site;
  const cell = (fn) => sites.map((s) => `<td>${fn(s)}</td>`).join('');
  const rows = [
    ['Domain Rating', (s) => `<strong>${s.dr ?? '—'}</strong>`],
    [S.pricing, (s) => pricingBadge(s.meta, lang)],
    [S.access, (s) => accessBadge(s.meta, lang)],
    ['API', (s) => (s.meta.api ? icon('check', 'icon icon-sm ok') : '—')],
    ['Open source', (s) => (s.meta.opensource ? icon('check', 'icon icon-sm ok') : '—')],
    [S.niches, (s) => s.categories.map((c) => esc(categoryName(c, lang))).join(', ') || '—'],
    [S.stack, (s) => esc(builderName(s.source, lang))],
    [S.server, (s) => esc(s.server || '—')],
    [S.wentLive, (s) => fmtDate(s.wentLive, lang)],
    [L.compare.summary, (s) => `<span class="small">${esc(s.summary)}</span>`],
  ];
  return `<div class="table-wrap"><table class="compare">
  <thead><tr><th scope="col"></th>${sites.map((s) => `<th scope="col">
    <div class="cmp-head">${favicon(s.domain, 28)}<a href="${sitePath(lang, s.domain)}">${esc(s.domain)}</a>
    <button type="button" class="icon-btn" data-remove="${esc(s.domain)}" aria-label="${L.compare.remove} ${esc(s.domain)}">${icon('x', 'icon icon-sm')}</button></div></th>`).join('')}</tr></thead>
  <tbody>${rows.map(([label, fn]) => `<tr><th scope="row">${esc(label)}</th>${cell(fn)}</tr>`).join('')}</tbody>
</table></div>`;
}

// Niche <select> options: startup niches first, then the rest of the taxonomy, sorted per language.
export function nicheOptions(lang, selected = '', anyLabel = t(lang).filters.allNiches) {
  const byName = (a, b) => categoryName(a, lang).localeCompare(categoryName(b, lang), lang);
  const opt = (c) => `<option value="${esc(c)}"${c === selected ? ' selected' : ''}>${esc(categoryName(c, lang))}</option>`;
  const [g1, g2] = t(lang).filters.nicheGroups;
  const others = ALL_CATEGORIES.filter((c) => !NICHES.includes(c)).sort(byName);
  return `<option value="">${esc(anyLabel)}</option><optgroup label="${esc(g1)}">${[...NICHES].sort(byName).map(opt).join('')}</optgroup><optgroup label="${esc(g2)}">${others.map(opt).join('')}</optgroup>`;
}

export const resultsMeta = (text) => `<p class="results-meta" aria-live="polite">${esc(text)}</p>`;

export { fmtNum };
