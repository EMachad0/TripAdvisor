// Route tab: map projection maths, label layout, leg dates, config route validation, route persistence
// (feedback/route.jsonl) and the /api/route endpoints. Temp dirs only; no network (no map images are requested).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { project, unproject, boundsOf, imageFrame, fitView, lerpView, arc, relaxPins, layoutLabels, overlaps, legPlan, addDays, nightsBetween, WORLD_Z, TILE } from '../lib/routemap.js';
import { project as platformProject } from '../../platform/lib/staticmap.js';
import { normalizeConfigRoutes, currentRoute, latestRoutes, formatRoute, stopsErrors } from '../../platform/lib/route.js';
import { loadTripConfig, readFeedback, tasteSummary, formatTaste, newFeedback, formatNewFeedback } from '../../platform/lib/index.js';
import { appendEvent } from '../lib/store.js';
import { startServer } from '../server.js';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'atr-route-'));
const close = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;

// ---------------- projection ----------------
test('routemap: project/unproject round-trip and match the platform tile maths', () => {
  for (const [lat, lng] of [[31.2325, 121.4692], [13.7525, 100.4942], [35.0116, 135.7681], [22.2819, 114.1582], [-23.55, -46.63]]) {
    const p = project(lat, lng);
    const back = unproject(p.x, p.y);
    assert.ok(close(back.lat, lat, 1e-9) && close(back.lng, lng, 1e-9), `${lat},${lng}`);
    const q = platformProject(lat, lng, WORLD_Z);
    assert.ok(close(p.x, q.x, 1e-6) && close(p.y, q.y, 1e-6), 'same pixels as platform/lib/staticmap.js');
  }
  // one zoom level = twice the pixels; north is up (smaller y), east is right
  const a = project(30, 120, 5), b = project(30, 120, 6);
  assert.ok(close(b.x, a.x * 2) && close(b.y, a.y * 2));
  assert.ok(project(40, 120).y < project(30, 120).y && project(30, 130).x > project(30, 120).x);
  assert.equal(project(0, -180, 0).x, 0);
  assert.equal(project(0, 180, 0).x, TILE);
});

test('routemap: imageFrame places the stitched image exactly where the overlay expects it', () => {
  const pts = [{ lat: 31.2325, lng: 121.4692 }, { lat: 39.9067, lng: 116.3975 }, { lat: 29.117, lng: 110.479 }, { lat: 45.767, lng: 126.6107 }];
  const f = imageFrame(pts);
  assert.ok(f.width <= 2048 && f.width === f.height, 'square, bounded');
  const tz = f.zoom + 1, k = 2 ** (tz - WORLD_Z);
  // staticMap centres the image on (lat, lng) at tile zoom tz: a point's pixel in the image is world(tz) - (centre - size/2)
  const c = platformProject(f.lat, f.lng, tz);
  for (const p of pts) {
    const inImg = platformProject(p.lat, p.lng, tz);
    const px = inImg.x - (c.x - f.width / 2), py = inImg.y - (c.y - f.height / 2);
    const w = project(p.lat, p.lng);
    assert.ok(close(px, (w.x - f.rect.x) * k, 1e-6) && close(py, (w.y - f.rect.y) * k, 1e-6), 'overlay and image agree');
    assert.ok(px > 0 && px < f.width && py > 0 && py < f.height, 'every point is on the image');
  }
  // the highest zoom that fits: one more level would not
  const b = boundsOf(pts);
  assert.ok(Math.max(b.w, b.h) * 2 ** (tz + 1 - WORLD_Z) * 1.32 > 2048);
  // a single city still gets a sensible frame, and no points → null
  const one = imageFrame([{ lat: 22.2819, lng: 114.1582 }]);
  assert.ok(one && one.zoom + 1 <= 11 && one.width >= 900);
  assert.equal(imageFrame([]), null);
});

