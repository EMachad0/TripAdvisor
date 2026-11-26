// Trip config (config/trip.yaml) used by gaps, budget checks and the game's Route tab.
import fs from 'node:fs';
import path from 'node:path';
import { parse } from 'yaml';
import { dataRoots, ROOT } from './paths.js';
import { normalizeConfigRoutes } from './route.js';

/**
 * Load the trip config. `countries[].route` (optional) is validated and normalised: every country gets a `route`
 * list (empty when absent) and bad stops are dropped. The problems are on the non-enumerable `cfg.warnings`
 * (never thrown: a typo in the route must not stop the curator tools that don't use it).
 */
export function loadTripConfig(opts = {}) {
  const file = opts.configFile || dataRoots(opts).config;
  if (!fs.existsSync(file)) return null;
  const cfg = parse(fs.readFileSync(file, 'utf8'));
  if (!cfg || typeof cfg !== 'object') return cfg;
  const rel = path.relative(ROOT, file);
  const warnings = normalizeConfigRoutes(cfg, { file: rel && !rel.startsWith('..') ? rel : file });
  Object.defineProperty(cfg, 'warnings', { value: warnings, enumerable: false, configurable: true, writable: true });
  return cfg;
}

/**
 * The raw config/hubs.yaml (airports and stations the trip site draws on the city maps), or null when the file is
 * missing, empty or not YAML. Never throws: the app keeps only well-formed entries (apps/web content/hubs.ts).
 * The file sits beside the trip config (`opts.configFile`), else in the data root's config/.
 */
export function loadHubsFile(opts = {}) {
  const file = opts.hubsFile || path.join(path.dirname(opts.configFile || dataRoots(opts).config), 'hubs.yaml');
  try {
    if (!fs.existsSync(file)) return null;
    return parse(fs.readFileSync(file, 'utf8')) ?? null;
  } catch {
    return null;
  }
}
