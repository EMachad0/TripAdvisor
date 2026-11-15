// Country overview map: one static OSM image per country with a numbered pin per area.
// Pins are returned as percentages so the page can overlay them (they keep their colour in dark mode).
import { staticMap, project } from './staticmap.js';

const TILE = 256;
/** Inverse of project(): world pixel at zoom z → { lat, lng }. */
export function unproject(x, y, z) {
  const n = 2 ** z * TILE;
  return { lng: (x / n) * 360 - 180, lat: (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / n))) * 180) / Math.PI };
}

/** Areas of one country that have coordinates, numbered north → south (then west → east). */
export function numberedAreas(areas) {
  return areas.filter((a) => typeof a.lat === 'number' && typeof a.lng === 'number')
    .sort((a, b) => b.lat - a.lat || a.lng - b.lng || String(a.id).localeCompare(String(b.id)))
    .map((a, i) => ({ id: a.id, name: a.name, lat: a.lat, lng: a.lng, n: i + 1 }));
}

/**
 * Pure layout: zoom, centre and pin positions for a set of points on a width × height image
 * (the image is rendered at zoom + 1 for 2× density, like place maps).
 * Returns { zoom, lat, lng, pins: [{ ...point, x, y }] } with x, y in % of the image.
 */
export function overviewLayout(points, { width = 1200, height = 720, minZoom = 2, maxZoom = 9, padX = 0.14, padY = 0.16 } = {}) {
  if (!points.length) return null;
  let zoom = minZoom;
  for (let z = maxZoom; z >= minZoom; z--) {
    const ps = points.map((p) => project(p.lat, p.lng, z + 1));
    const w = Math.max(...ps.map((p) => p.x)) - Math.min(...ps.map((p) => p.x)), h = Math.max(...ps.map((p) => p.y)) - Math.min(...ps.map((p) => p.y));
    if (w <= width * (1 - 2 * padX) && h <= height * (1 - 2 * padY)) { zoom = z; break; }
  }
  const ps = points.map((p) => project(p.lat, p.lng, zoom + 1));
  const cx = (Math.max(...ps.map((p) => p.x)) + Math.min(...ps.map((p) => p.x))) / 2, cy = (Math.max(...ps.map((p) => p.y)) + Math.min(...ps.map((p) => p.y))) / 2;
  const c = unproject(cx, cy, zoom + 1);
  // Round the centre like staticMap's cache key does, so the pins sit exactly where the image puts them.
  const lat = Number(c.lat.toFixed(5)), lng = Number(c.lng.toFixed(5));
  const cc = project(lat, lng, zoom + 1);
  return { zoom, lat, lng, width, height, pins: points.map((p, i) => ({ ...p, x: ((ps[i].x - (cc.x - width / 2)) / width) * 100, y: ((ps[i].y - (cc.y - height / 2)) / height) * 100 })) };
}

/**
 * Build (or reuse from cache) the overview map of one country's areas.
 * Returns { file, width, height, zoom, pins: [{ id, name, n, x, y }] } or null (fewer than 2 areas with
 * coordinates, or tiles unavailable). About 20 tiles per country, cached in .cache/tiles.
 */
export async function countryOverviewMap(areas, { opts = {}, width = 1200, height = 720 } = {}) {
  const pts = numberedAreas(areas);
  if (pts.length < 2) return null;
  const lay = overviewLayout(pts, { width, height });
  const m = await staticMap(lay.lat, lay.lng, { zoom: lay.zoom, width, height, opts });
  if (!m) return null;
  return { file: m.file, width, height, zoom: lay.zoom, pins: lay.pins.map(({ id, name, n, x, y }) => ({ id, name, n, x, y })) };
}
