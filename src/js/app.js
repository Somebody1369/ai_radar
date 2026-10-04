// Client entry: progressive enhancement on top of the prerendered pages.
import { PAGE_SIZE } from './config.js';
import { search, lookup, setCache } from './api.js';
import { matchesMetaFilters } from './classify.js';
import { t, localePath, fmtNum } from './i18n.js';
import { grid, pagination, message, skeleton, resultsMeta, siteDetail, compareTable, favicon, esc, icon } from './templates.js';
import { readState, writeState, isDeep, toApiParams, pageCount } from './listing.js';

const lang = document.body.dataset.lang === 'en' ? 'en' : 'uk';
const L = t(lang);

// ---------- response cache: memory + sessionStorage (10 min) ----------
const mem = new Map();
setCache({
  get(url) {
    if (mem.has(url)) return mem.get(url);
    try {
      const v = JSON.parse(sessionStorage.getItem(`fs:${url}`));
      if (v && Date.now() - v.at < 600e3) return v.data;
    } catch { /* storage unavailable */ }
    return null;
  },
  set(url, data) {
    mem.set(url, data);
    try {
      const s = JSON.stringify({ at: Date.now(), data });
      if (s.length < 400e3) sessionStorage.setItem(`fs:${url}`, s);
    } catch { /* quota or privacy mode */ }
  },
});

// ---------- favicon fallback (error events do not bubble, so listen in capture) ----------
document.addEventListener('error', (e) => {
  const img = e.target;
  if (img instanceof HTMLImageElement && img.parentElement?.classList.contains('fav')) img.parentElement.classList.add('fav-fallback');
}, true);
// Google returns a 16px globe for unknown domains; treat tiny images as missing too.
document.addEventListener('load', (e) => {
  const img = e.target;
  if (img instanceof HTMLImageElement && img.parentElement?.classList.contains('fav') && img.naturalWidth <= 16) img.parentElement.classList.add('fav-fallback');
}, true);

// ---------- language switch keeps the current path and query ----------
const switcher = document.querySelector('[data-lang-switch]');
if (switcher) {
  const neutral = location.pathname.replace(/^\/en(?=\/|$)/, '') || '/';
  switcher.href = (lang === 'uk' ? `/en${neutral}` : neutral) + location.search;
}

// ---------- compare store ----------
const KEY = 'airadar.compare';
const compare = {
  get() {
    try { return (JSON.parse(localStorage.getItem(KEY)) || []).slice(0, 3); } catch { return []; }
  },
  set(list) {
    try { localStorage.setItem(KEY, JSON.stringify(list.slice(0, 3))); } catch { /* ignore */ }
    document.dispatchEvent(new CustomEvent('compare:change'));
  },
  toggle(domain) {
    const list = compare.get();
    if (list.includes(domain)) return compare.set(list.filter((d) => d !== domain)), true;
    if (list.length >= 3) return false;
    compare.set([...list, domain]);
    return true;
  },
};
const compareHref = (list) => `${localePath(lang, '/compare/')}${list.length ? `?d=${list.map(encodeURIComponent).join(',')}` : ''}`;

function syncCompareButtons() {
  const list = compare.get();
  document.querySelectorAll('[data-compare]').forEach((b) => {
    const on = list.includes(b.dataset.compare);
    b.setAttribute('aria-pressed', String(on));
    b.querySelector('span').textContent = on ? L.card.inCompare : L.card.compare;
    b.querySelector('svg')?.replaceWith(document.createRange().createContextualFragment(icon(on ? 'check' : 'plus', b.classList.contains('btn-sm') ? 'icon icon-xs' : 'icon icon-sm')));
  });
}

const bar = document.querySelector('[data-cmpbar]');
let barNote = '';
function renderBar() {
  if (!bar) return;
  const list = compare.get();
  const onComparePage = Boolean(document.querySelector('[data-compare-view]'));
  bar.hidden = !list.length || onComparePage;
  if (bar.hidden) return;
  bar.innerHTML = `<div class="cmpbar-in">
    <span class="cmpbar-label">${icon('columns', 'icon icon-sm')}${L.compare.bar(list.length)}</span>
    <span class="cmpbar-items">${list.map((d) => `<span class="cmpbar-item">${favicon(d, 18)}<span>${esc(d)}</span><button type="button" class="icon-btn" data-cmp-remove="${esc(d)}" aria-label="${L.compare.remove} ${esc(d)}">${icon('x', 'icon icon-xs')}</button></span>`).join('')}</span>
    ${barNote ? `<span class="cmpbar-note">${esc(barNote)}</span>` : ''}
    <a class="btn btn-primary btn-sm" href="${compareHref(list)}">${L.compare.go}</a>
    <button type="button" class="btn btn-ghost btn-sm" data-cmp-clear aria-label="${L.compare.clear}">${icon('x', 'icon icon-xs')}<span class="cmpbar-clear-text">${L.compare.clear}</span></button>
  </div>`;
}

