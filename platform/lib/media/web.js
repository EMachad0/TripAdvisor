// Media from the open web: image search, the photos on a venue's own page, and saving one with its source.
// The site is personal (one traveler), so a photo does not need a free licence: it needs to show the real place.
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { cacheDir } from '../net.js';
import { processImage, upsertCredit, slugify, safeSlug, folderSlug } from './index.js';
import { localDate } from '../paths.js';

export const BROWSER_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
export const WEB_LICENSE = 'All rights reserved (personal use)';
export const MIN_WIDTH = 1000;
const MAX_BYTES = 30_000_000;

const unescapeHtml = (s) => String(s).replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');
const hostOf = (u) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return ''; } };

/** Parse a Bing Images result page into [{ image_url, page_url, title, thumb_url }]. */
export function parseBingImages(html) {
  const out = [];
  const seen = new Set();
  for (const m of String(html).matchAll(/\bm="(\{[^"]*\})"/g)) {
    let j;
    try { j = JSON.parse(unescapeHtml(m[1])); } catch { continue; }
    if (!j.murl || !/^https?:\/\//.test(j.murl) || seen.has(j.murl)) continue;
    seen.add(j.murl);
    out.push({ image_url: j.murl, page_url: j.purl || undefined, title: String(j.t || '').replace(/[-]/g, '').trim() || undefined, thumb_url: j.turl || undefined });
  }
  return out;
}

/**
 * Web image search (Bing Images, loaded in Chrome: plain HTTP requests get an empty shell most of the time).
 * `large` keeps big landscape photos only. Pass `html` to parse a saved page instead (tests).
 */
export async function searchWeb(query, { limit = 12, large = true, html } = {}) {
  if (html !== undefined) return parseBingImages(html).slice(0, limit);
  const params = new URLSearchParams({ q: query, form: 'IRFLTR', first: '1' });
  if (large) params.set('qft', '+filterui:imagesize-large+filterui:aspect-wide');
  const { launch } = await import('../shot.js');
  const browser = await launch();
  try {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 1800 }, locale: 'en-US' }); // Chrome's own User-Agent: an overridden one gets decoy results
    const page = await ctx.newPage();
    let found = [];
    for (let attempt = 0; attempt < 3 && !found.length; attempt++) {
      await page.goto(`https://www.bing.com/images/search?${params}`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
      await page.waitForSelector('a.iusc[m]', { timeout: 8000, state: 'attached' }).catch(() => {});
      await page.waitForTimeout(1500);
      found = parseBingImages(await page.content());
    }
    return found.slice(0, limit);
  } finally { await browser.close().catch(() => {}); }
}

/** Download an image with a browser User-Agent and the page as Referer (many hosts refuse hotlinks without it). */
export async function downloadImage(url, { referer, fetchImpl = fetch, timeoutMs = 60_000 } = {}) {
  const headers = { 'User-Agent': BROWSER_UA, Accept: 'image/avif,image/webp,image/png,image/jpeg,image/*;q=0.8,*/*;q=0.5', 'Accept-Language': 'en-US,en;q=0.9' };
  let res;
  for (const ref of referer ? [referer, undefined] : [undefined]) {
    res = await fetchImpl(url, { headers: ref ? { ...headers, Referer: ref } : headers, redirect: 'follow', signal: AbortSignal.timeout(timeoutMs) });
    if (res.ok) break;
  }
  if (!res.ok) throw new Error(`HTTP ${res.status} downloading ${url}`);
  const type = res.headers.get('content-type') || '';
  if (/^text\/|json|html/.test(type)) throw new Error(`${url} is not an image (${type.split(';')[0]}): give the direct image URL, or run \`./atr media scout <page-url>\` to list a page's images`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > MAX_BYTES) throw new Error(`${url} is ${Math.round(buf.length / 1e6)} MB: too large`);
  return buf;
}

