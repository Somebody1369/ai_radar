// Same-origin favicons. Google's favicon service answers 404 (with a placeholder globe) for a domain
// without an icon, and every such answer was an error in the visitor's console. Here a missing icon is
// a 200 with a transparent 1×1 PNG, which the page already treats as "no icon" (an image of 16px or
// less → the letter fallback, src/js/app.js). Only Google's favicon URL for a well-formed domain is
// fetched, so this relays nothing else, and Google no longer sees which visitor looks at which site.
// scripts/serve.mjs runs this same handler locally.

const DOMAIN = /^(?=.{3,253}$)[\p{L}\p{N}-]+(\.[\p{L}\p{N}-]+)+$/u;
// What browsers render as an <img>; anything else (an HTML error page, SVG with scripts) is not passed on.
const IMAGE = /^image\/(png|jpeg|gif|webp|x-icon|vnd\.microsoft\.icon)\b/;
const EMPTY = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR4nGNgAAIAAAUAAXpeqz8AAAAASUVORK5CYII=', 'base64');
const DAY = 86400;

const image = (body, type, maxAge) => new Response(body, {
  status: 200,
  headers: {
    'Content-Type': type,
    'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
    'Cache-Control': `public, max-age=${Math.min(maxAge, DAY)}`,
    // Icons rarely change: one fetch per domain a week is shared by every visitor through the CDN.
    'Netlify-CDN-Cache-Control': `public, durable, max-age=${maxAge}, stale-while-revalidate=${DAY}`,
    'Netlify-Vary': 'query=d',
  },
});

export default async function handler(req) {
  const d = (new URL(req.url).searchParams.get('d') || '').toLowerCase();
  if (req.method !== 'GET' || !DOMAIN.test(d)) {
    return new Response('bad domain', { status: 400, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' } });
  }
  try {
    const up = await fetch(`https://www.google.com/s2/favicons?domain=${encodeURIComponent(d)}&sz=64`, { signal: AbortSignal.timeout(5000) });
    const type = up.headers.get('content-type') || '';
    const body = Buffer.from(await up.arrayBuffer());
    if (up.ok && IMAGE.test(type) && body.length < 100_000) return image(body, type.split(';')[0], 7 * DAY);
    // No icon is an answer too and is cached as long; a Google hiccup only briefly.
    return image(EMPTY, 'image/png', up.status === 404 ? 7 * DAY : 600);
  } catch {
    return image(EMPTY, 'image/png', 60);
  }
}

// A list page shows up to ~40 icons, so the limit is far above /api/fs's: browsing stays well under it,
// a script fetching icons for random domains does not use up the function quota.
export const config = {
  path: '/api/fav',
  rateLimit: { windowLimit: 600, windowSize: 60, aggregateBy: ['ip', 'domain'] },
};
