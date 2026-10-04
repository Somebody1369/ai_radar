// Renders the link-preview images (og:image, 1200×630) from scripts/og.html with a local Chrome:
//   npm run og  →  src/static/og-uk.png, src/static/og-en.png (copied to the site root by the build)
// Not part of `npm run build`: Netlify has no Chrome, and the images change only with the design.
// CHROME=/path/to/chrome overrides the browser. A throwaway profile keeps an open Chrome untouched.
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CHROME = process.env.CHROME || [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
].find(existsSync);
if (!CHROME) {
  console.error('✗ Chrome not found: set CHROME=/path/to/chrome');
  process.exit(1);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const size = (f) => (existsSync(f) ? statSync(f).size : 0);

// Headless Chrome writes the screenshot but does not always exit afterwards, so wait for the file
// to stop growing and close the browser ourselves.
async function shot(url, out) {
  rmSync(out, { force: true });
  const profile = mkdtempSync(path.join(tmpdir(), 'ai-radar-og-'));
  const chrome = spawn(CHROME, [
    '--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run', `--user-data-dir=${profile}`,
    '--force-device-scale-factor=1', '--window-size=1200,630',
    // Time for Inter to arrive from Google Fonts before the shot.
    '--virtual-time-budget=10000',
    `--screenshot=${out}`, url,
  ], { stdio: 'ignore' });
  try {
    const deadline = Date.now() + 45000;
    let last = -1;
    while (!(size(out) > 0 && size(out) === last)) {
      if (Date.now() > deadline) throw new Error(`no screenshot after 45 s: ${out}`);
      if (chrome.exitCode !== null && !size(out)) throw new Error(`Chrome exited (${chrome.exitCode}) without ${out}`);
      last = size(out);
      await sleep(400);
    }
  } finally {
    chrome.kill('SIGKILL');
    await sleep(300);
    rmSync(profile, { recursive: true, force: true });
  }
}

const page = pathToFileURL(path.join(ROOT, 'scripts/og.html'));
for (const lang of ['uk', 'en']) {
  const out = path.join(ROOT, 'src/static', `og-${lang}.png`);
  await shot(`${page}?lang=${lang}`, out);
  console.log(`✓ ${path.relative(ROOT, out)}`);
}