/** The images a visitor sees on a page (rendered in Chrome): <img> at its largest srcset candidate, og:image, CSS backgrounds. */
export async function scoutPage(url, { minWidth = 500, waitMs = 2500, timeoutMs = 45_000 } = {}) {
  // Hostelworld pages draw their gallery late and show one photo to a scripted browser; its property API lists them all.
  const { hostelId: propertyId } = await import('../hostelprices.js');
  const hw = /hostelworld\.com/.test(String(url)) ? propertyId(url) : null;
  if (hw) {
    try {
      const { httpsGet } = await import('../net.js'); // Node's fetch is refused (403) by this API; the plain https client is not
      const res = await httpsGet(`https://prod.apigee.hostelworld.com/legacy-hwapi-service/2.2/properties/${hw}/?application=web`, { headers: { Accept: 'application/json' }, timeoutMs: 30_000 });
      const d = res.status === 200 ? JSON.parse(res.body.toString('utf8')) : {};
      const images = (d.images || []).map((i) => ({ image_url: `https://${i.prefix}${i.suffix}`, page_url: url, title: d.name || 'Hostelworld', kind: 'hostelworld' }));
      if (images.length) return { title: `${d.name || 'Hostel'} (Hostelworld, ${images.length} photos)`, finalUrl: url, images };
    } catch { /* fall back to the rendered page */ }
  }
  const { launch } = await import('../shot.js');
  const browser = await launch();
  try {
    const ctx = await browser.newContext({ userAgent: BROWSER_UA, viewport: { width: 1440, height: 2400 }, locale: 'en-US' });
    const page = await ctx.newPage();
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: timeoutMs });
    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});
    // Scroll through the page so lazy images load.
    await page.evaluate(async () => { for (let y = 0; y < Math.min(document.body.scrollHeight, 20000); y += 1200) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 150)); } window.scrollTo(0, 0); }).catch(() => {});
    await page.waitForTimeout(waitMs);
    const found = await page.evaluate(() => {
      const abs = (u) => { try { return new URL(u, location.href).href; } catch { return null; } };
      const best = (srcset) => { let top = null, score = 0; for (const part of String(srcset || '').split(/,\s+/)) { const [u, d] = part.trim().split(/\s+/); const s = parseFloat(d) || 1; if (u && s >= score) { top = u; score = s; } } return top; };
      const out = [];
      for (const sel of ['meta[property="og:image"]', 'meta[name="twitter:image"]', 'meta[property="og:image:secure_url"]']) for (const m of document.querySelectorAll(sel)) if (m.content) out.push({ url: abs(m.content), kind: 'og:image' });
      for (const img of document.images) {
        const u = best(img.srcset) || img.currentSrc || img.src || img.dataset.src || img.dataset.original;
        if (!u || u.startsWith('data:')) continue;
        out.push({ url: abs(u), kind: 'img', alt: (img.alt || '').slice(0, 100), w: img.naturalWidth, h: img.naturalHeight });
      }
      for (const s of document.querySelectorAll('picture source[srcset]')) { const u = best(s.srcset); if (u) out.push({ url: abs(u), kind: 'source' }); }
      for (const el of document.querySelectorAll('[style*="background"], [data-bg], [data-background]')) {
        const m = (el.getAttribute('style') || '').match(/url\(["']?([^"')]+)["']?\)/);
        const u = m?.[1] || el.dataset.bg || el.dataset.background;
        if (u && !u.startsWith('data:')) out.push({ url: abs(u), kind: 'background' });
      }
      return { title: document.title, finalUrl: location.href, images: out };
    });
    const seen = new Set();
    const images = found.images.filter((x) => x.url && /^https?:/.test(x.url) && !/\.svg(\?|$)/i.test(x.url) && !seen.has(x.url) && seen.add(x.url)).filter((x) => x.kind !== 'img' || !x.w || x.w >= Math.min(minWidth, 300));
    return { title: found.title, finalUrl: found.finalUrl, images: images.map((x) => ({ image_url: x.url, page_url: found.finalUrl, title: x.alt || x.kind, kind: x.kind })) };
  } finally { await browser.close().catch(() => {}); }
}

const hash = (s) => { let h = 5381; for (const ch of String(s)) h = ((h * 33) ^ ch.codePointAt(0)) >>> 0; return h.toString(36); };
const escXml = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/**
 * Download candidates (the full image, so the real pixel size is known) and build a numbered contact sheet.
 * Returns { dir, sheet?, items: [{ n, image_url, page_url, title, width, height, file } | { n, error }] }, biggest usable first is NOT applied: order is kept.
 */
