// `./atr trip set|update|delete <col> [id] --data <json>` (docs/MIGRATION-PLAN.md section 7, slice I): hand edits of
// the trip collections on the new app, replacing the hand edits of trip/*.json. The write runs the Convex function
// internal trip:adminWrite (the same rules as the app's trip.write) through a wrapper script that holds the admin
// key, so this file never sees a key or a token:
//   prod   scripts/convex-prod.sh run trip:adminWrite '<request>'   (owner's laptop only; asks first)
//   local  scripts/convex-local.sh convex run trip:adminWrite '<request>'   (ATR_SLOT picks the slot)
// Before writing it checks the request here with the server's rules (so the message is clear: the backend redacts
// its error text) and asks ops:getWritesFrozen, because adminWrite refuses while writes are frozen. It never passes
// `force`: overriding the freeze is the owner's hand step in the runbook, never this command's.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline/promises';
import { pathToFileURL } from 'node:url';

/** The nine trip collections (@atr/shared trip/constants.ts COLLECTIONS; a test keeps the two equal). */
export const COLLECTIONS = ['tasks', 'legs', 'bag', 'budget', 'fixed', 'spend', 'settings', 'days', 'visited'];
export const OPS = ['set', 'update', 'delete'];
/** apps/web/src/convex/lib/logic/trip.ts ID_RE. */
export const ID_RE = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,79}$/;
/** apps/web/src/convex/lib/logic/trip.ts TRIP_WRITE_LIMITS. */
export const LIMITS = { maxBytes: 65_536, maxString: 10_000, maxFields: 64, maxList: 100 };
export const FUNCTION = 'trip:adminWrite';
export const FROZEN_FUNCTION = 'ops:getWritesFrozen';
export const TARGETS = {
  prod: { script: 'scripts/convex-prod.sh', args: ['run'] },
  local: { script: 'scripts/convex-local.sh', args: ['convex', 'run'] },
};

export class TripCliError extends Error {}
const bad = (m) => new TripCliError(m);
const utf8Bytes = (s) => Buffer.byteLength(s, 'utf8');

/** Why one field value cannot be sent (null when it can): string, number, boolean, null or a list of strings. */
function valueProblem(key, value) {
  if (key.length > 64) return `field name too long: ${key.slice(0, 64)}…`;
  if (value === null || typeof value === 'boolean') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? null : `${key}: not a finite number`;
  if (typeof value === 'string') return value.length > LIMITS.maxString ? `${key}: too long (max ${LIMITS.maxString} characters)` : null;
  if (Array.isArray(value)) {
    if (value.length > LIMITS.maxList) return `${key}: too many items (max ${LIMITS.maxList})`;
    if (!value.every((x) => typeof x === 'string')) return `${key}: a list may only hold strings (city ids)`;
    return value.some((x) => x.length > LIMITS.maxString) ? `${key}: too long (max ${LIMITS.maxString} characters)` : null;
  }
  return `${key}: must be a string, number, boolean, null (to clear) or a list of strings`;
}

/**
 * The adminWrite request from the command line: op, positionals [col, id?] and --data <json>.
 * Throws TripCliError with the reason, in the old server's words where it had one.
 */
export function buildRequest(op, pos = [], dataText, fields = null) {
  if (!OPS.includes(op)) throw bad(`say what to do: ./atr trip ${OPS.join('|')} <collection> [id] --data <json>`);
  const [col, id, ...extra] = pos;
  if (!col) throw bad(`say which collection: ${COLLECTIONS.join(', ')}`);
  if (!COLLECTIONS.includes(col)) throw bad(`unknown collection "${col}" (one of: ${COLLECTIONS.join(', ')})`);
  if (extra.length) throw bad(`unexpected argument "${extra[0]}": give the fields with --data '<json>'`);
  if (id !== undefined && !ID_RE.test(id)) throw bad(`bad id "${id}" (letters, digits and _ . : -, up to 80, starting with a letter or digit)`);
  if (op !== 'set' && id === undefined) throw bad(`${op} needs an id: ./atr trip ${op} ${col} <id>${op === 'update' ? " --data '<json>'" : ''}`);
  const req = { col, op, ...(id !== undefined ? { id } : {}) };
  if (op === 'delete') {
    if (dataText !== undefined) throw bad('delete takes no --data');
    return req;
  }
  if (dataText === undefined) throw bad(`${op} needs --data '<json object>', e.g. --data '{"status":"booked"}'`);
  let data;
  try { data = JSON.parse(dataText); } catch (e) { throw bad(`--data is not JSON: ${e.message}`); }
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw bad('data must be an object');
  if ('id' in data) throw bad('put the id after the collection, not in --data');
  const entries = Object.entries(data);
  if (entries.length > LIMITS.maxFields) throw bad(`too many fields (max ${LIMITS.maxFields})`);
  for (const [k, v] of entries) {
    const p = valueProblem(k, v);
    if (p) throw bad(p);
  }
  const known = fields?.[col];
  const unknown = known ? entries.map(([k]) => k).filter((k) => !Object.hasOwn(known, k)) : [];
  if (unknown.length) throw bad(`${col} has no field ${unknown.map((k) => `"${k}"`).join(', ')} (fields: ${Object.keys(known).join(', ')})`);
  req.data = data;
  if (utf8Bytes(JSON.stringify(req)) > LIMITS.maxBytes) throw bad('body too large');
  return req;
}

