#!/usr/bin/env node
// Asia Trip Ranker — the game. Local Node server (no deps beyond the platform).
// Run: ./atr game  |  npm run game  |  node game/server.js [--port N] [--fixtures] [--open]
// Data is re-read on every request, so new curator content shows up without a restart.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import {
  loadPlaces, loadAreas, loadTripConfig, dataRoots, ROOT, renderPlaceCard, renderPlacePage, renderAreaCard, renderAreaPage, loadTaste, mustDoStatus,
  copyAssets, countsAgainstBudget, bookingLevel, bookingLinks, bookBadgeText, COUNTRIES, CATEGORIES,
  themeBoot, themeToggle, md, esc, staticMap, fmtBRL, titleCase, latestNotes, currentRoute, stopsErrors, eventDays, whenLabel,
} from '../platform/lib/index.js';
import { clean as cleanStop } from '../platform/lib/route.js';
import { imageFrame } from './lib/routemap.js';
import { appendEvent, readAll, latestVerdicts, sortedDuels, readState, writeState, trackSeen, newSessionId } from './lib/store.js';
import { computeRatings, START } from './lib/elo.js';
import { HOLIDAYS, picksMany } from './lib/board.js';
import { buildPrompt, buildTripPrompt, runAsk, summarize, splitTldr } from './lib/ask.js';
import { readTrip, writeDoc } from './lib/tripstore.js';
import { todayModel, localKey, localStamp, stayName, TZ_OFFSET } from './lib/trip.js';
import { createAuth, accountsFromEnv, loginPage } from './lib/auth.js';

/** Marks a card's root element with its country's UTC offset, so the page can label the times in its text. */
const withTz = (html, country) => (TZ_OFFSET[country] === undefined ? html : String(html).replace(/^(\s*<[a-z][\w-]*)/i, `$1 data-tz="${TZ_OFFSET[country]}"`));

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(HERE, 'public');
const LIB = path.join(HERE, 'lib');
const SHARED_LIB = new Set(['elo.js', 'pairing.js', 'board.js', 'routemap.js', 'trip.js']);
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.webp': 'image/webp', '.woff2': 'font/woff2', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json' };

// ---------- data ----------
function thumbUrl(p, credits) {
  const cover = p.cover || (p.blocks || []).find((b) => b?.type === 'hero')?.image;
  if (!cover) return null;
  const c = credits.find((x) => x.file === cover);
  const w = (c?.widths || [1280]).slice().sort((a, b) => a - b)[0];
  return `/media/${encodeURIComponent(p.id)}/${encodeURIComponent(cover)}-${w}.webp`;
}

const plain = (s) => String(s || '').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').replace(/[*_`]/g, '').replace(/\s+/g, ' ').trim();
const clip = (s, n) => (s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s);
const CROWD_RE = /[^.!?]*\b(crowd\w*|queue\w*|packed|busy|busiest|sell(?:s)? out|sold out|million)\b[^.!?]*[.!?]?/i;

/** Key facts for the holiday picker (crowd / cold / winter notes). */
export function holidayFacts(p) {
  const weather = (p.blocks || []).find((b) => b?.type === 'weather');
  const tags = p.tags || [];
  const text = [p.hours?.winter, p.best_time, p.book_ahead?.lead_time].map(plain).join(' . ');
  const crowdHit = text.match(CROWD_RE)?.[0]?.trim();
  return {
    cold: weather ? `${weather.temp_low_c} to ${weather.temp_high_c} °C · ${weather.conditions}` : (tags.includes('cold') ? 'Cold, mostly outdoors' : tags.includes('indoor') ? 'Indoors' : null),
    coldLevel: weather ? (weather.temp_low_c <= -10 ? 'brutal' : weather.temp_low_c <= 0 ? 'freezing' : weather.temp_high_c <= 12 ? 'chilly' : 'mild') : (tags.includes('cold') ? 'freezing' : null),
    outdoor: tags.includes('outdoor') || undefined,
    crowd: crowdHit ? clip(crowdHit.replace(/^[\s.]+/, ''), 140) : (tags.includes('crowded') ? 'Expect big crowds' : null),
    winter: p.hours?.winter ? (clip(plain(p.hours.winter).replace(crowdHit || '\u0000', '').replace(/\s+\.?\s*$/, '').trim(), 200) || null) : null,
    hours: p.hours?.summary || null,
  };
}

