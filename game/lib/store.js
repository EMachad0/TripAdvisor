// Game persistence: append-only feedback JSONL (docs/FEEDBACK-FORMAT.md) + a small local
// state file (feedback/game-state.json: first-seen times, days what-if, holiday locks).
import fs from 'node:fs';
import path from 'node:path';
import { readFeedback, FEEDBACK_SPECS } from '../../platform/lib/index.js';
import { check } from '../../platform/lib/schema/dsl.js';

export const nowIso = (d = new Date()) => d.toISOString().replace(/\.\d{3}Z$/, 'Z');

export function newSessionId(d = new Date()) {
  return `s-${d.toISOString().slice(0, 10)}-${Math.random().toString(36).slice(2, 6)}`;
}

/** Validate an event against the platform's feedback spec. Returns error strings. */
export function eventErrors(kind, ev) {
  return check(FEEDBACK_SPECS[kind], ev).filter((x) => x.level === 'error').map((x) => `${x.path}: ${x.message}`);
}

/**
 * Append one event to <dir>/<kind>.jsonl. Adds v and ts. Never rewrites past lines;
 * if the file doesn't end with a newline, one is added first so lines never merge.
 */
export function appendEvent(dir, kind, event, { now } = {}) {
  if (!FEEDBACK_SPECS[kind]) throw new Error(`unknown feedback kind ${kind}`);
  const ev = { v: 1, ts: nowIso(now), ...event };
  for (const k of Object.keys(ev)) if (ev[k] === undefined) delete ev[k];
  const errs = eventErrors(kind, ev);
  if (errs.length) { const e = new Error(`invalid ${kind} event: ${errs.join('; ')}`); e.status = 400; throw e; }
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${kind}.jsonl`);
  let prefix = '';
  if (fs.existsSync(file)) {
    const size = fs.statSync(file).size;
    if (size > 0) {
      const fd = fs.openSync(file, 'r');
      const b = Buffer.alloc(1);
      fs.readSync(fd, b, 0, 1, size - 1);
      fs.closeSync(fd);
      if (b[0] !== 0x0a) prefix = '\n';
    }
  }
  fs.appendFileSync(file, prefix + JSON.stringify(ev) + '\n');
  return ev;
}

/** Latest verdict per (round, id): { area: {id: verdict}, place: {id: verdict} }. */
export function latestVerdicts(swipes = []) {
  const out = { area: {}, place: {} };
  const sorted = [...swipes].map((s, i) => [s, i]).sort((a, b) => a[0].ts.localeCompare(b[0].ts) || a[1] - b[1]).map((x) => x[0]);
  for (const s of sorted) if (out[s.round]) out[s.round][s.id] = s.verdict;
  return out;
}

/** Duels oldest first (stable for equal timestamps). */
export function sortedDuels(duels = []) {
  return [...duels].map((d, i) => [d, i]).sort((a, b) => a[0].ts.localeCompare(b[0].ts) || a[1] - b[1]).map((x) => x[0]);
}

export function readAll(dir) {
  return readFeedback(dir);
}

// ---------- local state ----------
const EMPTY = () => ({ v: 1, firstRun: null, firstSeen: {}, days: {}, locks: {} });

export function readState(file) {
  try {
    const s = JSON.parse(fs.readFileSync(file, 'utf8'));
    return { ...EMPTY(), ...s, firstSeen: s.firstSeen || {}, days: s.days || {}, locks: s.locks || {} };
  } catch { return EMPTY(); }
}

export function writeState(file, state) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2) + '\n');
  fs.renameSync(tmp, file);
}

/**
 * Record first-seen times for ids and decide which are "new".
 * The very first run records everything as the baseline (nothing is new). Later, an id the
 * app has never listed before is new until the traveler swipes it.
 * Returns { state, changed, isNew(id) }.
 */
export function trackSeen(state, ids, swiped = new Set(), now = nowIso()) {
  let changed = false;
  if (!state.firstRun) { state.firstRun = now; changed = true; }
  for (const id of ids) if (!state.firstSeen[id]) { state.firstSeen[id] = now; changed = true; }
  const isNew = (id) => !swiped.has(id) && state.firstSeen[id] > state.firstRun;
  return { state, changed, isNew };
}
