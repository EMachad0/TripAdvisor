// Round 11A: network tools — shared Commons pacing and "fetch later" queue, link checker fallbacks,
// render timeout / navigation / links / bot walls, geo rate limits and Japanese addresses, PDF reader.
// No network: fetch, DNS and the browser are stubbed; Chrome is only used on local servers.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import sharp from 'sharp';
import { ROOT } from '../lib/paths.js';
import { tmpDir } from './helpers.js';
import { acquireSlot, retryAfterMs, fmtWait, envProxy, chromeProxy, readCooldown } from '../lib/net.js';
import * as media from '../lib/media/index.js';
import { checkUrl, checkLinks, linkIssue, failureKind } from '../lib/links.js';
import { botCheck, sameUrl, renderPage } from '../lib/pageview.js';
import { geoSearch, formatGeo, looksLikeJapaneseAddress } from '../lib/geo.js';
import { readPdf, parsePages } from '../lib/pdf.js';

process.env.ATR_QUIET = '1';
const CACHE = tmpDir();
process.env.ATR_CACHE_DIR = CACHE; // every cache file of these tests lives here, never in the real .cache/
const atr = (args, env = {}) => spawnSync(path.join(ROOT, 'atr'), args, { cwd: ROOT, encoding: 'utf8', env: { ...process.env, NO_COLOR: '1', ATR_OFFLINE: '1', ...env } });
const jpeg = (w = 64, h = 48) => sharp({ create: { width: w, height: h, channels: 3, background: '#4a7' } }).jpeg().toBuffer();
const resp = (status, body, headers = {}) => new Response(body, { status, headers });
const json = (o) => resp(200, JSON.stringify(o), { 'content-type': 'application/json' });
const dnsFail = async () => { throw Object.assign(new TypeError('fetch failed'), { cause: { code: 'ENOTFOUND' } }); };

