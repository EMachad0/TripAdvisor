// Repo paths and data roots. Fixture mode swaps places/areas/feedback for the
// test fixtures (flag --fixtures or env ATR_FIXTURES=1).
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const PLATFORM = path.join(ROOT, 'platform');
export const FIXTURES = path.join(PLATFORM, 'test', 'fixtures');

export function isFixtureMode(opts = {}) {
  if (opts.fixtures !== undefined) return !!opts.fixtures;
  return process.env.ATR_FIXTURES === '1' || process.env.ATR_FIXTURES === 'true';
}

export function dataRoots(opts = {}) {
  const fx = isFixtureMode(opts);
  const custom = opts.root || process.env.ATR_DATA_ROOT;
  const base = custom ? path.resolve(custom) : (fx ? FIXTURES : ROOT);
  // Stated taste: config/taste.yaml. A custom data root or the fixtures may carry their own copy
  // (<root>/config/taste.yaml) so tests don't depend on the real traveler's answers.
  const ownTaste = path.join(base, 'config', 'taste.yaml');
  const taste = opts.tasteFile ? path.resolve(opts.tasteFile)
    : process.env.ATR_TASTE_FILE ? path.resolve(process.env.ATR_TASTE_FILE)
    : (custom || fx) && fs.existsSync(ownTaste) ? ownTaste : path.join(ROOT, 'config', 'taste.yaml');
  return {
    taste,
    fixtures: fx,
    places: path.join(base, 'places'),
    areas: path.join(base, 'areas'),
    reviews: opts.reviewsDir ? path.resolve(opts.reviewsDir) : path.join(base, 'reviews'),   // independent reviews: written by `atr review` only
    feedback: opts.feedbackDir ? path.resolve(opts.feedbackDir) : path.join(base, 'feedback'),
    build: opts.buildDir ? path.resolve(opts.buildDir) : path.join(ROOT, 'build'),
    config: path.join(ROOT, 'config', 'trip.yaml'),
    cache: path.join(ROOT, '.cache'),
    runs: path.join(ROOT, 'runs'),
  };
}

export const rel = (p) => path.relative(process.cwd(), p) || '.';

/** Local calendar date YYYY-MM-DD (what a curator means by "today"). */
export const localDate = (d = new Date()) => d.toLocaleDateString('sv-SE');
