// Media: Wikimedia Commons search/fetch + local add, WebP variants, credits.yaml.
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { parse } from 'yaml';
import { toYaml } from '../yamlio.js';
import { localDate, dataRoots } from '../paths.js';
import { acquireSlot, readCooldown, writeCooldown, retryAfterMs, fmtWait, progress, cacheDir } from '../net.js';

export const USER_AGENT = 'AsiaTripRankerBot/0.1 (personal travel-research tool; non-commercial; low volume)';
export const WIDTHS = [640, 1280, 2048];
const API = 'https://commons.wikimedia.org/w/api.php';

const FREE = [/^cc0/i, /^cc[ -]by(-sa)?([ -]\d(\.\d)?)?/i, /^public domain/i, /^pd\b/i, /^pd-/i, /no restrictions/i, /^fal\b/i, /free art license/i, /^gfdl/i, /^attribution$/i, /copyrighted free use/i, /^cc[ -]?pd/i];
const NONFREE = [/\bnc\b/i, /\bnd\b/i, /non-?commercial/i, /no ?deriv/i, /fair use/i, /non-?free/i, /all rights reserved/i];

/** Is a license short name acceptable? Returns { ok, reason }. */
export function checkLicense(name, { nonFreeFlag = false } = {}) {
  const n = String(name || '').trim();
  if (!n) return { ok: false, reason: 'no license information' };
  if (nonFreeFlag) return { ok: false, reason: `marked non-free on Commons (${n})` };
  if (NONFREE.some((r) => r.test(n))) return { ok: false, reason: `non-free license (${n}): NC/ND/fair-use images are rejected` };
  if (FREE.some((r) => r.test(n))) return { ok: true };
  return { ok: false, reason: `unrecognised license "${n}" — only CC0, CC BY, CC BY-SA, public domain, FAL, GFDL accepted` };
}

export function stripHtml(s) {
  return String(s ?? '').replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ').trim();
}

