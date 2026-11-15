// Read-only loaders for places, areas and media credits.
import fs from 'node:fs';
import path from 'node:path';
import { parse } from 'yaml';
import { dataRoots } from './paths.js';

const skip = (name) => name.startsWith('.') || name.startsWith('_') || name === 'media' || name === 'node_modules';

function subdirs(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).filter((d) => d.isDirectory() && !skip(d.name)).map((d) => d.name).sort();
}

/** All place.yaml files: <places>/<country>/<city>/<slug>/place.yaml */
export function findPlaceFiles(opts = {}) {
  const root = opts.placesDir || dataRoots(opts).places;
  const out = [];
  for (const c of subdirs(root)) for (const city of subdirs(path.join(root, c))) for (const slug of subdirs(path.join(root, c, city))) {
    const f = path.join(root, c, city, slug, 'place.yaml');
    if (fs.existsSync(f)) out.push(f);
  }
  return out;
}

/** All area files: <areas>/<country>/<slug>.yaml */
export function findAreaFiles(opts = {}) {
  const root = opts.areasDir || dataRoots(opts).areas;
  const out = [];
  for (const c of subdirs(root)) {
    for (const f of fs.readdirSync(path.join(root, c)).sort()) {
      if (/\.ya?ml$/.test(f) && !skip(f)) out.push(path.join(root, c, f));
    }
  }
  return out;
}

export function loadCredits(mediaDir) {
  const f = path.join(mediaDir, 'credits.yaml');
  if (!fs.existsSync(f)) return [];
  try { return parse(fs.readFileSync(f, 'utf8')) || []; } catch { return []; }
}

export function mediaFiles(mediaDir) {
  if (!fs.existsSync(mediaDir)) return [];
  return fs.readdirSync(mediaDir).filter((f) => !f.startsWith('.'));
}

function readData(file) {
  try { return parse(fs.readFileSync(file, 'utf8')); } catch { return null; }
}

/**
 * Load all places. Returns plain objects with a non-enumerable-ish `_meta`
 * ({ file, dir, mediaDir, credits }). Real mode skips `fixture: true` entries.
 * opts: { fixtures, root, placesDir, includeFixtures }
 */
export function loadPlaces(opts = {}) {
  const roots = dataRoots(opts);
  const places = [];
  for (const file of findPlaceFiles(opts)) {
    const data = readData(file);
    if (!data || typeof data !== 'object') continue;
    if (data.fixture && !roots.fixtures && !opts.includeFixtures) continue;
    const dir = path.dirname(file);
    const mediaDir = path.join(dir, 'media');
    places.push({ ...data, _meta: { file, dir, mediaDir, credits: loadCredits(mediaDir) } });
  }
  return places;
}

export function loadAreas(opts = {}) {
  const roots = dataRoots(opts);
  const areas = [];
  for (const file of findAreaFiles(opts)) {
    const data = readData(file);
    if (!data || typeof data !== 'object') continue;
    if (data.fixture && !roots.fixtures && !opts.includeFixtures) continue;
    const mediaDir = path.join(path.dirname(file), 'media');
    areas.push({ ...data, _meta: { file, dir: path.dirname(file), mediaDir, credits: loadCredits(mediaDir) } });
  }
  return areas;
}

/** Resolve a place by id, folder or place.yaml path. */
export function resolvePlace(ref, opts = {}) {
  if (!ref) return null;
  const p = path.resolve(ref);
  if (fs.existsSync(p)) {
    const file = fs.statSync(p).isDirectory() ? path.join(p, 'place.yaml') : p;
    if (fs.existsSync(file)) return { file, dir: path.dirname(file), id: readData(file)?.id || path.basename(path.dirname(file)) };
  }
  for (const file of findPlaceFiles(opts)) {
    const dir = path.dirname(file);
    const id = path.basename(dir);
    if (id === ref || readData(file)?.id === ref) return { file, dir, id };
  }
  return null;
}

/** Resolve an area by id or path. */
export function resolveArea(ref, opts = {}) {
  const p = path.resolve(ref);
  if (fs.existsSync(p) && fs.statSync(p).isFile()) return { file: p, dir: path.dirname(p), id: path.basename(p).replace(/\.ya?ml$/, '') };
  for (const file of findAreaFiles(opts)) {
    const id = path.basename(file).replace(/\.ya?ml$/, '');
    if (id === ref) return { file, dir: path.dirname(file), id };
  }
  return null;
}
