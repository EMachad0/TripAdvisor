// Route map maths, shared by the game server, the browser (served at /lib/routemap.js) and the tests.
// Pure functions only (no Node or DOM imports).
//
// Coordinates: everything on the map lives in Web-Mercator "world pixels" at WORLD_Z (the OSM tile scheme,
// 256 px tiles). Base images (cached OSM tiles stitched by platform/lib/staticmap.js) are placed in the same
// space, so the SVG overlay and the images line up at any zoom: zooming is only a change of viewBox.

export const TILE = 256;
export const WORLD_Z = 12;

/** lat/lng → world pixels at zoom z (same formula as platform/lib/staticmap.js). */
export function project(lat, lng, z = WORLD_Z) {
  const n = 2 ** z * TILE;
  const s = Math.min(Math.max(Math.sin((lat * Math.PI) / 180), -0.9999), 0.9999);
  return { x: ((lng + 180) / 360) * n, y: (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * n };
}

/** World pixels at zoom z → lat/lng. */
export function unproject(x, y, z = WORLD_Z) {
  const n = 2 ** z * TILE;
  return { lng: (x / n) * 360 - 180, lat: (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / n))) * 180) / Math.PI };
}

/** Bounding box of lat/lng points in world pixels: { x, y, w, h } (w/h ≥ min). */
export function boundsOf(points, { z = WORLD_Z, min = 0 } = {}) {
  const ps = points.filter((p) => typeof p?.lat === 'number' && typeof p?.lng === 'number').map((p) => project(p.lat, p.lng, z));
  if (!ps.length) return null;
  let x0 = Math.min(...ps.map((p) => p.x)), x1 = Math.max(...ps.map((p) => p.x));
  let y0 = Math.min(...ps.map((p) => p.y)), y1 = Math.max(...ps.map((p) => p.y));
  if (x1 - x0 < min) { const c = (x0 + x1) / 2; x0 = c - min / 2; x1 = c + min / 2; }
  if (y1 - y0 < min) { const c = (y0 + y1) / 2; y0 = c - min / 2; y1 = c + min / 2; }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/**
 * The base image for a set of points: a square around their bounding box (square, so it still covers the view
 * when the map is wide on a desktop or tall on a phone), at the highest tile zoom that keeps it ≤ maxSide px.
 * Returns { zoom, lat, lng, width, height, rect } where zoom/lat/lng/width/height are staticMap() arguments
 * (staticMap renders tiles at zoom + 1) and rect is where the image sits in world pixels at WORLD_Z.
 */
export function imageFrame(points, { pad = 0.16, minSide = 900, maxSide = 2048, minSpanDeg = 0.4, maxTileZoom = 11, minTileZoom = 3 } = {}) {
  const minWorld = (minSpanDeg / 360) * 2 ** WORLD_Z * TILE;
  const b = boundsOf(points, { min: minWorld });
  if (!b) return null;
  let tz = minTileZoom;
  for (let z = maxTileZoom; z >= minTileZoom; z--) {
    const k = 2 ** (z - WORLD_Z);
    if (Math.max(b.w, b.h) * k * (1 + 2 * pad) <= maxSide) { tz = z; break; }
  }
  const k = 2 ** (tz - WORLD_Z);
  const side = Math.round(Math.min(maxSide, Math.max(minSide, Math.max(b.w, b.h) * k * (1 + 2 * pad))));
  const c = unproject((b.x + b.w / 2) * k, (b.y + b.h / 2) * k, tz);
  // Round the centre like staticMap's cache key does, so the overlay sits exactly where the image puts things.
  const lat = Number(c.lat.toFixed(5)), lng = Number(c.lng.toFixed(5));
  const cc = project(lat, lng, tz);
  const rect = { x: (cc.x - side / 2) / k, y: (cc.y - side / 2) / k, w: side / k, h: side / k };
  return { zoom: tz - 1, lat, lng, width: side, height: side, rect };
}

/** A viewBox (world px) showing rect with `pad` (share of each side) in a container of aspect cw:ch. */
export function fitView(rect, cw, ch, { pad = 0.12, minW = 0 } = {}) {
  let w = Math.max(rect.w * (1 + 2 * pad), minW), h = rect.h * (1 + 2 * pad);
  const want = cw / ch;
  if (w / h < want) w = h * want; else h = w / want;
  return { x: rect.x + rect.w / 2 - w / 2, y: rect.y + rect.h / 2 - h / 2, w, h };
}

/** Interpolate two viewBoxes (zoom animation): linear in the centre, geometric in the size, so the zoom feels even. */
export function lerpView(a, b, t) {
  const e = t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2;
  const w = a.w * (b.w / a.w) ** e, h = a.h * (b.h / a.h) ** e;
  const cx = a.x + a.w / 2 + (b.x + b.w / 2 - a.x - a.w / 2) * e, cy = a.y + a.h / 2 + (b.y + b.h / 2 - a.y - a.h / 2) * e;
  return { x: cx - w / 2, y: cy - h / 2, w, h };
}

/** A gentle arc from a to b (screen or world px): quadratic Bézier bent to the left of travel by `bend` × length. */
export function arc(a, b, bend = 0.2) {
  const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) || 1;
  const c = { x: (a.x + b.x) / 2 + (dy / len) * len * bend, y: (a.y + b.y) / 2 - (dx / len) * len * bend };
  const mid = { x: 0.25 * a.x + 0.5 * c.x + 0.25 * b.x, y: 0.25 * a.y + 0.5 * c.y + 0.25 * b.y };
  // tangent at t = 0.5 (direction of travel at the midpoint) and at the end (for arrowheads)
  const tan = { x: b.x - a.x, y: b.y - a.y };
  const endTan = { x: b.x - c.x, y: b.y - c.y };
  return { d: `M${r1(a.x)} ${r1(a.y)}Q${r1(c.x)} ${r1(c.y)} ${r1(b.x)} ${r1(b.y)}`, c, mid, angle: (Math.atan2(tan.y, tan.x) * 180) / Math.PI, endAngle: (Math.atan2(endTan.y, endTan.x) * 180) / Math.PI };
}
const r1 = (n) => Math.round(n * 10) / 10;

