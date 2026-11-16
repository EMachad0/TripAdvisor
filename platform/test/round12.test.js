// Round 12: atr hostel-prices, atr sun, full-page shots taller than Chrome's capture limit, and a CLI that
// fails kindly while a platform file is half-written. No network: the Hostelworld feed and fetch are stubbed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import sharp from 'sharp';
import { ROOT } from '../lib/paths.js';
import { tmpDir } from './helpers.js';
import { hostelId, hostelPrices, formatHostelPrices, nightsBetween, pageUrl, classifyEmpty } from '../lib/hostelprices.js';
import { sunReport, countryAt } from '../lib/sun.js';
import { checkUrl } from '../lib/links.js';
import { pieceRanges, shoot, MAX_PIECE } from '../lib/shot.js';

process.env.ATR_QUIET = '1';
process.env.ATR_CACHE_DIR = tmpDir();
const atr = (args, env = {}) => spawnSync(path.join(ROOT, 'atr'), args, { cwd: ROOT, encoding: 'utf8', env: { ...process.env, NO_COLOR: '1', ATR_OFFLINE: '1', ...env } });

// ── hostel-prices ──
const room = (name, capacity, prices, left = 4) => ({
  name, capacity: String(capacity), totalBedsAvailable: left, totalRoomsAvailable: 1,
  ratePlans: prices.map(([id, , nonref]) => ({ id, paymentProcedure: nonref ? { id: 'nonRefundable', label: 'Non-refundable' } : { id: 'depositPayable', label: 'Deposit only' } })),
  averagePricePerNight: prices.map(([id, v]) => ({ ratePlan: id, price: { value: String(v), currency: 'KRW' } })),
});
const onSale = (dorm = 43659) => ({ rooms: { dorms: [room('Standard 10 Bed Mixed Dorm', 10, [[1, dorm], [2, dorm - 1310, true]]), room('4 Bed Female Dorm', 4, [[3, dorm + 7000]])], privates: [room('Twin Room Private', 2, [[4, 147609]])] }, freeCancellationAvailable: true, freeCancellationAvailableUntil: '2027-01-11T23:59:59+09:00', stayRuleViolations: [] });
const empty = { rooms: { dorms: [], privates: [] }, freeCancellationAvailable: false, stayRuleViolations: [] };
/** A stub feed: { 'YYYY-MM-DD': answer }; anything else is empty. Records the URLs asked for. */
function feed(byDate, info = { name: "Jin's Paradise", currency: 'KRW', city: { name: 'Seoul', country: 'South Korea' } }) {
  const asked = [];
  const get = async (url) => {
    asked.push(url);
    if (/\/properties\/404\//.test(url)) return { status: 404, body: Buffer.from(JSON.stringify({ description: [{ message: 'Property not Found.' }] })) };
    if (!/availability/.test(url)) return { status: 200, body: Buffer.from(JSON.stringify(info)) };
    const d = new URL(url).searchParams.get('date-start');
    return { status: 200, body: Buffer.from(JSON.stringify(byDate[d] || empty)) };
  };
  return { get, asked };
}
const fx = async (cur) => ({ currency: cur, rate: 0.004, date: '2026-11-12', source: 'test' });

test('12 hostel-prices: ids from every Hostelworld URL form, nights, page URL', () => {
  assert.equal(hostelId('85799'), '85799');
  assert.equal(hostelId('https://www.hostelworld.com/pwa/hosteldetails.php/Jin-s-Paradise/Seoul/295727?from=2027-01-11&to=2027-01-12&guests=1'), '295727');
  assert.equal(hostelId('https://www.hostelworld.com/hostels/p/320426/some-hostel/?from=2027-01-01'), '320426');
  assert.equal(hostelId('https://prod.apigee.hostelworld.com/legacy-hwapi-service/2.2/properties/330544/availability/?guests=1'), '330544');
  assert.equal(hostelId('https://example.com/p/12345'), null);
  assert.equal(hostelId('yu-garden'), null);
  assert.deepEqual(nightsBetween('2026-12-30', '2027-01-02'), ['2026-12-30', '2026-12-31', '2027-01-01']);
  assert.equal(pageUrl({ id: '295727', name: "Jin's Paradise", city: 'Seoul' }, '2027-01-11', '2027-01-12', 'KRW'), 'https://www.hostelworld.com/pwa/hosteldetails.php/Jin-s-Paradise/Seoul/295727?from=2027-01-11&to=2027-01-12&guests=1&currency=KRW');
});

test('12 hostel-prices: cheapest dorm and private per night, refundable alternative, R$, free cancellation', async () => {
  const { get, asked } = feed({ '2027-01-15': onSale(43659), '2027-01-16': onSale(46777) });
  const r = await hostelPrices('295727', { from: '2027-01-15', to: '2027-01-17', get, fx, gapMs: 0 });
  assert.equal(r.nights.length, 2);
  const n = r.nights[0];
  assert.equal(n.status, 'on sale');
  assert.equal(n.dorm.price, 42349);
  assert.equal(n.dorm.plan, 'Non-refundable');
  assert.equal(n.dorm.refundable_price, 43659);
  assert.equal(n.dorm.brl, 169.4);
  assert.equal(n.private.price, 147609);
  assert.equal(n.private.sleeps, 2);
  assert.equal(n.free_cancellation_until, '2027-01-11T23:59:59+09:00');
  assert.match(n.page, /hosteldetails\.php\/Jin-s-Paradise\/Seoul\/295727\?from=2027-01-15&to=2027-01-16&guests=1&currency=KRW$/);
  assert.match(r.page, /from=2027-01-15&to=2027-01-17/);
  assert.ok(asked.some((u) => /num-nights=1&date-start=2027-01-16&currency=KRW/.test(u)));
  assert.equal(r.probes.length, 0, 'no probes when every night is on sale');
  const text = formatHostelPrices(r);
  assert.match(text, /dorm bed +KRW 42,349 \(R\$ 169,40\) per bed/);
  assert.match(text, /KRW 43,659 \(R\$ 174,64\) deposit only/);
  assert.match(text, /free cancellation until 2027-01-11 23:59/);
  assert.match(text, /\.\/atr links accepts both/);
});

test('12 hostel-prices: an empty night is SOLD OUT when a later date has beds, NOT ON SALE YET when only earlier dates do', async () => {
  // Jan 15 empty, Jan 22 (+7 probe) on sale → sold out.
  let f = feed({ '2027-01-14': onSale(), '2027-01-22': onSale() });
  let r = await hostelPrices('295727', { from: '2027-01-14', to: '2027-01-16', get: f.get, fx, gapMs: 0 });
  assert.equal(r.nights[1].status, 'sold out');
  assert.match(formatHostelPrices(r), /SOLD OUT/);
  // Only an earlier night has beds, no probe does → not on sale yet.
  f = feed({ '2027-01-14': onSale() });
  r = await hostelPrices('295727', { from: '2027-01-14', to: '2027-01-16', get: f.get, fx, gapMs: 0 });
  assert.equal(r.nights[1].status, 'not on sale yet');
  assert.match(formatHostelPrices(r), /NOT ON SALE YET/);
  assert.equal(r.probes.length, 3);
  // Nothing anywhere → no beds (the near probe was tried too).
  f = feed({});
  r = await hostelPrices('295727', { from: '2027-03-01', to: '2027-03-02', get: f.get, fx, gapMs: 0, today: '2026-11-12' });
  assert.equal(r.nights[0].status, 'no beds');
  assert.ok(r.probes.some((p) => p.date === '2026-11-26'));
  // classifyEmpty on its own
  const ns = classifyEmpty([{ date: '2027-01-10', on_sale: false }, { date: '2027-01-11', on_sale: true }], new Set(['2027-01-11']));
  assert.equal(ns[0].status, 'sold out');
});

test('12 hostel-prices: unknown id, bad dates, unreadable feed', async () => {
  await assert.rejects(hostelPrices('404', { from: '2027-01-14', get: feed({}).get, fx, gapMs: 0 }), /no active property/);
  await assert.rejects(hostelPrices('295727', { from: '2027-01-14', to: '2027-01-14', get: feed({}).get, fx, gapMs: 0 }), /must come after/);
  await assert.rejects(hostelPrices('295727', { from: '14/01/2027', get: feed({}).get, fx, gapMs: 0 }), /YYYY-MM-DD/);
  const blocked = async (url) => (/availability/.test(url) ? { status: 403, body: Buffer.from('<html>403</html>') } : { status: 200, body: Buffer.from('{"name":"X","currency":"KRW","city":{"name":"Seoul"}}') });
  const r = await hostelPrices('295727', { from: '2027-01-14', get: blocked, fx, gapMs: 0 });
  assert.match(r.nights[0].error, /could not be read \(HTTP 403\)/);
  assert.match(formatHostelPrices(r), /render the page instead: \.\/atr render "https:\/\/www\.hostelworld\.com\/pwa\/hosteldetails\.php\/X\/Seoul\/295727\?from=2027-01-14&to=2027-01-15/);
  const cli = atr(['hostel-prices', '295727']);
  assert.equal(cli.status, 1);
  assert.match(cli.stderr, /--from YYYY-MM-DD is required/);
});

test('12 links: a 403 from fetch is asked again with a plain request before it is called blocked', async () => {
  const fetch403 = async () => new Response('<html><title>403</title></html>', { status: 403, headers: { 'content-type': 'text/html' } });
  const ok = await checkUrl('https://prod.apigee.hostelworld.com/legacy-hwapi-service/2.2/properties/1/availability/', { fetch: fetch403, rawGet: async () => ({ status: 200, url: 'https://prod.apigee.hostelworld.com/x' }) });
  assert.equal(ok.status, 'ok');
  assert.match(ok.detail, /second, plain request; the first got 403/);
  const still = await checkUrl('https://example.org/x', { fetch: fetch403, rawGet: async () => ({ status: 403 }) });
  assert.equal(still.status, 'blocked');
  const noRaw = await checkUrl('https://example.org/x', { fetch: fetch403 });
  assert.equal(noRaw.status, 'blocked', 'an injected fetch alone never goes to the network');
});

// ── sun ──
test('12 sun: within a minute of sunrise-sunset.org (values read from its API on 2026-11-12)', () => {
  const near = (got, want) => { const [h, m] = got.split(':').map(Number), [H, M, S] = want.split(':').map(Number); assert.ok(Math.abs(h * 60 + m - (H * 60 + M + S / 60)) <= 1, `${got} vs ${want}`); };
  const bkk = sunReport({ lat: 13.7525, lng: 100.4942, country: 'thailand' }, '2026-12-15');
  assert.equal(bkk.tz, 'Asia/Bangkok');
  near(bkk.times.sunrise, '06:33:19'); near(bkk.times.sunset, '17:52:41'); near(bkk.times.dusk_civil, '18:15:44'); near(bkk.times.noon, '12:13:00');
  const sel = sunReport({ lat: 37.5665, lng: 126.978 }, '2027-01-15');
  assert.equal(sel.tz, 'Asia/Seoul', 'zone from the coordinates');
  near(sel.times.sunrise, '07:45:47'); near(sel.times.sunset, '17:36:46'); near(sel.times.dusk_civil, '18:05:15');
  const hrb = sunReport({ lat: 45.75, lng: 126.65, country: 'china' }, '2026-12-21');
  near(hrb.times.sunrise, '07:11:02'); near(hrb.times.sunset, '15:51:32');
  const tyo = sunReport({ lat: 35.6812, lng: 139.7671 }, '2026-12-01');
  near(tyo.times.sunrise, '06:31:47'); near(tyo.times.sunset, '16:27:48');
  assert.equal(countryAt(22.3, 114.17), 'hong-kong');
  const polar = sunReport({ lat: 78.2, lng: 15.6, tz: 'Europe/Oslo' }, '2026-12-21');
  assert.equal(polar.times.sunrise, null);
  assert.equal(polar.day_length, null);
});

test('12 sun CLI: an area id, coordinates and a date range', () => {
  const a = atr(['sun', 'bangkok', '2026-12-15']);
  if (a.status === 0) { assert.match(a.stdout, /sunrise +06:33/); assert.match(a.stdout, /dusk +18:16/); }
  const j = JSON.parse(atr(['sun', '13.7525,100.4942', '2026-12-15', '--json']).stdout);
  assert.equal(j.times.sunset, '17:53');
  const r = atr(['sun', '37.5665,126.978', '2027-01-10', '--to', '2027-01-12']);
  assert.equal(r.status, 0);
  assert.equal(r.stdout.trim().split('\n').filter((l) => /^2027-01-1\d/.test(l)).length, 3);
  assert.match(atr(['sun', '48.85,2.35', '2026-12-05']).stdout, /times are UTC/);
});

// ── shot ──
test('12 shot: pages taller than one capture are shot in pieces; the end of the page is in the PNG', async (t) => {
  assert.deepEqual(pieceRanges(20000, 8000), [{ y: 0, height: 8000 }, { y: 8000, height: 8000 }, { y: 16000, height: 4000 }]);
  assert.deepEqual(pieceRanges(500, 8000), [{ y: 0, height: 500 }]);
  const dir = tmpDir();
  const file = path.join(dir, 'tall.html');
  // 23,000 px: blue at the top, a band per 1,000 px, red footer at the very end.
  const bands = Array.from({ length: 22 }, (_, i) => `<div style="height:1000px;background:hsl(${i * 15},60%,60%)"></div>`).join('');
  fs.writeFileSync(file, `<!doctype html><meta name=viewport content="width=device-width"><body style="margin:0"><div style="height:1000px;background:#00f"></div>${bands.slice(0)}<footer style="height:200px;background:#f00"></footer>`);
  let res;
  try { res = await shoot([{ file, out: path.join(dir, 'tall.png'), device: 'phone', theme: 'light' }], { waitMs: 0 }); } catch (e) { if (/Could not launch Google Chrome/.test(e.message)) return t.skip('Chrome not installed'); throw e; }
  assert.ok(res[0].pieces >= 3, `captured in ${res[0].pieces} pieces`);
  const { height } = await sharp(res[0].out).metadata();
  assert.equal(height, 23200);
  const px = async (y) => { const { data } = await sharp(res[0].out).extract({ left: 100, top: y, width: 1, height: 1 }).raw().toBuffer({ resolveWithObject: true }); return [...data.slice(0, 3)]; };
  assert.deepEqual(await px(23100), [255, 0, 0], 'the footer is at the end (before: the top of the page repeated after 16,384 px)');
  assert.deepEqual(await px(500), [0, 0, 255]);
  assert.ok(MAX_PIECE < 16384);
});

// ── kind failure while the platform is being updated ──
test('12 CLI: a half-written platform module prints one line, not a stack trace', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'atr-broken-'));
  try {
    fs.cpSync(path.join(ROOT, 'platform'), path.join(dir, 'platform'), { recursive: true, filter: (s) => !s.includes(`${path.sep}test${path.sep}`) && !s.endsWith(`${path.sep}test`) && !s.split(path.sep).includes('node_modules') });
    // Under pnpm, platform/ is a workspace package with its own package.json (exports map, "type": "module") and its
    // own node_modules (skipped above); its dependencies resolve from the root node_modules symlinked below.
    fs.copyFileSync(path.join(ROOT, 'atr'), path.join(dir, 'atr'));
    fs.copyFileSync(path.join(ROOT, 'package.json'), path.join(dir, 'package.json'));
    fs.symlinkSync(path.join(ROOT, 'node_modules'), path.join(dir, 'node_modules'));
    const run = (args) => spawnSync(process.execPath, [path.join(dir, 'atr'), ...args], { cwd: dir, encoding: 'utf8', env: { ...process.env, NO_COLOR: '1', ATR_OFFLINE: '1', ATR_DEBUG: '' } });
    // Sanity: the copy works.
    assert.equal(run(['sun', '13.75,100.49', '2026-12-15', '--json']).status, 0);
    // A statically imported module emptied mid-edit (round 11's incident): missing export.
    fs.writeFileSync(path.join(dir, 'platform/lib/validate.js'), '');
    let r = run(['validate', '--quiet']);
    assert.equal(r.status, 75);
    assert.match(r.stderr, /^atr: the platform is being updated; try again in a minute\. \(.*does not provide an export named/);
    assert.equal(r.stderr.trim().split('\n').length, 1, r.stderr);
    assert.doesNotMatch(r.stderr, /at .*\(file:|node:internal/);
    // Half-written: a parse error.
    fs.writeFileSync(path.join(dir, 'platform/lib/validate.js'), 'export function validateAll(o) { return {');
    r = run(['--help']);
    assert.equal(r.status, 75);
    assert.match(r.stderr, /platform is being updated/);
    fs.copyFileSync(path.join(ROOT, 'platform/lib/validate.js'), path.join(dir, 'platform/lib/validate.js'));
    // A module a command loads later: same line, from the CLI's own catch.
    fs.writeFileSync(path.join(dir, 'platform/lib/sun.js'), 'export const TZ = {;');
    r = run(['sun', '13.75,100.49', '2026-12-15']);
    assert.equal(r.status, 75);
    assert.match(r.stderr, /^atr: the platform is being updated; try again in a minute/);
    // A module that is gone for a moment (renamed during an update).
    fs.rmSync(path.join(dir, 'platform/lib/sun.js'));
    r = run(['sun', '13.75,100.49', '2026-12-15']);
    assert.equal(r.status, 75);
    assert.match(r.stderr, /platform is being updated.*Cannot find module/);
    // An ordinary error is still an ordinary error.
    r = run(['hostel-prices', '1']);
    assert.equal(r.status, 1);
    assert.doesNotMatch(r.stderr, /being updated/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

// ── display fixes from places/_friction.md ──
test('static map: the crop never runs past the stitched tiles (siam-paragon-skywalk never drew its map)', async () => {
  const { tileWindow } = await import('../lib/staticmap.js');
  // 13.74678, 100.53495 at zoom 16 (rendered at 17): the crop offset used to round up to 81 px of a 1280 px strip
  const w = tileWindow(13.74678, 100.53495, 17, 1200, 720);
  assert.equal(w.fullWidth, 1280);
  assert.ok(w.cropLeft + 1200 <= w.fullWidth, `crop ${w.cropLeft}+1200 fits in ${w.fullWidth}`);
  for (let i = 0; i < 400; i++) {
    const t = tileWindow(13 + i * 0.00137, 100 + i * 0.00291, 17, 1200, 720);
    assert.ok(t.cropLeft >= 0 && t.cropTop >= 0 && t.cropLeft + 1200 <= t.fullWidth && t.cropTop + 720 <= t.fullHeight);
  }
});

test('weather card and hours box are labelled with the months the traveler is in that country', async () => {
  const { tripMonths } = await import('../lib/when.js');
  const { renderPlacePage, renderAreaPage } = await import('../lib/index.js');
  const { fixturePlace, fixtureCredits } = await import('./helpers.js');
  const trip = { countries: [{ id: 'china', from: '2026-12-06', to: '2027-01-02' }, { id: 'korea', from: '2027-01-11', to: '2027-01-20' }, { id: 'japan', from: '2027-01-20', to: '2027-02-04' }, { id: 'hong-kong', from: '2027-02-04', to: '2027-02-09' }] };
  assert.equal(tripMonths({ country: 'hong-kong' }, trip), 'Feb');
  assert.equal(tripMonths({ country: 'japan' }, trip), 'Jan–Feb');
  assert.equal(tripMonths({ country: 'korea' }, trip), 'Jan');
  assert.equal(tripMonths({ country: 'china' }, trip), 'Dec–Jan');
  assert.equal(tripMonths({ country: 'china' }, null), 'Dec–Jan', 'no trip dates: the old label');
  const p = { ...fixturePlace(), country: 'hong-kong' };
  p.hours = { ...p.hours, winter: 'Open over the holiday.' };
  if (!p.blocks.some((b) => b.type === 'weather')) p.blocks.push({ type: 'weather', temp_low_c: 14, temp_high_c: 19, conditions: 'Mild', note: 'Dry.' });
  const html = renderPlacePage(p, { credits: fixtureCredits(), trip });
  assert.match(html, /Typical Feb low \/ high/);
  assert.match(html, /<strong>Feb:<\/strong>/);
  assert.doesNotMatch(html, /Dec–Jan/);
  assert.match(renderPlacePage(p, { credits: fixtureCredits() }), /Typical Dec–Jan low \/ high/);
  const area = { id: 'hk', name: 'Hong Kong', country: 'hong-kong', winter_note: 'Mild and dry.', blocks: [] };
  assert.match(renderAreaPage(area, { credits: [], trip }), /Feb in Hong Kong/);
});