export function slugify(s) {
  return String(s).replace(/^File:/i, '').replace(/\.[a-z0-9]+$/i, '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/['’‘`´]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60).replace(/-$/, '') || 'image';
}

/** Slug for a cache folder: like slugify, but a name with no Latin word (CJK, Hangul, Thai…) gets a short stable hash. */
export function folderSlug(s) { return safeSlug(s, 'q'); }

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const RETRY = [429, 500, 502, 503, 504];
export class CommonsError extends Error {}
/** Thrown when Commons keeps rate-limiting past the caller's patience; `notBefore` is when the shared cooldown ends. */
export class CommonsRateLimit extends CommonsError {}

// Commons pacing is shared by every curator session on this machine: one request at a time (a lock under
// .cache/locks/), a minimum gap between requests, and one shared "not before" time that a 429 pushes out
// (by Retry-After when the server sends it, else 30 s doubling per consecutive 429, up to 15 min).
export const commonsConfig = {
  patienceMs: 120_000,       // how long one call may wait for the limit to clear; --patient raises it
  baseBackoffMs: 30_000,
  maxBackoffMs: 15 * 60_000,
  apiGapMs: 1200,
  uploadGapMs: 3000,
  fetch: (...a) => fetch(...a),
};
export function configureCommons(over = {}) { Object.assign(commonsConfig, over); return commonsConfig; }
const stateFile = () => path.join(cacheDir(), 'commons-cooldown.json');
const lockDir = () => path.join(cacheDir(), 'locks');
const clock = (t) => new Date(t).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

function friendly(status, what) {
  if (status === 429) return new CommonsError(`Wikimedia Commons is rate-limiting us (HTTP 429) while ${what}. Wait about a minute, then retry; avoid firing many searches back to back.`);
  if (status >= 500) return new CommonsError(`Wikimedia Commons is temporarily unavailable (HTTP ${status}) while ${what}. Try again in a minute.`);
  if (status === 404) return new CommonsError(`Not found (HTTP 404) while ${what}. Check the File: name.`);
  return new CommonsError(`Wikimedia Commons answered HTTP ${status} while ${what}.`);
}

/**
 * One Commons request, paced across processes. Waits out a shared cooldown (printing why on stderr), honours
 * Retry-After, and gives up only when the next allowed time is past `patienceMs` from the start of the call.
 */
async function fetchRetry(url, what, { api = true, patienceMs = commonsConfig.patienceMs } = {}) {
  const cfg = commonsConfig;
  const giveUpAt = Date.now() + patienceMs;
  let attempt = 0, netFails = 0, srvFails = 0;
  for (;;) {
    const st = readCooldown(stateFile());
    const wait = (st.notBefore || 0) - Date.now();
    if (wait > 0) {
      if (Date.now() + wait > giveUpAt) {
        const e = new CommonsRateLimit(`Wikimedia Commons is rate-limiting this machine (HTTP 429; all curator sessions share the limit) while ${what}. The shared cooldown ends at ${clock(st.notBefore)} (in ${fmtWait(wait)}), past this call's ${fmtWait(patienceMs)} patience.`);
        e.notBefore = st.notBefore;
        throw e;
      }
      progress(`Commons cooldown (shared by all sessions on this machine${st.reason ? `: ${st.reason}` : ''}): waiting ${fmtWait(wait)}, until ${clock(st.notBefore)}, before ${what}`);
      await sleep(Math.min(wait, 60_000));
      continue;
    }
    const release = await acquireSlot(lockDir(), 'commons', { slots: 1, staleMs: 3 * 60_000, onWait: (s) => progress(`waiting ${s} s for another session's Commons request to finish (before ${what})`) });
    let res;
    try {
      const st2 = readCooldown(stateFile());
      if ((st2.notBefore || 0) > Date.now()) continue; // someone got a 429 while we waited for the lock
      const gap = (st2.last || 0) + (api ? cfg.apiGapMs : cfg.uploadGapMs) - Date.now();
      if (gap > 0) await sleep(gap);
      attempt++;
      try { res = await cfg.fetch(url, { headers: { 'User-Agent': USER_AGENT, 'Api-User-Agent': USER_AGENT }, signal: AbortSignal.timeout(90_000) }); } catch (e) {
        writeCooldown(stateFile(), { ...readCooldown(stateFile()), last: Date.now() });
        if (++netFails >= 4) throw new CommonsError(`Network error while ${what}: ${e.cause?.code || e.message}. Are you online?`);
        progress(`network error (${e.cause?.code || e.message}) while ${what}; retrying in ${2 ** netFails} s`);
        await sleep(1000 * 2 ** netFails);
        continue;
      }
      const now = Date.now();
      const cur = readCooldown(stateFile());
      if (res.ok) { writeCooldown(stateFile(), { ...cur, last: now, strikes: 0 }); return res; }
      res.body?.cancel?.().catch(() => {});
      if (!RETRY.includes(res.status)) { writeCooldown(stateFile(), { ...cur, last: now }); throw friendly(res.status, what); }
      if (res.status === 429) {
        const ra = retryAfterMs(res.headers.get('retry-after'), now);
        const strikes = (cur.strikes || 0) + 1;
        const delay = Math.max(ra ?? 0, Math.min(cfg.maxBackoffMs, cfg.baseBackoffMs * 2 ** (strikes - 1)));
        const notBefore = Math.max(cur.notBefore || 0, now + delay);
        const reason = `HTTP 429${ra != null ? `, retry-after ${Math.round(ra / 1000)} s` : ''} at ${clock(now)}`;
        writeCooldown(stateFile(), { ...cur, last: now, strikes, notBefore, reason });
        progress(`rate-limited (${reason}) while ${what}; next try in ${fmtWait(notBefore - now)} (attempt ${attempt}; this call waits until ${clock(giveUpAt)}, --patient waits longer)`);
        continue;
      }
      writeCooldown(stateFile(), { ...cur, last: now });
      if (++srvFails >= 4) throw friendly(res.status, what);
      progress(`Commons HTTP ${res.status} while ${what}; retrying in ${5 * 2 ** (srvFails - 1)} s`);
      await sleep(5000 * 2 ** (srvFails - 1));
    } finally { release(); }
  }
}

