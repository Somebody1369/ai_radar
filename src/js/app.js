// Client entry: progressive enhancement on top of the prerendered pages.
import { PAGE_SIZE, TASKS, NICHES, ALL_CATEGORIES, slugify } from './config.js';
import { search, lookup, suggest, setCache } from './api.js';
import { matchesMetaFilters } from './classify.js';
import { t, localePath, fmtNum, taskName, categoryName } from './i18n.js';
import { grid, pagination, message, skeleton, resultsMeta, siteDetail, compareTable, favicon, esc, icon, sitePath, categoryHref, setLatest } from './templates.js';
import { readState, writeState, isDeep, hasQuery, defaultSort, effectiveSort, toApiParams, pageCount } from './listing.js';

const lang = document.body.dataset.lang === 'en' ? 'en' : 'uk';
const L = t(lang);
setLatest(document.body.dataset.latest);

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
const checkFav = (img) => {
  if (img.parentElement?.classList.contains('fav') && img.complete && img.naturalWidth <= 16) img.parentElement.classList.add('fav-fallback');
};
document.addEventListener('load', (e) => { if (e.target instanceof HTMLImageElement) checkFav(e.target); }, true);
// Images that finished before this module ran never fire the listeners above.
document.querySelectorAll('.fav img').forEach(checkFav);

// ---------- language switch keeps the current path and query ----------
const switcher = document.querySelector('[data-lang-switch]');
if (switcher) {
  const neutral = location.pathname.replace(/^\/en(?=\/|$)/, '') || '/';
  switcher.href = (lang === 'uk' ? `/en${neutral}` : neutral) + location.search;
}

// ---------- mobile menu (the burger is shown by CSS only on narrow screens) ----------
const header = document.querySelector('.header');
const menuBtn = header?.querySelector('[data-menu]');
if (menuBtn) {
  const setMenu = (open) => {
    header.classList.toggle('is-open', open);
    menuBtn.setAttribute('aria-expanded', String(open));
  };
  menuBtn.addEventListener('click', () => setMenu(menuBtn.getAttribute('aria-expanded') !== 'true'));
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && header.classList.contains('is-open')) { setMenu(false); menuBtn.focus(); }
  });
  document.addEventListener('pointerdown', (e) => { if (!header.contains(e.target)) setMenu(false); });
  matchMedia('(min-width: 861px)').addEventListener('change', (e) => { if (e.matches) setMenu(false); });
  // A page restored from the back/forward cache must not come back with the menu open.
  addEventListener('pageshow', () => setMenu(false));
}

