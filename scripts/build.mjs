// Static site generator: fetches FreeSerp once, prerenders every indexable page in uk + en,
// writes sitemap/robots and copies assets. Run: node scripts/build.mjs
import { mkdir, writeFile, readFile, readdir, cp, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { TASKS, NICHES, BUILDERS, TLDS, PAGE_SIZE, slugify } from '../src/js/config.js';
import { search, stats, setCache } from '../src/js/api.js';
import { LANGS, t, taskName, taskDesc, categoryName, fmtDate, fmtNum, localePath } from '../src/js/i18n.js';
import { esc, icon, grid, pagination, resultsMeta, siteDetail, sitePath, message, nicheOptions, cardMini, setLatest } from '../src/js/templates.js';
import { toApiParams, pageCount } from '../src/js/listing.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');
const CACHE_DIR = path.join(ROOT, '.cache');
const SITE = (process.env.URL || 'http://localhost:8080').replace(/\/$/, '');
const BUILD_DATE = new Date().toISOString().slice(0, 10);

// JS/CSS go to /assets/<content hash>/: relative module imports then carry the version too, so a deploy
// can never mix old and new modules, and the folder can be cached forever (see netlify.toml).
async function hashDir(dirs) {
  const h = createHash('sha1');
  for (const dir of dirs) {
    for (const f of (await readdir(dir, { recursive: true })).sort()) {
      try { h.update(f).update(await readFile(path.join(dir, f))); } catch { /* sub-directory */ }
    }
  }
  return h.digest('hex').slice(0, 10);
}
const ASSETS = `/assets/${await hashDir([path.join(ROOT, 'src/js'), path.join(ROOT, 'src/css')])}`;

// The only inline script (lets CSS hide the mobile nav before app.js loads). Its hash is whitelisted in
// the Content-Security-Policy in netlify.toml, so a change here must update that hash too.
const HEAD_SCRIPT = "document.documentElement.classList.add('js')";
const HEAD_SCRIPT_HASH = `sha256-${createHash('sha256').update(HEAD_SCRIPT).digest('base64')}`;
if (!(await readFile(path.join(ROOT, 'netlify.toml'), 'utf8')).includes(HEAD_SCRIPT_HASH)) {
  console.error(`✗ netlify.toml CSP must allow the inline script: '${HEAD_SCRIPT_HASH}'`);
  process.exit(1);
}

// ---------- data ----------