async function getJson(url, what = 'querying the API', opts = {}) { return (await fetchRetry(url, what, opts)).json(); }
async function getBuffer(url, what = 'downloading the image', opts = {}) { return Buffer.from(await (await fetchRetry(url, what, { ...opts, api: false })).arrayBuffer()); }

const LICENSE_TALK = /\b(this (?:file|image|photo(?:graph)?|picture|work) (?:is|was|has|may)|licen[cs]ed?|licen[cs]e|creative commons|cc[ -]?by|cc0|gfdl|attribution|permission|you (are|may)|must|please|copyright|all rights|public domain|released under|own work|for (more|commercial)|contact)\b|©|\(c\)/i;
/**
 * The photographer's name from a Commons Artist/Credit field: no licence notes, "(talk | contribs)" or long
 * sentences. Returns { author, shortened }. The full text stays on the file page (source_url).
 */
export function cleanAuthor(raw, max = 120) {
  const original = stripHtml(raw);
  let a = original.replace(/\s*\((?:[^)]*\b(?:talk|contribs?|website|e-?mail|homepage)\b[^)]*)\)/gi, '').replace(/^(?:photo(?:graph)?(?: by)?|author|by|credit)\s*[:-]?\s*/i, '').trim();
  const m = a.search(LICENSE_TALK);
  if (m > 2) a = a.slice(0, m);
  a = a.split(/\s+(?:[|/•·]|-{1,2}|—|–)\s+|\n|;\s|(?<=\p{Ll}{3})\.\s+(?=\p{Lu}|[^\p{Script=Latin}\s\d])/u)[0];
  a = a.replace(/[\s,;:.(\-–—|/]+$/u, '').replace(/^User:/i, '').trim();
  if (a.length > max) { const cut = a.slice(0, max); const sp = cut.lastIndexOf(' '); a = `${(sp > 40 ? cut.slice(0, sp) : cut).replace(/[\s,;:]+$/, '')}…`; }
  if (!a) a = original.slice(0, max).trim() || 'Unknown';
  return { author: a, shortened: a !== original };
}

/** Readable slug, or (for names with no Latin word: Hangul, CJK, Thai…) the digits plus a short stable hash. */
export function safeSlug(s, prefix = 'photo') {
  const slug = slugify(s);
  if (/[a-z]{2,}/.test(slug) && !(slug === 'image' && !/image/i.test(String(s)))) return slug;
  let h = 5381;
  for (const ch of String(s)) h = ((h * 33) ^ ch.codePointAt(0)) >>> 0;
  return [prefix, slug === 'image' ? '' : slug, h.toString(36)].filter(Boolean).join('-');
}

function infoToCandidate(page) {
  const ii = page.imageinfo?.[0] || {};
  const m = ii.extmetadata || {};
  const v = (k) => m[k]?.value;
  const license = stripHtml(v('LicenseShortName') || v('License') || '');
  const lic = checkLicense(license, { nonFreeFlag: String(v('NonFree') || '').toLowerCase() === 'true' });
  return {
    title: page.title,
    width: ii.width, height: ii.height, size: ii.size, mime: ii.mime,
    license, license_url: v('LicenseUrl') || undefined, free: lic.ok, reason: lic.reason,
    ...(() => { const a = cleanAuthor(v('Artist') || v('Credit') || 'Unknown'); return { author: a.author, ...(a.shortened ? { author_shortened: true } : {}) }; })(),
    description: stripHtml(v('ImageDescription') || '').slice(0, 300) || undefined,
    source_url: ii.descriptionurl || `https://commons.wikimedia.org/wiki/${encodeURIComponent(page.title.replace(/ /g, '_'))}`,
    original_url: ii.url,
    thumb_url: ii.thumburl,
  };
}

/** Search Commons for bitmap images. Returns candidates (free and non-free, flagged). */
export async function searchCommons(query, { limit = 12, patienceMs } = {}) {
  const params = new URLSearchParams({
    action: 'query', format: 'json', formatversion: '2', generator: 'search',
    gsrsearch: `${query} filetype:bitmap`, gsrnamespace: '6', gsrlimit: String(Math.min(limit, 40)),
    prop: 'imageinfo', iiprop: 'url|size|mime|extmetadata', iiurlwidth: '500', // a standard Wikimedia thumbnail width: other widths are rate-limited hard
    iiextmetadatafilter: 'LicenseShortName|License|LicenseUrl|Artist|Credit|ImageDescription|NonFree|UsageTerms',
  });
  const data = await getJson(`${API}?${params}`, `searching for "${query}"`, { patienceMs });
  const pages = (data.query?.pages || []).sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
  return pages.filter((p) => p.imageinfo).map(infoToCandidate);
}