test('routemap: fitView keeps the container aspect and contains the rect; lerpView hits both ends', () => {
  const r = { x: 1000, y: 2000, w: 400, h: 100 };
  for (const [cw, ch] of [[358, 440], [720, 600], [1000, 300]]) {
    const v = fitView(r, cw, ch, { pad: 0.1 });
    assert.ok(close(v.w / v.h, cw / ch, 1e-9));
    assert.ok(v.x <= r.x && v.y <= r.y && v.x + v.w >= r.x + r.w && v.y + v.h >= r.y + r.h);
    assert.ok(close(v.x + v.w / 2, r.x + r.w / 2) && close(v.y + v.h / 2, r.y + r.h / 2), 'centred');
  }
  const a = { x: 0, y: 0, w: 100, h: 80 }, b = { x: 500, y: 300, w: 10, h: 8 };
  assert.deepEqual(lerpView(a, b, 0), a);
  const end = lerpView(a, b, 1);
  for (const k of ['x', 'y', 'w', 'h']) assert.ok(close(end[k], b[k], 1e-9));
});

test('routemap: arcs bend to one side and pass through the midpoint they report', () => {
  const a = arc({ x: 0, y: 0 }, { x: 100, y: 0 }, 0.2);
  assert.match(a.d, /^M0 0Q50 -20 100 0$/);
  assert.deepEqual(a.mid, { x: 50, y: -10 });
  assert.equal(a.angle, 0);
});

test('routemap: relaxPins separates overlapping pins (identical points too) and leaves the rest alone', () => {
  const nodes = [{ p: { x: 100, y: 100 }, r: 10 }, { p: { x: 104, y: 103 }, r: 10 }, { p: { x: 300, y: 300 }, r: 10 }, { p: { x: 50, y: 50 }, r: 5 }, { p: { x: 50, y: 50 }, r: 5 }];
  relaxPins(nodes, { gap: 3 });
  const d = (i, j) => Math.hypot(nodes[i].p.x - nodes[j].p.x, nodes[i].p.y - nodes[j].p.y);
  assert.ok(d(0, 1) >= 23 - 0.05, `Kyoto/Osaka-like pair apart: ${d(0, 1)}`);
  assert.ok(d(3, 4) >= 13 - 0.05, 'identical points apart');
  assert.deepEqual(nodes[2].p, { x: 300, y: 300 }, 'a pin with room does not move');
  // moved symmetrically around the old midpoint
  assert.ok(close((nodes[0].p.x + nodes[1].p.x) / 2, 102, 1e-6));
});

test('routemap: layoutLabels never overlaps placed labels, avoids pins, hides what does not fit, forces must labels', () => {
  const bounds = { x: 0, y: 0, w: 300, h: 200 };
  // three cities in a tight cluster (eastern China / Kansai) plus a far one
  const items = [
    { id: 'shanghai', x: 150, y: 100, w: 70, h: 20, r: 12, priority: 1, must: true },
    { id: 'huangshan', x: 140, y: 104, w: 120, h: 20, r: 9, priority: 3 },
    { id: 'hangzhou', x: 146, y: 112, w: 80, h: 20, r: 9, priority: 5 },
    { id: 'far', x: 30, y: 30, w: 40, h: 16, r: 6, priority: 5 },
  ];
  const obstacles = items.map((it) => ({ id: it.id, x: it.x - 8, y: it.y - 8, w: 16, h: 16 }));
  const out = layoutLabels(items, { obstacles, bounds });
  const shown = [...out.entries()].filter(([, v]) => !v.hidden);
  for (let i = 0; i < shown.length; i++) for (let j = i + 1; j < shown.length; j++) assert.ok(!overlaps(shown[i][1].box, shown[j][1].box), `${shown[i][0]} vs ${shown[j][0]}`);
  for (const [id, v] of shown) {
    assert.ok(v.box.x >= 0 && v.box.y >= 0 && v.box.x + v.box.w <= 300 && v.box.y + v.box.h <= 200, `${id} inside the map`);
    for (const o of obstacles) if (o.id !== id && !v.overlap) assert.ok(!overlaps(v.box, o), `${id} covers pin ${o.id}`);
  }
  assert.equal(out.get('shanghai').hidden, false);
  assert.equal(out.get('far').hidden, false);
  // no room at all: an optional label hides, a must label is still placed (least overlap)
  const tiny = { x: 0, y: 0, w: 60, h: 30 };
  const crowded = layoutLabels([{ id: 'a', x: 30, y: 15, w: 50, h: 20, r: 4, priority: 1, must: true }, { id: 'b', x: 31, y: 15, w: 50, h: 20, r: 4, priority: 2 }], { bounds: tiny, margin: 0 });
  assert.equal(crowded.get('b').hidden, true);
  assert.equal(crowded.get('a').hidden, false);
  // a fixed label (the long-haul flights) is kept where it is and others avoid it
  const fixed = layoutLabels([{ id: 'lh', fixed: { x: 0, y: 0, w: 300, h: 100 } }, { id: 'c', x: 150, y: 120, w: 40, h: 16, r: 5 }], { bounds });
  assert.deepEqual(fixed.get('lh').box, { x: 0, y: 0, w: 300, h: 100 });
  assert.ok(!overlaps(fixed.get('c').box, fixed.get('lh').box));
});