document.addEventListener('compare:change', () => { syncCompareButtons(); renderBar(); });
document.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-compare]');
  if (btn) {
    barNote = compare.toggle(btn.dataset.compare) ? '' : L.compare.full;
    renderBar();
    return;
  }
  const rm = e.target.closest('[data-cmp-remove]');
  if (rm) { barNote = ''; compare.set(compare.get().filter((d) => d !== rm.dataset.cmpRemove)); return; }
  if (e.target.closest('[data-cmp-clear]')) { barNote = ''; compare.set([]); }
});
syncCompareButtons();
renderBar();

// ---------- list pages ----------
function initList(root) {
  const cfg = JSON.parse(root.dataset.list);
  const form = root.querySelector('[data-filters]');
  const results = root.querySelector('[data-results]');
  const moreKeys = ['cat', 'builder', 'tld', 'dr_min', 'dr_max', 'from', 'to', 'api', 'oss'];
  let state = readState(new URLSearchParams(location.search));
  let ctrl;
  let timer;

  const effectiveSort = (s) => s.sort || (s.q ? 'relevance' : cfg.sort);

  function syncForm(s) {
    for (const el of form.elements) {
      if (!el.name) continue;
      if (el.type === 'checkbox') el.checked = Boolean(s[el.name]);
      else if (el.name === 'sort') el.value = effectiveSort(s);
      else el.value = s[el.name] ?? '';
    }
    const n = moreKeys.filter((k) => s[k] !== undefined).length;
    const badge = form.querySelector('[data-filters-count]');
    if (badge) badge.textContent = n ? ` · ${n}` : '';
    if (n) form.querySelector('details')?.setAttribute('open', '');
  }

  function readForm() {
    const sp = new URLSearchParams();
    for (const [k, v] of new FormData(form)) if (v !== '') sp.set(k, v);
    const s = readState(sp);
    if (s.sort && s.sort === (s.q ? 'relevance' : cfg.sort)) delete s.sort;
    return s;
  }

  const hrefFor = (s) => (n) => {
    const qs = writeState({ ...s, page: n > 1 ? n : undefined });
    return cfg.base + (qs ? `?${qs}` : '');
  };

  async function load(s, { push = false, scroll = false } = {}) {
    state = s;
    const qs = writeState(s);
    const url = cfg.base + (qs ? `?${qs}` : '');
    if (url !== location.pathname + location.search) history[push ? 'pushState' : 'replaceState'](null, '', url);
    // Filter combinations are not canonical pages; keep them out of the index.
    document.querySelector('meta[name="robots"]')?.setAttribute('content', qs ? 'noindex,follow' : 'index,follow');

    ctrl?.abort();
    ctrl = new AbortController();
    results.setAttribute('aria-busy', 'true');
    if (results.querySelector('.grid')) results.classList.add('is-loading');
    else results.innerHTML = skeleton(6);
    if (scroll) root.scrollIntoView({ behavior: 'smooth', block: 'start' });

    try {
      const data = await search(toApiParams(cfg, s), { signal: ctrl.signal });
      let html;
      if (isDeep(s)) {
        const matched = data.results.filter((x) => matchesMetaFilters(x.meta, s));
        const pages = Math.max(1, Math.ceil(matched.length / PAGE_SIZE));
        const page = Math.min(s.page || 1, pages);
        const slice = matched.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
        html = resultsMeta(L.list.deep(matched.length, data.results.length + data.hidden))
          + (slice.length ? grid(slice, lang) : message(L.list.empty))
          + pagination(page, pages, hrefFor(s), lang);
      } else if (!data.results.length) {
        html = message(L.list.empty);
      } else {
        const page = s.page || 1;
        const from = (page - 1) * PAGE_SIZE;
        html = resultsMeta(L.list.shown(from + 1, from + data.results.length + data.hidden, fmtNum(data.total, lang)))
          + grid(data.results, lang)
          + pagination(page, pageCount(data.total), hrefFor(s), lang);
      }
      results.innerHTML = html;
      syncCompareButtons();
    } catch (e) {
      if (e.name === 'AbortError') return;
      results.innerHTML = message(L.list.error, { retry: true, lang });
    } finally {
      results.classList.remove('is-loading');
      results.removeAttribute('aria-busy');
    }
  }

  form.addEventListener('submit', (e) => { e.preventDefault(); clearTimeout(timer); load(readForm(), { push: true }); });
  form.addEventListener('change', (e) => {
    if (e.target.type === 'search') return; // handled by the debounced input listener / submit
    load(readForm(), { push: true });
    syncForm(state);
  });
  form.addEventListener('input', (e) => {
    if (e.target.type !== 'search') return;
    clearTimeout(timer);
    timer = setTimeout(() => load(readForm()), 450);
  });
  form.querySelector('[data-reset]')?.addEventListener('click', (e) => {
    e.preventDefault();
    syncForm({});
    load({}, { push: true });
  });
  results.addEventListener('click', (e) => {
    const a = e.target.closest('[data-page]');
    if (a) {
      e.preventDefault();
      load({ ...state, page: Number(a.dataset.page) > 1 ? Number(a.dataset.page) : undefined }, { push: true, scroll: true });
    }
    if (e.target.closest('[data-retry]')) load(state);
  });
  window.addEventListener('popstate', () => {
    const s = readState(new URLSearchParams(location.search));
    syncForm(s);
    load(s);
  });

  syncForm(state);
  if (Object.keys(state).length || root.hasAttribute('data-empty')) load(state);
}