// ---------- compare store ----------
const KEY = 'airadar.compare';
// Unicode letters too: the API returns some IDN domains in their Unicode form.
const DOMAIN = /^[\p{L}\p{N}-]+(\.[\p{L}\p{N}-]+)+$/u;
const compare = {
  get() {
    try {
      const v = JSON.parse(localStorage.getItem(KEY));
      // Storage is user-editable: keep only well-formed domains.
      return Array.isArray(v) ? v.filter((d) => typeof d === 'string' && DOMAIN.test(d)).slice(0, 3) : [];
    } catch { return []; }
  },
  set(list, { quiet = false } = {}) {
    try { localStorage.setItem(KEY, JSON.stringify(list.slice(0, 3))); } catch { /* ignore */ }
    if (!quiet) document.dispatchEvent(new CustomEvent('compare:change'));
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

// ---------- search suggestions ----------
const lower = (x) => String(x).toLowerCase();

// Tasks and niches are matched locally in both languages, so "музика" and "music" both work.
function localMatches(q) {
  const n = lower(q);
  const tasks = TASKS
    .filter((tk) => [taskName(tk.slug, 'uk'), taskName(tk.slug, 'en'), tk.slug].some((v) => lower(v).includes(n)))
    .slice(0, 3)
    .map((tk) => ({ type: 'task', label: taskName(tk.slug, lang), icon: tk.icon, href: localePath(lang, `/tools/${tk.slug}/`) }));
  const niches = ALL_CATEGORIES
    .filter((c) => [c, categoryName(c, 'uk')].some((v) => lower(v).includes(n)))
    .slice(0, 3)
    .map((c) => ({ type: 'niche', label: categoryName(c, lang), icon: 'grid', href: categoryHref(lang, c) }));
  return [...tasks, ...niches];
}

// FreeSerp matches whole words only ("suno" finds suno.com, "su" does not), so known sites from the
// build-time index are matched by prefix locally and API results are appended after them.
let siteIndex;
// Lives next to the versioned assets folder, so resolve it from this module's own URL.
const loadIndex = () => (siteIndex ??= fetch(new URL('../sites-index.json', import.meta.url)).then((r) => r.json()).catch(() => []));

async function siteMatches(q, preset, signal) {
  const n = lower(q);
  const cat = preset.ai_categories;
  const local = (await loadIndex())
    .filter(([domain, title, , cats]) => (!cat || cats.includes(cat)) && (domain.includes(n) || lower(title).includes(n)))
    .map(([domain, title, dr]) => ({ domain, title, dr, rank: domain.startsWith(n) ? 0 : domain.includes(n) ? 1 : 2 }))
    .sort((a, b) => a.rank - b.rank || (b.dr ?? -1) - (a.dr ?? -1))
    .slice(0, 4);
  let remote = [];
  try {
    remote = await suggest(q, preset, { signal });
  } catch (e) {
    if (e.name === 'AbortError') throw e;
  }
  const seen = new Set(local.map((x) => x.domain));
  return [...local, ...remote.filter((x) => !seen.has(x.domain))]
    .slice(0, 7)
    .map((x) => ({ type: 'site', label: x.domain, domain: x.domain, title: x.title, dr: x.dr, href: sitePath(lang, x.domain) }));
}

// Without a chosen niche, keep suggestions inside the AI part of the index.
const nicheScope = (cat) => (cat ? { ai_categories: cat } : { category: 'ai' });

const highlight = (text, q) => {
  const i = lower(text).indexOf(lower(q));
  return i < 0 ? esc(text) : `${esc(text.slice(0, i))}<mark>${esc(text.slice(i, i + q.length))}</mark>${esc(text.slice(i + q.length))}`;
};

let acCount = 0;
// Accessible combobox: arrows move, Enter picks the highlighted row, Enter without a row submits the form.
function autocomplete(input, { source, onPick = (it) => { location.href = it.href; } }) {
  const list = document.createElement('ul');
  list.className = 'ac';
  list.id = `ac-${++acCount}`;
  list.setAttribute('role', 'listbox');
  list.hidden = true;
  input.parentElement.append(list);
  Object.entries({ role: 'combobox', 'aria-autocomplete': 'list', 'aria-expanded': 'false', 'aria-controls': list.id, autocomplete: 'off' })
    .forEach(([k, v]) => input.setAttribute(k, v));

  let items = [];
  let active = -1;
  let timer;
  let ctrl;
  const groupLabel = { task: L.suggest.tasks, niche: L.suggest.niches, site: L.suggest.sites };

  const close = () => {
    list.hidden = true;
    active = -1;
    input.setAttribute('aria-expanded', 'false');
    input.removeAttribute('aria-activedescendant');
  };
  const setActive = (i) => {
    active = i;
    list.querySelectorAll('[role="option"]').forEach((el) => el.setAttribute('aria-selected', String(Number(el.dataset.i) === i)));
    const el = document.getElementById(`${list.id}-${i}`);
    if (el) { input.setAttribute('aria-activedescendant', el.id); el.scrollIntoView({ block: 'nearest' }); }
  };
  const pick = (it) => { close(); onPick(it); };

  function render(q) {
    let html = '';
    let group = '';
    items.forEach((it, i) => {
      if (it.type !== group) { group = it.type; html += `<li class="ac-group" role="presentation">${groupLabel[group]}</li>`; }
      const lead = it.type === 'site' ? favicon(it.domain, 24) : `<span class="ac-icon">${icon(it.icon, 'icon icon-sm')}</span>`;
      html += `<li role="option" id="${list.id}-${i}" data-i="${i}" aria-selected="false">${lead}
        <span class="ac-text"><span class="ac-label">${highlight(it.label, q)}</span>${it.type === 'site' ? `<span class="ac-sub">${esc(it.title)}</span>` : ''}</span>
        ${it.type === 'site' && it.dr !== null ? `<span class="ac-dr">DR ${it.dr}</span>` : ''}</li>`;
    });
    list.innerHTML = html || `<li class="ac-empty" role="presentation">${L.suggest.empty}</li>`;
    list.hidden = false;
    active = -1;
    input.setAttribute('aria-expanded', 'true');
  }

  input.addEventListener('input', () => {
    clearTimeout(timer);
    const q = input.value.trim();
    if (q.length < 2) { ctrl?.abort(); close(); return; }
    timer = setTimeout(async () => {
      ctrl?.abort();
      ctrl = new AbortController();
      try { items = await source(q, ctrl.signal); } catch (e) { if (e.name === 'AbortError') return; items = []; }
      if (document.activeElement === input && input.value.trim() === q) render(q);
    }, 220);
  });
  input.addEventListener('keydown', (e) => {
    if (list.hidden || !items.length) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((active + 1) % items.length); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((active - 1 + items.length) % items.length); }
    else if (e.key === 'Enter' && active >= 0) { e.preventDefault(); pick(items[active]); }
    else if (e.key === 'Escape') close();
  });
  input.addEventListener('blur', () => setTimeout(close, 150));
  input.form?.addEventListener('submit', close);
  list.addEventListener('mousedown', (e) => e.preventDefault()); // keep focus in the input
  list.addEventListener('click', (e) => {
    const li = e.target.closest('[role="option"]');
    if (li) pick(items[Number(li.dataset.i)]);
  });
}

// ---------- custom selects ----------
// The native <select> stays in the form (FormData, change events, no-JS fallback) but is hidden;
// a button + listbox in the app's style drives it. Programmatic `select.value = …` (used by the
// list controller) is intercepted so the button label always matches.
const nativeValue = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value');
let ddCount = 0;

function customSelect(select) {
  const id = `dd-${++ddCount}`;
  const wrap = document.createElement('span');
  wrap.className = 'dd';
  select.before(wrap);
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = `${select.className} dd-btn`;
  btn.setAttribute('aria-haspopup', 'listbox');
  btn.setAttribute('aria-expanded', 'false');
  btn.setAttribute('aria-controls', id);
  const list = document.createElement('ul');
  list.className = 'ac dd-list';
  list.id = id;
  list.tabIndex = -1;
  list.setAttribute('role', 'listbox');
  list.hidden = true;
  // Button first: a wrapping <label> then targets it, so clicking the label text opens the list.
  wrap.append(btn, select, list);
  select.classList.add('dd-native');
  select.tabIndex = -1;
  select.setAttribute('aria-hidden', 'true');

  const label = select.closest('label')?.querySelector('.field-label, .sr-only')?.textContent.trim() || '';
  const options = () => [...select.options];
  let active = -1;

  function refresh() {
    const opt = select.selectedOptions[0] || select.options[0];
    btn.textContent = opt?.textContent || '';
    btn.setAttribute('aria-label', label ? `${label}: ${btn.textContent}` : btn.textContent);
  }
  Object.defineProperty(select, 'value', {
    configurable: true,
    get() { return nativeValue.get.call(this); },
    set(v) { nativeValue.set.call(this, v); refresh(); },
  });

  function render() {
    let i = 0;
    const optHtml = (o) => {
      const sel = o.selected;
      return `<li role="option" id="${id}-${i}" data-i="${i++}" aria-selected="${sel}"${o.disabled ? ' aria-disabled="true"' : ''}>${esc(o.textContent)}${sel ? icon('check', 'icon icon-sm dd-check') : ''}</li>`;
    };
    list.innerHTML = [...select.children].map((el) => (el.tagName === 'OPTGROUP'
      ? `<li class="ac-group" role="presentation">${esc(el.label)}</li>${[...el.children].map(optHtml).join('')}`
      : optHtml(el))).join('');
  }

  function setActive(i) {
    const items = list.querySelectorAll('[role="option"]');
    if (!items.length) return;
    active = Math.max(0, Math.min(items.length - 1, i));
    items.forEach((el) => el.classList.toggle('is-active', Number(el.dataset.i) === active));
    list.setAttribute('aria-activedescendant', `${id}-${active}`);
    items[active].scrollIntoView({ block: 'nearest' });
  }

  function open() {
    if (!list.hidden) return;
    document.dispatchEvent(new CustomEvent('dd:open', { detail: list }));
    render();
    list.hidden = false;
    btn.setAttribute('aria-expanded', 'true');
    wrap.classList.add('is-open');
    // Prefer opening down; flip up only when the room below is tight. The sticky header and the
    // floating compare bar both cover the viewport, so measure the space between them.
    const r = btn.getBoundingClientRect();
    const top = (document.querySelector('.header')?.getBoundingClientRect().bottom || 0) + 8;
    const cmp = document.querySelector('[data-cmpbar]:not([hidden])');
    const bottom = (cmp ? cmp.getBoundingClientRect().top : innerHeight) - 8;
    const below = bottom - r.bottom - 8;
    const above = r.top - top - 8;
    const up = below < 220 && above > below;
    wrap.classList.toggle('dd-up', up);
    list.style.maxHeight = `${Math.max(160, Math.min(380, up ? above : below))}px`;
    wrap.classList.remove('dd-right');
    if (list.getBoundingClientRect().right > innerWidth - 8) wrap.classList.add('dd-right');
    list.focus({ preventScroll: true });
    setActive(Math.max(0, select.selectedIndex));
  }

  function close(focusBtn = true) {
    if (list.hidden) return;
    list.hidden = true;
    btn.setAttribute('aria-expanded', 'false');
    wrap.classList.remove('is-open');
    list.removeAttribute('aria-activedescendant');
    if (focusBtn) btn.focus({ preventScroll: true });
  }

  function choose(i) {
    const opt = options()[i];
    close();
    if (!opt || opt.selected || opt.disabled) return;
    select.value = opt.value;
    select.dispatchEvent(new Event('change', { bubbles: true }));
  }

  btn.addEventListener('click', (e) => { e.preventDefault(); list.hidden ? open() : close(); });
  btn.addEventListener('keydown', (e) => {
    if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) { e.preventDefault(); open(); }
  });

  let typed = '';
  let typedTimer;
  list.addEventListener('keydown', (e) => {
    const n = options().length;
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(active + 1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(active - 1); }
    else if (e.key === 'Home') { e.preventDefault(); setActive(0); }
    else if (e.key === 'End') { e.preventDefault(); setActive(n - 1); }
    else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); choose(active); }
    else if (e.key === 'Escape') { e.preventDefault(); close(); }
    else if (e.key === 'Tab') close(false);
    else if (e.key.length === 1) {
      // Type-ahead: jump to the first option starting with the typed letters.
      clearTimeout(typedTimer);
      typed += e.key.toLowerCase();
      typedTimer = setTimeout(() => { typed = ''; }, 600);
      const hit = options().findIndex((o) => o.textContent.toLowerCase().startsWith(typed));
      if (hit >= 0) setActive(hit);
    }
  });
  list.addEventListener('mousemove', (e) => {
    const li = e.target.closest('[role="option"]');
    if (li && Number(li.dataset.i) !== active) setActive(Number(li.dataset.i));
  });
  list.addEventListener('click', (e) => {
    // The list sits inside the field's <label>: without this the label forwards the click to the
    // button and the list opens again right after a choice.
    e.preventDefault();
    const li = e.target.closest('[role="option"]');
    if (li) choose(Number(li.dataset.i));
  });
  list.addEventListener('focusout', (e) => { if (!wrap.contains(e.relatedTarget)) close(false); });
  document.addEventListener('pointerdown', (e) => { if (!wrap.contains(e.target)) close(false); });
  document.addEventListener('dd:open', (e) => { if (e.detail !== list) close(false); });

  refresh();
}