export async function previewWeb(cands, label, { minWidth = 0, max = 12, outDir, fetchImpl = fetch } = {}) {
  const base = outDir || path.join(cacheDir(), 'previews', `web-${folderSlug(label).slice(0, 40)}-${hash(label)}`);
  fs.rmSync(base, { recursive: true, force: true });
  fs.mkdirSync(base, { recursive: true });
  const items = [];
  let n = 0;
  for (const c of cands) {
    if (items.filter((x) => x.file).length >= max) break;
    try {
      const buf = await downloadImage(c.image_url, { referer: c.page_url, fetchImpl, timeoutMs: 25_000 });
      const meta = await sharp(buf, { failOn: 'none' }).rotate().metadata();
      const width = meta.autoOrient?.width ?? meta.width, height = meta.autoOrient?.height ?? meta.height;
      if (!width || width < minWidth) continue; // icons, logos, thumbnails
      n++;
      const file = path.join(base, `${String(n).padStart(2, '0')}.jpg`);
      await sharp(buf, { failOn: 'none' }).rotate().resize({ width: 640, withoutEnlargement: true }).flatten({ background: '#ffffff' }).jpeg({ quality: 78 }).toFile(file);
      items.push({ n, ...c, width, height, file });
    } catch (e) { items.push({ ...c, error: e.message }); }
  }
  const ok = items.filter((x) => x.file);
  let sheet;
  if (ok.length) {
    const TW = 420, TH = 300, LH = 46, cols = 3, rows = Math.ceil(ok.length / cols);
    const comps = [];
    for (const [k, it] of ok.entries()) {
      const x = (k % cols) * TW, y = Math.floor(k / cols) * (TH + LH);
      comps.push({ input: await sharp(it.file).resize(TW - 8, TH - 8, { fit: 'contain', background: '#1b1814' }).toBuffer(), left: x + 4, top: y + 4 });
      const orient = it.height > it.width ? 'portrait' : 'landscape';
      const small = it.width < MIN_WIDTH;
      const svg = `<svg width="${TW}" height="${LH}" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="#1b1814"/><text x="10" y="19" font-family="Helvetica, Arial, sans-serif" font-size="16" font-weight="700" fill="${small ? '#ff7a6b' : '#ffd66b'}">#${it.n}</text><text x="44" y="19" font-family="Helvetica, Arial, sans-serif" font-size="13" fill="#f3ede3">${escXml(`${it.width}×${it.height} ${orient}${small ? ' (too small)' : ''} · ${hostOf(it.page_url || it.image_url)}`.slice(0, 54))}</text><text x="10" y="38" font-family="Helvetica, Arial, sans-serif" font-size="12" fill="#a0978a">${escXml(String(it.title || '').slice(0, 58))}</text></svg>`;
      comps.push({ input: Buffer.from(svg), left: x, top: y + TH });
    }
    sheet = path.join(base, 'contact-sheet.jpg');
    await sharp({ create: { width: cols * TW, height: rows * (TH + LH), channels: 3, background: '#12100d' } }).composite(comps).jpeg({ quality: 82 }).toFile(sheet);
  }
  fs.writeFileSync(path.join(base, 'items.json'), JSON.stringify(ok, null, 1)); // numbered as on the contact sheet
  return { dir: base, sheet, items };
}

/**
 * Save a web image into mediaDir with its source recorded. pageUrl is the page the photo is shown on
 * (the venue's site, its booking page, an article): it becomes the credit link.
 */
export async function grabWeb(imageUrl, mediaDir, { name, pageUrl, credit, description, area, force = false, fetchImpl = fetch } = {}) {
  const local = !/^https?:\/\//.test(String(imageUrl)) && fs.existsSync(String(imageUrl)); // a file you cropped or converted yourself
  if (!local && !/^https?:\/\//.test(String(imageUrl))) throw new Error('give the direct image URL (https://…jpg), as printed by `./atr media web` or `./atr media scout`, or a local image file');
  if (!pageUrl || !/^https?:\/\//.test(pageUrl)) throw new Error('give --from <page-url>: the page the photo is shown on (the venue\'s site, its booking page, an article about it)');
  const buf = local ? fs.readFileSync(imageUrl) : await downloadImage(imageUrl, { referer: pageUrl, fetchImpl });
  let meta;
  try { meta = await sharp(buf, { failOn: 'none' }).rotate().metadata(); } catch { throw new Error(`${imageUrl} did not decode as an image`); }
  const width = meta.autoOrient?.width ?? meta.width;
  if (width < MIN_WIDTH && !force) throw new Error(`${imageUrl} is only ${width} px wide (minimum ${MIN_WIDTH}; a hero needs 1600). Look for a larger version (many sites take a size in the URL, e.g. w=1920 or =s2048), or pass --force for a gallery photo you really want.`);
  const base = local ? path.basename(imageUrl) : (() => { try { return decodeURIComponent(path.basename(new URL(imageUrl).pathname)); } catch { return 'photo'; } })();
  const file = name ? slugify(name) : safeSlug(base);
  const out = await processImage(buf, mediaDir, file);
  return upsertCredit(mediaDir, {
    file, title: base.slice(0, 300), author: credit || hostOf(pageUrl), license: WEB_LICENSE,
    source_url: pageUrl, ...(local ? {} : { original_url: imageUrl }),
    ...(description ? { description } : {}),
    width: out.width, height: out.height, widths: out.widths, fetched: localDate(), origin: 'web',
    ...(area ? { area } : {}),
  });
}