/** Normalise "File:X.jpg", a commons page URL or an upload.wikimedia.org URL into "File:X.jpg". */
export function toFileTitle(ref) {
  let s = String(ref).trim();
  try {
    if (/^https?:\/\//.test(s)) {
      const u = new URL(s);
      if (u.hostname === 'upload.wikimedia.org') {
        const parts = u.pathname.split('/');
        // /wikipedia/commons/thumb/a/ab/Name.jpg/1280px-Name.jpg  or /wikipedia/commons/a/ab/Name.jpg
        const i = parts.indexOf('thumb');
        s = 'File:' + decodeURIComponent(i >= 0 ? parts[i + 3] : parts.at(-1));
      } else {
        const m = u.pathname.match(/\/wiki\/(.+)$/);
        if (m) s = decodeURIComponent(m[1]);
        else if (u.searchParams.get('title')) s = u.searchParams.get('title');
      }
    }
  } catch { /* fall through */ }
  s = s.replace(/_/g, ' ');
  if (!/^(File|Image):/i.test(s)) s = 'File:' + s;
  return s.replace(/^Image:/i, 'File:');
}

export async function commonsInfo(ref, { thumbWidth = FETCH_WIDTH, patienceMs } = {}) {
  const title = toFileTitle(ref);
  const params = new URLSearchParams({
    action: 'query', format: 'json', formatversion: '2', titles: title,
    prop: 'imageinfo', iiprop: 'url|size|mime|extmetadata', iiurlwidth: String(thumbWidth),
  });
  const data = await getJson(`${API}?${params}`, `looking up ${title}`, { patienceMs });
  const page = data.query?.pages?.[0];
  if (!page || page.missing || !page.imageinfo) throw new Error(`Commons file not found: ${title}`);
  return infoToCandidate(page);
}

export function readCredits(mediaDir) {
  const f = path.join(mediaDir, 'credits.yaml');
  if (!fs.existsSync(f)) return [];
  return parse(fs.readFileSync(f, 'utf8')) || [];
}

export function writeCredits(mediaDir, credits) {
  fs.mkdirSync(mediaDir, { recursive: true });
  const header = '# Photo credits — written by `./atr media`. One entry per image; `file` is the name used in place.yaml.\n';
  fs.writeFileSync(path.join(mediaDir, 'credits.yaml'), header + toYaml(credits));
}

/** Resize a buffer into WebP variants. Returns { widths, width, height }. */
export async function processImage(buf, mediaDir, name, { widths = WIDTHS, quality = 78 } = {}) {
  fs.mkdirSync(mediaDir, { recursive: true });
  const meta = await sharp(buf, { failOn: 'none' }).rotate().metadata();
  const ow = meta.autoOrient?.width ?? meta.width;
  const oh = meta.autoOrient?.height ?? meta.height;
  let targets = widths.filter((w) => w <= ow);
  if (!targets.length) targets = [ow];
  else if (ow < widths.at(-1) && !targets.includes(ow) && ow - targets.at(-1) > 60) targets.push(ow);
  for (const old of fs.readdirSync(mediaDir)) if (old.startsWith(`${name}-`) && /^\d+\.webp$/.test(old.slice(name.length + 1))) fs.rmSync(path.join(mediaDir, old)); // this photo's old sizes only, not "<name>-other-640.webp"
  for (const w of targets) {
    await sharp(buf, { failOn: 'none' }).rotate().resize({ width: w, withoutEnlargement: true }).webp({ quality: w >= 2000 ? quality - 8 : w >= 1200 ? quality - 4 : quality, effort: 5 }).toFile(path.join(mediaDir, `${name}-${w}.webp`));
  }
  return { widths: targets, width: ow, height: oh };
}

