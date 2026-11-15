#!/usr/bin/env node
// Screenshot every game mode (desktop + phone, light + dark) into build/game-shots/.
// Uses the game fixtures (game/test/fixtures, answer cards included) with seeded feedback in a temp dir.
// Usage: node game/tools/shots.js [--real] [--only home,swipe,...] [--device phone|desktop|phone360] [--theme light|dark]
// Route scenes (route, route-china, route-japan, route-pop) always use the real places/areas (the fixtures have no
// coordinates) with a temp COPY of feedback/: the real feedback files are never written.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { ROOT } from '../../platform/lib/index.js';
import { DEVICES as BASE_DEVICES } from '../../platform/lib/shot.js';
// phone360: the narrowest phone the layout supports (use --device phone360).
const DEVICES = { ...BASE_DEVICES, phone360: { ...BASE_DEVICES.phone, viewport: { width: 360, height: 740 } } };
import { startServer } from '../server.js';
import { appendEvent } from '../lib/store.js';

const { values: o } = parseArgs({ options: { real: { type: 'boolean' }, only: { type: 'string' }, device: { type: 'string' }, theme: { type: 'string' }, out: { type: 'string' } } });
const OUT = path.resolve(o.out || path.join(ROOT, 'build', 'game-shots', o.real ? 'real' : ''));
const FIX = path.join(ROOT, 'game', 'test', 'fixtures');