export function createApp(opts = {}) {
  const dataOpts = { ...(opts.root ? { root: opts.root, includeFixtures: true } : {}), ...(opts.fixtures !== undefined ? { fixtures: opts.fixtures } : {}), ...(opts.configFile ? { configFile: path.resolve(opts.configFile) } : {}) };
  const roots = dataRoots(dataOpts);
  const feedbackDir = opts.feedbackDir ? path.resolve(opts.feedbackDir) : roots.feedback;
  // The trip planner's own data (tasks, itinerary, bag, money): <data root>/trip/*.json, see game/lib/tripstore.js.
  const tripDir = opts.tripDir ? path.resolve(opts.tripDir) : path.join(path.dirname(roots.places), 'trip');
  const stateFile = opts.stateFile ? path.resolve(opts.stateFile) : path.join(feedbackDir, 'game-state.json');
  const session = opts.session || newSessionId();
  const ask = opts.ask || runAsk;
  // Hosted site: an owner + read-only guest login (ATR_OWNER_PASSWORD, ATR_GUEST_PASSWORD, see lib/auth.js)
  // and no Ask box (ATR_ASK=off), since asking runs the claude CLI on the laptop.
  const auth = createAuth(opts.accounts !== undefined ? opts.accounts : accountsFromEnv());
  const GUEST_NO = 'Guests can look but not change anything.';
  const askOn = opts.askEnabled !== undefined ? !!opts.askEnabled : !/^(off|0|false)$/i.test(process.env.ATR_ASK || '');
  const ASK_OFF = 'Asking is turned off on the hosted site. Ask from the laptop.';
  const assetsDir = opts.assetsDir || path.join(ROOT, '.cache', 'game-assets');
  copyAssets(assetsDir);
  let asking = 0;

  const load = () => {
    const places = loadPlaces(dataOpts).filter((p) => p && p.id && p.name && p.country);
    const areas = loadAreas(dataOpts).filter((a) => a && a.id && a.name && a.country);
    const cfg = loadTripConfig(dataOpts) || { countries: [] };
    return { places, areas, cfg, byId: new Map(places.map((p) => [p.id, p])) };
  };

  /** write: false (a guest) leaves the first-seen bookkeeping in memory instead of saving it. */
  function state({ write = true } = {}) {
    const d = load();
    const fb = readAll(feedbackDir);
    const verdicts = latestVerdicts(fb.swipes);
    const duels = sortedDuels(fb.duels);
    const ratings = computeRatings(verdicts.place, duels);
    const notes = latestNotes(fb.notes);
    const noteOf = (round, id) => notes.get(`${round}:${id}`)?.text.trim() || null;
    const st = readState(stateFile);
    const swiped = new Set([...Object.keys(verdicts.place), ...Object.keys(verdicts.area)]);
    const seen = trackSeen(st, [...d.places.map((p) => p.id), ...d.areas.map((a) => `area:${a.id}`)], swiped);
    // areas use an "area:" prefix in firstSeen so an area and a place can share an id.
    const isNewArea = (id) => !verdicts.area[id] && st.firstSeen[`area:${id}`] > st.firstRun;
    if (seen.changed && write) writeState(stateFile, st);
    const countries = (d.cfg.countries || []).map((c) => ({ id: c.id, name: COUNTRIES[c.id]?.name || titleCase(c.id), flag: COUNTRIES[c.id]?.flag || '', days: c.days, budget_brl_per_day: c.budget_brl_per_day, from: String(c.from).slice(0, 10), to: String(c.to).slice(0, 10), cities: c.cities || [] }));
    const places = d.places.map((p) => {
      const credits = p._meta.credits || [];
      const isNew = seen.isNew(p.id);
      const r = ratings.get(p.id);
      const level = bookingLevel(p);
      const tags = p.tags || [];
      let card = renderPlaceCard(p, { mediaUrl: (n, w) => `/media/${encodeURIComponent(p.id)}/${encodeURIComponent(n)}-${w}.webp`, isNew });
      if (tags.includes('drone-show')) card = card.replace(/(<div class="atr-card__top"><span class="chip">[^<]*<\/span>)/, '$1<span class="atr-card__book g-drone" title="Drone show">🛸 Drone show</span>');
      return {
        id: p.id, name: p.name, short: p.short_name || null, name_local: p.name_local || null, country: p.country, city: p.city, cityName: titleCase(p.city), area: p.area,
        category: p.category, kind: p.kind, tags, why: p.why,
        loc: typeof p.location?.lat === 'number' && typeof p.location?.lng === 'number' ? { lat: p.location.lat, lng: p.location.lng } : null,
        brl: p.cost?.brl ?? 0, costLabel: fmtBRL(p.cost?.brl), budgeted: countsAgainstBudget(p),
        booking: { level, lead_days: p.book_ahead?.lead_days, badge: bookBadgeText(p.book_ahead), links: bookingLinks(p) },
        drone: tags.includes('drone-show'), holidays: Object.keys(HOLIDAYS).filter((h) => tags.includes(HOLIDAYS[h].tag)),
        verdict: verdicts.place[p.id] || null, note: noteOf('place', p.id), rating: r?.rating ?? null, games: r?.games ?? 0, wins: r?.wins ?? 0,
        days: eventDays(p), whenLabel: whenLabel(p), isNew, thumb: thumbUrl(p, credits), facts: holidayFacts(p), card: withTz(card, p.country),
      };
    });
    const areas = d.areas.map((a) => ({
      id: a.id, name: a.name, country: a.country, cities: a.cities || [], best_for: a.best_for || [],
      verdict: verdicts.area[a.id] || null, note: noteOf('area', a.id), isNew: isNewArea(a.id),
      card: withTz(renderAreaCard(a, { mediaUrl: (n, w) => `/area-media/${encodeURIComponent(a.country)}/${encodeURIComponent(n)}-${w}.webp` }).replace('<article class="area-card"', `<article class="area-card${isNewArea(a.id) ? ' g-new' : ''}"`), a.country),
    }));
    return {
      session, fixtures: roots.fixtures || !!opts.root,
      countries, categories: Object.fromEntries(Object.entries(CATEGORIES).map(([k, v]) => [k, { label: v.label, icon: v.icon }])),
      interests: (d.cfg.traveler?.interests || []).filter((c) => CATEGORIES[c]),
      dominantShare: d.cfg.gaps?.dominant_category_share ?? 0.4,
      places, areas,
      duels: duels.map((x) => ({ winner: x.winner, loser: x.loser })),
      questions: fb.questions.length, warnings: fb.warnings.length,
      local: { days: st.days || {}, locks: st.locks || {} },
      route: routeSummary(d, fb, verdicts),
    };
  }

  // ---------- route (Route tab) ----------
  const located = (o) => typeof o?.lat === 'number' && typeof o?.lng === 'number';
  /** Home tab line: stops placed, must cities not placed yet. */
  function routeSummary(d, fb, verdicts) {
    const route = currentRoute({ cfg: d.cfg, areas: d.areas, events: fb.route });
    const inRoute = new Set(route.flatMap((r) => r.stops.map((s) => `${r.id}/${s.area}`)));
    const legs = new Set(route.map((r) => r.id));
    const unplaced = d.areas.filter((a) => legs.has(a.country) && verdicts.area[a.id] === 'must' && !inRoute.has(`${a.country}/${a.id}`)).length;
    return { stops: inRoute.size, unplaced, legs: route.length, edited: route.some((r) => r.source === 'game') };
  }

  /**
   * Everything the Route tab draws: legs in order with their stops (dates are worked out in the browser), every city
   * of each country that has coordinates (with the traveler's area verdict and how many of its places are must/maybe),
   * the long-haul flights and where the cached OSM base images sit in world pixels (game/lib/routemap.js).
   */
  function routeModel(d = load(), fb = readAll(feedbackDir)) {
    const verdicts = latestVerdicts(fb.swipes);
    const route = currentRoute({ cfg: d.cfg, areas: d.areas, events: fb.route });
    const placesIn = (country, cities) => {
      const xs = d.places.filter((p) => p.country === country && cities.includes(p.city));
      return { must: xs.filter((p) => verdicts.place[p.id] === 'must').length, maybe: xs.filter((p) => verdicts.place[p.id] === 'maybe').length, total: xs.length };
    };
    const countries = route.map((r) => {
      const cfgC = (d.cfg.countries || []).find((c) => c.id === r.id) || {};
      const cities = d.areas.filter((a) => a.country === r.id && located(a)).map((a) => ({
        area: a.id, name: a.name, lat: a.lat, lng: a.lng, hasPage: true, scope: a.scope || 'city',
        verdict: verdicts.area[a.id] || null, places: placesIn(r.id, a.cities?.length ? a.cities : [a.id]),
      }));
      // stops with no area file (config-only, e.g. Hong Kong) are cities too
      for (const s of [...(cfgC.route || []), ...r.stops]) {
        if (cities.some((c) => c.area === s.area) || !located(s)) continue;
        cities.push({ area: s.area, name: s.name || titleCase(s.area), lat: s.lat, lng: s.lng, hasPage: false, scope: 'city', verdict: null, places: placesIn(r.id, [s.area]) });
      }
      const byArea = new Map(cities.map((c) => [c.area, c]));
      const stops = r.stops.map((s) => ({ ...s, verdict: byArea.get(s.area)?.verdict ?? null, places: byArea.get(s.area)?.places ?? placesIn(r.id, [s.area]) }));
      return { ...r, notes: cfgC.notes || '', seed: (cfgC.route || []).map((s) => ({ area: s.area, nights: s.nights ?? null })), stops, cities };
    });
    const frame = (key, pts) => {
      const f = imageFrame(pts);
      return f ? { key, url: `/route-map/${key}.webp?v=${f.zoom}_${f.lat}_${f.lng}_${f.width}`, rect: f.rect, args: { lat: f.lat, lng: f.lng, zoom: f.zoom, width: f.width, height: f.height } } : null;
    };
    const frames = { overview: frame('overview', countries.flatMap((c) => c.cities)) };
    for (const c of countries) frames[c.id] = frame(c.id, c.cities);
    const home = String(d.cfg.traveler?.home || '');
    const homeCity = /são paulo|sao paulo/i.test(home) ? 'São Paulo' : home.replace(/\s*\(.*$/, '') || 'home';
    const first = countries[0], last = countries.at(-1);
    return {
      countries,
      longHaul: first ? {
        in: { from: homeCity, country: first.id, date: first.from },
        out: { to: homeCity, country: last.id, date: last.to, booked: !/not booked/i.test(last.notes) },
      } : null,
      frames: Object.fromEntries(Object.entries(frames).map(([k, f]) => [k, f && { url: f.url, rect: f.rect }])),
      _frames: frames,
      warnings: d.cfg.warnings || [],
      fixtures: roots.fixtures || !!opts.root,
    };
  }
  const publicRoute = (m) => { const { _frames, ...rest } = m; return rest; };

  // ---------- place page ----------
  async function placePage(id, embed) {
    const d = load();
    const p = d.byId.get(id);
    if (!p) return null;
    const cfgC = d.cfg.countries?.find((c) => c.id === p.country);
    let sm = null;
    const mapB = (p.blocks || []).find((b) => b?.type === 'map');
    if (mapB && mapB.embed !== false) {
      const m = await Promise.race([staticMap(p.location?.lat, p.location?.lng, { zoom: mapB.zoom || 16 }), new Promise((r) => setTimeout(() => r(null), 6000))]).catch(() => null);
      if (m) sm = { url: `/map/${encodeURIComponent(p.id)}.webp`, width: m.width, height: m.height };
    }
    const mediaUrl = (n, w) => `/media/${encodeURIComponent(p.id)}/${encodeURIComponent(n)}-${w}.webp`;
    let html = renderPlacePage(p, {
      assetBase: '/assets/', mediaUrl, homeUrl: '/', places: Object.fromEntries(d.places.map((x) => [x.id, x])),
      placeUrl: (o) => `/place/${encodeURIComponent(o.id)}${embed ? '?embed=1' : ''}`, placeMediaUrl: (o, n, w) => `/media/${encodeURIComponent(o.id)}/${encodeURIComponent(n)}-${w}.webp`,
      budgetPerDay: cfgC?.budget_brl_per_day, cheapMealBrl: cfgC?.cheap_meal_brl, staticMap: sm,
    });
    return gameChrome(html, p, 'place', embed);
  }

  // ---------- area page (the curator's full page for a city or region) ----------
  async function areaPage(id, embed) {
    const d = load();
    const a = d.areas.find((x) => x.id === id);
    if (!a) return null;
    let sm = null;
    if (typeof a.lat === 'number' && typeof a.lng === 'number') {
      const m = await Promise.race([staticMap(a.lat, a.lng, { zoom: a.scope === 'region' ? 7 : 10 }), new Promise((r) => setTimeout(() => r(null), 6000))]).catch(() => null);
      if (m) sm = { url: `/area-map/${encodeURIComponent(a.id)}.webp`, width: m.width, height: m.height };
    }
    let mustDo = [];
    try { mustDo = mustDoStatus(loadTaste(dataOpts), d.places, d.areas); } catch {}
    const html = renderAreaPage(a, {
      assetBase: '/assets/', homeUrl: '/#/areas', mediaUrl: (n, w) => `/area-media/${encodeURIComponent(a.country)}/${encodeURIComponent(n)}-${w}.webp`,
      places: d.places, mustDo, staticMap: sm, trip: d.cfg,
      placeUrl: (o) => `/place/${encodeURIComponent(o.id)}${embed ? '?embed=1' : ''}`, placeMediaUrl: (o, n, w) => `/media/${encodeURIComponent(o.id)}/${encodeURIComponent(n)}-${w}.webp`,
    });
    return gameChrome(html, a, 'area', embed);
  }

  /** Add the game's back link, Ask box and embed glue to a rendered place or area page. */
  function gameChrome(html, item, kind, embed) {
    const past = readAll(feedbackDir).questions.filter((q) => q.id === item.id).slice(-6).reverse();
    const askHtml = askOn ? askSection(item, past, kind) : '';
    html = html.replace(/<span class="lbl">All (places|areas)<\/span>/, '<span class="lbl">Back to the game</span>');
    html = html.includes('<p class="site-foot">') ? html.replace('<p class="site-foot">', () => `${askHtml}\n<p class="site-foot">`) : html.replace('</main>', () => `${askHtml}</main>`);
    html = html.replace('</head>', `<link rel="stylesheet" href="/game/place.css">\n</head>`);
    html = html.replace('</body>', `<script type="module" src="/game/place.js"></script></body>`);
    if (embed) html = html.replace('<html lang="en"', '<html lang="en" data-embed="1"');
    return html;
  }

  function askSection(p, past, kind = 'place') {
    const sugg = kind === 'area'
      ? ['Is it worth the days in winter?', 'How many days do I really need?', 'What does a day cost here?', 'How do I get there cheaply?']
      : ['Is it worth it in winter?', 'Do I need to book, and how?', 'How do I get there cheaply?', 'What should I combine it with nearby?'];
    return `<section class="block wrap g-ask" id="ask" data-block="ask" data-id="${esc(p.id)}" data-kind="${kind}"><div class="col">
  <p class="eyebrow">Ask about this ${kind}</p>
  <h2 class="h2">Got a question?</h2>
  <p class="g-ask__sub">Claude checks the page data and the web, then answers here. Answers never change the page, and every question helps the curator learn your taste.</p>
  <form class="g-ask__form" autocomplete="off">
    <textarea name="q" rows="2" maxlength="2000" placeholder="e.g. Is it open on Christmas Day?" required></textarea>
    <button type="submit" class="g-ask__go"><span>Ask</span><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg></button>
  </form>
  <div class="g-ask__chips">${sugg.map((s) => `<button type="button" class="chip">${esc(s)}</button>`).join('')}</div>
  <div class="g-ask__out" aria-live="polite"></div>
  ${past.length ? `<div class="g-ask__past"><h3>Asked before</h3><ul>${past.map((q) => `<li><b>${esc(q.question)}</b>${q.answer_summary ? `<span>${esc(q.answer_summary)}</span>` : ''}</li>`).join('')}</ul></div>` : ''}
</div></section>
<a class="g-ask__fab" href="#ask">Ask</a>`;
  }

  function shell(who) {
    return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Asia Trip</title>
<meta name="color-scheme" content="light dark">
<meta name="theme-color" content="#f8f4ec" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#12100d" media="(prefers-color-scheme: dark)">
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Crect width='64' height='64' rx='16' fill='%239b3d2a'/%3E%3Ctext x='32' y='44' font-size='34' text-anchor='middle' fill='white' font-family='Georgia'%3EA%3C/text%3E%3C/svg%3E">
${themeBoot}
<link rel="stylesheet" href="/assets/atr.css">
<link rel="stylesheet" href="/game/game.css">
<link rel="stylesheet" href="/game/trip.css">
</head>
<body class="g">
<header class="g-bar">
  <a class="g-brand" href="#/"><span class="g-brand__mark" aria-hidden="true">旅</span><span class="g-brand__txt">Asia Trip</span></a>
  <nav class="g-tabs" id="tabs" aria-label="Sections"></nav>
  <div class="g-bar__end">${who?.role === 'guest' ? '<span class="g-who" title="Signed in as a guest: you can look, not change">Guest<span class="g-who__more"> · read only</span></span>' : ''}${who ? '<a class="g-out" href="/logout">Sign out</a>' : ''}${themeToggle('g-theme')}</div>
</header>
<nav class="g-sub" id="subtabs" aria-label="Pages in this section" hidden></nav>
<main id="view" class="g-view" tabindex="-1"><div class="g-loading"><span></span><span></span><span></span></div></main>
<div id="sheet" class="g-sheet" hidden></div>
<dialog id="tsheet" class="t-sheet"></dialog>
<div id="toasts" class="g-toasts" aria-live="polite"></div>
<script type="module" src="/game/game.js"></script>
</body>
</html>`;
  }

  // ---------- http ----------
  const send = (res, code, body, type = 'application/json') => {
    res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store' });
    res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
  };
  const sendFile = (res, file, cache = 'no-cache') => {
    if (!file || !fs.existsSync(file) || !fs.statSync(file).isFile()) return send(res, 404, { error: 'not found' });
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': cache });
    fs.createReadStream(file).pipe(res);
  };
  const inside = (base, rel) => { const f = path.resolve(base, rel); return f.startsWith(path.resolve(base) + path.sep) ? f : null; };
  // JSON everywhere; the login form also posts as a plain HTML form (form: true), only on /login.
  const readBody = (req, { form = false } = {}) => new Promise((resolve, reject) => {
    let b = '';
    req.on('data', (c) => { b += c; if (b.length > 65536) { reject(Object.assign(new Error('body too large'), { status: 413 })); req.destroy(); } });
    req.on('end', () => {
      if (form && /application\/x-www-form-urlencoded/i.test(req.headers['content-type'] || '')) return resolve(Object.fromEntries(new URLSearchParams(b)));
      try { resolve(b ? JSON.parse(b) : {}); } catch { reject(Object.assign(new Error('invalid JSON'), { status: 400 })); }
    });
  });

  async function handle(req, res) {
    const url = new URL(req.url, 'http://local');
    const p = decodeURIComponent(url.pathname);
    if (p === '/healthz') return send(res, 200, { ok: true });
    let who = null;
    if (auth.enabled) {
      if (p === '/login' && req.method === 'POST') {
        const body = await readBody(req, { form: true });
        const r = auth.login(req, body.username, body.password);
        // The HTML form gets a page back (a redirect home, or the form again with the error); a script gets JSON.
        const isForm = !/json/i.test(req.headers['content-type'] || '');
        if (!r.ok) return isForm ? send(res, r.status, loginPage(themeBoot, { error: r.error, user: String(body.username || '').slice(0, 100) }), TYPES['.html']) : send(res, r.status, { error: r.error });
        res.setHeader('Set-Cookie', r.cookie);
        if (isForm) { res.writeHead(303, { Location: '/', 'Cache-Control': 'no-store' }); return res.end(); }
        return send(res, 200, { ok: true, role: r.role, user: r.user });
      }
      if (p === '/logout') { res.writeHead(303, { Location: '/login', 'Set-Cookie': auth.logoutCookie, 'Cache-Control': 'no-store' }); return res.end(); }
      if (!auth.ok(req)) {
        // The login page needs its stylesheet and fonts; everything else stays behind the gate.
        if (req.method === 'GET' && p.startsWith('/assets/')) return sendFile(res, inside(assetsDir, p.slice(8)), 'max-age=3600');
        if (req.method === 'GET' && p === '/login') return send(res, 200, loginPage(themeBoot), TYPES['.html']);
        if (req.method === 'GET' && !p.startsWith('/api/')) { res.writeHead(303, { Location: '/login', 'Cache-Control': 'no-store' }); return res.end(); }
        return send(res, 401, { error: 'Sign in first.' });
      }
      if (p === '/login') { res.writeHead(303, { Location: '/', 'Cache-Control': 'no-store' }); return res.end(); }
      who = auth.who(req);
      // The guest account is read-only: no state-changing request gets past here.
      if (who?.role === 'guest' && req.method !== 'GET') return send(res, 403, { error: GUEST_NO });
    }
    const guest = who?.role === 'guest';
    if (req.method === 'GET') {
      if (p === '/' || p === '/index.html') {
        // Sliding session: every page load starts the 400 days again, so nobody is signed out mid-trip.
        const fresh = auth.refreshCookie(req);
        if (fresh) res.setHeader('Set-Cookie', fresh);
        return send(res, 200, shell(who), TYPES['.html']);
      }
      if (p === '/api/state') return send(res, 200, { ...state({ write: !guest }), role: who?.role ?? null, user: who?.user ?? null });
      if (p === '/api/route') return send(res, 200, publicRoute(routeModel()));
      if (p === '/api/trip') return send(res, 200, { trip: readTrip(tripDir) });
      if (p.startsWith('/assets/')) return sendFile(res, inside(assetsDir, p.slice(8)), 'max-age=3600');
      if (p.startsWith('/game/')) return sendFile(res, inside(PUBLIC, p.slice(6)));
      if (p.startsWith('/lib/') && SHARED_LIB.has(p.slice(5))) return sendFile(res, path.join(LIB, p.slice(5)));
      let m;
      if ((m = p.match(/^\/media\/([^/]+)\/([^/]+\.webp)$/))) {
        const pl = load().byId.get(m[1]);
        return sendFile(res, pl ? inside(pl._meta.mediaDir, m[2]) : null, 'max-age=600');
      }
      if ((m = p.match(/^\/area-media\/([^/]+)\/([^/]+\.webp)$/))) return sendFile(res, inside(roots.areas, path.join(m[1], 'media', m[2])), 'max-age=600');
      if ((m = p.match(/^\/map\/([^/]+)\.webp$/))) {
        const pl = load().byId.get(m[1]);
        const mapB = (pl?.blocks || []).find((b) => b?.type === 'map');
        const sm = pl ? await staticMap(pl.location?.lat, pl.location?.lng, { zoom: mapB?.zoom || 16 }).catch(() => null) : null;
        return sendFile(res, sm?.file, 'max-age=86400');
      }
      if ((m = p.match(/^\/area-map\/([^/]+)\.webp$/))) {
        const ar = load().areas.find((x) => x.id === m[1]);
        const sm = ar && typeof ar.lat === 'number' && typeof ar.lng === 'number' ? await staticMap(ar.lat, ar.lng, { zoom: ar.scope === 'region' ? 7 : 10 }).catch(() => null) : null;
        return sendFile(res, sm?.file, 'max-age=86400');
      }
      if ((m = p.match(/^\/route-map\/([a-z0-9-]+)\.webp$/))) {
        const f = routeModel()._frames[m[1]];
        const sm = f ? await staticMap(f.args.lat, f.args.lng, { zoom: f.args.zoom, width: f.args.width, height: f.args.height }).catch(() => null) : null;
        return sendFile(res, sm?.file, 'max-age=86400');
      }
      if ((m = p.match(/^\/area\/([^/]+)\/?$/))) {
        const html = await areaPage(m[1], url.searchParams.get('embed') === '1');
        return html ? send(res, 200, html, TYPES['.html']) : send(res, 404, `<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="/assets/atr.css"><body><main class="wrap"><p class="empty">This area doesn't exist (any more). <a href="/">Back to the game</a></p></main>`, TYPES['.html']);
      }
      if ((m = p.match(/^\/place\/([^/]+)\/?$/))) {
        const html = await placePage(m[1], url.searchParams.get('embed') === '1');
        return html ? send(res, 200, html, TYPES['.html']) : send(res, 404, `<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="/assets/atr.css"><body><main class="wrap"><p class="empty">This place doesn't exist (any more). <a href="/">Back to the game</a></p></main>`, TYPES['.html']);
      }
      return send(res, 404, { error: 'not found' });
    }
    if (req.method === 'POST') {
      const body = await readBody(req);
      if (p === '/api/swipe') {
        const d = load();
        const round = body.round === 'area' ? 'area' : body.round === 'place' ? 'place' : null;
        const item = round === 'area' ? d.areas.find((a) => a.id === body.id) : d.byId.get(body.id);
        if (!round || !item) return send(res, 400, { error: `unknown ${round || 'round'} id "${body.id}"` });
        const ev = appendEvent(feedbackDir, 'swipes', { session, round, id: item.id, verdict: body.verdict, country: item.country, ms: Number.isInteger(body.ms) && body.ms >= 0 ? Math.min(body.ms, 3_600_000) : undefined });
        return send(res, 200, { ok: true, event: ev });
      }
      if (p === '/api/note') {
        const d = load();
        const round = body.round === 'area' ? 'area' : body.round === 'place' ? 'place' : null;
        const item = round === 'area' ? d.areas.find((a) => a.id === body.id) : round ? d.byId.get(body.id) : null;
        if (!round || !item) return send(res, 400, { error: `unknown ${round || 'round'} id "${body.id}"` });
        if (typeof body.text !== 'string') return send(res, 400, { error: 'text must be a string ("" clears the note)' });
        const text = body.text.replace(/\r\n?/g, '\n').trim();
        // One editable note per card: skip the write when nothing changed, so autosave never floods the log.
        const cur = latestNotes(readAll(feedbackDir).notes, { keepCleared: true }).get(`${round}:${item.id}`);
        if ((cur ? cur.text.trim() : '') === text) return send(res, 200, { ok: true, unchanged: true, note: text || null });
        const ev = appendEvent(feedbackDir, 'notes', { session, round, id: item.id, text, country: item.country });
        return send(res, 200, { ok: true, event: ev, note: text || null });
      }
      if (p === '/api/route') {
        // The whole ordered list of stops for one country, every save (latest line per country wins).
        const d = load();
        const cfgC = (d.cfg.countries || []).find((c) => c.id === body.country);
        if (!cfgC) return send(res, 400, { error: `unknown country "${body.country}" (not a leg in config/trip.yaml)` });
        const seed = new Map((cfgC.route || []).map((s) => [s.area, s]));
        const areaOf = new Map(d.areas.filter((a) => a.country === cfgC.id).map((a) => [a.id, a]));
        let stops;
        if (body.reset) stops = (cfgC.route || []).map(cleanStop);
        else {
          const errs = stopsErrors(body.stops);
          if (errs.length) return send(res, 400, { error: errs.slice(0, 3).join('; ') });
          const unknown = body.stops.find((s) => !areaOf.has(s.area) && !seed.has(s.area));
          if (unknown) return send(res, 400, { error: `"${unknown.area}" is not a city of ${cfgC.id} (no area file and not in the config route)` });
          // a stop with no area file keeps the config's name and coordinates
          stops = body.stops.map((s) => cleanStop({ area: s.area, nights: s.nights, ...(areaOf.has(s.area) ? {} : { name: seed.get(s.area).name, lat: seed.get(s.area).lat, lng: seed.get(s.area).lng }) }));
        }
        const fb = readAll(feedbackDir);
        const cur = currentRoute({ cfg: d.cfg, areas: d.areas, events: fb.route }).find((r) => r.id === cfgC.id);
        const same = cur.stops.length === stops.length && cur.stops.every((s, i) => s.area === stops[i].area && (s.nights ?? null) === (stops[i].nights ?? null));
        let ev = null;
        if (!same) ev = appendEvent(feedbackDir, 'route', { session, country: cfgC.id, stops });
        const m2 = routeModel(d, ev ? readAll(feedbackDir) : fb);
        return send(res, 200, { ok: true, unchanged: !ev, event: ev || undefined, country: m2.countries.find((c) => c.id === cfgC.id) });
      }
      if (p === '/api/duel') {
        const d = load();
        const w = d.byId.get(body.winner), l = d.byId.get(body.loser);
        if (!w || !l || w.id === l.id) return send(res, 400, { error: 'winner and loser must be two different existing places' });
        const fb = readAll(feedbackDir);
        const ratings = computeRatings(latestVerdicts(fb.swipes).place, sortedDuels(fb.duels));
        const rw = ratings.get(w.id)?.rating ?? START, rl = ratings.get(l.id)?.rating ?? START;
        const ev = appendEvent(feedbackDir, 'duels', { session, winner: w.id, loser: l.id, country: w.country === l.country ? w.country : undefined, elo: { winner: Math.round(rw * 10) / 10, loser: Math.round(rl * 10) / 10 } });
        return send(res, 200, { ok: true, event: ev });
      }
      if (p === '/api/local') {
        const st = readState(stateFile);
        const d = load();
        if (body.days && typeof body.days === 'object') {
          for (const [k, v] of Object.entries(body.days)) {
            if (!COUNTRIES[k]) continue;
            if (v === null) delete st.days[k];
            else if (Number.isInteger(v) && v >= 0 && v <= 90) st.days[k] = v;
          }
        }
        if (body.resetDays) st.days = {};
        if (body.locks && typeof body.locks === 'object') {
          for (const [h, id] of Object.entries(body.locks)) {
            if (!HOLIDAYS[h] || picksMany(h)) continue; // a many-pick holiday has no single lock
            if (id === null) delete st.locks[h];
            else if (d.byId.has(id)) st.locks[h] = id;
          }
        }
        writeState(stateFile, st);
        return send(res, 200, { ok: true, local: { days: st.days, locks: st.locks } });
      }
      if (p === '/api/trip') {
        // One write to one trip collection: { col, op: set | update | delete, id?, data? }.
        const { doc } = writeDoc(tripDir, body);
        return send(res, 200, { ok: true, doc });
      }
      if ((p === '/api/trip-ask' || p === '/api/ask') && !askOn) return send(res, 503, { error: ASK_OFF });
      if (p === '/api/trip-ask') return tripAskHandler(req, res, body);
      if (p === '/api/ask') return askHandler(req, res, body);
      return send(res, 404, { error: 'not found' });
    }
    send(res, 405, { error: 'method not allowed' });
  }

  async function askHandler(req, res, body) {
    const d = load();
    const place = body.kind === 'area' ? d.areas.find((a) => a.id === body.id) : d.byId.get(body.id);
    const question = String(body.question || '').trim().slice(0, 2000);
    if (!place || !question) return send(res, 400, { error: 'need an existing place id and a question' });
    if (asking >= 2) return send(res, 429, { error: 'Two questions are already running. Give them a moment.' });
    asking++;
    res.writeHead(200, { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-store', 'X-Accel-Buffering': 'no' });
    const emit = (o) => { if (!res.writableEnded) res.write(JSON.stringify(o) + '\n'); };
    const ac = new AbortController();
    res.on('close', () => { if (!res.writableFinished) ac.abort(); });
    emit({ type: 'status', text: 'Thinking…' });
    try {
      const kind = body.kind === 'area' ? 'area' : 'place';
      const fb = readAll(feedbackDir);
      const note = latestNotes(fb.notes).get(`${kind}:${place.id}`)?.text.trim() || null;
      const verdict = latestVerdicts(fb.swipes)[kind][place.id] || null;
      const prompt = buildPrompt({ place, question, cfg: d.cfg, note, verdict, kind });
      const r = await ask(prompt, emit, { signal: ac.signal });
      if (r.error === 'cancelled') return;
      const answer = r.text || '';
      const summary = r.error && !answer ? `(no answer: ${r.error})`.slice(0, 2000) : summarize(answer);
      try { appendEvent(feedbackDir, 'questions', { session, id: place.id, question, answer_summary: summary || undefined }); } catch (e) { emit({ type: 'status', text: `Could not log the question: ${e.message}` }); }
      if (r.error && !answer) emit({ type: 'error', message: r.error });
      else { const { body: b, tldr } = splitTldr(answer); emit({ type: 'done', html: md(b), tldr, summary, warning: r.error || undefined }); }
    } catch (e) {
      emit({ type: 'error', message: e.message });
    } finally {
      asking--;
      res.end();
    }
  }

  /** Ask about the whole trip (Today view): the itinerary, where you are and the place cards. Not logged for the curator. */
  async function tripAskHandler(req, res, body) {
    const question = String(body.question || '').trim().slice(0, 2000);
    if (!question) return send(res, 400, { error: 'need a question' });
    if (asking >= 2) return send(res, 429, { error: 'Two questions are already running. Give them a moment.' });
    asking++;
    res.writeHead(200, { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-store', 'X-Accel-Buffering': 'no' });
    const emit = (o) => { if (!res.writableEnded) res.write(JSON.stringify(o) + '\n'); };
    const ac = new AbortController();
    res.on('close', () => { if (!res.writableFinished) ac.abort(); });
    emit({ type: 'status', text: 'Thinking…' });
    try {
      const d = load();
      const trip = readTrip(tripDir);
      const verdicts = latestVerdicts(readAll(feedbackDir).swipes);
      const today = /^\d{4}-\d{2}-\d{2}$/.test(body.today || '') ? body.today : localKey();
      const now = today === localKey() ? localStamp() : `${today}T09:00`;
      const places = d.places.map((p) => ({ id: p.id, name: p.name, country: p.country, city: p.city, category: p.category, verdict: verdicts.place[p.id] || null, days: eventDays(p), when: whenLabel(p) }));
      const model = todayModel({ legs: trip.legs, places, tasks: trip.tasks, days: trip.days, visited: trip.visited, today, now });
      const prompt = buildTripPrompt({ question, today, model, trip, places, tripDir: path.relative(ROOT, tripDir) || 'trip', stayName });
      const r = await ask(prompt, emit, { signal: ac.signal });
      if (r.error === 'cancelled') return;
      const answer = r.text || '';
      if (r.error && !answer) emit({ type: 'error', message: r.error });
      else { const { body: b, tldr } = splitTldr(answer); emit({ type: 'done', html: md(b), tldr, warning: r.error || undefined }); }
    } catch (e) {
      emit({ type: 'error', message: e.message });
    } finally {
      asking--;
      res.end();
    }
  }

  const server = http.createServer((req, res) => {
    handle(req, res).catch((e) => {
      if (!res.headersSent) send(res, e.status || 500, { error: e.message });
      else res.end();
      if (!e.status) console.error(e);
    });
  });
  return { server, state, feedbackDir, tripDir, stateFile, session, placePage, areaPage };
}

/** Start listening. Tries the preferred port, then any free port. Resolves { url, server }. */
export function startServer(opts = {}) {
  const app = createApp(opts);
  const host = opts.host || '127.0.0.1';
  const want = opts.port !== undefined ? Number(opts.port) : 4400;
  return new Promise((resolve, reject) => {
    const tryListen = (port, fallback) => {
      app.server.once('error', (e) => { if (e.code === 'EADDRINUSE' && fallback) tryListen(0, false); else reject(e); });
      app.server.listen(port, host, () => {
        const { port: actual } = app.server.address();
        resolve({ ...app, url: `http://localhost:${actual}/`, port: actual });
      });
    };
    tryListen(want, opts.port === undefined);
  });
}

export async function main(argv = process.argv.slice(2)) {
  const { values: o } = parseArgs({ args: argv, options: { port: { type: 'string' }, host: { type: 'string' }, fixtures: { type: 'boolean' }, root: { type: 'string' }, feedback: { type: 'string' }, trip: { type: 'string' }, open: { type: 'boolean' }, help: { type: 'boolean', short: 'h' } }, allowPositionals: true, strict: false });
  if (o.help) {
    console.log(`atr game — the trip site: today, itinerary, places, the ranking game, money and prep

usage: ./atr game [--port 4400] [--host 127.0.0.1] [--open] [--fixtures] [--root <data dir>] [--feedback <dir>] [--trip <dir>]

  --port       preferred port (default 4400, falls back to any free port)
  --open       open the browser
  --fixtures   play with platform/test/fixtures (test data)
  --root       another data root with places/ areas/ feedback/ (e.g. game/test/fixtures)
  --feedback   write feedback JSONL somewhere else (default <data root>/feedback)
  --trip       read and write the trip planner data somewhere else (default <data root>/trip)
  --host       address to listen on (default 127.0.0.1; 0.0.0.0 lets a phone on the same Wi-Fi open it)

environment (the hosted site, see docs/DEPLOY.md):
  ATR_OWNER_PASSWORD  when set, every page and API call needs a login; this is the owner's password (full access)
  ATR_OWNER_USER      the owner's username (default eliton)
  ATR_GUEST_PASSWORD  optional: turns on a read-only guest account with this password
  ATR_GUEST_USER      the guest's username (default guest)
  ATR_ASK=off         turn the Ask boxes off (they run the claude CLI, which the server does not have)

The game re-reads places/ and areas/ on every request: new curator content appears on refresh, marked "New".`);
    return;
  }
  if (o.fixtures) process.env.ATR_FIXTURES = '1';
  const r = await startServer({ port: o.port, host: o.host, root: o.root, feedbackDir: o.feedback, tripDir: o.trip });
  const st = r.state();
  console.log(`\n  Asia Trip Ranker — game is running\n\n  ➜  ${r.url}\n\n  ${st.places.length} place(s), ${st.areas.length} area card(s)${st.fixtures ? ' · test data' : ''} · feedback → ${path.relative(process.cwd(), r.feedbackDir) || '.'}\n  Ctrl+C to stop.\n`);
  if (o.open) {
    const { spawn } = await import('node:child_process');
    spawn(process.platform === 'darwin' ? 'open' : 'xdg-open', [r.url], { stdio: 'ignore', detached: true }).unref();
  }
  return r;
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) main();
