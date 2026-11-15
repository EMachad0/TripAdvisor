// Build-time static map: stitches OpenStreetMap tiles around a point (cached; tiny volume,
// per the OSM tile usage policy: identifying User-Agent, caching, no bulk downloads).
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { dataRoots } from './paths.js';

const UA = 'AsiaTripRankerBot/0.1 (personal travel-research tool; static maps for a handful of pages)';
const TILE = 256;

export function project(lat, lng, z) {
  const n = 2 ** z * TILE;
  const s = Math.sin((lat * Math.PI) / 180);
  return { x: ((lng + 180) / 360) * n, y: (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * n };
}

/**
 * Which tiles cover a width × height image centred on lat/lng, and where to crop the stitched tiles.
 * The crop offset is floored, never rounded: rounding a .5+ fraction up pushed the crop one pixel past the
 * stitched image (e.g. 13.74678, 100.53495 at zoom 16), sharp threw, and the page kept the "OPEN MAP" placeholder.
 */
export function tileWindow(lat, lng, z, width, height) {
  const c = project(lat, lng, z);
  const left = Math.floor(c.x - width / 2), top = Math.floor(c.y - height / 2);
  const x0 = Math.floor(left / TILE), x1 = Math.floor((left + width - 1) / TILE);
  const y0 = Math.floor(top / TILE), y1 = Math.floor((top + height - 1) / TILE);
  return { x0, x1, y0, y1, cropLeft: left - x0 * TILE, cropTop: top - y0 * TILE, fullWidth: (x1 - x0 + 1) * TILE, fullHeight: (y1 - y0 + 1) * TILE };
}

async function tile(z, x, y, cacheDir) {
  const f = path.join(cacheDir, 'tiles', String(z), String(x), `${y}.png`);
  if (fs.existsSync(f)) return fs.readFileSync(f);
  if (process.env.ATR_OFFLINE === '1') throw new Error('offline and tile not cached');
  for (let i = 0; i < 3; i++) {
    const res = await fetch(`https://tile.openstreetmap.org/${z}/${x}/${y}.png`, { headers: { 'User-Agent': UA } });
    if (res.ok) {
      const buf = Buffer.from(await res.arrayBuffer());
      fs.mkdirSync(path.dirname(f), { recursive: true });
      fs.writeFileSync(f, buf);
      return buf;
    }
    if (![429, 500, 502, 503, 504].includes(res.status)) throw new Error(`tile HTTP ${res.status}`);
    await new Promise((r) => setTimeout(r, 1500 * (i + 1)));
  }
  throw new Error('tile server busy');
}

/**
 * Render (or reuse from cache) a static map centred on lat/lng.
 * Returns { file, width, height } or null when tiles are unavailable.
 * The pin is NOT baked in (the page overlays it so it keeps its colour in dark mode).
 */
export async function staticMap(lat, lng, { zoom = 16, width = 1200, height = 720, opts = {} } = {}) {
  if (typeof lat !== 'number' || typeof lng !== 'number') return null;
  const cacheDir = dataRoots(opts).cache;
  const z = Math.min(19, zoom + 1); // rendered at 2× density
  const key = `${lat.toFixed(5)}_${lng.toFixed(5)}_${z}_${width}x${height}.webp`;
  const out = path.join(cacheDir, 'maps', key);
  if (fs.existsSync(out)) return { file: out, width, height };
  try {
    const { x0, x1, y0, y1, cropLeft, cropTop, fullWidth, fullHeight } = tileWindow(lat, lng, z, width, height);
    const comps = [];
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) comps.push({ input: await tile(z, x, y, cacheDir), left: (x - x0) * TILE, top: (y - y0) * TILE });
    const big = await sharp({ create: { width: fullWidth, height: fullHeight, channels: 3, background: '#e8e4dc' } }).composite(comps).png().toBuffer();
    fs.mkdirSync(path.dirname(out), { recursive: true });
    await sharp(big).extract({ left: cropLeft, top: cropTop, width, height }).webp({ quality: 80 }).toFile(out);
    return { file: out, width, height };
  } catch (e) {
    // Say why instead of silently leaving the placeholder (offline runs are expected to miss tiles).
    if (process.env.ATR_OFFLINE !== '1') console.warn(`▲ static map skipped for ${lat}, ${lng}: ${e.message}`);
    return null;
  }
}
