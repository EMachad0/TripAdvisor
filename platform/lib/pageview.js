// `atr render <url>`: load a public page in the installed Chrome and return its visible text (and a
// screenshot on request). For pages that only show their content after JavaScript runs (date searches,
// hostel prices), where a plain fetch sees nothing. Also the browser fallback of `atr links`.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { dataRoots } from './paths.js';
import { acquireSlot, chromeProxy, cacheDir, progress, sleep } from './net.js';

// A normal desktop browser User-Agent; nothing that identifies this project or its user.
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';
const PRIVATE = /^(localhost|127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|\[?::1\]?|0\.0\.0\.0)|\.local$|\.internal$/i;
/** At most this many renders at once on this machine (all sessions); more wait for a slot. */
export const RENDER_SLOTS = 3;
/** Text longer than this is also saved to a file: the shell tool that runs ./atr cuts output near 30k characters. */
export const SAVE_TEXT_OVER = 20000;

/** Public http(s) pages only. Returns an error text, or null when the URL is fine. */
export function renderUrlProblem(url, { allowLocal = false } = {}) {
  let u;
  try { u = new URL(url); } catch { return `"${url}" is not a URL (give a full https:// address)`; }
  if (!/^https?:$/.test(u.protocol)) return `only http(s) pages can be rendered, not ${u.protocol}`;
  if (!allowLocal && PRIVATE.test(u.hostname)) return `${u.hostname} is a local or private address: only public pages`;
  if (u.username || u.password) return 'URLs with a user name or password are not rendered';
  return null;
}

/** Collapse a page's innerText: trim lines, drop runs of blank lines. */
export function tidyText(text, maxChars = 12000) {
  const t = String(text || '').split('\n').map((l) => l.replace(/\s+/g, ' ').trim()).join('\n').replace(/\n{3,}/g, '\n\n').trim();
  return t.length > maxChars ? { text: t.slice(0, maxChars), truncated: t.length - maxChars } : { text: t, truncated: 0 };
}

const BOT_RE = /just a moment|attention required|checking (if the site connection is secure|your browser)|verify (that )?you are (a )?human|are you a robot|captcha|access denied|request blocked|pardon our interruption|security check|environment checking|whaleguard|ddos protection|enable javascript and cookies|unusual traffic|bot detection|sorry, you have been blocked/i;
/** A bot wall instead of the page? Returns a short reason or null. */
export function botCheck({ title = '', text = '', status = null } = {}) {
  const head = `${title}\n${String(text).slice(0, 800)}`;
  const m = head.match(BOT_RE);
  if (m && String(text).length < 4000) return `"${m[0]}"${status ? `, HTTP ${status}` : ''}`;
  if ([401, 403, 412, 429, 432].includes(status) && String(text).trim().length < 800) return `HTTP ${status} with almost no text`;
  return null;
}

/** Same page? Ignores a trailing slash, the fragment and http→https. */
export function sameUrl(a, b) {
  const n = (x) => { try { const u = new URL(x); u.hash = ''; return `${u.host.replace(/^www\./, '')}${u.pathname.replace(/\/$/, '')}${u.search}`; } catch { return x; } };
  return n(a) === n(b);
}

/** Launch the installed Chrome, through the environment's proxy when there is one (sandboxed sessions). */
export async function launchBrowser() {
  const { chromium } = await import('playwright-core');
  const proxy = chromeProxy();
  const base = { headless: true, ...(proxy ? { proxy } : {}) };
  try { return await chromium.launch({ channel: 'chrome', ...base }); } catch (e) {
    const p = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
    if (fs.existsSync(p)) return chromium.launch({ executablePath: p, ...base });
    throw new Error(`Could not launch Google Chrome (${e.message.split('\n')[0]}). Install Chrome or set CHROME_PATH.`);
  }
}

const NAV_GONE = /Execution context was destroyed|because of a navigation|frame was detached/i; // never match Playwright's "navigating to" call log
/** page.evaluate that survives the page navigating underneath it (redirects, reloads after load). */
// Race a promise against a time limit, and cancel the timer when the promise wins: a pending timer keeps the
// process alive, which made every `atr render` last its whole --timeout.
function within(promise, ms, fallback) {
  let t;
  return Promise.race([promise, new Promise((r) => { t = setTimeout(() => r(fallback), ms); })]).finally(() => clearTimeout(t));
}

async function evalSettled(page, fn, arg, { tries = 4 } = {}) {
  let last;
  for (let i = 0; i < tries; i++) {
    try { return await page.evaluate(fn, arg); } catch (e) {
      last = e;
      if (!NAV_GONE.test(e.message.split('\n')[0])) throw e;
      await page.waitForLoadState('domcontentloaded', { timeout: 10000 }).catch(() => {});
      await page.waitForTimeout(1500);
    }
  }
  throw last;
}