document.querySelectorAll('[data-list]').forEach(initList);

// ---------- site page ----------
async function loadSimilar(el, domain, cat) {
  if (!el || !cat) return;
  try {
    const data = await search({ ai_categories: cat, sort: 'dr', order: 'desc', size: 7 });
    const list = data.results.filter((s) => s.domain !== domain).slice(0, 6);
    if (list.length) el.innerHTML = `<div class="section-head"><h2 class="h2">${L.site.similar}</h2></div>${grid(list, lang)}`;
    syncCompareButtons();
  } catch { /* similar sites are optional */ }
}

const siteEl = document.querySelector('[data-site]');
const similarEl = document.querySelector('[data-similar]');
if (siteEl?.hasAttribute('data-prerendered')) {
  loadSimilar(similarEl, similarEl.dataset.domain, similarEl.dataset.cat);
} else if (siteEl) {
  const m = location.pathname.match(/\/site\/([^/]+)/);
  const domain = m ? decodeURIComponent(m[1]).toLowerCase() : '';
  if (!domain) location.replace(localePath(lang, '/sites/'));
  else {
    lookup(domain).then((s) => {
      if (!s) {
        document.title = L.site.notFound;
        siteEl.innerHTML = `${message(L.site.notFound)}<p><a class="btn btn-ghost" href="${localePath(lang, '/sites/')}">${L.site.back}</a></p>`;
        return;
      }
      siteEl.innerHTML = siteDetail(s, lang);
      document.title = L.site.title(s);
      document.querySelector('meta[name="description"]')?.setAttribute('content', s.summary.slice(0, 158));
      syncCompareButtons();
      loadSimilar(similarEl, s.domain, s.categories[0]);
    }).catch(() => { siteEl.innerHTML = message(L.list.error, { retry: false, lang }); });
  }
}

// ---------- compare page ----------
const view = document.querySelector('[data-compare-view]');
if (view) {
  const note = document.querySelector('[data-cmp-note]');
  const addForm = document.querySelector('[data-cmp-add]');
  const DOMAIN = /^[a-z0-9.-]+\.[a-z]{2,}$/;
  const fromUrl = (new URLSearchParams(location.search).get('d') || '').split(',').map((d) => d.trim().toLowerCase()).filter((d) => DOMAIN.test(d)).slice(0, 3);
  if (fromUrl.length) compare.set(fromUrl);

  const render = async () => {
    const list = compare.get();
    history.replaceState(null, '', compareHref(list));
    if (!list.length) { view.innerHTML = message(L.compare.empty); return; }
    view.innerHTML = '<div class="card card-skel card-skel-wide"></div>';
    const found = await Promise.all(list.map((d) => lookup(d).catch(() => null)));
    const missing = list.filter((d, i) => !found[i]);
    if (missing.length) note.textContent = missing.map(L.compare.notFound).join(' · ');
    const sites = found.filter(Boolean);
    view.innerHTML = sites.length ? compareTable(sites, lang) : message(L.compare.empty);
  };

  addForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const input = addForm.elements.domain;
    const d = input.value.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '');
    note.textContent = '';
    if (!DOMAIN.test(d)) { note.textContent = L.compare.notFound(input.value); return; }
    const list = compare.get();
    if (list.includes(d)) { input.value = ''; return; }
    if (list.length >= 3) { note.textContent = L.compare.full; return; }
    const s = await lookup(d).catch(() => null);
    if (!s) { note.textContent = L.compare.notFound(d); return; }
    input.value = '';
    compare.set([...list, d]);
  });
  view.addEventListener('click', (e) => {
    const b = e.target.closest('[data-remove]');
    if (b) compare.set(compare.get().filter((d) => d !== b.dataset.remove));
  });
  document.addEventListener('compare:change', render);
  render();
}