test('routemap: legPlan dates, nights used vs available and over/under', () => {
  assert.equal(nightsBetween('2026-12-06', '2027-01-02'), 27);
  assert.equal(addDays('2026-12-30', 4), '2027-01-03');
  const from = '2026-12-06';
  const empty = legPlan({ from, nights: 27, stops: [{ area: 'shanghai' }] });
  assert.deepEqual([empty.status, empty.planned, empty.left], ['empty', 0, 27]);
  assert.deepEqual([empty.stops[0].start, empty.stops[0].end], [from, null], 'the first stop starts on the leg start');
  const under = legPlan({ from, nights: 27, stops: [{ area: 'shanghai', nights: 6 }, { area: 'beijing', nights: 5 }, { area: 'xian' }, { area: 'chongqing', nights: 4 }] });
  assert.equal(under.status, 'under');
  assert.equal(under.planned, 15);
  assert.deepEqual(under.stops.map((s) => [s.start, s.end]), [['2026-12-06', '2026-12-12'], ['2026-12-12', '2026-12-17'], ['2026-12-17', null], [null, null]], 'dates stop after a stop without nights');
  assert.equal(legPlan({ from, nights: 8, stops: [{ area: 'bangkok', nights: 8 }] }).status, 'ok');
  const over = legPlan({ from: '2027-02-04', nights: 5, stops: [{ area: 'hong-kong', nights: 7 }] });
  assert.deepEqual([over.status, over.left], ['over', -2]);
});

// ---------------- config + feedback ----------------
test('config: route is optional, validated, normalised; problems are warnings, never thrown', () => {
  const cfg = { countries: [
    { id: 'china', route: ['shanghai', { area: 'beijing', nights: 5 }, { area: 'beijing' }, { area: 'xian', nights: 0 }, { area: 'Bad Id' }, { area: 'harbin', lat: 45.7 }] },
    { id: 'thailand' },
    { id: 'korea', route: 'seoul' },
    { id: 'hong-kong', route: [{ area: 'hong-kong', name: 'Hong Kong', lat: 22.28, lng: 114.16, nights: 5 }] },
  ] };
  const w = normalizeConfigRoutes(cfg);
  assert.deepEqual(cfg.countries[0].route, [{ area: 'shanghai' }, { area: 'beijing', nights: 5 }]);
  assert.deepEqual(cfg.countries[1].route, [], 'absent is fine');
  assert.deepEqual(cfg.countries[2].route, []);
  assert.deepEqual(cfg.countries[3].route, [{ area: 'hong-kong', nights: 5, name: 'Hong Kong', lat: 22.28, lng: 114.16 }]);
  assert.equal(w.length, 5, w.join('\n'));
  assert.ok(w.some((x) => /route\[2\].*already on this route/.test(x)));
  assert.ok(w.some((x) => /route\[3\].*nights.*minimum 1/.test(x)));
  assert.ok(w.some((x) => /route\[4\].*area/.test(x)));
  assert.ok(w.some((x) => /route\[5\].*lat and lng go together/.test(x)));
  assert.ok(w.some((x) => /\(korea\)\.route: expected a list/.test(x)));
  // loadTripConfig: warnings ride along, non-enumerable (JSON dumps of the config don't change)
  const dir = tmp();
  const file = path.join(dir, 'trip.yaml');
  fs.writeFileSync(file, 'countries:\n  - id: china\n    from: 2026-12-06\n    to: 2027-01-02\n    route:\n      - { area: shanghai, nights: two }\n  - id: japan\n    from: 2027-01-20\n    to: 2027-02-04\n');
  const c = loadTripConfig({ configFile: file });
  assert.deepEqual(c.countries.map((x) => x.route), [[], []]);
  assert.equal(c.warnings.length, 1);
  assert.match(c.warnings[0], /nights/);
  assert.ok(!Object.keys(c).includes('warnings'));
  // the real config is valid and seeds the route the traveler described
  const real = loadTripConfig();
  assert.deepEqual(real.warnings, []);
  // the traveler keeps editing the route, so check its shape and not a list that goes stale
  assert.deepEqual(real.countries.map((x) => x.id), ['china', 'thailand', 'singapore', 'korea', 'japan', 'hong-kong']);
  for (const c2 of real.countries) assert.ok(c2.route.length >= 1 && c2.route.every((s) => typeof s.area === 'string'), `${c2.id} has a route`);
  assert.ok(typeof real.countries.at(-1).route[0].lat === 'number', 'Hong Kong has no area file: it carries coordinates');
});