const RETRY_NET = /ERR_CONNECTION_REFUSED|ERR_CONNECTION_RESET|ERR_CONNECTION_CLOSED|ERR_EMPTY_RESPONSE|ERR_NETWORK_CHANGED|ERR_TIMED_OUT|ERR_SOCKET_NOT_CONNECTED/;
function explainNav(msg) {
  const m = msg.split('\n')[0].replace(/^page\.goto:\s*/, '');
  if (/ERR_CONNECTION_REFUSED/.test(m)) return `${m}. The site (or something between) refused the connection twice. Common causes: the site rate-limits this machine after a few requests (wait a minute), or this session runs in a sandbox whose proxy Chrome could not use. If curl opens it, the site is up: say so in confidence_note rather than dropping the source.`;
  if (/ERR_NAME_NOT_RESOLVED/.test(m)) return `${m}. The host name did not resolve from this machine (check the spelling; in a sandbox, DNS may be unavailable).`;
  if (/ERR_CERT|ERR_SSL/.test(m)) return `${m}. Chrome rejected the site's certificate; try the http:// address.`;
  return m;
}

/**
 * Render a page. opts: { waitS = 2 (extra seconds after network idle), shot, maxChars = 12000, timeoutS = 60 (hard
 * limit for the whole render), links, expand, click: [selector], allowLocal, slots = RENDER_SLOTS }
 * Returns { url, finalUrl, redirected, status, title, text, truncated, chars, settled, blocked?, links?, clicks?, textFile?, shot? }.
 * A fresh browser context per call: no cookies or storage are kept. Never runs past timeoutS (plus a few seconds
 * to close): when the page has not settled by then, it returns the text rendered so far with settled: false.
 */
export async function renderPage(url, opts = {}) {
  const problem = renderUrlProblem(url, opts);
  if (problem) throw new Error(problem);
  if ((opts.offline ?? process.env.ATR_OFFLINE === '1') && !opts.allowLocal) throw new Error("ATR_OFFLINE=1: can't load web pages offline");
  const timeoutMs = Math.max(5, opts.timeoutS ?? 60) * 1000;
  const release = await acquireSlot(path.join(cacheDir(), 'locks'), 'render', {
    slots: opts.slots ?? RENDER_SLOTS, staleMs: 15 * 60_000, maxWaitMs: 5 * 60_000,
    onWait: (s, n) => progress(`waiting ${s} s for a render slot (${n} renders already running on this machine)`),
  });
  const deadline = Date.now() + timeoutMs;
  const left = () => deadline - Date.now();
  let browser, page;
  const out = { url, finalUrl: url, redirected: false, status: null, title: '', text: '', truncated: 0, chars: 0, settled: true };
  let raw = '';
  const work = (async () => {
    browser = await launchBrowser();
    const ctx = await browser.newContext({ userAgent: UA, viewport: { width: 1280, height: 900 }, locale: 'en-US' });
    page = await ctx.newPage();
    let res;
    for (let attempt = 0; ; attempt++) {
      try { res = await page.goto(url, { waitUntil: 'networkidle', timeout: Math.max(3000, Math.min(45000, left() - 8000)) }); break; } catch (e) {
        if (/Timeout/i.test(e.message)) break; // pages that never go idle (trackers, long polling): take what has rendered
        if (NAV_GONE.test(e.message.split('\n')[0]) && !/net::ERR_/.test(e.message)) { await page.waitForLoadState('domcontentloaded', { timeout: 10000 }).catch(() => {}); break; }
        if (attempt === 0 && RETRY_NET.test(e.message) && left() > 15000) { await sleep(3000); continue; }
        throw new Error(`could not load the page: ${explainNav(e.message)}`);
      }
    }
    out.status = res?.status() ?? null;
    await page.waitForTimeout(Math.max(0, Math.min((opts.waitS ?? 2) * 1000, left() - 5000)));
    out.clicks = [];
    for (const sel of [].concat(opts.click || [])) {
      try {
        await page.click(sel, { timeout: 8000 });
        await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
        await page.waitForTimeout(1000);
        out.clicks.push({ selector: sel, ok: true });
      } catch (e) { out.clicks.push({ selector: sel, ok: false, error: e.message.split('\n')[0].replace(/^page\.click:\s*/, '') }); }
    }
    if (opts.expand) {
      out.expanded = await evalSettled(page, async () => {
        let n = 0;
        for (let pass = 0; pass < 3; pass++) {
          document.querySelectorAll('details:not([open])').forEach((d) => { d.open = true; n++; });
          const els = [...document.querySelectorAll('[aria-expanded="false"]')].slice(0, 200);
          if (!els.length) break;
          for (const el of els) { try { el.click(); n++; } catch { /* ignore */ } }
          await new Promise((r) => setTimeout(r, 600));
        }
        return n;
      });
      await page.waitForTimeout(800);
    }
    raw = await evalSettled(page, () => document.body?.innerText || '');
    out.title = await page.title().catch(() => '');
    if (opts.links) {
      out.links = await evalSettled(page, () => {
        const seen = new Set(), list = [];
        for (const el of document.querySelectorAll('a[href], [onclick]')) {
          const text = (el.innerText || el.getAttribute('aria-label') || el.title || '').replace(/\s+/g, ' ').trim().slice(0, 100);
          const href = el.getAttribute('href');
          let target = '';
          if (href && !/^javascript:/i.test(href) && href !== '#') { try { target = new URL(href, location.href).href; } catch { target = href; } }
          else target = (href && /^javascript:/i.test(href) ? href : el.getAttribute('onclick') || '').replace(/\s+/g, ' ').trim().slice(0, 200);
          if (!target) continue;
          const key = `${text}|${target}`;
          if (seen.has(key)) continue;
          seen.add(key);
          list.push({ text, href: target, script: !/^https?:|^mailto:|^tel:/i.test(target) });
          if (list.length >= 1000) break;
        }
        return list;
      });
    }
    if (opts.shot) {
      const dir = path.join(dataRoots(opts).cache, 'render');
      fs.mkdirSync(dir, { recursive: true });
      const host = new URL(url).hostname.replace(/[^a-z0-9.-]/gi, '');
      out.shot = path.join(dir, `${host}-${crypto.createHash('sha1').update(url).digest('hex').slice(0, 8)}.png`);
      const h = await evalSettled(page, () => Math.min(document.documentElement.scrollHeight, 6000));
      await page.screenshot({ path: out.shot, clip: { x: 0, y: 0, width: 1280, height: Math.max(900, h) }, fullPage: true, timeout: Math.max(3000, left() - 3000) });
    }
    return 'done';
  })();
  try {
    const how = await within(work, Math.max(0, left()), 'timeout');
    if (how === 'timeout') {
      work.catch(() => {}); // it is abandoned; the browser is closed below
      out.settled = false;
      if (page && !raw) raw = await Promise.race([page.evaluate(() => document.body?.innerText || '').catch(() => ''), sleep(3000).then(() => '')]);
      if (page && !out.title) out.title = await Promise.race([page.title().catch(() => ''), sleep(1500).then(() => '')]);
      if (!browser) throw new Error(`Chrome did not start within ${Math.round(timeoutMs / 1000)} s`);
    }
    try { if (page) out.finalUrl = page.url(); } catch { /* closed */ }
    if (!out.finalUrl || out.finalUrl === 'about:blank') { out.finalUrl = url; out.answered = false; } // the server never answered
    out.redirected = !sameUrl(url, out.finalUrl);
    const { text, truncated } = tidyText(raw, opts.maxChars ?? 12000);
    Object.assign(out, { text, truncated, chars: text.length });
    const blocked = botCheck({ title: out.title, text, status: out.status });
    if (blocked) out.blocked = blocked;
    const full = tidyText(raw, Infinity).text;
    if (full.length > SAVE_TEXT_OVER || truncated) {
      const dir = path.join(cacheDir(), 'render');
      fs.mkdirSync(dir, { recursive: true });
      out.textFile = path.join(dir, `${new URL(url).hostname.replace(/[^a-z0-9.-]/gi, '')}-${crypto.createHash('sha1').update(url).digest('hex').slice(0, 8)}.txt`);
      fs.writeFileSync(out.textFile, full);
      out.fullChars = full.length;
    }
    return out;
  } finally {
    if (browser) await within(browser.close().catch(() => {}), 5000);
    release();
  }
}