async function launch() {
  const { chromium } = await import('playwright-core');
  try { return await chromium.launch({ channel: 'chrome', headless: true }); } catch {
    return chromium.launch({ executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
  }
}

/** Seed a believable mid-game state. */
function seed(dir) {
  const t = (m) => new Date(Date.UTC(2026, 10, 10, 9, m)).toISOString().replace(/\.\d{3}Z$/, 'Z');
  let m = 0;
  const sw = (round, id, verdict, country) => appendEvent(dir, 'swipes', { session: 's-shots', round, id, verdict, country }, { now: new Date(t(m++)) });
  sw('area', 'harbin', 'must', 'china');
  const v = { 'harbin-ice-world': 'must', 'bund-countdown': 'must', 'great-wall-mutianyu': 'must', 'xintiandi-christmas-market': 'maybe', 'bund-techno-club': 'maybe', 'nanxiang-dumplings': 'must', 'hongyadong-night': 'must', 'lol-park-t1': 'must', 'gwangjang-food-alley': 'maybe', 'bukhansan-snow-hike': 'maybe', 'shibuya-sky': 'must', 'suga-shrine-stairs': 'maybe', 'victoria-peak-tram': 'must', 'chatuchak-weekend-market': 'skip' };
  const country = (id) => fs.readdirSync(path.join(FIX, 'places')).find((c) => fs.readdirSync(path.join(FIX, 'places', c)).some((city) => fs.existsSync(path.join(FIX, 'places', c, city, id))));
  for (const [id, verdict] of Object.entries(v)) sw('place', id, verdict, country(id));
  const duels = [['harbin-ice-world', 'great-wall-mutianyu'], ['bund-countdown', 'xintiandi-christmas-market'], ['hongyadong-night', 'nanxiang-dumplings'], ['harbin-ice-world', 'bund-countdown'], ['great-wall-mutianyu', 'bund-techno-club'], ['lol-park-t1', 'gwangjang-food-alley'], ['bukhansan-snow-hike', 'gwangjang-food-alley'], ['shibuya-sky', 'suga-shrine-stairs'], ['hongyadong-night', 'great-wall-mutianyu']];
  for (const [w, l] of duels) appendEvent(dir, 'duels', { session: 's-shots', winner: w, loser: l }, { now: new Date(t(m++)) });
  const note = (round, id, text) => appendEvent(dir, 'notes', { session: 's-shots', round, id, text }, { now: new Date(t(m++)) });
  note('area', 'harbin', 'Must, but only if I go in January: the ice festival is the whole point.');
  note('place', 'harbin-ice-world', 'Go at dusk when the lights come on. Worth the cold, but bring real boots.');
  note('place', 'great-wall-mutianyu', 'Only on a clear day; skip it if Beijing is grey.');
  note('place', 'chatuchak-weekend-market', 'Skip: too hot and crowded for me.');
  appendEvent(dir, 'questions', { session: 's-shots', id: 'harbin-ice-world', question: 'Is it open on Christmas Day?', answer_summary: 'Yes, open daily from mid-December including Dec 25.' }, { now: new Date(t(m++)) });
  fs.writeFileSync(path.join(dir, 'game-state.json'), JSON.stringify({ v: 1, firstRun: '2026-11-01T00:00:00Z', firstSeen: Object.fromEntries(['hongyadong-night', 'khao-san-road', 'dotonbori-kani-doraku'].map((id) => [id, '2026-11-09T00:00:00Z'])), days: { china: 25, japan: 11 }, locks: { nye: 'harbin-ice-world' } }, null, 2));
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'atr-game-shots-'));
if (o.real) { const src = path.join(ROOT, 'feedback'); if (fs.existsSync(src)) fs.cpSync(src, tmp, { recursive: true }); } else seed(tmp);
const tmpTrip = fs.mkdtempSync(path.join(os.tmpdir(), 'atr-game-shots-trip-'));
{ const src = path.join(ROOT, 'trip'); if (fs.existsSync(src)) fs.cpSync(src, tmpTrip, { recursive: true }); }
const srv = await startServer({ port: 0, ...(o.real ? {} : { root: FIX }), feedbackDir: tmp, tripDir: path.join(tmp, 'trip'), assetsDir: path.join(tmp, 'assets') });
const base = srv.url.replace(/\/$/, '');
// Route scenes: real places/areas, feedback copied to a temp dir.
const tmpReal = fs.mkdtempSync(path.join(os.tmpdir(), 'atr-game-shots-route-'));
{ const src = path.join(ROOT, 'feedback'); if (fs.existsSync(src)) fs.cpSync(src, tmpReal, { recursive: true }); }
const srvReal = await startServer({ port: 0, feedbackDir: tmpReal, tripDir: tmpTrip, assetsDir: path.join(tmpReal, 'assets') });
const baseReal = srvReal.url.replace(/\/$/, '');
const waitMap = async (page) => { await page.waitForSelector('#rmap', { timeout: 10000 }); await page.waitForFunction(() => !document.querySelector('#rmap.is-loading'), null, { timeout: 60000 }).catch(() => {}); await page.waitForTimeout(700); };
const browser = await launch();
const devices = o.device ? [o.device] : ['desktop', 'phone'];
const themes = o.theme ? [o.theme] : ['light', 'dark'];
const only = o.only ? new Set(o.only.split(',')) : null;
fs.mkdirSync(OUT, { recursive: true });

const SCENES = [
  { name: 'home', hash: '#/game', full: true },
  // Trip planner scenes: the real places and a temp COPY of trip/ (the real files are never written).
  { name: 'today', hash: '#/', real: true, full: true },
  { name: 'today-osaka', hash: '#/today/2027-01-30', real: true, full: true },
  { name: 'today-chongqing', hash: '#/today/2026-12-31', real: true, full: true },
  { name: 'itinerary', hash: '#/itinerary', real: true, full: true },
  { name: 'calendar', hash: '#/calendar', real: true, full: true },
  { name: 'calendar-day', hash: '#/calendar/2027-02-05', real: true },
  { name: 'find', hash: '#/places/osaka', real: true, full: true },
  { name: 'find-ramen', hash: '#/places', real: true, act: async (page) => { await page.locator('#t-q').fill('ramen'); await page.waitForTimeout(400); } },
  { name: 'money', hash: '#/money', real: true, full: true, act: async (page) => { await page.locator('#chk-price').fill('120'); await page.waitForTimeout(200); } },
  { name: 'todo', hash: '#/todo', real: true, full: true },
  { name: 'bag', hash: '#/bag', real: true, full: true },
  { name: 'edit-leg', hash: '#/itinerary', real: true, act: async (page) => { await page.locator('[data-leg="tk216"] [data-act="edit"]').click(); await page.waitForTimeout(300); } },
  { name: 'plan', hash: '#/itinerary', real: true, act: async (page) => { await page.locator('[data-leg="uber-to-gru"] [data-act="detail"]').click(); await page.waitForTimeout(300); } },
  { name: 'areas', hash: '#/areas' },
  { name: 'area-sheet', hash: '#/areas', act: async (page) => { await page.locator('[data-act="open"]').click().catch(() => {}); await page.waitForTimeout(500); } },
  { name: 'swipe', hash: '#/swipe' },
  { name: 'swipe-drag', hash: '#/swipe', act: async (page) => {
    const box = await page.locator('.g-card[data-depth="0"]').boundingBox();
    if (!box) return;
    const x = box.x + box.width / 2, y = box.y + box.height / 2;
    await page.mouse.move(x, y); await page.mouse.down(); await page.mouse.move(x + 60, y - 6, { steps: 4 }); await page.mouse.move(x + 120, y - 10, { steps: 4 });
    await page.waitForTimeout(150);
  } },
  { name: 'duels', hash: '#/duels' },
  { name: 'duels-note', hash: '#/duels', act: async (page) => { for (let i = 0; i < 25 && !(await page.locator('.g-side__note').count()); i++) { await page.keyboard.press('ArrowDown'); await page.waitForTimeout(80); } await page.waitForTimeout(500); } },
  { name: 'duels-pick', hash: '#/duels', act: async (page) => { await page.keyboard.press('ArrowLeft'); await page.waitForTimeout(260); } },
  { name: 'board', hash: '#/board', full: true },
  { name: 'calls', hash: '#/calls', full: true },
  { name: 'deck-note', hash: '#/swipe', act: async (page) => { await page.keyboard.press('n'); await page.waitForTimeout(250); await page.locator('.g-decknote textarea').fill('Only if the weekend works with Bangkok.'); await page.waitForTimeout(1600); } },
  { name: 'deck-noted', hash: '#/swipe', act: async (page) => { await page.keyboard.press('n'); await page.waitForTimeout(250); await page.locator('.g-decknote textarea').fill('Only if the weekend works with Bangkok.'); await page.keyboard.press('Escape'); await page.waitForTimeout(900); } },
  { name: 'sheet-note', hash: '#/board', act: async (page) => { await page.locator('.g-row[data-id="harbin-ice-world"]').first().click(); await page.waitForTimeout(900); } },
  { name: 'sheet-note-edit', hash: '#/board', act: async (page) => { await page.locator('.g-row[data-id="great-wall-mutianyu"]').first().click(); await page.waitForTimeout(700); await page.locator('.g-sheet__note textarea').click(); await page.keyboard.press('End'); await page.keyboard.type(' Maybe a day trip with a driver?'); await page.waitForTimeout(400); } },
  { name: 'holidays', hash: '#/holidays', full: true },
  { name: 'route', hash: '#/route', real: true, act: waitMap },
  { name: 'route-full', hash: '#/route', real: true, full: true, act: waitMap },
  { name: 'route-japan', hash: '#/route', real: true, act: async (page) => { await waitMap(page); await page.locator('#rlegs [data-zoom="japan"]').click(); await page.waitForTimeout(1400); } },
  { name: 'route-pop', hash: '#/route', real: true, act: async (page) => { await waitMap(page); await page.locator('.g-plan [data-city="china/shanghai"]').first().click(); await page.waitForTimeout(1400); } },
  // the plan is read-only until "Edit route"; this scene shows the controls
  { name: 'route-edit', hash: '#/route', real: true, full: true, act: async (page) => { await waitMap(page); await page.locator('[data-editroute]').click(); await waitMap(page); } },
  { name: 'place', hash: '#/swipe', act: async (page) => {
    await page.evaluate(() => document.querySelector('.g-card[data-depth="0"]') && document.querySelector('[data-act="open"]')?.click());
    await page.waitForTimeout(900);
  } },
  { name: 'answers', hash: '#/answers', full: true },
  { name: 'answers-open', hash: '#/answers/2026-11-20-ice-world-christmas', act: async (page) => { await page.waitForTimeout(600); } },
  { name: 'answers-place', hash: '#/answers', act: async (page) => {
    await page.locator('[data-open-id="harbin-ice-world"]').first().click();
    await page.waitForTimeout(900);
    await page.evaluate(() => document.querySelector('.g-sheet__frame').contentDocument.getElementById('answers')?.scrollIntoView({ block: 'start' }));
    await page.waitForTimeout(400);
  } },
];

const written = [];
for (const device of devices) for (const theme of themes) {
  for (const sc of SCENES) {
    if (only && !only.has(sc.name)) continue;
    const ctx = await browser.newContext({ ...DEVICES[device], deviceScaleFactor: sc.full ? 1 : DEVICES[device].deviceScaleFactor, colorScheme: theme, reducedMotion: 'no-preference' });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    // Fresh feedback per scene would change state; scenes that write (duels-pick) run last per device/theme.
    await page.goto(`${sc.real ? baseReal : base}/${sc.hash}`, { waitUntil: 'networkidle' });
    await page.waitForSelector('#view > :not(.g-loading)', { timeout: 10000 });
    await page.evaluate(async () => { await document.fonts.ready; document.querySelectorAll('[loading="lazy"]').forEach((i) => { i.loading = 'eager'; }); await Promise.all([...document.images].map((i) => (i.complete ? null : new Promise((r) => { i.onload = i.onerror = r; setTimeout(r, 4000); })))); });
    await page.waitForTimeout(500);
    if (sc.act) await sc.act(page);
    const file = path.join(OUT, `${sc.name}-${device}-${theme}.png`);
    await page.screenshot({ path: file, fullPage: !!sc.full });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    written.push(file);
    console.log(`${path.relative(ROOT, file)}${overflow > 1 ? `  ⚠ horizontal overflow ${overflow}px` : ''}${errors.length ? `  ⚠ ${errors.join(' | ').slice(0, 300)}` : ''}`);
    await ctx.close();
    // a scene that edits the route resets the sandbox copy so the next scene starts from the real state
    if (sc.resetsAfter) { fs.rmSync(path.join(tmpReal, 'route.jsonl'), { force: true }); const src = path.join(ROOT, 'feedback', 'route.jsonl'); if (fs.existsSync(src)) fs.copyFileSync(src, path.join(tmpReal, 'route.jsonl')); }
  }
}
await browser.close();
srv.server.close();
srvReal.server.close();
fs.rmSync(tmp, { recursive: true, force: true });
fs.rmSync(tmpReal, { recursive: true, force: true });
console.log(`\n${written.length} screenshot(s) in ${OUT}`);
