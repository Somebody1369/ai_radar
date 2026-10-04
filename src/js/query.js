// What a typed query is about. FreeSerp searches English page text, so "генератор лого" or "чат-бот"
// find nothing there: queries are matched to tasks (config.TASKS words) and niche names locally,
// in both languages. Used by the search box and its suggestions (app.js).
import { TASKS, ALL_CATEGORIES, QUERY_FILLER } from './config.js';
import { taskName, categoryName } from './i18n.js';

const lower = (x) => String(x).toLowerCase();
const PHRASES = [
  [/speech[\s-]*to[\s-]*text|audio[\s-]*to[\s-]*text|(?:голос|аудіо|мовлен)\S* в текст/g, ' stt '],
  [/text[\s-]*to[\s-]*speech|текст\S* в (?:голос|мовлен)\S*/g, ' tts '],
];
// Apostrophes stay inside words: "інтер’єр" is one word, not "інтер" + "єр".
export const queryWords = (q) => PHRASES.reduce((x, [rx, to]) => x.replace(rx, to), lower(q))
  .split(/[^\p{L}\p{N}'’ʼ]+/u).map((w) => w.replace(/['’ʼ]/g, '')).filter(Boolean);
// A stem ending in "." is a whole word (config.TASKS).
const hit = (w, k) => (k.endsWith('.') ? w === k.slice(0, -1) : w.startsWith(k));
const meaningful = (words) => words.filter((w) => !QUERY_FILLER.some((k) => hit(w, k)));
export const cyrillic = (q) => /\p{Script=Cyrillic}/u.test(q || '');

// A topic word scores 2, an action word 1; no topic word means no match. `all`: every word is
// explained by the task, so the query can open the task page instead of a text search.
function taskScore(tk, ws) {
  let topic = 0;
  let score = 0;
  let all = ws.length > 0;
  for (const w of ws) {
    const isTopic = tk.words.topic.some((k) => hit(w, k));
    const isAction = !isTopic && (tk.words.action || []).some((k) => hit(w, k));
    if (isTopic) topic++;
    score += isTopic ? 2 : isAction ? 1 : 0;
    if (!isTopic && !isAction) all = false;
  }
  return topic ? { score, all } : { score: 0, all: false };
}

// Same word up to its ending: a typed prefix ("чат" → "чатбот"), or a shared stem that differs only in
// the last two letters, as Ukrainian endings do ("презентацій" → "Презентації", "логотипів" → "логотипи").
function sameWord(w, nw) {
  if (nw.startsWith(w)) return true;
  if (w.length < 4 || nw.length < 4) return false;
  let i = 0;
  while (i < w.length && w[i] === nw[i]) i++;
  return i >= Math.max(4, Math.min(w.length, nw.length) - 2);
}
// Niche names in both languages, as words. A niche matches when every query word is one of them
// ("чат бот" → "Чат-боти й асистенти").
const nicheWords = new Map(ALL_CATEGORIES.map((c) => [c, [...queryWords(c), ...queryWords(categoryName(c, 'uk'))]]));
const nicheMatch = (c, ws) => ws.length > 0 && ws.every((w) => nicheWords.get(c).some((nw) => sameWord(w, nw)));

// Every typed word starts a word of one of the names: "su" is in "subtitles", "відео мон" in "Монтаж відео".
export function typedIn(names, q) {
  const words = queryWords(q);
  return words.length > 0 && names.some((v) => {
    const nw = queryWords(v);
    return words.every((w) => nw.some((x) => x.startsWith(w)));
  });
}

// The page a query clearly asks for: { task } (by name or by its words), else { niche }; null means
// a text search. A Cyrillic query cannot be searched at all, so for it a partial task match will do.
export function resolveQuery(q) {
  const n = lower(q.trim());
  const named = TASKS.find((tk) => [taskName(tk.slug, 'uk'), taskName(tk.slug, 'en'), tk.slug].some((v) => lower(v) === n));
  if (named) return { task: named };
  const ws = meaningful(queryWords(q));
  const best = TASKS.map((tk) => ({ tk, ...taskScore(tk, ws) }))
    .filter((x) => x.all || (cyrillic(q) && x.score > 0))
    .sort((a, b) => b.score - a.score)[0];
  if (best) return { task: best.tk };
  const niche = ALL_CATEGORIES.filter((c) => nicheMatch(c, ws)).sort((a, b) => nicheWords.get(a).length - nicheWords.get(b).length)[0];
  return niche ? { niche } : null;
}

// Suggestions: tasks named by the typed text or about it, best first; niches whose names it starts.
export function matchTasks(q, limit = 3) {
  const ws = meaningful(queryWords(q));
  return TASKS
    .map((tk) => ({ tk, score: taskScore(tk, ws).score + (typedIn([taskName(tk.slug, 'uk'), taskName(tk.slug, 'en')], q) ? 3 : 0) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((x) => x.tk);
}
export const matchNiches = (q, limit = 3) => ALL_CATEGORIES.filter((c) => nicheMatch(c, queryWords(q))).slice(0, limit);