/**
 * Nudge overlapping pins apart (in place). nodes: [{ p: { x, y }, r }] in screen px. Pins closer than r1 + r2 + gap
 * are pushed apart along the line between them (straight apart for identical points), a few rounds.
 * Pins that don't overlap never move. Returns nodes.
 */
export function relaxPins(nodes, { gap = 2, rounds = 10 } = {}) {
  for (let k = 0; k < rounds; k++) {
    let moved = false;
    for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i].p, b = nodes[j].p;
      const min = nodes[i].r + nodes[j].r + gap;
      let dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy);
      if (d >= min - 0.01) continue;
      if (d < 0.01) { const t = (j * 2.399963) % (2 * Math.PI); dx = Math.cos(t); dy = Math.sin(t); d = 1; } else { dx /= d; dy /= d; }
      const push = (min - (d < 0.01 ? 0 : d)) / 2 + 0.01;
      nodes[i].p = { x: a.x - dx * push, y: a.y - dy * push };
      nodes[j].p = { x: b.x + dx * push, y: b.y + dy * push };
      moved = true;
    }
    if (!moved) break;
  }
  return nodes;
}

// ---------------------------------------------------------------- dates and nights
const DAY = 86400000;
export const addDays = (iso, n) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);
export const nightsBetween = (from, to) => { const n = Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY); return Number.isFinite(n) && n > 0 ? n : 0; };

/**
 * Dates for each stop of a leg. A stop's dates are known when every stop before it has nights
 * (the leg starts on `from`). Returns { stops: [{ ...stop, start, end }], planned, left, status }:
 * start/end null when unknown (end null too when the stop has no nights); status empty | under | ok | over.
 */
export function legPlan({ from, nights: available, stops = [] }) {
  let cur = from, known = true, planned = 0;
  const out = stops.map((s) => {
    const n = Number.isInteger(s.nights) && s.nights > 0 ? s.nights : null;
    const start = known ? cur : null;
    const end = known && n ? addDays(cur, n) : null;
    if (n) planned += n;
    if (known && n) cur = end; else known = false;
    return { ...s, start, end };
  });
  const status = !planned ? 'empty' : planned > available ? 'over' : planned < available ? 'under' : 'ok';
  return { stops: out, planned, left: available - planned, status };
}