test('route feedback: appendEvent validates, latest line per country wins, the config seeds the rest', () => {
  const dir = tmp();
  const t = (m) => ({ now: new Date(Date.UTC(2026, 10, 12, 10, m)) });
  appendEvent(dir, 'route', { session: 's', country: 'china', stops: [{ area: 'shanghai', nights: 4 }] }, t(1));
  appendEvent(dir, 'route', { session: 's', country: 'china', stops: [{ area: 'shanghai', nights: 6 }, { area: 'beijing', nights: 5 }] }, t(2));
  appendEvent(dir, 'route', { country: 'hong-kong', stops: [{ area: 'hong-kong', nights: 5 }] }, t(3));
  assert.throws(() => appendEvent(dir, 'route', { country: 'china', stops: [{ area: 'x', nights: 0 }] }), /nights/);
  assert.throws(() => appendEvent(dir, 'route', { country: 'mars', stops: [] }), /country/);
  assert.throws(() => appendEvent(dir, 'route', { country: 'china', stops: [{ area: 'x', color: 'red' }] }), /unknown field/);
  const fb = readFeedback(dir);
  assert.equal(fb.warnings.length, 0);
  assert.equal(fb.route.length, 3);
  assert.equal(latestRoutes(fb.route).get('china').stops.length, 2);
  assert.deepEqual(stopsErrors([{ area: 'a' }, { area: 'a' }]), ['stops[1]: a is on the route twice']);
  const cfg = { countries: [
    { id: 'china', from: '2026-12-06', to: '2027-01-02', route: [{ area: 'shanghai' }] },
    { id: 'thailand', from: '2027-01-02', to: '2027-01-10', route: [{ area: 'bangkok' }] },
    { id: 'hong-kong', from: '2027-02-04', to: '2027-02-09', route: [{ area: 'hong-kong', name: 'Hong Kong', lat: 22.28, lng: 114.16 }] },
  ] };
  const areas = [{ id: 'shanghai', country: 'china', name: 'Shanghai', lat: 31.2, lng: 121.5 }, { id: 'beijing', country: 'china', name: 'Beijing', lat: 39.9, lng: 116.4 }];
  const r = currentRoute({ cfg, areas, events: fb.route });
  assert.deepEqual(r.map((x) => [x.id, x.source, x.stops.map((s) => `${s.area}:${s.nights}`).join(',')]), [['china', 'game', 'shanghai:6,beijing:5'], ['thailand', 'config', 'bangkok:null'], ['hong-kong', 'game', 'hong-kong:5']]);
  assert.deepEqual([r[0].nights, r[0].planned, r[0].status], [27, 11, 'under']);
  const hk = r[2].stops[0];
  assert.deepEqual([hk.name, hk.lat, hk.lng, hk.hasPage, hk.located], ['Hong Kong', 22.28, 114.16, false, true], 'the config keeps a no-area-file stop on the map');
  assert.equal(r[1].stops[0].located, false, 'an area id with no file and no coordinates is listed but not mappable');
  assert.equal(r[2].status, 'ok');
  // ./atr feedback shows the current route; --new shows the legs that changed
  const s = tasteSummary(fb, { places: [], areas, cfg });
  const txt = formatTaste(s);
  assert.match(txt, /## Route/);
  assert.match(txt, /1\. China.*Shanghai 6n → Beijing 5n/);
  assert.match(txt, /11 of 27 nights placed/);
  assert.match(txt, /2\. Thailand.*from config\/trip\.yaml/s);
  const n = newFeedback(fb, { since: '2026-11-12T10:02:30Z', cfg, areas });
  assert.deepEqual(n.routeChanged, ['hong-kong']);
  assert.equal(n.counts.route, 1);
  assert.match(formatNewFeedback(n), /## Route changed[\s\S]*Hong Kong/);
  assert.equal(newFeedback(fb, { since: '2026-11-12T11:00:00Z', cfg, areas }).counts.route, undefined, 'no route key when nothing changed');
  assert.match(formatRoute(r), /3\. Hong Kong.*Hong Kong 5n/);
});

// ---------------- server ----------------
async function withRouteServer(fn) {
  const root = tmp();
  const area = (country, id, name, lat, lng) => { fs.mkdirSync(path.join(root, 'areas', country), { recursive: true }); fs.writeFileSync(path.join(root, 'areas', country, `${id}.yaml`), `id: ${id}\ncountry: ${country}\nname: ${name}\nscope: city\ncities: [${id}]\n${lat !== undefined ? `lat: ${lat}\nlng: ${lng}\n` : ''}`); };
  area('china', 'shanghai', 'Shanghai', 31.2325, 121.4692);
  area('china', 'beijing', 'Beijing', 39.9067, 116.3975);
  area('china', 'xian', "Xi'an", 34.26111, 108.94222);
  area('china', 'dali', 'Dali', 25.6939, 100.1611);
  area('japan', 'tokyo', 'Tokyo', 35.6897, 139.6922);
  area('japan', 'kyoto', 'Kyoto', 35.0116, 135.7681);
  fs.mkdirSync(path.join(root, 'places'), { recursive: true });
  const configFile = path.join(root, 'trip.yaml');
  fs.writeFileSync(configFile, `traveler:\n  home: Brazil (Joinville / São Paulo)\ncountries:\n  - id: china\n    from: 2026-12-06\n    to: 2027-01-02\n    route: [shanghai]\n  - id: japan\n    from: 2027-01-20\n    to: 2027-02-04\n    route:\n      - { area: tokyo }\n      - { area: kyoto }\n  - id: hong-kong\n    from: 2027-02-04\n    to: 2027-02-09\n    notes: Home flight not booked.\n    route:\n      - { area: hong-kong, name: Hong Kong, lat: 22.2819, lng: 114.1582 }\n`);
  const fbDir = path.join(root, 'feedback');
  fs.mkdirSync(fbDir);
  appendEvent(fbDir, 'swipes', { session: 's', round: 'area', id: 'beijing', verdict: 'must', country: 'china' });
  appendEvent(fbDir, 'swipes', { session: 's', round: 'area', id: 'xian', verdict: 'maybe', country: 'china' });
  appendEvent(fbDir, 'swipes', { session: 's', round: 'area', id: 'dali', verdict: 'skip', country: 'china' });
  const srv = await startServer({ port: 0, root, configFile, feedbackDir: fbDir, assetsDir: path.join(root, 'assets'), ask: async () => ({ text: '', error: null }) });
  try { await fn({ base: srv.url.replace(/\/$/, ''), fbDir }); } finally { srv.server.close(); }
}
const post = (url, body) => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

test('server: GET /api/route gives legs, stops, cities with verdicts, long-haul flights and map frames', async () => {
  await withRouteServer(async ({ base }) => {
    const r = await (await fetch(`${base}/api/route`)).json();
    assert.deepEqual(r.countries.map((c) => [c.n, c.id, c.nights, c.source]), [[1, 'china', 27, 'config'], [2, 'japan', 15, 'config'], [3, 'hong-kong', 5, 'config']]);
    const china = r.countries[0];
    assert.deepEqual(china.stops.map((s) => s.area), ['shanghai']);
    assert.deepEqual(Object.fromEntries(china.cities.map((c) => [c.area, c.verdict])), { beijing: 'must', dali: 'skip', shanghai: null, xian: 'maybe' });
    assert.deepEqual(china.seed, [{ area: 'shanghai', nights: null }]);
    const hk = r.countries[2];
    assert.deepEqual(hk.cities.map((c) => [c.area, c.hasPage, c.lat]), [['hong-kong', false, 22.2819]], 'a config-only stop is a city on the map');
    assert.deepEqual(r.longHaul, { in: { from: 'São Paulo', country: 'china', date: '2026-12-06' }, out: { to: 'São Paulo', country: 'hong-kong', date: '2027-02-09', booked: false } });
    for (const k of ['overview', 'china', 'japan', 'hong-kong']) {
      assert.match(r.frames[k].url, new RegExp(`^/route-map/${k}\\.webp\\?v=`));
      assert.ok(r.frames[k].rect.w > 0 && r.frames[k].rect.w === r.frames[k].rect.h);
    }
    assert.equal(r._frames, undefined, 'staticMap arguments stay on the server');
    assert.deepEqual(r.warnings, []);
    const st = await (await fetch(`${base}/api/state`)).json();
    assert.deepEqual(st.route, { stops: 4, unplaced: 1, legs: 3, edited: false });
    assert.equal((await fetch(`${base}/lib/routemap.js`)).status, 200, 'the browser loads the same maths');
    assert.equal((await fetch(`${base}/route-map/nope.webp`)).status, 404);
  });
});

test('server: POST /api/route appends the whole list per country, dedupes, validates, resets', async () => {
  await withRouteServer(async ({ base, fbDir }) => {
    const ok = await (await post(`${base}/api/route`, { country: 'china', stops: [{ area: 'shanghai', nights: 6 }, { area: 'beijing', nights: 5 }, { area: 'xian' }] })).json();
    assert.equal(ok.ok, true);
    assert.equal(ok.unchanged, false);
    assert.deepEqual(ok.event.stops, [{ area: 'shanghai', nights: 6 }, { area: 'beijing', nights: 5 }, { area: 'xian' }]);
    assert.equal(ok.country.source, 'game');
    assert.equal(ok.country.planned, 11);
    // same list again: nothing written (autosave can't flood the log)
    assert.equal((await (await post(`${base}/api/route`, { country: 'china', stops: [{ area: 'shanghai', nights: 6 }, { area: 'beijing', nights: 5 }, { area: 'xian' }] })).json()).unchanged, true);
    // a config-only stop keeps its name and coordinates in the log, so curators can read it without the config
    const hk = await (await post(`${base}/api/route`, { country: 'hong-kong', stops: [{ area: 'hong-kong', nights: 5 }] })).json();
    assert.deepEqual(hk.event.stops, [{ area: 'hong-kong', nights: 5, name: 'Hong Kong', lat: 22.2819, lng: 114.1582 }]);
    // bad input
    const bad = async (body, re) => { const r = await post(`${base}/api/route`, body); assert.equal(r.status, 400, JSON.stringify(body)); assert.match((await r.json()).error, re); };
    await bad({ country: 'thailand', stops: [] }, /not a leg/);
    await bad({ country: 'china', stops: [{ area: 'shanghai', nights: 0 }] }, /nights/);
    await bad({ country: 'china', stops: [{ area: 'shanghai', nights: 2.5 }] }, /nights/);
    await bad({ country: 'china', stops: [{ area: 'tokyo' }] }, /not a city of china/);
    await bad({ country: 'china', stops: [{ area: 'shanghai' }, { area: 'shanghai' }] }, /twice/);
    await bad({ country: 'china', stops: 'shanghai' }, /list/);
    await bad({ country: 'china', stops: [{ area: 'shanghai', label: 'x' }] }, /unknown field/);
    // reset goes back to the config seed (one more line; latest wins)
    const reset = await (await post(`${base}/api/route`, { country: 'china', reset: true })).json();
    assert.deepEqual(reset.event.stops, [{ area: 'shanghai' }]);
    const fb = readFeedback(fbDir);
    assert.equal(fb.warnings.length, 0);
    assert.deepEqual(fb.route.map((e) => e.country), ['china', 'hong-kong', 'china']);
    const r = await (await fetch(`${base}/api/route`)).json();
    assert.deepEqual(r.countries[0].stops.map((s) => [s.area, s.nights]), [['shanghai', null]]);
    assert.equal(r.countries[0].source, 'game');
    assert.deepEqual(r.countries[2].stops.map((s) => [s.area, s.nights, s.located]), [['hong-kong', 5, true]]);
    // the config file is never touched
    assert.match(fs.readFileSync(path.join(path.dirname(fbDir), 'trip.yaml'), 'utf8'), /route: \[shanghai\]/);
  });
});