// Local builds reuse responses for a few hours; Netlify always fetches fresh data.
if (!process.env.NETLIFY) {
  await mkdir(CACHE_DIR, { recursive: true });
  const file = (url) => path.join(CACHE_DIR, `${createHash('sha1').update(url).digest('hex')}.json`);
  setCache({
    async get(url) {
      try {
        const { at, data } = JSON.parse(await readFile(file(url), 'utf8'));
        return Date.now() - at < 6 * 3600e3 ? data : null;
      } catch { return null; }
    },
    set: (url, data) => writeFile(file(url), JSON.stringify({ at: Date.now(), data })),
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let requests = 0;
let failures = 0;
async function safe(label, fn) {
  try {
    const out = await fn();
    requests++;
    await sleep(120); // be polite: the API asks for a few requests per second at most
    return out;
  } catch (e) {
    failures++;
    console.warn(`! ${label}: ${e.message}`);
    return null;
  }
}

const LIST = {
  catalog: { preset: { ai_startups: 1 }, sort: 'dr', base: '/sites/', filters: ['cat', 'q', 'pricing', 'access', 'sort', 'builder', 'tld', 'dr', 'dates', 'flags'] },
  task: (task) => ({ preset: { ...task.params }, sort: task.params.q ? 'relevance' : 'dr', widenQ: task.widen, base: `/tools/${task.slug}/`, filters: ['cat', 'q', 'pricing', 'access', 'sort', 'builder', 'dr', 'flags'] }),
  // On niche pages the niche select switches to another niche page instead of filtering in place.
  niche: (name) => ({ preset: { ai_categories: name }, sort: 'dr', base: `/niche/${slugify(name)}/`, nicheNav: true, filters: ['cat', 'q', 'pricing', 'access', 'sort', 'builder', 'tld', 'dr', 'flags'] }),
  fresh: (from, to) => ({ preset: { ai_startups: 1, from_date: from, to_date: to }, sort: 'dr', base: '/new/', filters: ['cat', 'q', 'pricing', 'access', 'sort', 'builder', 'flags'] }),
};

const fetchList = (cfg, label) => safe(label, () => search(toApiParams(cfg, {})));

console.log(`Fetching FreeSerp data… (site: ${SITE})`);
const statsData = await safe('stats', () => stats());
const catalog = await fetchList(LIST.catalog, 'catalog');

// "New" is measured from the latest date in the data, not from today: the index lags real time.
const newest = await safe('latest', () => search({ ai_startups: 1, sort: 'went_live', order: 'desc', size: 1 }));
// A broken API must not replace a good deploy with empty pages: fail the build and Netlify keeps
// serving the previous one.
const abort = () => {
  console.error('✗ FreeSerp API is unavailable or failing — build aborted, the current deploy stays live.');
  process.exit(1);
};
if (!catalog || !newest) abort();
const latest = newest.results[0]?.wentLive || BUILD_DATE;
setLatest(latest);
const daysBefore = (n) => new Date(Date.parse(`${latest}T00:00:00Z`) - n * 864e5).toISOString().slice(0, 10);
const weekAgo = daysBefore(6);
const monthAgo = daysBefore(29);
LIST.freshCfg = LIST.fresh(weekAgo, latest);
const fresh = await fetchList(LIST.freshCfg, 'new');

// Newest sites of a category: the last 30 days of data; small categories fall back to their newest ever.
async function newestIn(preset, label) {
  const base = { ...preset, sort: 'went_live', order: 'desc', size: 6 };
  const recent = await safe(`${label} new`, () => search({ ...base, from_date: monthAgo, to_date: latest }));
  if (recent && recent.results.length >= 3) return recent;
  return (await safe(`${label} new (all time)`, () => search(base))) || recent;
}

const tasks = [];
for (const task of TASKS) {
  tasks.push({ task, cfg: LIST.task(task), data: await fetchList(LIST.task(task), `task ${task.slug}`), fresh: await newestIn(task.params, `task ${task.slug}`) });
}
const niches = [];
for (const name of NICHES) {
  niches.push({ name, cfg: LIST.niche(name), data: await fetchList(LIST.niche(name), `niche ${name}`), fresh: await newestIn({ ai_categories: name }, `niche ${name}`) });
}
console.log(`  ${requests} API requests ok, ${failures} failed`);
// A few failed niche requests are tolerated (those pages load their list in the browser instead).
if (failures > (requests + failures) * 0.2) abort();

// Every site that appears in a prerendered list gets its own indexable page.
const sites = new Map();
for (const d of [catalog, fresh, ...tasks.flatMap((x) => [x.data, x.fresh]), ...niches.flatMap((x) => [x.data, x.fresh])]) {
  // IDN / odd domains stay client-rendered: their folder names would not match encoded URLs.
  for (const s of d?.results || []) if (/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(s.domain) && !sites.has(s.domain)) sites.set(s.domain, s);
}

// ---------- layout ----------

const sitemap = [];

function jsonld(obj) {
  return `<script type="application/ld+json">${JSON.stringify(obj).replace(/</g, '\\u003c')}</script>`;
}

function breadcrumbs(lang, items) {
  const L = t(lang);
  const all = [{ name: L.siteName, path: '/' }, ...items];
  const html = `<nav class="crumbs" aria-label="${L.crumbsLabel}">${all.map((c, i) => (i < all.length - 1 ? `<a href="${localePath(lang, c.path)}">${esc(c.name)}</a><span aria-hidden="true">/</span>` : `<span aria-current="page">${esc(c.name)}</span>`)).join('')}</nav>`;
  const ld = { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: all.map((c, i) => ({ '@type': 'ListItem', position: i + 1, name: c.name, item: SITE + localePath(lang, c.path) })) };
  return { html, ld };
}

function layout({ lang, pathname, title, description, body, active = '', robots = 'index,follow', ld = [], indexable = true }) {
  const L = t(lang);
  const other = lang === 'uk' ? 'en' : 'uk';
  const canonical = SITE + localePath(lang, pathname);
  if (indexable && lang === 'uk') sitemap.push(pathname);
  const nav = [['tools', '/tools/'], ['catalog', '/sites/'], ['new', '/new/'], ['compare', '/compare/']];
  return `<!doctype html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<script>${HEAD_SCRIPT}</script>
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<meta name="robots" content="${robots}">
<link rel="canonical" href="${canonical}">
${LANGS.map((l) => `<link rel="alternate" hreflang="${l}" href="${SITE + localePath(l, pathname)}">`).join('\n')}
<link rel="alternate" hreflang="x-default" href="${SITE + pathname}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="${L.siteName}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${canonical}">
<meta property="og:locale" content="${lang === 'uk' ? 'uk_UA' : 'en_US'}">
<meta name="theme-color" content="#161616">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:ital,opsz,wght@0,14..32,400..700;1,14..32,400..600&display=swap">
<link rel="preconnect" href="https://www.google.com">
<link rel="stylesheet" href="${ASSETS}/css/style.css">
${ld.map(jsonld).join('\n')}
</head>
<body data-lang="${lang}" data-latest="${latest}">
<a class="skip" href="#main">${L.skip}</a>
<header class="header">
  <div class="wrap header-in">
    <a class="logo" href="${localePath(lang, '/')}">${icon('radar', 'icon logo-icon')}<span>AI Radar</span></a>
    <nav class="nav" id="nav" aria-label="${L.navLabel}">
      ${nav.map(([k, p]) => `<a href="${localePath(lang, p)}"${active === k ? ' aria-current="page"' : ''}>${L.nav[k]}</a>`).join('')}
    </nav>
    <a class="lang" href="${localePath(other, pathname)}" hreflang="${other}" lang="${other}" data-lang-switch title="${L.lang.switch}">${L.lang[other]}</a>
    <button type="button" class="menu-btn" aria-controls="nav" aria-expanded="false" aria-label="${L.menu}" data-menu>${icon('menu', 'icon i-open')}${icon('x', 'icon i-close')}</button>
  </div>
</header>
<main id="main" class="wrap">
${body}
</main>
<footer class="footer">
  <div class="wrap footer-in">
    <div>
      <a class="logo" href="${localePath(lang, '/')}">${icon('radar', 'icon logo-icon')}<span>AI Radar</span></a>
      <p class="muted small">${L.tagline}</p>
    </div>
    <div class="small muted footer-meta">
      <p>${L.footer.data} · <a href="https://freeserp.ai/docs.php" rel="noopener" target="_blank">freeserp.ai</a></p>
      <p>${L.footer.built}</p>
      <p>${L.footer.updated(fmtDate(BUILD_DATE, lang))}</p>
    </div>
  </div>
</footer>
<div class="cmpbar" data-cmpbar hidden></div>
<script type="module" src="${ASSETS}/js/app.js"></script>
</body>
</html>`;
}

async function writePage(lang, pathname, html) {
  const rel = localePath(lang, pathname);
  const file = rel.endsWith('/') ? path.join(DIST, rel, 'index.html') : path.join(DIST, rel);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, html);
}

// ---------- list section ----------

function filtersForm(cfg, lang) {
  const L = t(lang);
  const F = L.filters;
  const has = (k) => cfg.filters.includes(k);
  const opt = (v, label, sel) => `<option value="${esc(v)}"${sel ? ' selected' : ''}>${esc(label)}</option>`;
  const select = (name, label, options) => `<label class="field"><span class="field-label">${label}</span><select name="${name}" class="input">${options}</select></label>`;
  const sorts = cfg.preset.q || has('q') ? ['relevance', 'new', 'dr'] : ['new', 'dr'];

  const primary = [];
  if (has('cat')) primary.push(`<label class="field field-niche"><span class="field-label">${F.niche}</span><select name="cat" class="input">${nicheOptions(lang, cfg.preset.ai_categories || '')}</select></label>`);
  if (has('q')) primary.push(`<label class="field field-q"><span class="field-label">${F.q}</span><span class="input-icon">${icon('search', 'icon icon-sm')}<input class="input" type="search" name="q" placeholder="${esc(cfg.preset.q ? F.qRefinePh : F.qPh)}" autocomplete="off"></span></label>`);
  if (has('pricing')) primary.push(select('pricing', F.pricing, opt('', L.pricing.any) + ['hasfree', 'free', 'freemium', 'trial', 'paid'].map((v) => opt(v, L.pricing[v])).join('')));
  if (has('access')) primary.push(select('access', F.access, opt('', L.access.any) + ['noauth', 'account', 'waitlist'].map((v) => opt(v, L.access[v])).join('')));
  if (has('sort')) primary.push(select('sort', F.sort, sorts.map((v) => opt(v, L.sort[v], v === cfg.sort)).join('')));

  const more = [];
  if (has('builder')) more.push(select('builder', F.builder, opt('', F.anyF) + BUILDERS.map((b) => opt(b, L.builders[b])).join('')));
  if (has('tld')) more.push(select('tld', F.tld, opt('', F.anyF) + TLDS.map((d) => opt(d, `.${d}`)).join('')));
  if (has('dr')) more.push(`<label class="field field-num"><span class="field-label">${F.dr}</span><input class="input" type="number" name="dr_min" min="0" max="100" inputmode="numeric" placeholder="0"></label><label class="field field-num"><span class="field-label">${F.drTo}</span><input class="input" type="number" name="dr_max" min="0" max="100" inputmode="numeric" placeholder="100"></label>`);
  if (has('dates')) more.push(`<label class="field field-date"><span class="field-label">${F.from}</span><input class="input" type="date" name="from"></label><label class="field field-date"><span class="field-label">${F.to}</span><input class="input" type="date" name="to"></label>`);
  if (has('flags')) more.push(`<div class="field field-flags"><label class="check"><input type="checkbox" name="api" value="1"><span>${F.api}</span></label><label class="check"><input type="checkbox" name="oss" value="1"><span>${F.oss}</span></label></div>`);

  return `<form class="filters" data-filters role="search" action="${localePath(lang, cfg.base)}" method="get">
  <div class="filters-row">${primary.join('')}</div>
  <details class="filters-more">
    <summary class="btn btn-ghost btn-sm">${F.title}<span class="filters-count" data-filters-count></span></summary>
    <div class="filters-row">${more.join('')}<button type="reset" class="btn btn-ghost btn-sm" data-reset>${F.reset}</button></div>
  </details>
  <noscript><button class="btn btn-primary btn-sm">${F.apply}</button></noscript>
</form>`;
}

function listSection(cfg, data, lang) {
  const L = t(lang);
  let inner;
  if (!data) inner = message(L.list.error, { retry: true, lang });
  else if (!data.results.length) inner = message(L.list.empty);
  else {
    const pages = pageCount(data.total);
    const href = (n) => `${localePath(lang, cfg.base)}?page=${n}`;
    inner = resultsMeta(L.list.shown(1, Math.min(PAGE_SIZE, data.total), fmtNum(data.total, lang))) + grid(data.results, lang) + pagination(1, pages, href, lang);
  }
  return `<section class="list" aria-labelledby="results-h" data-list="${esc(JSON.stringify({ preset: cfg.preset, sort: cfg.sort, widenQ: cfg.widenQ, base: localePath(lang, cfg.base), nicheNav: Boolean(cfg.nicheNav) }))}"${data ? '' : ' data-empty'}>
  <h2 class="sr-only" id="results-h">${L.list.results}</h2>
  ${filtersForm(cfg, lang)}
  <div class="results" data-results>${inner}</div>
</section>`;
}

const itemListLd = (lang, data) => ({
  '@context': 'https://schema.org',
  '@type': 'ItemList',
  itemListElement: (data?.results || []).slice(0, 24).map((s, i) => ({ '@type': 'ListItem', position: i + 1, url: SITE + sitePath(lang, s.domain), name: s.domain })),
});

function newInBlock(lang, data, base) {
  const list = data?.results || [];
  if (!list.length) return '';
  const L = t(lang);
  const dates = list.map((s) => s.wentLive).filter(Boolean).sort();
  return `<section class="newin" aria-labelledby="newin-h">
  <div class="section-head">
    <div><h2 class="h3 newin-title" id="newin-h">${icon('sparkles', 'icon icon-sm')}${L.newIn.title}</h2>
    ${dates.length ? `<p class="muted small">${esc(L.newIn.range(fmtDate(dates[0], lang), fmtDate(dates[dates.length - 1], lang)))}</p>` : ''}</div>
    <a class="link-more" href="${localePath(lang, base)}?sort=new">${L.newIn.more}${icon('arrow', 'icon icon-xs')}</a>
  </div>
  <div class="mini-grid">${list.slice(0, 6).map((s) => cardMini(s, lang)).join('')}</div>
</section>`;
}

const HOME_NEW_NICHES = ['AI Agents & Autonomous', 'AI Chatbot & Assistant', 'Code & Dev Tools', 'Image Generation', 'Video Generation', 'Voice & Text-to-Speech'];

const pageHead = (h1, lead, extra = '') => `<div class="page-head">${extra}<h1 class="h1">${h1}</h1>${lead ? `<p class="lead">${lead}</p>` : ''}</div>`;

// ---------- pages ----------

await rm(DIST, { recursive: true, force: true });

for (const lang of LANGS) {
  const L = t(lang);
  const H = L.home;
  const total = statsData?.ai_startups?.total;
  const taskTotals = Object.fromEntries(tasks.map((x) => [x.task.slug, x.data?.total]));

  // Home
  const taskTile = (task, n) => `<a class="tile" href="${localePath(lang, `/tools/${task.slug}/`)}">
    <span class="tile-icon">${icon(task.icon)}</span>
    <span class="tile-body"><span class="tile-title">${esc(taskName(task.slug, lang))}</span><span class="tile-desc">${esc(taskDesc(task.slug, lang))}</span></span>
    ${n ? `<span class="tile-count">${fmtNum(n, lang)}</span>` : ''}
  </a>`;
  // Numbers about what the visitor gets (AI startups, how many are new), not about the whole index.
  // No "new in 30 days": the index was bulk-loaded on 7–13 Aug, so that window counts almost everything.
  const statItems = [[total, H.statStartups], [fresh?.total, H.statWeek], [TASKS.length, H.statTasks(TASKS.length)], [NICHES.length, H.statNiches]]
    .filter(([n]) => typeof n === 'number');
  const statsRow = `<div class="stats">${statItems.map(([n, label]) => `<div class="stat"><strong>${fmtNum(n, lang)}</strong><span>${label}</span></div>`).join('')}</div>`;

  const tabSets = [
    { label: L.filters.allNiches, data: fresh, href: localePath(lang, '/new/'), more: H.newAll },
    ...HOME_NEW_NICHES.map((n) => ({ label: categoryName(n, lang), data: niches.find((x) => x.name === n)?.fresh, href: `${localePath(lang, `/niche/${slugify(n)}/`)}?sort=new`, more: H.newMore })),
  ].filter((x) => x.data?.results.length);
  const newTabs = `<div class="tabs" data-tabs>
    <div class="tablist" role="tablist" aria-label="${esc(H.newTitle)}">${tabSets.map((x, i) => `<button type="button" role="tab" class="tab" id="nt-${i}" aria-controls="np-${i}" aria-selected="${i === 0}" tabindex="${i === 0 ? 0 : -1}">${esc(x.label)}</button>`).join('')}</div>
    ${tabSets.map((x, i) => `<div class="tabpanel" role="tabpanel" id="np-${i}" aria-labelledby="nt-${i}"${i ? ' hidden' : ''}>${grid(x.data.results.slice(0, 6), lang)}<p class="tab-more"><a class="link-more" href="${x.href}">${x.more}${icon('arrow', 'icon icon-xs')}</a></p></div>`).join('')}
  </div>`;
  const section = (title, lead, href, content) => `<section class="section">
    <div class="section-head"><div><h2 class="h2">${title}</h2>${lead ? `<p class="muted">${lead}</p>` : ''}</div>${href ? `<a class="link-more" href="${href}">${H.viewAll}${icon('arrow', 'icon icon-xs')}</a>` : ''}</div>
    ${content}
  </section>`;
  const popular = ['music', 'video-generation', 'logo', 'favicon', 'upscale', 'background-removal'];
  const homeBody = `
<section class="hero">
  <p class="eyebrow">${icon('radar', 'icon icon-xs')}${esc(H.eyebrow(fmtDate(latest, lang)))}</p>
  <h1 class="display">${H.h1}</h1>
  <p class="lead">${H.lead}</p>
  <form class="hero-search" action="${localePath(lang, '/sites/')}" method="get" role="search" data-hero-search>
    <label class="hero-niche"><span class="sr-only">${L.filters.niche}</span><select class="input input-lg" name="cat">${nicheOptions(lang)}</select></label>
    <span class="input-icon">${icon('search', 'icon icon-sm')}<input class="input input-lg" type="search" name="q" placeholder="${esc(H.searchPh)}" aria-label="${esc(H.searchBtn)}" autocomplete="off"></span>
    <button class="btn btn-primary btn-lg">${H.searchBtn}</button>
  </form>
  <div class="hero-chips"><span class="muted small">${H.popular}</span>${popular.map((s) => `<a class="chip" href="${localePath(lang, `/tools/${s}/`)}">${esc(taskName(s, lang))}</a>`).join('')}</div>
</section>
${statsRow}
${section(H.tasksTitle, H.tasksLead, localePath(lang, '/tools/'), `<div class="tiles">${TASKS.slice(0, 12).map((x) => taskTile(x, taskTotals[x.slug])).join('')}</div>`)}
${tabSets.length ? section(H.newTitle, H.newLead, '', newTabs) : ''}
${section(H.nichesTitle, '', '', `<div class="niche-grid">${niches.map(({ name, data }) => `<a class="niche" href="${localePath(lang, `/niche/${slugify(name)}/`)}"><span>${esc(categoryName(name, lang))}</span>${data ? `<span class="muted small">${fmtNum(data.total, lang)}</span>` : ''}</a>`).join('')}</div>`)}
<section class="section honest">
  <h2 class="h3">${H.honestTitle}</h2>
  <ul>${H.honest.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>
</section>`;
  await writePage(lang, '/', layout({
    lang, pathname: '/', title: H.title, description: H.description, body: homeBody,
    ld: [{ '@context': 'https://schema.org', '@type': 'WebSite', name: 'AI Radar', url: SITE + localePath(lang, '/'), inLanguage: lang, potentialAction: { '@type': 'SearchAction', target: `${SITE}${localePath(lang, '/sites/')}?q={search_term_string}`, 'query-input': 'required name=search_term_string' } }],
  }));

  // Tools index
  const toolsCrumbs = breadcrumbs(lang, [{ name: L.nav.tools, path: '/tools/' }]);
  await writePage(lang, '/tools/', layout({
    lang, pathname: '/tools/', title: L.tools.title, description: L.tools.description, active: 'tools', ld: [toolsCrumbs.ld],
    body: `${toolsCrumbs.html}${pageHead(L.tools.h1, L.tools.lead)}<div class="tiles tiles-all">${TASKS.map((x) => taskTile(x, taskTotals[x.slug])).join('')}</div>`,
  }));

  // Task pages
  for (const { task, cfg, data, fresh: taskNew } of tasks) {
    const name = taskName(task.slug, lang);
    const crumbs = breadcrumbs(lang, [{ name: L.nav.tools, path: '/tools/' }, { name, path: `/tools/${task.slug}/` }]);
    const others = TASKS.filter((x) => x.slug !== task.slug).slice(0, 8);
    await writePage(lang, `/tools/${task.slug}/`, layout({
      lang, pathname: `/tools/${task.slug}/`, title: L.tools.pageTitle(name), description: L.tools.pageDescription(name), active: 'tools', ld: [crumbs.ld, itemListLd(lang, data)],
      body: `${crumbs.html}${pageHead(esc(name), esc(taskDesc(task.slug, lang)), `<span class="tile-icon tile-icon-lg">${icon(task.icon)}</span>`)}
${newInBlock(lang, taskNew, cfg.base)}
${listSection(cfg, data, lang)}
<section class="section"><h2 class="h3">${L.nav.tools}</h2><div class="hero-chips">${others.map((x) => `<a class="chip" href="${localePath(lang, `/tools/${x.slug}/`)}">${esc(taskName(x.slug, lang))}</a>`).join('')}</div></section>`,
    }));
  }

  // Catalog
  const catCrumbs = breadcrumbs(lang, [{ name: L.nav.catalog, path: '/sites/' }]);
  await writePage(lang, '/sites/', layout({
    lang, pathname: '/sites/', title: L.catalog.title, description: L.catalog.description, active: 'catalog', ld: [catCrumbs.ld, itemListLd(lang, catalog)],
    body: `${catCrumbs.html}${pageHead(L.catalog.h1, L.catalog.lead)}${listSection(LIST.catalog, catalog, lang)}`,
  }));

  // Niches
  for (const { name, cfg, data, fresh: nicheNew } of niches) {
    const label = categoryName(name, lang);
    const p = `/niche/${slugify(name)}/`;
    const crumbs = breadcrumbs(lang, [{ name: L.nav.catalog, path: '/sites/' }, { name: label, path: p }]);
    await writePage(lang, p, layout({
      lang, pathname: p, title: L.niche.title(label), description: L.niche.description(label), active: 'catalog', ld: [crumbs.ld, itemListLd(lang, data)],
      body: `${crumbs.html}${pageHead(esc(L.niche.h1(label)), esc(L.niche.lead(label)))}${newInBlock(lang, nicheNew, cfg.base)}${listSection(cfg, data, lang)}`,
    }));
  }

  // New
  const newCrumbs = breadcrumbs(lang, [{ name: L.nav.new, path: '/new/' }]);
  await writePage(lang, '/new/', layout({
    lang, pathname: '/new/', title: L.fresh.title, description: L.fresh.description, active: 'new', ld: [newCrumbs.ld, itemListLd(lang, fresh)],
    body: `${newCrumbs.html}${pageHead(L.fresh.h1, esc(L.fresh.lead(fmtDate(weekAgo, lang), fmtDate(latest, lang))))}${listSection(LIST.freshCfg, fresh, lang)}`,
  }));

  // Site pages (prerendered) + a client-rendered shell for every other domain
  for (const s of sites.values()) {
    const p = `/site/${s.domain}/`;
    const crumbs = breadcrumbs(lang, [{ name: L.nav.catalog, path: '/sites/' }, { name: s.domain, path: p }]);
    const desc = `${s.domain}: ${L.pricing[s.meta.pricing]}, ${L.access[s.meta.access]}, DR ${s.dr ?? '—'}. ${s.summary}`.slice(0, 158);
    await writePage(lang, p, layout({
      lang, pathname: p, title: L.site.title(s), description: desc, active: 'catalog',
      ld: [crumbs.ld, { '@context': 'https://schema.org', '@type': 'WebPage', name: L.site.title(s), description: s.summary, about: { '@type': 'WebSite', name: s.title, url: s.url } }],
      body: `${crumbs.html}<div data-site data-prerendered>${siteDetail(s, lang)}</div>
<section class="section" data-similar data-domain="${esc(s.domain)}" data-cat="${esc(s.categories[0] || '')}"></section>`,
    }));
  }
  await writePage(lang, '/site/', layout({
    lang, pathname: '/site/', title: L.site.loading, description: L.catalog.description, active: 'catalog', robots: 'noindex,follow', indexable: false,
    body: `<div data-site><p class="msg">${L.site.loading}</p></div><section class="section" data-similar></section>`,
  }));

  // Compare
  const cmpCrumbs = breadcrumbs(lang, [{ name: L.nav.compare, path: '/compare/' }]);
  await writePage(lang, '/compare/', layout({
    lang, pathname: '/compare/', title: L.compare.title, description: L.compare.description, active: 'compare', ld: [cmpCrumbs.ld],
    body: `${cmpCrumbs.html}${pageHead(L.compare.h1, L.compare.lead)}
<form class="cmp-add" data-cmp-add><label class="cmp-niche"><span class="sr-only">${L.filters.niche}</span><select class="input" name="cat">${nicheOptions(lang)}</select></label><span class="input-icon">${icon('plus', 'icon icon-sm')}<input class="input" name="domain" placeholder="${esc(L.compare.addPh)}" aria-label="${esc(L.compare.addPh)}" autocomplete="off" required></span><button class="btn btn-primary">${L.compare.add}</button></form>
<p class="small muted" data-cmp-note aria-live="polite"></p>
<div data-compare-view></div>`,
  }));

  // 404
  const nf = layout({
    lang, pathname: '/404.html', title: L.notFound.title, description: L.notFound.lead, robots: 'noindex', indexable: false,
    body: `<div class="page-head center"><p class="display">404</p><h1 class="h2">${L.notFound.title}</h1><p class="lead">${L.notFound.lead}</p><a class="btn btn-primary" href="${localePath(lang, '/')}">${L.notFound.home}</a></div>`,
  });
  await writePage(lang, '/404.html', nf);
}

// ---------- sitemap, robots, assets ----------

const urlEntry = (p, lang) => `<url><loc>${SITE + localePath(lang, p)}</loc><lastmod>${BUILD_DATE}</lastmod>${LANGS.map((l) => `<xhtml:link rel="alternate" hreflang="${l}" href="${SITE + localePath(l, p)}"/>`).join('')}</url>`;
await writeFile(path.join(DIST, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${sitemap.flatMap((p) => LANGS.map((l) => urlEntry(p, l))).join('\n')}
</urlset>`);
await writeFile(path.join(DIST, 'robots.txt'), `User-agent: *\nAllow: /\nDisallow: /site/$\nDisallow: /en/site/$\n\nSitemap: ${SITE}/sitemap.xml\n`);

await cp(path.join(ROOT, 'src/js'), path.join(DIST, ASSETS, 'js'), { recursive: true });
// Compact index of every prerendered site for instant prefix suggestions (the API has no prefix search).
await writeFile(path.join(DIST, ASSETS, 'sites-index.json'), JSON.stringify([...sites.values()].map((s) => [s.domain, s.title.slice(0, 90), s.dr, s.categories])));
await cp(path.join(ROOT, 'src/css'), path.join(DIST, ASSETS, 'css'), { recursive: true });
await cp(path.join(ROOT, 'src/static'), DIST, { recursive: true });

console.log(`Built ${sitemap.length * LANGS.length} indexable pages (${sites.size} site pages per language) → dist/`);
