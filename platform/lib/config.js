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
