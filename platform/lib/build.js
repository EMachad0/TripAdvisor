// Static site build: index, every place page, areas page.
import fs from 'node:fs';
import path from 'node:path';
import { dataRoots } from './paths.js';
import { loadPlaces, loadAreas, mediaFiles } from './load.js';
import { validatePlace, validateArea } from './validate.js';
import { loadTripConfig } from './config.js';
import { renderPlacePage, renderIndexPage, renderAreasPage, renderAreaPage, copyAssets } from './render/index.js';
import { countryOverviewMap } from './overview.js';
import { loadTaste, mustDoStatus } from './taste.js';
import { staticMap } from './staticmap.js';
import { loadReviews, reviewStatus } from './review.js';

/** Where the site goes: build/ for real data, build/fixtures/ in fixture mode (opts.siteDir overrides both). */
export function siteDir(opts = {}) {
  if (opts.siteDir) return path.resolve(opts.siteDir);
  const r = dataRoots(opts);
  return r.fixtures ? path.join(r.build, 'fixtures') : r.build;
}

// The entries a build writes; everything else in build/ (shots/, fixtures/, game-shots/) is left alone.
const SITE_ENTRIES = ['index.html', 'areas.html', 'places', 'areas', 'assets'];
const PRIVATE = '.private';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; } };

/** Hard link when possible (same disk, no extra space), else copy. */
function linkOrCopy(from, to) {
  try { fs.linkSync(from, to); } catch { fs.copyFileSync(from, to); }
}

function copyMedia(from, to) {
  if (!fs.existsSync(from)) return 0;
  fs.mkdirSync(to, { recursive: true });
  let n = 0;
  for (const f of fs.readdirSync(from)) if (f.endsWith('.webp') && !fs.existsSync(path.join(to, f))) { linkOrCopy(path.join(from, f), path.join(to, f)); n++; }
  return n;
}

/**
 * A build dir of this process only, under <site>/.private/<pid>-<time>/ (`atr shot`, and so `atr review`, use one):
 * parallel sessions never read a page another session is rebuilding. Leftovers of dead processes are removed.
 */
