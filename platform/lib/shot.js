// Screenshots of built pages with playwright-core driving installed Chrome.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const DEVICES = {
  desktop: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 },
  phone: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
};

export async function launch() {
  const { chromium } = await import('playwright-core');
  try { return await chromium.launch({ channel: 'chrome', headless: true }); } catch (e) {
    const p = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
    if (fs.existsSync(p)) return chromium.launch({ executablePath: p, headless: true });
    throw new Error(`Could not launch Google Chrome (${e.message.split('\n')[0]}). Install Chrome or set CHROME_PATH.`);
  }
}

/**
 * Screenshot an HTML file. jobs: [{ file, out, device, theme }]
 * opts: { full: true, waitMs }
 */
export async function shoot(jobs, opts = {}) {
  const browser = await launch();
  const results = [];
  try {
    for (const j of jobs) {
      // Full-page shots use 1× (smaller files); pages taller than MAX_PIECE are captured in pieces (captureFull).
      const full = j.full ?? (opts.full !== false);
      const ctx = await browser.newContext({ ...DEVICES[j.device], ...(full ? { deviceScaleFactor: 1 } : {}), colorScheme: j.theme });
      const page = await ctx.newPage();
      await page.goto(pathToFileURL(j.file).href, { waitUntil: 'load', timeout: 30000 });
      // Make lazy images load for a full-page capture.
      await page.evaluate(async () => {
        document.querySelectorAll('[loading="lazy"]').forEach((i) => { i.loading = 'eager'; });
        for (let y = 0; y < document.body.scrollHeight; y += window.innerHeight * 0.8) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 120)); }
        window.scrollTo(0, 0);
        // Freeze viewport-relative heights so the full-page resize does not re-layout the hero.
        document.querySelectorAll('.hero').forEach((h) => { h.style.minHeight = h.offsetHeight + 'px'; h.style.height = h.offsetHeight + 'px'; });
        await Promise.all([...document.images].map((i) => i.complete ? null : new Promise((r) => { i.onload = i.onerror = r; setTimeout(r, 8000); })));
        await document.fonts.ready;
      });
      await page.waitForTimeout(opts.waitMs ?? 1200);
      fs.mkdirSync(path.dirname(j.out), { recursive: true });
      const pieces = full ? await captureFull(page, j.out) : (await page.screenshot({ path: j.out }), 1);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      // On the areas page each country's map and card grid carry data-country: slices read "country_map korea", "areas korea".
      const blocks = await page.evaluate(() => [...document.querySelectorAll('[data-block]')].map((el) => { const r = el.getBoundingClientRect(); return { type: el.dataset.block + (el.dataset.country ? ` ${el.dataset.country}` : ''), top: Math.round(r.top + scrollY), bottom: Math.round(r.bottom + scrollY) }; }));
      results.push({ ...j, overflowX: overflow > 1 ? overflow : 0, blocks, ...(pieces > 1 ? { pieces } : {}) });
      await ctx.close();
    }
  } finally { await browser.close(); }
  return results;
}

/**
 * Chrome renders one capture into a GPU texture of at most 16384 device px: a taller full-page shot keeps its height
 * but repeats the top of the page after 16384 px (the Bangkok area page, 23,216 px on phone, ended in a second hero
 * instead of the footer). Pages taller than MAX_PIECE are captured in clipped pieces and stitched.
 */