// ---------------------------------------------------------------- labels
const CANDIDATES = [
  // [dx, dy, anchor]: label box placed relative to the pin (screen px; r = pin radius + gap added by the caller)
  ['E'], ['W'], ['NE'], ['SE'], ['N'], ['S'], ['NW'], ['SW'],
];
function boxAt(it, dir, dist) {
  const { x, y, w, h } = it;
  const d = dist;
  switch (dir) {
    case 'E': return { x: x + d, y: y - h / 2, w, h };
    case 'W': return { x: x - d - w, y: y - h / 2, w, h };
    case 'N': return { x: x - w / 2, y: y - d - h, w, h };
    case 'S': return { x: x - w / 2, y: y + d, w, h };
    case 'NE': return { x: x + d * 0.7, y: y - d * 0.7 - h, w, h };
    case 'SE': return { x: x + d * 0.7, y: y + d * 0.7, w, h };
    case 'NW': return { x: x - d * 0.7 - w, y: y - d * 0.7 - h, w, h };
    case 'SW': return { x: x - d * 0.7 - w, y: y + d * 0.7, w, h };
    default: return { x, y, w, h };
  }
}
export const overlaps = (a, b, gap = 0) => a.x < b.x + b.w + gap && b.x < a.x + a.w + gap && a.y < b.y + b.h + gap && b.y < a.y + a.h + gap;
const inside = (b, bounds, m) => !bounds || (b.x >= bounds.x + m && b.y >= bounds.y + m && b.x + b.w <= bounds.x + bounds.w - m && b.y + b.h <= bounds.y + bounds.h - m);
const area = (a, b) => Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));

/**
 * Greedy label placement (screen px). items: [{ id, x, y, w, h, r, priority, fixed?: box, must?: bool, prefer?: dir }]
 * (x, y = the pin; r = distance from the pin centre to the label; lower priority number = placed first).
 * obstacles: boxes labels must avoid (pins, legend). bounds: the visible map ({ x, y, w, h }).
 * Each label tries 8 directions next to its pin, then 8 farther out with a leader line. A `must` label that fits
 * nowhere is put where it overlaps least; any other label that fits nowhere is hidden.
 * Returns Map id → { box, dir, leader: bool, hidden: bool }.
 */
export function layoutLabels(items, { obstacles = [], bounds = null, margin = 4, gap = 2 } = {}) {
  const placed = [];
  const out = new Map();
  const sorted = items.map((it, i) => [it, i]).sort((a, b) => (a[0].priority ?? 9) - (b[0].priority ?? 9) || a[1] - b[1]).map((x) => x[0]);
  const free = (b, self) => inside(b, bounds, margin) && !placed.some((p) => overlaps(b, p, gap)) && !obstacles.some((o) => o.id !== self && overlaps(b, o, 0));
  for (const it of sorted) {
    if (it.fixed) { placed.push(it.fixed); out.set(it.id, { box: it.fixed, dir: 'fixed', leader: false, hidden: false }); continue; }
    const dirs = it.prefer ? [it.prefer, ...CANDIDATES.map((c) => c[0]).filter((d) => d !== it.prefer)] : CANDIDATES.map((c) => c[0]);
    let hit = null;
    for (const [dist, leader] of [[it.r, false], [it.r + 16, true], [it.r + 34, true]]) {
      for (const d of dirs) { const b = boxAt(it, d, dist); if (free(b, it.id)) { hit = { box: b, dir: d, leader, hidden: false }; break; } }
      if (hit) break;
    }
    if (!hit && it.must) {
      // least-bad spot near the pin: inside the bounds if possible, smallest overlap with what is already placed
      let best = null, bestCost = Infinity;
      for (const d of dirs) {
        const b = boxAt(it, d, it.r);
        const cost = placed.reduce((n, p) => n + area(b, p), 0) + obstacles.filter((o) => o.id !== it.id).reduce((n, o) => n + area(b, o) * 0.5, 0) + (inside(b, bounds, margin) ? 0 : 1e6);
        if (cost < bestCost) { bestCost = cost; best = { box: b, dir: d, leader: false, hidden: false, overlap: true }; }
      }
      hit = best;
    }
    if (hit) { placed.push(hit.box); out.set(it.id, hit); } else out.set(it.id, { box: null, dir: null, leader: false, hidden: true });
  }
  return out;
}