export function upsertCredit(mediaDir, entry, extra = {}) {
  const credits = readCredits(mediaDir).filter((c) => c.file !== entry.file);
  credits.push(entry);
  writeCredits(mediaDir, credits);
  return { ...entry, ...Object.fromEntries(Object.entries(extra).filter(([, v]) => v !== undefined)) }; // extra: for the caller, not credits.yaml
}

const today = () => localDate();

/** Fetch a Commons file into mediaDir. ref: "File:X.jpg" or URL. */
// Download size: a 1920 px thumbnail (a standard Wikimedia width, so it is usually cached and not rate-limited
// like odd widths) instead of the multi-MB original. 1920 px covers every slot (the largest needs 1280 px).
export const FETCH_WIDTH = 1920;
export async function fetchCommons(ref, mediaDir, { name, force = false, area, patienceMs } = {}) {
  const info = await commonsInfo(ref, { thumbWidth: FETCH_WIDTH, patienceMs });
  if (!info.free && !force) throw new Error(`Rejected ${info.title}: ${info.reason}`);
  if (!/^image\/(jpeg|png|webp|tiff|gif)/.test(info.mime || '')) throw new Error(`Unsupported type ${info.mime} for ${info.title}`);
  const file = name ? slugify(name) : safeSlug(info.title);
  const src = info.thumb_url && info.width > FETCH_WIDTH ? info.thumb_url : info.original_url;
  const buf = await getBuffer(src, `downloading ${info.title}`, { patienceMs });
  const out = await processImage(buf, mediaDir, file);
  return upsertCredit(mediaDir, {
    file, title: info.title, author: info.author, license: info.license,
    ...(info.license_url ? { license_url: info.license_url } : {}),
    source_url: info.source_url, original_url: info.original_url,
    ...(info.description ? { description: info.description } : {}),
    width: info.width, height: info.height, widths: out.widths, fetched: today(), origin: 'commons',
    ...(area ? { area } : {}), // which area card fetched it (areas of one country share a media folder)
  }, { author_shortened: info.author_shortened });
}

/**
 * Fetch several Commons files one after another. Pacing is shared across processes (fetchRetry), so gapMs is 0.
 * items: [{ ref, name? }]. Returns [{ ref, credit } | { ref, error, queued? }]; one failure does not stop the rest.
 * queue: when Commons stays rate-limited past the patience, the file goes to the "fetch later" queue
 * (`label` is what `./atr media fetch` takes to drain it: a place id or `--area <id>`).
 */
export async function fetchCommonsMany(items, mediaDir, { area, gapMs = 0, onItem, fetchOne = fetchCommons, patienceMs, queue = false, label } = {}) {
  const out = [];
  for (const [i, it] of items.entries()) {
    if (i && gapMs) await sleep(gapMs);
    let r;
    try { r = { ref: it.ref, credit: await fetchOne(it.ref, mediaDir, { name: it.name, area, patienceMs }) }; } catch (e) {
      r = { ref: it.ref, error: e.message };
      if (queue && e instanceof CommonsRateLimit) { await enqueue({ ref: it.ref, name: it.name, mediaDir, area, label }); r.queued = true; }
    }
    out.push(r);
    onItem?.(r, i, items.length);
  }
  return out;
}