export const MAX_PIECE = 8000;
/** Height pieces [{ y, height }] covering 0..total, each at most max px. */
export function pieceRanges(total, max = MAX_PIECE) {
  const out = [];
  for (let y = 0; y < total; y += max) out.push({ y, height: Math.min(max, total - y) });
  return out;
}
/** Full-page PNG of `page` at `out`, stitched from pieces when the page is tall. Returns the number of pieces. */
async function captureFull(page, out) {
  const { width, height, dpr } = await page.evaluate(() => ({ width: document.documentElement.scrollWidth, height: Math.ceil(Math.max(document.documentElement.scrollHeight, document.body.scrollHeight)), dpr: window.devicePixelRatio || 1 }));
  if (height * dpr <= MAX_PIECE) { await page.screenshot({ path: out, fullPage: true }); return 1; }
  const sharp = (await import('sharp')).default;
  const vw = page.viewportSize()?.width || width;
  const bufs = [];
  for (const r of pieceRanges(height, Math.floor(MAX_PIECE / dpr))) bufs.push({ r, buf: await page.screenshot({ fullPage: true, clip: { x: 0, y: r.y, width: vw, height: r.height } }) });
  const metas = await Promise.all(bufs.map((b) => sharp(b.buf).metadata()));
  const W = Math.max(...metas.map((m) => m.width));
  let top = 0;
  const composite = bufs.map((b, i) => { const c = { input: b.buf, left: 0, top }; top += metas[i].height; return c; });
  const tmp = `${out}.${process.pid}.tmp.png`;
  await sharp({ create: { width: W, height: top, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 1 } }, limitInputPixels: false }).composite(composite).png().toFile(tmp);
  fs.renameSync(tmp, out);
  return bufs.length;
}

/** Slice a tall PNG into sections (<base>-s01.png …). Returns [{ file, top, height }]. */
export async function sliceShot(file, sliceHeight) {
  const sharp = (await import('sharp')).default;
  const dir = path.dirname(file), base = path.basename(file, '.png');
  for (const f of fs.readdirSync(dir)) if (f.startsWith(`${base}-s`) && /-s\d\d\.png$/.test(f)) fs.rmSync(path.join(dir, f));
  const { width, height } = await sharp(file).metadata();
  const out = [];
  const overlap = 60;
  for (let top = 0, i = 1; top < height; top += sliceHeight - overlap, i++) {
    const h = Math.min(sliceHeight, height - top);
    if (h < 200 && i > 1) break;
    const o = path.join(dir, `${base}-s${String(i).padStart(2, '0')}.png`);
    await sharp(file).extract({ left: 0, top, width, height: h }).toFile(o);
    out.push({ file: o, top, height: h });
    if (top + h >= height) break;
  }
  return out;
}

/** Element screenshots of one block type (data-block attribute) at 2×. jobs: [{file, device, theme, out}] */
export async function shootSection(jobs, type) {
  const browser = await launch();
  const results = [];
  try {
    for (const j of jobs) {
      const ctx = await browser.newContext({ ...DEVICES[j.device], deviceScaleFactor: 2, colorScheme: j.theme });
      const page = await ctx.newPage();
      await page.goto(pathToFileURL(j.file).href, { waitUntil: 'load', timeout: 30000 });
      // "country_map korea" picks that country's block (data-country) on the areas page.
      const [blockType, country] = String(type).trim().split(/\s+/);
      const el = await page.$(`[data-block="${blockType}"]${country ? `[data-country="${country}"]` : ''}`);
      if (!el) { results.push({ ...j, missing: true }); await ctx.close(); continue; }
      await el.scrollIntoViewIfNeeded();
      await page.evaluate(async () => { document.querySelectorAll('[loading="lazy"]').forEach((i) => { i.loading = 'eager'; }); await Promise.all([...document.images].map((i) => i.complete ? null : new Promise((r) => { i.onload = i.onerror = r; setTimeout(r, 6000); }))); await document.fonts.ready; });
      await page.waitForTimeout(500);
      fs.mkdirSync(path.dirname(j.out), { recursive: true });
      await el.screenshot({ path: j.out });
      results.push(j);
      await ctx.close();
    }
  } finally { await browser.close(); }
  return results;
}

/** Which blocks each slice shows: [{ file, blocks: ['hero', 'quick_facts'] }] (a block counts if ≥ 80 px of it is visible). */
export function sliceMap(slices, blocks = []) {
  return slices.map((s) => ({ file: s.file, blocks: [...new Set(blocks.filter((b) => Math.min(b.bottom, s.top + s.height) - Math.max(b.top, s.top) >= Math.min(80, b.bottom - b.top)).map((b) => b.type))] }));
}