/**
 * The field names per collection from @atr/shared (packages/shared/src/v1/trip-types.ts TRIP_FIELDS), or null when
 * this checkout has no packages/ (the platform copied on its own): then the backend's schema check is the only one.
 */
export async function loadTripFields(root) {
  const file = path.join(root, 'packages', 'shared', 'src', 'v1', 'trip-types.ts');
  if (!fs.existsSync(file)) return null;
  try { return (await import(pathToFileURL(file).href)).TRIP_FIELDS ?? null; } catch { return null; }
}

/** Run a command without a shell; never throws. → { code, stdout, stderr } */
export function sh(cmd, args, { cwd, env } = {}) {
  const r = spawnSync(cmd, args, { cwd, env, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
  if (r.error) return { code: 127, stdout: '', stderr: r.error.code === 'ENOENT' ? `${cmd}: not found` : r.error.message };
  return { code: r.status ?? 1, stdout: r.stdout || '', stderr: r.stderr || '' };
}

/** The JSON value a `convex run` printed (the wrapper may print a host line first), or undefined. */
export function parseRunOutput(stdout) {
  const text = String(stdout || '').trim();
  try { return JSON.parse(text); } catch { /* a line before the value */ }
  const at = text.search(/^[{[]|^null$|^true$|^false$/m);
  if (at < 0) return undefined;
  try { return JSON.parse(text.slice(at)); } catch { return undefined; }
}

/** The first useful line of a failed run, without request ids. */
const firstError = (r) => String(r.stderr || r.stdout || `exit ${r.code}`).split('\n').map((l) => l.trim()).filter((l) => l && !/^✖ Failed to run function/.test(l)).slice(0, 2).join(' ').replace(/\[Request ID: [^\]]+\] /, '') || `exit ${r.code}`;

/**
 * Do one hand edit. opts: { op, pos, data (the --data text), target: 'prod' | 'local', yes, dryRun, root, run, ask,
 * isTTY, log }. → { ok, dryRun?, target, request, doc }. Throws TripCliError with what went wrong; nothing is
 * written unless it returns ok.
 */
export async function tripWrite(opts) {
  const { op, pos, data, target = 'prod', yes = false, dryRun = false, root, run = sh, log = () => {} } = opts;
  const request = buildRequest(op, pos, data, opts.fields === undefined ? await loadTripFields(root) : opts.fields);
  const t = TARGETS[target];
  if (!t) throw bad(`unknown target ${target}`);
  const script = path.join(root, t.script);
  if (dryRun) return { ok: true, dryRun: true, target, request, command: [t.script, ...t.args, FUNCTION, JSON.stringify(request)] };
  if (!fs.existsSync(script)) throw bad(target === 'prod' ? `${t.script} is not in this checkout yet (it comes with the Convex deployment); nothing was written. Use --local for a local slot.` : `${t.script} is missing; nothing was written`);
  const call = (fn, args) => run(script, [...t.args, fn, JSON.stringify(args)], { cwd: root });

  // writes frozen (shadow, cutover, rollback): adminWrite would refuse, so say why up front
  const fr = call(FROZEN_FUNCTION, {});
  if (fr.code !== 0) throw bad(`could not reach the ${target} backend: ${firstError(fr)}. Nothing was written.`);
  const frozen = parseRunOutput(fr.stdout);
  if (frozen?.writesFrozen === true) throw bad(`writes are frozen on the ${target} backend (a cutover or rollback is in progress); nothing was written. Try again once they are unfrozen.`);
  if (frozen?.writesFrozen !== false) throw bad(`the ${target} backend gave an unexpected answer to ${FROZEN_FUNCTION}; nothing was written`);

  if (target === 'prod' && !yes) {
    const summary = `${request.op} ${request.col}${request.id ? `/${request.id}` : ' (new id)'}${request.data ? ` ${JSON.stringify(request.data)}` : ''}`;
    if (!(opts.isTTY ?? process.stdin.isTTY)) throw bad(`this writes to the live trip data (${summary}); run it in a terminal to confirm, or add --yes after checking it. Nothing was written.`);
    const ask = opts.ask || (async (q) => { const rl = readline.createInterface({ input: process.stdin, output: process.stderr }); try { return await rl.question(q); } finally { rl.close(); } });
    const answer = String(await ask(`write to the live trip data: ${summary}? [y/N] `)).trim().toLowerCase();
    if (answer !== 'y' && answer !== 'yes') throw bad('not confirmed; nothing was written');
  }

  const r = call(FUNCTION, request);
  if (r.code !== 0) {
    throw bad(`the ${target} backend refused the write (${firstError(r)}). Nothing was written. Usual causes: an update of an id that does not exist, or a value the ${request.col} schema does not accept (see docs/TRIP.md).`);
  }
  const res = parseRunOutput(r.stdout);
  if (!res || res.ok !== true) throw bad(`the ${target} backend answered something unexpected; check with ./atr trip pull --from-convex before retrying`);
  log(`${request.op} ${request.col}/${res.doc?.id ?? request.id}`);
  return { ok: true, target, request, doc: res.doc ?? null };
}