// ── "fetch later" queue: files that could not be fetched because Commons kept rate-limiting ──
const queueFile = () => path.join(cacheDir(), 'commons-queue.json');
export function readQueue() { try { return JSON.parse(fs.readFileSync(queueFile(), 'utf8')); } catch { return []; } }
function writeQueue(q) { fs.mkdirSync(path.dirname(queueFile()), { recursive: true }); const tmp = `${queueFile()}.${process.pid}.tmp`; fs.writeFileSync(tmp, JSON.stringify(q, null, 1)); fs.renameSync(tmp, queueFile()); }
const sameItem = (a, b) => path.resolve(a.mediaDir) === path.resolve(b.mediaDir) && toFileTitle(a.ref) === toFileTitle(b.ref);
async function withQueueLock(fn) { const release = await acquireSlot(lockDir(), 'commons-queue', { staleMs: 60_000, pollMs: 100 }); try { return fn(); } finally { release(); } }
export function enqueue(item) {
  return withQueueLock(() => {
    const q = readQueue();
    if (q.some((x) => sameItem(x, item))) return q; // already queued: keep its place
    q.push({ ref: toFileTitle(item.ref), ...(item.name ? { name: item.name } : {}), mediaDir: path.resolve(item.mediaDir), ...(item.area ? { area: item.area } : {}), ...(item.label ? { label: item.label } : {}), added: new Date().toISOString() });
    writeQueue(q);
    return q;
  });
}
export function dequeue(item) { return withQueueLock(() => { const q = readQueue(); const rest = q.filter((x) => !sameItem(x, item)); if (rest.length !== q.length) writeQueue(rest); return rest; }); }
/** Queued items for one media folder (the place or area folder a curator is working on). */
export const queuedFor = (mediaDir) => readQueue().filter((x) => path.resolve(x.mediaDir) === path.resolve(mediaDir));

/**
 * Fetch queued files (all, or those for `mediaDir`). Successful ones leave the queue; rate-limited ones stay.
 * Returns the same shape as fetchCommonsMany.
 */
export async function drainQueue({ mediaDir, patienceMs, onItem, fetchOne = fetchCommons } = {}) {
  const items = mediaDir ? queuedFor(mediaDir) : readQueue();
  const out = [];
  for (const [i, it] of items.entries()) {
    let r;
    try { r = { ref: it.ref, mediaDir: it.mediaDir, credit: await fetchOne(it.ref, it.mediaDir, { name: it.name, area: it.area, patienceMs }) }; await dequeue(it); } catch (e) {
      r = { ref: it.ref, mediaDir: it.mediaDir, error: e.message, queued: e instanceof CommonsRateLimit };
      if (!r.queued) await dequeue(it); // a missing or non-free file will never succeed: drop it and say so
    }
    out.push(r);
    onItem?.(r, i, items.length);
  }
  return out;
}

/** Add a local image with manually supplied credit fields. */
export async function addLocal(srcFile, mediaDir, { name, author, license, license_url, source_url, description, area } = {}) {
  if (!author || !license || !source_url) throw new Error('local images need --author, --license and --source-url (where the photo came from)');
  const lic = checkLicense(license);
  if (!lic.ok && !/own work/i.test(license)) throw new Error(`Rejected: ${lic.reason}`);
  const buf = fs.readFileSync(srcFile);
  const file = slugify(name || path.basename(srcFile));
  const out = await processImage(buf, mediaDir, file);
  return upsertCredit(mediaDir, {
    file, title: path.basename(srcFile), author, license,
    ...(license_url ? { license_url } : {}), source_url,
    ...(description ? { description } : {}),
    width: out.width, height: out.height, widths: out.widths, fetched: today(), origin: 'local',
    ...(area ? { area } : {}),
  });
}

export function listMedia(mediaDir) {
  const credits = readCredits(mediaDir);
  const files = fs.existsSync(mediaDir) ? fs.readdirSync(mediaDir) : [];
  return credits.map((c) => ({ ...c, files: files.filter((f) => f.startsWith(`${c.file}-`) && f.endsWith('.webp')) }));
}

const escXml = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/**
 * Download small local previews so an agent can LOOK at candidates with its Read tool.
 * ref: a search query, "File:…" or a Commons/upload URL.
 * Returns { dir, sheet?, items: [{ n, title, file, width, height, license, free }] }.
 */