document.querySelectorAll('select.input').forEach(customSelect);

// Home hero: niche + query. A niche alone opens its SEO page; anything else goes to the catalog.
const hero = document.querySelector('[data-hero-search]');
if (hero) {
  const catOf = () => hero.elements.cat.value;
  autocomplete(hero.elements.q, {
    source: async (q, signal) => [...localMatches(q), ...(await siteMatches(q, nicheScope(catOf()), signal))],
  });
  hero.addEventListener('submit', (e) => {
    e.preventDefault();
    const q = hero.elements.q.value.trim();
    const cat = catOf();
    // A query that names a task ("музика", "logos") opens the tool finder for it.
    const task = q && TASKS.find((tk) => [taskName(tk.slug, 'uk'), taskName(tk.slug, 'en'), tk.slug].some((v) => lower(v) === lower(q)));
    if (task) { location.href = localePath(lang, `/tools/${task.slug}/`); return; }
    if (!q && NICHES.includes(cat)) { location.href = localePath(lang, `/niche/${slugify(cat)}/`); return; }
    const qs = writeState({ cat: cat || undefined, q: q || undefined });
    location.href = localePath(lang, '/sites/') + (qs ? `?${qs}` : '');
  });
}

// ---------- tabs (home: new startups by niche) ----------
document.querySelectorAll('[data-tabs]').forEach((root) => {
  const tabs = [...root.querySelectorAll('[role="tab"]')];
  const select = (tab, focus = false) => {
    tabs.forEach((t2) => {
      const on = t2 === tab;
      t2.setAttribute('aria-selected', String(on));
      t2.tabIndex = on ? 0 : -1;
      document.getElementById(t2.getAttribute('aria-controls')).hidden = !on;
    });
    if (focus) tab.focus();
    syncCompareButtons();
  };
  tabs.forEach((tab, i) => {
    tab.addEventListener('click', () => select(tab));
    tab.addEventListener('keydown', (e) => {
      const next = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: tabs.length - 1 }[e.key];
      if (next === undefined) return;
      e.preventDefault();
      select(tabs[(next + tabs.length) % tabs.length], true);
    });
  });
});

