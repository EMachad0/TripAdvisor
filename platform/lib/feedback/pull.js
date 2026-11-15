// `./atr feedback pull` and `./atr trip pull` (docs/MIGRATION-PLAN.md section 7): fetch the export bundle from
// the site (GET <url>/ops/export, Bearer token) and write the v1 files under .cache/feedback-live/ or
// .cache/trip-live/ (gitignored), for the read-only curator commands. The bundle format is defined in
// packages/migrate/src/bundle.ts:
//   { format: "atr-v1-bundle", version: 1, generatedAt, files: { "<feedback|trip>/<name>": { count, sha256, content } } }
// Rules:
// - the token comes from ATR_EXPORT_TOKEN or the macOS keychain (service "atr-export-token"); it is never an
//   argument, never printed and never written anywhere;
// - every file's sha256 and count are checked before anything is written;
// - files go to a temp dir under .cache/ first, then one rename replaces the target;
// - the target is never replaced when a file in it is newer than (or differs from) what the last pull wrote,
//   or when it was not written by a pull at all; the error names the file.
import { execFileSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export const BUNDLE_FORMAT = 'atr-v1-bundle';
export const MANIFEST = '.pull-manifest.json';
export const KEYCHAIN_SERVICE = 'atr-export-token';
/** A pull older than this gets a warning in the read-only commands (plan section 7). */
export const STALE_HOURS = 26;
export const PULL_KINDS = {
  feedback: { prefix: 'feedback/', dir: 'feedback-live' },
  trip: { prefix: 'trip/', dir: 'trip-live' },
};
const NAME_RE = /^(feedback|trip)\/[a-z][a-z-]*\.(jsonl|json)$/;

const pullError = (message) => Object.assign(new Error(message), { pull: true });
const sha256 = (text) => createHash('sha256').update(text, 'utf8').digest('hex');

/** The export token: ATR_EXPORT_TOKEN, else the macOS keychain. Throws with how to set it up. */
export function readToken({ env = process.env, platform = process.platform, exec = execFileSync } = {}) {
  if (env.ATR_EXPORT_TOKEN) return env.ATR_EXPORT_TOKEN.trim();
  if (platform === 'darwin') {
    try {
      const out = exec('security', ['find-generic-password', '-s', KEYCHAIN_SERVICE, '-w'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
      if (out.trim()) return out.trim();
    } catch { /* not in the keychain: fall through to the message */ }
  }
  throw pullError(`no export token: set ATR_EXPORT_TOKEN, or store it once in the keychain with \`security add-generic-password -s ${KEYCHAIN_SERVICE} -a atr -w\` (it prompts for the value)`);
}

export function exportUrl(base) {
  let u;
  try { u = new URL(base); } catch { throw pullError(`--url is not a URL: ${base}`); }
  if (!/^https?:$/.test(u.protocol)) throw pullError(`--url must be http(s): ${base}`);
  if (u.protocol === 'http:' && !['127.0.0.1', 'localhost', '[::1]'].includes(u.hostname)) throw pullError('plain http is only allowed for a local server; use https');
  if (!u.pathname.endsWith('/ops/export')) u.pathname = `${u.pathname.replace(/\/$/, '')}/ops/export`;
  return u;
}

/** Number of records in a v1 file, as the bundle manifest counts them. */
export function countOf(name, content) {
  if (name.endsWith('.jsonl')) return content.split('\n').filter((l) => l.trim()).length;
  const v = JSON.parse(content);
  if (name.endsWith('/game-state.json')) return v && typeof v.firstSeen === 'object' && v.firstSeen ? Object.keys(v.firstSeen).length : 0;
  if (!Array.isArray(v)) throw new Error('not a JSON array');
  return v.length;
}

/** Problems with a bundle (empty when it is sound): format, names, sha256 and counts. */
export function bundleProblems(bundle) {
  if (!bundle || typeof bundle !== 'object' || bundle.format !== BUNDLE_FORMAT || bundle.version !== 1 || !bundle.files || typeof bundle.files !== 'object') {
    return [`not an ${BUNDLE_FORMAT} v1 document`];
  }
  const problems = [];
  for (const [name, f] of Object.entries(bundle.files)) {
    if (!NAME_RE.test(name)) { problems.push(`unexpected file name ${JSON.stringify(name)}`); continue; }
    if (!f || typeof f.content !== 'string') { problems.push(`${name}: no content`); continue; }
    if (sha256(f.content) !== f.sha256) { problems.push(`${name}: sha256 does not match the manifest`); continue; }
    let count;
    try { count = countOf(name, f.content); } catch (e) { problems.push(`${name}: ${e.message}`); continue; }
    if (count !== f.count) problems.push(`${name}: ${count} records, the manifest says ${f.count}`);
  }
  return problems;
}

export async function fetchBundle({ url, token, fetchImpl = fetch }) {
  let res;
  try {
    res = await fetchImpl(url, { headers: { authorization: `Bearer ${token}`, accept: 'application/json' }, redirect: 'error' });
  } catch (e) {
    throw pullError(`could not reach ${url.origin}: ${e.cause?.code || e.message}`);
  }
  if (res.status === 401 || res.status === 403) throw pullError(`${url.origin} refused the export token (HTTP ${res.status})`);
  if (!res.ok) throw pullError(`${url.origin}${url.pathname} answered HTTP ${res.status}`);
  try { return await res.json(); } catch { throw pullError(`${url.origin} did not return JSON`); }
}

function readManifest(dir) {
  try { return JSON.parse(fs.readFileSync(path.join(dir, MANIFEST), 'utf8')); } catch { return null; }
}

/** Why the existing target must not be replaced (empty when it may be). */
export function targetProblems(dir) {
  if (!fs.existsSync(dir)) return [];
  const names = fs.readdirSync(dir).filter((n) => n !== MANIFEST);
  const m = readManifest(dir);
  if (!m || typeof m.files !== 'object') return names.length ? [`${path.join(dir, names[0])} was not written by a pull (no ${MANIFEST}); move it away first`] : [];
  const problems = [];
  for (const name of names) {
    const file = path.join(dir, name);
    const was = m.files[name];
    if (!was) { problems.push(`${file} is not from the last pull`); continue; }
    const st = fs.statSync(file);
    if (st.mtimeMs > was.mtimeMs) problems.push(`${file} is newer than the last pull (${new Date(st.mtimeMs).toISOString()} > ${new Date(was.mtimeMs).toISOString()})`);
    else if (sha256(fs.readFileSync(file, 'utf8')) !== was.sha256) problems.push(`${file} changed since the last pull`);
  }
  return problems;
}

/** Writes the kind's files from a checked bundle into <cacheDir>/<kind>-live through a temp dir and a rename. */
export function writePull({ bundle, kind, cacheDir, source, now = () => new Date() }) {
  const spec = PULL_KINDS[kind];
  if (!spec) throw pullError(`unknown pull kind ${kind}`);
  const problems = bundleProblems(bundle);
  if (problems.length) throw pullError(`bad export bundle, nothing written:\n  ${problems.join('\n  ')}`);
  const target = path.join(cacheDir, spec.dir);
  const blocked = targetProblems(target);
  if (blocked.length) throw pullError(`refusing to replace ${target}:\n  ${blocked.join('\n  ')}`);
  const picked = Object.entries(bundle.files).filter(([name]) => name.startsWith(spec.prefix));
  fs.mkdirSync(cacheDir, { recursive: true, mode: 0o700 });
  const tmp = path.join(cacheDir, `.pull-${spec.dir}-${process.pid}-${randomBytes(4).toString('hex')}`);
  fs.mkdirSync(tmp, { mode: 0o700 });
  try {
    const files = {};
    for (const [name, f] of picked) {
      const base = name.slice(spec.prefix.length);
      const file = path.join(tmp, base);
      fs.writeFileSync(file, f.content, { mode: 0o600 });
      if (sha256(fs.readFileSync(file, 'utf8')) !== f.sha256) throw pullError(`${base}: written bytes do not match the manifest`);
      files[base] = { sha256: f.sha256, count: f.count, mtimeMs: fs.statSync(file).mtimeMs };
    }
    const manifest = { source, generatedAt: bundle.generatedAt ?? null, pulledAt: now().toISOString().replace(/\.\d{3}Z$/, 'Z'), files };
    fs.writeFileSync(path.join(tmp, MANIFEST), JSON.stringify(manifest, null, 2) + '\n', { mode: 0o600 });
    const old = fs.existsSync(target) ? `${tmp}-old` : null;
    if (old) fs.renameSync(target, old);
    fs.renameSync(tmp, target);
    if (old) fs.rmSync(old, { recursive: true, force: true });
    return { dir: target, generatedAt: manifest.generatedAt, pulledAt: manifest.pulledAt, files: Object.entries(files).map(([name, f]) => ({ name, count: f.count })) };
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

/** The whole pull: token, fetch, check, write. Returns what writePull returns. */
export async function pull({ kind, url, cacheDir, env = process.env, fetchImpl = fetch, exec = execFileSync, platform = process.platform, now }) {
  const base = url || env.ATR_EXPORT_URL;
  if (!base) throw pullError('say where to pull from: --url <site> or ATR_EXPORT_URL (the Convex site origin that serves /ops/export)');
  const u = exportUrl(base);
  const token = readToken({ env, platform, exec });
  const bundle = await fetchBundle({ url: u, token, fetchImpl });
  return writePull({ bundle, kind, cacheDir, source: u.origin, now });
}

/** { pulledAt, ageHours, stale } for a pulled dir, or null when it was not written by a pull. */
export function pullInfo(dir, now = Date.now()) {
  const m = readManifest(dir);
  const t = m && Date.parse(m.pulledAt);
  if (!t) return null;
  const ageHours = (now - t) / 3_600_000;
  return { pulledAt: m.pulledAt, ageHours, stale: ageHours > STALE_HOURS };
}