/**
 * A browser for checking links one at a time (the fallback of `atr links`). check(url) resolves to
 * { ok, status, finalUrl } | { blocked: true, why, status } | { error, status? }. close() when done.
 */
export function openBrowserProbe({ timeoutS = 25 } = {}) {
  let browserP, chain = Promise.resolve();
  async function one(url) {
    if (renderUrlProblem(url)) return { error: 'not a public http(s) URL' };
    browserP ||= launchBrowser();
    let browser;
    try { browser = await browserP; } catch (e) { return { error: e.message.split('\n')[0] }; }
    const ctx = await browser.newContext({ userAgent: UA, viewport: { width: 1280, height: 900 }, locale: 'en-US' });
    try {
      const page = await ctx.newPage();
      let res;
      for (let attempt = 0; ; attempt++) {
        try { res = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: timeoutS * 1000 }); break; } catch (e) {
          if (attempt === 0 && RETRY_NET.test(e.message)) { await sleep(2000); continue; }
          if (NAV_GONE.test(e.message.split('\n')[0]) && !/net::ERR_/.test(e.message)) break;
          return { error: e.message.split('\n')[0].replace(/^page\.goto:\s*/, '').replace(/ at https?:\S+/, '') };
        }
      }
      await page.waitForTimeout(1500);
      const status = res?.status() ?? null;
      const title = await page.title().catch(() => '');
      const text = await evalSettled(page, () => (document.body?.innerText || '').slice(0, 4000)).catch(() => '');
      const why = botCheck({ title, text, status });
      if (why) return { blocked: true, why, status };
      if (status && status >= 400) return { status, error: `HTTP ${status}` };
      return { ok: true, status, finalUrl: page.url() };
    } finally { await ctx.close().catch(() => {}); }
  }
  return {
    check(url) { const run = chain.then(() => one(url)); chain = run.catch(() => {}); return run; },
    async close() { if (browserP) { const b = await browserP.catch(() => null); if (b) await Promise.race([b.close().catch(() => {}), sleep(5000)]); } },
  };
}