// ---------- list pages ----------
function initList(root) {
  const cfg = JSON.parse(root.dataset.list);
  const form = root.querySelector('[data-filters]');
  const results = root.querySelector('[data-results]');
  const moreKeys = ['builder', 'tld', 'dr_min', 'dr_max', 'from', 'to', 'api', 'oss'];
  const presetCat = cfg.preset.ai_categories || '';
  let state = readState(new URLSearchParams(location.search));
  let ctrl;
  let timer;
  // One persistent live region: the results markup is replaced wholesale, which screen readers skip.
  const status = document.createElement('p');
  status.className = 'sr-only';
  status.setAttribute('aria-live', 'polite');
  root.append(status);

  // "Relevance" is offered only while there is a query to be relevant to.
  const relevance = form.querySelector('select[name="sort"] option[value="relevance"]');
  const syncRelevance = (s) => { if (relevance) relevance.disabled = !hasQuery(cfg, s); };

  function syncForm(s) {
    syncRelevance(s);
    for (const el of form.elements) {
      if (!el.name) continue;
      if (el.type === 'checkbox') el.checked = Boolean(s[el.name]);
      else if (el.name === 'sort') el.value = effectiveSort(cfg, s);
      else if (el.name === 'cat') el.value = s.cat === 'all' ? '' : s.cat ?? presetCat;
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
    // The page's own niche is the default (not stored in the URL); clearing it means "all niches".
    if (presetCat) {
      const cat = form.elements.cat?.value ?? presetCat;
      if (cat === presetCat) sp.delete('cat');
      else if (cat === '') sp.set('cat', 'all');
    }
    const s = readState(sp);
    // The select always shows the current default; it is a choice only once the visitor changes it,
    // so a new query or "all niches" can still switch the default (e.g. to relevance).
    if (!state.sort && s.sort === effectiveSort(cfg, state)) delete s.sort;
    if (s.sort === 'relevance' && !hasQuery(cfg, s)) delete s.sort;
    if (s.sort && s.sort === defaultSort(cfg, s)) delete s.sort;
    return s;
  }

  // Deep (pricing/access) filters scan the hinted query ("… free", "… no sign up") and the plain one
  // together: the hint finds pages that state it, the plain query keeps tools that phrase it differently.
  async function fetchList(s, signal) {
    const params = toApiParams(cfg, s);
    const plain = toApiParams(cfg, s, { nudge: false });
    if (!isDeep(s) || plain.q === params.q) return search(params, { signal });
    const [a, b] = await Promise.all([search(params, { signal }), search(plain, { signal })]);
    const seen = new Set();
    const results = [...a.results, ...b.results].filter((x) => !seen.has(x.domain) && seen.add(x.domain));
    return { total: results.length, results, hidden: a.hidden + b.hidden };
  }

  const hrefFor = (s) => (n) => {
    const qs = writeState({ ...s, page: n > 1 ? n : undefined });
    return cfg.base + (qs ? `?${qs}` : '');
  };

  async function load(s, { push = false, scroll = false } = {}) {
    state = s;
    // Typing a query changes the default order: keep the sort control in step with what is loaded.
    syncRelevance(s);
    if (form.elements.sort) form.elements.sort.value = effectiveSort(cfg, s);
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
      const data = await fetchList(s, ctrl.signal);
      let html;
      if (isDeep(s)) {
        const matched = data.results.filter((x) => matchesMetaFilters(x.meta, s));
        const pages = Math.max(1, Math.ceil(matched.length / PAGE_SIZE));
        const page = Math.min(s.page || 1, pages);
        const slice = matched.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
        html = resultsMeta(L.list.deep(matched.length, data.results.length + data.hidden))
          + (slice.length ? grid(slice, lang) : message(data.results.length ? L.list.deepEmpty : L.list.empty))
          + pagination(page, pages, hrefFor(s), lang);
      } else if (!data.results.length && !data.hidden) {
        html = message(L.list.empty);
      } else {
        // A page can be fully hidden by the blocklist; keep the pagination so later pages stay reachable.
        const page = s.page || 1;
        const from = (page - 1) * PAGE_SIZE;
        html = resultsMeta(L.list.shown(from + 1, from + data.results.length + data.hidden, fmtNum(data.total, lang)))
          + (data.results.length ? grid(data.results, lang) : message(L.list.empty))
          + pagination(page, pageCount(data.total), hrefFor(s), lang);
      }
      results.innerHTML = html;
      status.textContent = results.querySelector('.results-meta, .msg')?.textContent || '';
      syncCompareButtons();
    } catch (e) {
      if (e.name === 'AbortError') return;
      results.innerHTML = message(L.list.error, { retry: true, lang });
      status.textContent = L.list.error;
    } finally {
      results.classList.remove('is-loading');
      results.removeAttribute('aria-busy');
    }
  }

  form.addEventListener('submit', (e) => { e.preventDefault(); clearTimeout(timer); load(readForm(), { push: true }); });
  form.addEventListener('change', (e) => {
    if (e.target.type === 'search') return; // handled by the debounced input listener / submit
    if (cfg.nicheNav && e.target.name === 'cat') {
      const v = e.target.value;
      location.href = !v ? localePath(lang, '/sites/') : NICHES.includes(v) ? localePath(lang, `/niche/${slugify(v)}/`) : localePath(lang, `/sites/?cat=${encodeURIComponent(v)}`);
      return;
    }
    load(readForm(), { push: true });
    syncForm(state);
  });
  form.addEventListener('input', (e) => {
    if (e.target.type !== 'search') return;
    syncRelevance({ ...state, q: e.target.value.trim() });
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

  // Suggestions follow the niche currently selected in this form.
  const qInput = form.elements.q;
  if (qInput) {
    autocomplete(qInput, {
      source: async (q, signal) => {
        const cat = form.elements.cat?.value;
        const scope = cat ? { ai_categories: cat } : cfg.preset.ai_startups ? { ai_startups: 1 } : {};
        return [...localMatches(q), ...(await siteMatches(q, scope, signal))];
      },
    });
  }

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
  let domain = '';
  try { domain = m ? decodeURIComponent(m[1]).toLowerCase() : ''; } catch { domain = m[1]; /* malformed %-escape */ }
  const notFound = () => {
    document.title = L.site.notFound;
    siteEl.innerHTML = `${message(L.site.notFound)}<p><a class="btn btn-ghost" href="${localePath(lang, '/sites/')}">${L.site.back}</a></p>`;
  };
  if (!domain) location.replace(localePath(lang, '/sites/'));
  else if (!DOMAIN.test(domain)) notFound();
  else {
    lookup(domain).then((s) => {
      if (!s) { notFound(); return; }
      siteEl.innerHTML = siteDetail(s, lang);
      document.title = L.site.title(s);
      document.querySelector('meta[name="description"]')?.setAttribute('content', s.summary.slice(0, 158));
      document.querySelector('link[rel="canonical"]')?.setAttribute('href', location.origin + sitePath(lang, s.domain));
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
  const fromUrl = (new URLSearchParams(location.search).get('d') || '').split(',').map((d) => d.trim().toLowerCase()).filter((d) => DOMAIN.test(d)).slice(0, 3);
  if (fromUrl.length) compare.set(fromUrl);

  let renderId = 0;
  const render = async () => {
    const id = ++renderId;
    const list = compare.get();
    history.replaceState(null, '', compareHref(list));
    note.textContent = '';
    if (!list.length) { view.innerHTML = message(L.compare.empty); return; }
    view.innerHTML = compareTable(list.map((domain) => ({ domain })), lang);
    // null = not in the index, undefined = request failed (keep it: the next visit may succeed).
    const found = await Promise.all(list.map((d) => lookup(d).catch(() => undefined)));
    if (id !== renderId) return; // a newer change already re-rendered
    const missing = list.filter((d, i) => found[i] === null);
    if (missing.length) {
      note.textContent = missing.map(L.compare.notFound).join(' · ');
      // Drop them from the list: they have no column, so they could not be removed otherwise.
      compare.set(list.filter((d) => !missing.includes(d)), { quiet: true });
      history.replaceState(null, '', compareHref(compare.get()));
    }
    const sites = found.filter(Boolean);
    view.innerHTML = sites.length ? compareTable(sites, lang) : message(L.compare.empty);
  };

  const input = addForm.elements.domain;
  async function addDomain(raw) {
    const d = raw.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '');
    note.textContent = '';
    if (!DOMAIN.test(d)) { note.textContent = L.compare.notFound(raw); return; }
    const list = compare.get();
    if (list.includes(d)) { input.value = ''; return; }
    if (list.length >= 3) { note.textContent = L.compare.full; return; }
    const s = await lookup(d).catch(() => null);
    if (!s) { note.textContent = L.compare.notFound(d); return; }
    input.value = '';
    compare.set([...list, d]);
  }
  addForm.addEventListener('submit', (e) => { e.preventDefault(); addDomain(input.value); });
  autocomplete(input, {
    source: (q, signal) => siteMatches(q, nicheScope(addForm.elements.cat.value), signal),
    onPick: (it) => addDomain(it.domain),
  });
  view.addEventListener('click', (e) => {
    const b = e.target.closest('[data-remove]');
    if (b) compare.set(compare.get().filter((d) => d !== b.dataset.remove));
  });
  document.addEventListener('compare:change', render);
  render();
}