/** A minimal valid PDF with one line of text per page. */
function miniPdf(pages) {
  const objs = ['<< /Type /Catalog /Pages 2 0 R >>', null, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'];
  const kids = [];
  for (const t of pages) {
    const s = t ? `BT /F1 24 Tf 72 720 Td (${t}) Tj ET` : '';
    objs.push(`<< /Length ${s.length} >>\nstream\n${s}\nendstream`);
    objs.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents ${objs.length} 0 R /Resources << /Font << /F1 3 0 R >> >> >>`);
    kids.push(objs.length);
  }
  objs[1] = `<< /Type /Pages /Kids [${kids.map((k) => `${k} 0 R`).join(' ')}] /Count ${kids.length} >>`;
  let out = '%PDF-1.4\n';
  const offs = [];
  objs.forEach((o, i) => { offs.push(out.length); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const x = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offs.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${x}\n%%EOF\n`;
  return Buffer.from(out, 'latin1');
}

test('11A net: Retry-After, waits, proxy settings and cross-process slots', async () => {
  assert.equal(retryAfterMs('600'), 600000);
  assert.equal(retryAfterMs(new Date(Date.now() + 90_000).toUTCString()) > 80_000, true);
  assert.equal(retryAfterMs(''), null);
  assert.equal(fmtWait(200_000), '3 min 20 s');
  assert.equal(fmtWait(45_000), '45 s');
  assert.equal(envProxy({}), null);
  assert.deepEqual(chromeProxy({ HTTPS_PROXY: 'http://127.0.0.1:8080', NO_PROXY: 'localhost, 127.0.0.1' }), { server: 'http://127.0.0.1:8080', bypass: 'localhost,127.0.0.1' });
  const dir = path.join(CACHE, 'slots');
  const a = await acquireSlot(dir, 'job', { slots: 2 });
  const b = await acquireSlot(dir, 'job', { slots: 2 });
  let third = false;
  const p = acquireSlot(dir, 'job', { slots: 2, pollMs: 20 }).then((r) => { third = true; return r; });
  await new Promise((r) => setTimeout(r, 100));
  assert.equal(third, false, 'a third job waits while two slots are taken');
  a();
  (await p)();
  b();
  fs.writeFileSync(path.join(dir, 'job-0.lock'), JSON.stringify({ pid: 999999, at: Date.now() }));
  const c = await acquireSlot(dir, 'job', { slots: 1, maxWaitMs: 1000 });
  c();
  assert.ok(true, 'a slot held by a dead process is taken over');
});

test('11A media: author trimmed to the name; Hangul/CJK names get a stable, distinct slug', () => {
  const long = `<a href="//commons.wikimedia.org/wiki/User:Ko">Kittipong Somchai</a> This file is licensed under the Creative Commons Attribution-Share Alike 4.0 International license. ${'ภาพนี้ได้รับอนุญาต '.repeat(30)}`;
  const a = media.cleanAuthor(long);
  assert.deepEqual(a, { author: 'Kittipong Somchai', shortened: true });
  assert.equal(media.cleanAuthor('Jane Doe (talk | contribs)').author, 'Jane Doe');
  assert.equal(media.cleanAuthor('Dr. A. B. Smith').author, 'Dr. A. B. Smith');
  assert.equal(media.cleanAuthor('Jean-Pierre Dalbéra from Paris, France').shortened, false);
  assert.ok(media.cleanAuthor('x'.repeat(500)).author.length <= 121);
  const n1 = media.safeSlug('File:남이섬 (4).JPG'), n2 = media.safeSlug('File:경복궁 (4).JPG');
  assert.match(n1, /^photo-4-[a-z0-9]+$/);
  assert.notEqual(n1, n2, 'two Hangul names with the same number no longer collide');
  assert.equal(media.safeSlug('File:Yu Garden 1.jpg'), 'yu-garden-1');
  assert.match(media.folderSlug('File:남이섬 (4).JPG'), /^q-4-/);
  assert.match(media.folderSlug('哈尔滨冰雪大世界'), /^q-[a-z0-9]+$/);
});

test('11A media: a 429 sets one shared cooldown from Retry-After; past the patience the call fails without "attempt 6 of 5"', async () => {
  const cooldown = path.join(CACHE, 'commons-cooldown.json');
  fs.rmSync(cooldown, { force: true });
  const urls = [];
  media.configureCommons({ baseBackoffMs: 30, apiGapMs: 0, uploadGapMs: 0, fetch: async (u) => { urls.push(u); return resp(429, 'slow down', { 'retry-after': '600' }); } });
  try {
    await assert.rejects(media.searchCommons('Wat Pho', { patienceMs: 2000 }), (e) => {
      assert.ok(e instanceof media.CommonsRateLimit);
      assert.match(e.message, /all curator sessions share the limit/);
      assert.doesNotMatch(e.message, /attempt \d+ of \d+/);
      return true;
    });
    assert.equal(urls.length, 1, 'no hammering: the server said wait 600 s');
    assert.match(urls[0], /iiurlwidth=500/, 'search previews use a standard thumbnail width');
    const st = readCooldown(cooldown);
    assert.ok(st.notBefore - Date.now() > 590_000, 'the cooldown honours Retry-After');
    assert.match(st.reason, /retry-after 600 s/);
    // Another "session" (same file) does not even ask while the cooldown lasts.
    await assert.rejects(media.commonsInfo('File:X.jpg', { patienceMs: 1000 }), media.CommonsRateLimit);
    assert.equal(urls.length, 1);
    // A short cooldown is waited out, then the request goes through.
    fs.writeFileSync(cooldown, JSON.stringify({ notBefore: Date.now() + 150, strikes: 1 }));
    media.configureCommons({ fetch: async (u) => { urls.push(u); return json({ query: { pages: [] } }); } });
    assert.deepEqual(await media.searchCommons('Wat Pho', { patienceMs: 5000 }), []);
    assert.equal(readCooldown(cooldown).strikes, 0, 'a success resets the backoff');
  } finally { media.configureCommons({ baseBackoffMs: 30_000, apiGapMs: 1200, uploadGapMs: 3000, fetch: (...a) => fetch(...a) }); fs.rmSync(cooldown, { force: true }); }
});

test('11A media: fetch downloads the 1920 px thumbnail, cleans the author; previews take several files', async () => {
  const dir = tmpDir();
  const img = await jpeg(120, 80);
  const seen = [];
  const info = (title, width) => ({ title, imageinfo: [{ width, height: Math.round(width * 0.66), size: 9e6, mime: 'image/jpeg', url: `https://upload.wikimedia.org/o/${encodeURIComponent(title)}`, thumburl: `https://upload.wikimedia.org/thumb/${encodeURIComponent(title)}/1920px.jpg`, descriptionurl: 'https://commons.wikimedia.org/wiki/F', extmetadata: { LicenseShortName: { value: 'CC BY-SA 4.0' }, Artist: { value: 'Ann Lee. This file is licensed under CC BY-SA 4.0; you must attribute…' } } }] });
  media.configureCommons({ apiGapMs: 0, uploadGapMs: 0, fetch: async (u) => {
    seen.push(u);
    if (u.includes('/w/api.php')) { const t = new URL(u).searchParams.get('titles'); return json({ query: { pages: [info(t, t.includes('Small') ? 800 : 5000)] } }); }
    return resp(200, img, { 'content-type': 'image/jpeg' });
  } });
  try {
    const cr = await media.fetchCommons('File:Big temple.jpg', dir, {});
    assert.match(seen[0], /iiurlwidth=1920/);
    assert.match(seen[1], /\/thumb\//, 'a 5000 px original is not downloaded');
    assert.equal(cr.author, 'Ann Lee');
    assert.equal(cr.author_shortened, true);
    assert.doesNotMatch(fs.readFileSync(path.join(dir, 'credits.yaml'), 'utf8'), /author_shortened|licensed/, 'credits.yaml only gets the name');
    await media.fetchCommons('File:Small one.jpg', dir, {});
    assert.match(seen.at(-1), /\/o\//, 'a small original is downloaded as is');
    const pv = await media.previewCommons(['File:A one.jpg', 'File:B two.jpg'], { outDir: path.join(dir, 'pv') });
    assert.equal(pv.items.filter((i) => i.file).length, 2, 'both files previewed');
    assert.ok(pv.sheet && fs.existsSync(pv.sheet), 'a contact sheet even for File: previews');
  } finally { media.configureCommons({ apiGapMs: 1200, uploadGapMs: 3000, fetch: (...a) => fetch(...a) }); }
});

test('11A media: files that stay rate-limited go to the "fetch later" queue; a later call drains it', async () => {
  const dir = path.join(tmpDir(), 'media');
  const limited = async () => { const e = new media.CommonsRateLimit('rate-limited'); throw e; };
  const rs = await media.fetchCommonsMany([{ ref: 'File:A.jpg', name: 'a' }, { ref: 'https://commons.wikimedia.org/wiki/File:B_b.jpg' }], dir, { fetchOne: limited, queue: true, label: 'wat-pho' });
  assert.deepEqual(rs.map((r) => r.queued), [true, true]);
  assert.deepEqual(media.queuedFor(dir).map((q) => [q.ref, q.name, q.label]), [['File:A.jpg', 'a', 'wat-pho'], ['File:B b.jpg', undefined, 'wat-pho']]);
  await media.fetchCommonsMany([{ ref: 'File:A.jpg', name: 'a' }], dir, { fetchOne: limited, queue: true });
  assert.equal(media.queuedFor(dir).length, 2, 'queued once');
  const calls = [];
  const ok = async (ref, d, o) => { calls.push([ref, o.name]); if (/B b/.test(ref)) throw new Error('Rejected File:B b.jpg: non-free license'); return { file: o.name || 'x', widths: [640] }; };
  const out = await media.drainQueue({ mediaDir: dir, fetchOne: ok });
  assert.deepEqual(calls, [['File:A.jpg', 'a'], ['File:B b.jpg', undefined]]);
  assert.deepEqual(out.map((r) => !!r.credit), [true, false]);
  assert.equal(media.queuedFor(dir).length, 0, 'saved files leave the queue; a file that can never succeed is dropped');
});

test('11A links: why a link failed; DNS checked with the system resolver; "DNS unavailable" when nothing resolves', async () => {
  assert.deepEqual(['ENOTFOUND', 'ECONNREFUSED', 'CERT_HAS_EXPIRED', 'UND_ERR_CONNECT_TIMEOUT'].map(failureKind), ['dns', 'tcp', 'tls', 'timeout']);
  let tries = 0;
  const counting = async () => { tries++; return dnsFail(); };
  const flaky = await checkUrl('https://en.wikipedia.org/wiki/Bangkok', { fetch: counting, retryDelayMs: 0, lookup: async () => ({ address: '198.35.26.96' }) });
  assert.equal(tries, 2, 'a DNS failure is retried once');
  assert.deepEqual([flaky.status, flaky.reason], ['timeout', 'dns-flaky']);
  assert.match(flaky.detail, /resolves on this machine \(198\.35\.26\.96\)/);
  assert.equal(linkIssue({ url: 'u', pathArr: ['sources', 0, 'url'], what: 'source' }, flaky).level, 'warning', 'not dead');
  const down = await checkUrl('https://en.wikipedia.org/wiki/Bangkok', { fetch: dnsFail, retryDelayMs: 0, lookup: async () => { throw new Error('ENOTFOUND'); } });
  assert.deepEqual([down.status, down.reason], ['timeout', 'dns-unavailable']);
  assert.match(down.detail, /DNS unavailable on this machine/);
  const gone = await checkUrl('https://no-such-place.example/', { fetch: dnsFail, retryDelayMs: 0, lookup: async (h) => { if (h === 'en.wikipedia.org') return { address: '1.2.3.4' }; throw new Error('ENOTFOUND'); } });
  assert.deepEqual([gone.status, gone.detail], ['dead', 'the domain does not exist (DNS)']);
  const second = await checkUrl('https://x.example/', { fetch: (() => { let n = 0; return async () => (n++ ? resp(200, '<title>ok</title>', { 'content-type': 'text/html' }) : dnsFail()); })(), retryDelayMs: 0 });
  assert.equal(second.status, 'ok');
  assert.match(second.detail, /second try/);
});

test('11A links: a link only a browser can open passes; a bot wall in the browser stays blocked', async () => {
  const forbidden = async () => resp(403, 'no', { 'content-type': 'text/html' });
  const tls = async () => { throw Object.assign(new TypeError('fetch failed'), { cause: { code: 'UNABLE_TO_VERIFY_LEAF_SIGNATURE' } }); };
  const opened = await checkUrl('https://www.elysian.co.kr/', { fetch: tls, retryDelayMs: 0, browserCheck: async () => ({ ok: true, status: 200, finalUrl: 'https://www.elysian.co.kr/' }) });
  assert.deepEqual([opened.status, opened.via, opened.reason], ['ok', 'browser', 'tls']);
  assert.match(opened.detail, /opens in a browser \(HTTP 200\); a plain request got: TLS\/connection failure/);
  const walled = await checkUrl('https://siksinhot.com/', { fetch: forbidden, browserCheck: async () => ({ blocked: true, why: '"Just a moment"' }) });
  assert.deepEqual([walled.status, walled.reason], ['blocked', 'bot']);
  const still = await checkUrl('https://a.example/', { fetch: tls, retryDelayMs: 0, browserCheck: async () => ({ error: 'net::ERR_CERT_AUTHORITY_INVALID' }) });
  assert.equal(still.status, 'dead');
  assert.match(still.detail, /a browser could not open it either \(net::ERR_CERT_AUTHORITY_INVALID\)/);
  let asked = 0;
  await checkUrl('https://www.trip.com/x', { fetch: forbidden, browserCheck: async () => { asked++; return { ok: true }; } });
  await checkUrl('https://a.example/gone', { fetch: async () => resp(404, ''), browserCheck: async () => { asked++; return { ok: true }; } });
  assert.equal(asked, 0, 'known bot-walled hosts and 404s are not opened in the browser');
});

test('11A links: failures are re-checked after an hour; every host failing DNS is "DNS unavailable" and not cached; cache shown', async () => {
  const cacheFile = path.join(tmpDir(), 'links.json');
  const old = new Date(Date.now() - 2 * 3600_000).toISOString();
  fs.writeFileSync(cacheFile, JSON.stringify({ 'https://a.example/ok': { status: 'ok', http: 200, detail: 'HTTP 200', checked: old }, 'https://b.example/x': { status: 'dead', detail: 'the domain does not exist (DNS)', checked: old } }));
  const asked = [];
  const r = await checkLinks(['https://a.example/ok', 'https://b.example/x'], { cacheFile, fetch: async (u) => { asked.push(u); return resp(200, '<title>fine</title>', { 'content-type': 'text/html' }); } });
  assert.deepEqual(asked, ['https://b.example/x'], 'the 2 h old DNS failure is re-checked, the 2 h old ok is not');
  assert.equal(r['https://a.example/ok'].cached, true);
  const msg = linkIssue({ url: 'u', pathArr: ['sources', 0, 'url'], what: 'source' }, { status: 'blocked', reason: 'http', http: 403, detail: 'HTTP 403', cached: true, checked: '2026-11-12T10:20:00.000Z' }).message;
  assert.match(msg, /\[cached result from 2026-11-12 10:20 UTC; --fresh re-checks\]/);
  const cf2 = path.join(tmpDir(), 'links.json');
  const all = await checkLinks(['https://c.example/1', 'https://d.example/2', 'https://e.example/3'], { cacheFile: cf2, fetch: dnsFail, retryDelayMs: 0 });
  assert.deepEqual(Object.values(all).map((x) => x.reason), ['dns-unavailable', 'dns-unavailable', 'dns-unavailable']);
  assert.ok(Object.values(all).every((x) => x.status === 'timeout'), 'a warning, never dead');
  assert.deepEqual(JSON.parse(fs.readFileSync(cf2, 'utf8')), {}, 'never remembered');
});

test('11A render: bot walls, same-URL check', () => {
  assert.match(botCheck({ title: 'Just a moment...', text: 'Checking your browser' }), /Just a moment/i);
  assert.match(botCheck({ title: '', text: 'x', status: 432 }), /HTTP 432/);
  assert.equal(botCheck({ title: 'Ramen guide', text: 'A long article. '.repeat(400), status: 200 }), null);
  assert.equal(botCheck({ title: 'How to solve a captcha', text: 'word '.repeat(2000), status: 200 }), null, 'a long real page mentioning captcha is content');
  assert.equal(sameUrl('https://example.com/a', 'https://www.example.com/a/#top'), true);
  assert.equal(sameUrl('https://www.hostelworld.com/pwa/hosteldetails.php/X/Tokyo/272463', 'https://www.hostelworld.com/pwa/s?q=Tokyo'), false);
});

test('11A render (Chrome on local pages): survives a navigation, hard timeout, --links, --expand, long text saved', async (t) => {
  const long = 'Fare table line. '.repeat(1800);
  const srv = http.createServer((req, res) => {
    if (req.url === '/hang') return; // never answers
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    if (req.url === '/hop') return res.end('<title>Hop</title><body>first<script>setTimeout(function(){location.replace("/landed")},30)</script></body>');
    if (req.url === '/landed') return res.end('<title>Landed</title><body><p>the real notice</p></body>');
    if (req.url === '/links') return res.end('<title>L</title><body><a href="/program/7">Temple stay</a> <a href="javascript:fncReserve(\'42\')">Reserve</a> <button onclick="go(\'9\')">Book</button><details><summary>Q</summary>Hidden answer</details><button aria-expanded="false" onclick="document.getElementById(\'a\').hidden=false;this.setAttribute(\'aria-expanded\',\'true\')">FAQ</button><div id="a" hidden>Accordion answer</div></body>');
    if (req.url === '/long') return res.end(`<title>Long</title><body><p>${long}</p></body>`);
    res.end('<title>x</title>');
  });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${srv.address().port}`;
  try {
    let r;
    try { r = await renderPage(`${base}/hop`, { allowLocal: true, waitS: 0.5, timeoutS: 30 }); } catch (e) { if (/Could not launch Google Chrome/.test(e.message)) return t.skip('Chrome not installed'); throw e; }
    assert.equal(r.text, 'the real notice');
    assert.equal(r.redirected, true);
    assert.match(r.finalUrl, /\/landed$/);
    const t0 = Date.now();
    const h = await renderPage(`${base}/hang`, { allowLocal: true, waitS: 0, timeoutS: 6 });
    assert.ok(Date.now() - t0 < 15000, `a hanging page ends near the timeout (${Date.now() - t0} ms)`);
    assert.equal(h.settled, false);
    const l = await renderPage(`${base}/links`, { allowLocal: true, waitS: 0.2, links: true, expand: true, timeoutS: 30 });
    assert.deepEqual(l.links.map((x) => [x.text, x.href]), [['Temple stay', `${base}/program/7`], ['Reserve', "javascript:fncReserve('42')"], ['Book', "go('9')"], ['FAQ', "document.getElementById('a').hidden=false;this.setAttribute('aria-expanded','true')"]]);
    assert.match(l.text, /Hidden answer/);
    assert.match(l.text, /Accordion answer/);
    const g = await renderPage(`${base}/long`, { allowLocal: true, waitS: 0, maxChars: 1000, timeoutS: 30 });
    assert.equal(g.chars, 1000);
    assert.ok(g.textFile && fs.readFileSync(g.textFile, 'utf8').length > 25000, 'the whole text is saved to a file');
    assert.ok(g.textFile.startsWith(CACHE));
  } finally { srv.close(); srv.closeAllConnections?.(); }
});

test('11A geo: Wikidata 429 is a note, OSM results stay, and Wikidata is skipped during the cooldown; Japanese addresses go to GSI', async () => {
  const cacheFile = path.join(tmpDir(), 'geo.json');
  const calls = [];
  const osm = [{ name: 'Wat Pho', category: 'amenity', type: 'place_of_worship', display_name: 'Wat Pho, Bangkok', lat: '13.7465', lon: '100.4927' }];
  const fake = async (u) => { calls.push(new URL(u).hostname); if (u.includes('wikidata')) return resp(429, 'too many', { 'retry-after': '120' }); return json(osm); };
  const r = await geoSearch('Wat Pho', { country: 'thailand', fetch: fake, cacheFile, offline: false });
  assert.equal(r.candidates.length, 1);
  assert.deepEqual(r.errors, []);
  assert.match(r.notes[0], /Wikidata answered HTTP 429/);
  assert.match(formatGeo(r), /ℹ Wikidata answered HTTP 429/);
  calls.length = 0;
  const again = await geoSearch('Wat Arun', { country: 'thailand', fetch: fake, cacheFile, offline: false });
  assert.deepEqual(calls, ['nominatim.openstreetmap.org'], 'Wikidata is not asked again during the cooldown');
  assert.match(again.notes[0], /Wikidata skipped/);
  assert.equal(looksLikeJapaneseAddress('東京都渋谷区代々木2-14-3', 'japan'), true);
  assert.equal(looksLikeJapaneseAddress('鬼金棒', 'japan'), false);
  assert.equal(looksLikeJapaneseAddress('钟书阁 都江堰', 'china'), false);
  const jp = await geoSearch('東京都渋谷区代々木2-14-3', { country: 'japan', cacheFile: path.join(tmpDir(), 'g.json'), offline: false, fetch: async (u) => {
    if (u.includes('gsi.go.jp')) return json([{ geometry: { coordinates: [139.696564, 35.686668] }, properties: { title: '東京都渋谷区代々木二丁目１４番３号' } }]);
    if (u.includes('nominatim')) return json([]);
    return json({ search: [] });
  } });
  assert.deepEqual([jp.candidates[0].source, jp.candidates[0].lat, jp.candidates[0].lng], ['gsi', 35.68667, 139.69656]);
  assert.match(formatGeo(jp), /GSI Japan/);
});

test('11A pdf: text per page, page images, page ranges, no-text pages', async () => {
  assert.deepEqual(parsePages('1-3,5', 6), [1, 2, 3, 5]);
  assert.deepEqual(parsePages('4-', 6), [4, 5, 6]);
  assert.deepEqual(parsePages('', 2), [1, 2]);
  assert.throws(() => parsePages('9', 2), /outside the document/);
  const dir = tmpDir();
  const file = path.join(dir, 'fares.pdf');
  fs.writeFileSync(file, miniPdf(['Adult fare 1200 yen', '', 'Last ferry 17:30']));
  const r = await readPdf(file, { images: true, pages: '1-3' });
  assert.equal(r.pageCount, 3);
  assert.deepEqual(r.pages.map((p) => p.text), ['Adult fare 1200 yen', '', 'Last ferry 17:30']);
  assert.deepEqual(r.noText, [2]);
  const meta = await sharp(r.pages[0].image).metadata();
  assert.ok(meta.width > 600 && meta.format === 'png');
  assert.match(fs.readFileSync(r.textFile, 'utf8'), /--- page 3 ---\nLast ferry 17:30/);
  fs.writeFileSync(path.join(dir, 'page.pdf'), '<!doctype html><html>not a pdf</html>');
  await assert.rejects(readPdf(path.join(dir, 'page.pdf')), /not a PDF \(the server sent a web page/);
  await assert.rejects(readPdf('https://example.com/x.pdf', { offline: true }), /offline/);
});

test('11A CLI: new flags and commands are wired', () => {
  assert.match(atr(['render', '--help']).stdout, /--timeout <value>[\s\S]*--links[\s\S]*--expand[\s\S]*--click <value>/);
  assert.match(atr(['render', 'https://example.com', '--timeout', 'x']).stderr, /--timeout takes seconds/);
  assert.match(atr(['pdf']).stderr, /give a PDF URL or file/);
  assert.match(atr(['--help']).stdout, /^ {2}pdf\s/m);
  assert.match(atr(['media', '--help']).stdout, /--patient[\s\S]*--queued/);
  assert.match(atr(['links', '--help']).stdout, /--no-browser/);
  const q = atr(['media', 'queue'], { ATR_CACHE_DIR: tmpDir() });
  assert.match(q.stdout, /no files queued for later/);
});
