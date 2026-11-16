// Repo paths and data roots. Fixture mode swaps places/areas/answers/feedback for the
// test fixtures (flag --fixtures or env ATR_FIXTURES=1).
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

// PLATFORM is where this package's own files are (lib, test fixtures). ROOT is the content root (places/, areas/,
// answers/, config/, ...): the repo by default, or ATR_ROOT when the platform runs as an installed package
// (the web image sets ATR_ROOT=/app/content).
export const PLATFORM = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const ROOT = process.env.ATR_ROOT ? path.resolve(process.env.ATR_ROOT) : path.dirname(PLATFORM);
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
    answers: opts.answersDir ? path.resolve(opts.answersDir) : path.join(base, 'answers'),   // answer cards (answers/*.md), see platform/lib/answers.js
    reviews: opts.reviewsDir ? path.resolve(opts.reviewsDir) : path.join(base, 'reviews'),   // independent reviews: written by `atr review` only
    feedback: opts.feedbackDir ? path.resolve(opts.feedbackDir) : path.join(base, 'feedback'),
    build: opts.buildDir ? path.resolve(opts.buildDir) : path.join(ROOT, 'build'),
    config: path.join(ROOT, 'config', 'trip.yaml'),
    cache: path.join(ROOT, '.cache'),
    runs: path.join(ROOT, 'runs'),
  };
}

/** Where `./atr feedback pull` and `./atr trip pull` keep the live copies (under the gitignored .cache/). */
export const liveDirs = () => ({ feedback: path.join(ROOT, '.cache', 'feedback-live'), trip: path.join(ROOT, '.cache', 'trip-live') });

/**
 * The feedback directory for read-only curator commands (feedback, taste, next, run --auto): --dir, else
 * ATR_FEEDBACK_DIR, else .cache/feedback-live/ when a pull wrote it, else <data root>/feedback. Fixture mode and a
 * custom data root keep their own feedback/. `dataRoots().feedback` (what ./atr game writes) never changes.
 */
export function readOnlyFeedbackDir(opts = {}) {
  if (opts.dir) return path.resolve(opts.dir);
  if (process.env.ATR_FEEDBACK_DIR) return path.resolve(process.env.ATR_FEEDBACK_DIR);
  const ownRoot = isFixtureMode(opts) || opts.root || process.env.ATR_DATA_ROOT;
  if (!ownRoot && fs.existsSync(liveDirs().feedback)) return liveDirs().feedback;
  return dataRoots(opts).feedback;
}

export const rel = (p) => path.relative(process.cwd(), p) || '.';

/** Local calendar date YYYY-MM-DD (what a curator means by "today"). */
export const localDate = (d = new Date()) => d.toLocaleDateString('sv-SE');