export async function previewCommons(ref, { limit = 9, outDir, patienceMs } = {}) {
  const refs = (Array.isArray(ref) ? ref : [ref]).map(String).filter(Boolean);
  const isRef = (r) => /^(File:|Image:)/i.test(r) || /^https?:\/\//.test(r);
  const isFile = refs.every(isRef);
  if (!isFile && refs.length > 1) throw new Error('give one search query, or one or more "File:…" names');
  const base = outDir || path.join(cacheDir(), 'previews', folderSlug(refs.join(' ')));
  fs.rmSync(base, { recursive: true, force: true });
  fs.mkdirSync(base, { recursive: true });
  const cands = [];
  if (isFile) {
    for (const r of refs) {
      try { cands.push(await commonsInfo(r, { thumbWidth: 960, patienceMs })); } catch (e) { cands.push({ title: toFileTitle(r), error: e.message }); }
    }
  } else cands.push(...(await searchCommons(refs[0], { limit, patienceMs })).slice(0, limit));
  const items = [];
  for (const [i, c] of cands.entries()) {
    if (c.error) { items.push({ n: i + 1, title: c.title, error: c.error }); continue; }
    const src = c.thumb_url || c.original_url;
    try {
      const buf = await getBuffer(src, `downloading a preview of ${c.title}`, { patienceMs });
      const file = path.join(base, `${String(i + 1).padStart(2, '0')}-${safeSlug(c.title)}.jpg`);
      await sharp(buf, { failOn: 'none' }).rotate().resize({ width: isFile ? 960 : 480, withoutEnlargement: true }).jpeg({ quality: 78 }).toFile(file);
      items.push({ n: i + 1, title: c.title, file, width: c.width, height: c.height, license: c.license, free: c.free, author: c.author });
    } catch (e) { items.push({ n: i + 1, title: c.title, error: e.message }); }
  }
  let sheet;
  const ok = items.filter((x) => x.file);
  if (ok.length) {
    const TW = 420, TH = 300, LH = 46, cols = 3, rows = Math.ceil(ok.length / cols);
    const comps = [];
    for (const [k, it] of ok.entries()) {
      const x = (k % cols) * TW, y = Math.floor(k / cols) * (TH + LH);
      const tile = await sharp(it.file).resize(TW - 8, TH - 8, { fit: 'contain', background: '#1b1814' }).toBuffer();
      comps.push({ input: tile, left: x + 4, top: y + 4 });
      const orient = it.height > it.width ? 'portrait' : 'landscape';
      const label = `<svg width="${TW}" height="${LH}" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="#1b1814"/><text x="10" y="19" font-family="Helvetica, Arial, sans-serif" font-size="16" font-weight="700" fill="${it.free ? '#ffd66b' : '#ff7a6b'}">#${it.n}</text><text x="44" y="19" font-family="Helvetica, Arial, sans-serif" font-size="13" fill="#f3ede3">${escXml(`${it.width}×${it.height} ${orient} · ${it.license}${it.free ? '' : ' (rejected)'}`)}</text><text x="10" y="38" font-family="Helvetica, Arial, sans-serif" font-size="12" fill="#a0978a">${escXml(it.title.replace(/^File:/, '').slice(0, 58))}</text></svg>`;
      comps.push({ input: Buffer.from(label), left: x, top: y + TH });
    }
    sheet = path.join(base, 'contact-sheet.jpg');
    await sharp({ create: { width: cols * TW, height: rows * (TH + LH), channels: 3, background: '#12100d' } }).composite(comps).jpeg({ quality: 82 }).toFile(sheet);
  }
  return { dir: base, sheet, items };
}

/** Remove one media item: its WebP variants and its credits entry. Returns removed file names. */
export function removeMedia(mediaDir, name) {
  const credits = readCredits(mediaDir);
  const files = fs.existsSync(mediaDir) ? fs.readdirSync(mediaDir).filter((f) => f.startsWith(`${name}-`) && /-\d+\.webp$/.test(f) && f.slice(name.length + 1).match(/^\d+\.webp$/)) : [];
  if (!files.length && !credits.some((c) => c.file === name)) throw new Error(`no media named "${name}" (see ./atr media list)`);
  for (const f of files) fs.rmSync(path.join(mediaDir, f));
  writeCredits(mediaDir, credits.filter((c) => c.file !== name));
  return files;
}

/** Media names with files or credits that `used` (a Set of names) does not contain; also orphan WebP files. */
export function unusedMedia(mediaDir, used) {
  const credits = readCredits(mediaDir).map((c) => c.file);
  const fileNames = (fs.existsSync(mediaDir) ? fs.readdirSync(mediaDir) : []).map((f) => f.match(/^(.+)-\d+\.webp$/)?.[1]).filter(Boolean);
  return [...new Set([...credits, ...fileNames])].filter((n) => !used.has(n)).sort();
}