export function privateSiteDir(opts = {}) {
  const base = path.join(siteDir(opts), PRIVATE);
  fs.mkdirSync(base, { recursive: true });
  for (const d of fs.readdirSync(base)) {
    const pid = Number(d.split('-')[0]);
    try { if (pid && pid !== process.pid && !alive(pid) && Date.now() - fs.statSync(path.join(base, d)).mtimeMs > 10 * 60000) fs.rmSync(path.join(base, d), { recursive: true, force: true }); } catch { /* another process cleans it */ }
  }
  const dir = path.join(base, `${process.pid}-${Date.now().toString(36)}`);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/** Run fn while holding <dir>/.build.lock (a directory: mkdir is atomic). A lock older than 2 minutes is stale. */
async function withLock(dir, fn, { waitMs = 120000 } = {}) {
  const lock = path.join(dir, '.build.lock');
  const until = Date.now() + waitMs;
  for (;;) {
    try { fs.mkdirSync(lock); break; } catch (e) {
      if (e.code !== 'EEXIST') throw e;
      try { if (Date.now() - fs.statSync(lock).mtimeMs > 120000) { fs.rmSync(lock, { recursive: true, force: true }); continue; } } catch { continue; }
      if (Date.now() > until) throw new Error(`another build has held ${lock} for over ${Math.round(waitMs / 1000)} s; retry, or remove the folder if no build is running`);
      await sleep(80 + Math.random() * 120);
    }
  }
  try { return await fn(); } finally { fs.rmSync(lock, { recursive: true, force: true }); }
}

/**
 * Build the site. The shared build/ is written to a staging folder first and swapped in under a lock, so two
 * sessions building at once no longer delete each other's half-written pages (ENOENT / ENOTEMPTY build/areas).
 * opts.siteDir (e.g. privateSiteDir()) builds straight into that folder.
 */
export async function buildSite(opts = {}) {
  const out = siteDir(opts);
  if (opts.siteDir) {
    for (const d of SITE_ENTRIES) fs.rmSync(path.join(out, d), { recursive: true, force: true });
    return buildInto(out, opts);
  }
  fs.mkdirSync(out, { recursive: true });
  const stage = path.join(out, `.staging-${process.pid}-${Date.now().toString(36)}`);
  const trash = path.join(out, `.old-${process.pid}-${Date.now().toString(36)}`);
  try {
    const r = await buildInto(stage, opts);
    await withLock(out, async () => {
      fs.mkdirSync(trash, { recursive: true });
      for (const d of SITE_ENTRIES) {
        if (fs.existsSync(path.join(out, d))) fs.renameSync(path.join(out, d), path.join(trash, d));
        if (fs.existsSync(path.join(stage, d))) fs.renameSync(path.join(stage, d), path.join(out, d));
      }
    });
    const fix = (f) => f && path.join(out, path.relative(stage, f));
    return { ...r, dir: out, index: fix(r.index), areasPage: fix(r.areasPage), pages: r.pages.map((p) => ({ ...p, file: fix(p.file) })), areaPages: r.areaPages.map((p) => ({ ...p, file: fix(p.file) })) };
  } finally {
    fs.rmSync(stage, { recursive: true, force: true });
    fs.rmSync(trash, { recursive: true, force: true });
  }
}

export function budgetFor(country, cfg) {
  return cfg?.countries?.find((c) => c.id === country)?.budget_brl_per_day;
}
export function cheapMealFor(country, cfg) {
  return cfg?.countries?.find((c) => c.id === country)?.cheap_meal_brl;
}

async function buildInto(out, opts) {
  const roots = dataRoots(opts);
  fs.mkdirSync(out, { recursive: true });
  copyAssets(path.join(out, 'assets'));
  const cfg = loadTripConfig(opts);
  const places = loadPlaces(opts).filter((p) => p.id && p.name);
  const areas = loadAreas(opts).filter((a) => a.id && a.name);
  // Pages with validation errors (another curator's scaffold full of TODOs, a page half done) still get their
  // own page, so `atr shot` works while they are being written, but no index, area page or pairs_well lists them.
  const fixtureMode = roots.fixtures;
  const strip = ({ _meta, ...d }) => d;
  const placeOk = (p) => !validatePlace(strip(p), { credits: p._meta.credits, mediaFiles: mediaFiles(p._meta.mediaDir), fixtureMode }).some((i) => i.level === 'error');
  const areaOk = (a) => !validateArea(strip(a), { credits: a._meta.credits, mediaFiles: mediaFiles(a._meta.mediaDir), fixtureMode }).some((i) => i.level === 'error');
  const listed = places.filter(placeOk), listedAreas = areas.filter(areaOk);
  const unlisted = [...places.filter((p) => !listed.includes(p)).map((p) => p.id), ...areas.filter((a) => !listedAreas.includes(a)).map((a) => `area ${a.id}`)];
  const byId = Object.fromEntries(listed.map((p) => [p.id, p]));
  const reviews = loadReviews(opts);
  const pages = [];
  for (const p of places) {
    const dir = path.join(out, 'places', p.id);
    fs.mkdirSync(dir, { recursive: true });
    copyMedia(p._meta.mediaDir, path.join(dir, 'media'));
    let sm = null;
    const mapB = (p.blocks || []).find((b) => b?.type === 'map');
    if (mapB && mapB.embed !== false && !opts.noMaps) {
      const m = await staticMap(p.location?.lat, p.location?.lng, { zoom: mapB.zoom || 16, opts });
      if (m) { linkOrCopy(m.file, path.join(dir, "map.webp")); sm = { url: 'map.webp', width: m.width, height: m.height }; }
    }
    let html;
    try {
      html = renderPlacePage(p, {
        assetBase: '../../assets/', homeUrl: '../../', mediaBase: 'media/', places: byId,
        placeUrl: (o) => `../${o.id}/`, placeMediaUrl: (o, n, w) => `../${o.id}/media/${n}-${w}.webp`,
        budgetPerDay: budgetFor(p.country, cfg), cheapMealBrl: cheapMealFor(p.country, cfg), staticMap: sm, review: reviewStatus(p, reviews), trip: cfg,
      });
    } catch (e) {
      html = `<!doctype html><meta charset="utf-8"><title>Render error</title><pre>Render error for ${p.id}: ${String(e.stack).replace(/</g, '&lt;')}</pre>`;
    }
    fs.writeFileSync(path.join(dir, 'index.html'), html);
    pages.push({ id: p.id, file: path.join(dir, 'index.html') });
  }
  for (const a of areas) copyMedia(a._meta.mediaDir, path.join(out, 'areas', a.country, 'media'));
  // Country overview maps (areas page) and one page per area: build/areas/<id>/index.html
  const countryMaps = {};
  if (!opts.noMaps) for (const c of [...new Set(listedAreas.map((a) => a.country))]) {
    const m = await countryOverviewMap(listedAreas.filter((a) => a.country === c), { opts });
    if (m) { fs.mkdirSync(path.join(out, 'areas', c), { recursive: true }); linkOrCopy(m.file, path.join(out, "areas", c, "overview.webp")); countryMaps[c] = { url: `areas/${c}/overview.webp`, width: m.width, height: m.height, pins: m.pins }; }
  }
  const mustDo = mustDoStatus(loadTaste(opts), listed, listedAreas);
  const areaPages = [];
  for (const a of areas) {
    const dir = path.join(out, 'areas', a.id);
    fs.mkdirSync(dir, { recursive: true });
    let sm = null;
    if (!opts.noMaps && typeof a.lat === 'number' && typeof a.lng === 'number') {
      const m = await staticMap(a.lat, a.lng, { zoom: a.scope === 'region' ? 7 : 10, opts });
      if (m) { linkOrCopy(m.file, path.join(dir, "map.webp")); sm = { url: 'map.webp', width: m.width, height: m.height }; }
    }
    let html;
    try {
      html = renderAreaPage(a, {
        assetBase: '../../assets/', homeUrl: `../../areas.html#area-${a.id}`, mediaBase: `../${a.country}/media/`, places: listed, mustDo, staticMap: sm,
        placeUrl: (p) => `../../places/${p.id}/`, placeMediaUrl: (p, n, w) => `../../places/${p.id}/media/${n}-${w}.webp`,
        number: countryMaps[a.country]?.pins.find((x) => x.id === a.id)?.n, trip: cfg,
      });
    } catch (e) {
      html = `<!doctype html><meta charset="utf-8"><title>Render error</title><pre>Render error for area ${a.id}: ${String(e.stack).replace(/</g, '&lt;')}</pre>`;
    }
    fs.writeFileSync(path.join(dir, 'index.html'), html);
    areaPages.push({ id: a.id, file: path.join(dir, 'index.html') });
  }
  fs.writeFileSync(path.join(out, 'index.html'), renderIndexPage(listed, { assetBase: 'assets/', areasUrl: 'areas.html', fixtures: roots.fixtures, countries: cfg?.countries }));
  fs.writeFileSync(path.join(out, 'areas.html'), renderAreasPage(listedAreas, { assetBase: 'assets/', trip: cfg, areaUrl: (a) => `areas/${a.id}/`, countryMaps }));
  return { dir: out, pages, areaPages, places: places.length, areas: areas.length, unlisted, index: path.join(out, 'index.html'), areasPage: path.join(out, 'areas.html') };
}
