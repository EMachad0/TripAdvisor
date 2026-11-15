// ./atr feedback pull and ./atr trip pull against a local fake export server (lib/feedback/pull.js).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync, spawn } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { PLATFORM, ROOT } from '../lib/paths.js';
import { bundleProblems, exportUrl, pullInfo, readToken, writePull, KEYCHAIN_SERVICE, MANIFEST } from '../lib/feedback/pull.js';
import { tmpDir } from './helpers.js';

const TOKEN = randomBytes(18).toString('base64url'); // generated per run, never a real token
const sha = (s) => createHash('sha256').update(s, 'utf8').digest('hex');
const file = (content, count) => ({ count, sha256: sha(content), content });
const swipe = (i) => JSON.stringify({ v: 1, ts: `2026-11-10T09:0${i}:00Z`, session: 's', round: 'place', id: 'yu-garden', verdict: 'must', country: 'china' }) + '\n';

function bundle({ swipes = 2 } = {}) {
  const sw = Array.from({ length: swipes }, (_, i) => swipe(i)).join('');
  const gs = JSON.stringify({ v: 1, firstRun: null, firstSeen: { 'yu-garden': '2026-11-10T09:00:00Z' }, days: {}, locks: {} }, null, 2) + '\n';
  const legs = JSON.stringify([{ id: 'a', type: 'stay', order: 1 }], null, 2) + '\n';
  return {
    format: 'atr-v1-bundle', version: 1, generatedAt: '2026-11-15T12:00:00Z',
    files: {
      'feedback/swipes.jsonl': file(sw, swipes),
      'feedback/game-state.json': file(gs, 1),
      'trip/legs.json': file(legs, 1),
      'trip/spend.json': file('[]\n', 0),
    },
  };
}

// The fake site: GET /ops/export with the right Bearer token returns `served`.
let server, base, served = bundle(), requests = [];
before(async () => {
  server = http.createServer((req, res) => {
    requests.push({ url: req.url, auth: req.headers.authorization });
    if (req.url !== '/ops/export') { res.writeHead(404); return res.end(); }
    if (req.headers.authorization !== `Bearer ${TOKEN}`) { res.writeHead(401); return res.end('{}'); }
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(typeof served === 'string' ? served : JSON.stringify(served));
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());

// The CLI runs in a child with ATR_ROOT pointing at a temp content root, so .cache/ is that root's.
function atr(root, args, env = {}) {
  return new Promise((resolve) => {
    const child = spawn(path.join(ROOT, 'atr'), args, { cwd: root, env: { ...process.env, NO_COLOR: '1', ATR_OFFLINE: '1', ATR_ROOT: root, ATR_EXPORT_TOKEN: TOKEN, ATR_EXPORT_URL: '', ATR_FEEDBACK_DIR: '', ...env } });
    let stdout = '', stderr = '';
    child.stdout.on('data', (d) => { stdout += d; });
    child.stderr.on('data', (d) => { stderr += d; });
    child.on('close', (status) => resolve({ status, stdout, stderr }));
  });
}
const live = (root, kind = 'feedback') => path.join(root, '.cache', `${kind}-live`);

test('feedback pull writes the feedback files and a manifest, never the token', async () => {
  served = bundle();
  const root = tmpDir();
  const r = await atr(root, ['feedback', 'pull', '--url', base]);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /pulled 2 file\(s\)/);
  assert.deepEqual(fs.readdirSync(live(root)).sort(), [MANIFEST, 'game-state.json', 'swipes.jsonl']);
  assert.equal(fs.readFileSync(path.join(live(root), 'swipes.jsonl'), 'utf8'), served.files['feedback/swipes.jsonl'].content);
  const m = JSON.parse(fs.readFileSync(path.join(live(root), MANIFEST), 'utf8'));
  assert.equal(m.source, base);
  assert.equal(m.files['swipes.jsonl'].count, 2);
  assert.equal(fs.statSync(live(root)).mode & 0o077, 0, 'the pulled dir is private');
  assert.ok(!r.stdout.includes(TOKEN) && !r.stderr.includes(TOKEN));
  assert.ok(!fs.readFileSync(path.join(live(root), MANIFEST), 'utf8').includes(TOKEN));
  assert.equal(requests.at(-1).auth, `Bearer ${TOKEN}`);
  assert.deepEqual(fs.readdirSync(path.join(root, '.cache')).sort(), ['feedback-live'], 'no temp dir left behind');
});

test('trip pull writes trip-live, and ATR_EXPORT_URL is the default source', async () => {
  served = bundle();
  const root = tmpDir();
  const r = await atr(root, ['trip', 'pull'], { ATR_EXPORT_URL: base });
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(fs.readdirSync(live(root, 'trip')).sort(), [MANIFEST, 'legs.json', 'spend.json']);
  assert.ok(!fs.existsSync(live(root)));
});

test('a second pull replaces the copy; a file newer than the last pull blocks it and is named', async () => {
  served = bundle();
  const root = tmpDir();
  assert.equal((await atr(root, ['feedback', 'pull', '--url', base])).status, 0);
  served = bundle({ swipes: 3 });
  assert.equal((await atr(root, ['feedback', 'pull', '--url', base])).status, 0);
  assert.equal(fs.readFileSync(path.join(live(root), 'swipes.jsonl'), 'utf8').split('\n').filter(Boolean).length, 3);

  const local = path.join(live(root), 'swipes.jsonl');
  fs.appendFileSync(local, swipe(9));
  const later = new Date(Date.now() + 60_000);
  fs.utimesSync(local, later, later);
  const r = await atr(root, ['feedback', 'pull', '--url', base]);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /refusing to replace .*feedback-live/);
  assert.match(r.stderr, /swipes\.jsonl is newer than the last pull/);
  assert.equal(fs.readFileSync(local, 'utf8').split('\n').filter(Boolean).length, 4, 'the local edit is kept');
});

test('an edited file with an old mtime, a stray file, or a dir no pull wrote also block the pull', () => {
  const cacheDir = tmpDir();
  writePull({ bundle: bundle(), kind: 'feedback', cacheDir, source: 'x' });
  const dir = path.join(cacheDir, 'feedback-live');
  const f = path.join(dir, 'game-state.json');
  fs.writeFileSync(f, '{}\n');
  const past = new Date(Date.now() - 3_600_000);
  fs.utimesSync(f, past, past);
  assert.throws(() => writePull({ bundle: bundle(), kind: 'feedback', cacheDir, source: 'x' }), /game-state\.json changed since the last pull/);

  const c2 = tmpDir();
  writePull({ bundle: bundle(), kind: 'feedback', cacheDir: c2, source: 'x' });
  fs.writeFileSync(path.join(c2, 'feedback-live', 'notes.jsonl'), '');
  assert.throws(() => writePull({ bundle: bundle(), kind: 'feedback', cacheDir: c2, source: 'x' }), /notes\.jsonl is not from the last pull/);

  const c3 = tmpDir();
  fs.mkdirSync(path.join(c3, 'feedback-live'));
  fs.writeFileSync(path.join(c3, 'feedback-live', 'swipes.jsonl'), swipe(1));
  assert.throws(() => writePull({ bundle: bundle(), kind: 'feedback', cacheDir: c3, source: 'x' }), /was not written by a pull/);
});

test('a bad bundle writes nothing: checksum, count, file names, format', async () => {
  const b = bundle();
  b.files['feedback/swipes.jsonl'].content += swipe(7);
  assert.deepEqual(bundleProblems(b), ['feedback/swipes.jsonl: sha256 does not match the manifest']);
  const c = bundle();
  c.files['feedback/swipes.jsonl'].count = 5;
  assert.deepEqual(bundleProblems(c), ['feedback/swipes.jsonl: 2 records, the manifest says 5']);
  const d = bundle();
  d.files['../../etc/passwd'] = file('x', 0);
  assert.deepEqual(bundleProblems(d), ['unexpected file name "../../etc/passwd"']);
  assert.deepEqual(bundleProblems({ files: {} }), ['not an atr-v1-bundle v1 document']);

  served = b;
  const root = tmpDir();
  const r = await atr(root, ['feedback', 'pull', '--url', base]);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /bad export bundle, nothing written/);
  assert.ok(!fs.existsSync(live(root)));
});

test('a wrong token, a missing token or a missing URL fail with a clear message and no secret in it', async () => {
  served = bundle();
  const root = tmpDir();
  const wrong = await atr(root, ['feedback', 'pull', '--url', base], { ATR_EXPORT_TOKEN: 'not-the-token' });
  assert.equal(wrong.status, 1);
  assert.match(wrong.stderr, /refused the export token \(HTTP 401\)/);
  assert.ok(!wrong.stderr.includes('not-the-token'));
  const noUrl = await atr(root, ['feedback', 'pull']);
  assert.match(noUrl.stderr, /--url <site> or ATR_EXPORT_URL/);
  assert.throws(() => readToken({ env: {}, platform: 'linux' }), /set ATR_EXPORT_TOKEN/);
  assert.throws(() => exportUrl('http://example.com'), /only allowed for a local server/);
  assert.equal(exportUrl('https://cvx.example/').href, 'https://cvx.example/ops/export');
});

test('the keychain is read with security(1), the token never on its command line', () => {
  const calls = [];
  const exec = (cmd, args, opts) => { calls.push({ cmd, args, opts }); return `${TOKEN}\n`; };
  assert.equal(readToken({ env: {}, platform: 'darwin', exec }), TOKEN);
  assert.deepEqual(calls[0].args, ['find-generic-password', '-s', KEYCHAIN_SERVICE, '-w']);
  assert.equal(calls[0].opts.stdio[1], 'pipe', 'stdout is captured, not shown');
  assert.equal(readToken({ env: { ATR_EXPORT_TOKEN: 'env-wins' }, platform: 'darwin', exec }), 'env-wins');
  assert.equal(calls.length, 1);
});

test('after a pull, read-only commands use .cache/feedback-live, ./atr game still writes <root>/feedback', async () => {
  served = bundle({ swipes: 3 });
  const root = tmpDir();
  fs.mkdirSync(path.join(root, 'feedback'));
  fs.writeFileSync(path.join(root, 'feedback', 'swipes.jsonl'), swipe(1));
  const probe = (env = {}) => spawnSync(process.execPath, ['--input-type=module', '-e',
    `const m = await import(${JSON.stringify(path.join(PLATFORM, 'lib/paths.js'))}); console.log(JSON.stringify({ ro: m.readOnlyFeedbackDir(), game: m.dataRoots().feedback, fx: m.readOnlyFeedbackDir({ fixtures: true }) }));`],
  { encoding: 'utf8', env: { ...process.env, ATR_ROOT: root, ATR_FEEDBACK_DIR: '', ATR_FIXTURES: '', ...env } });
  const before = JSON.parse(probe().stdout);
  assert.equal(before.ro, path.join(root, 'feedback'));

  assert.equal((await atr(root, ['feedback', 'pull', '--url', base])).status, 0);
  const after = JSON.parse(probe().stdout);
  assert.equal(after.ro, live(root));
  assert.equal(after.game, path.join(root, 'feedback'), 'dataRoots().feedback (what ./atr game writes) is unchanged');
  assert.notEqual(after.fx, live(root), 'fixture mode keeps the fixtures');
  assert.equal(JSON.parse(probe({ ATR_FEEDBACK_DIR: '/x/y' }).stdout).ro, '/x/y');

  const fb = await atr(root, ['feedback', '--json']);
  assert.equal(fb.status, 0, fb.stderr);
  assert.equal(JSON.parse(fb.stdout).totals.swipes, 3, './atr feedback reads the pulled copy');
  const own = await atr(root, ['feedback', '--json', '--dir', path.join(root, 'feedback')]);
  assert.equal(JSON.parse(own.stdout).totals.swipes, 1, '--dir still wins');
});

test('an old pull warns once on stderr', async () => {
  served = bundle();
  const root = tmpDir();
  assert.equal((await atr(root, ['feedback', 'pull', '--url', base])).status, 0);
  const m = path.join(live(root), MANIFEST);
  const old = JSON.parse(fs.readFileSync(m, 'utf8'));
  old.pulledAt = new Date(Date.now() - 30 * 3_600_000).toISOString();
  fs.writeFileSync(m, JSON.stringify(old));
  assert.equal(pullInfo(live(root)).stale, true);
  const r = await atr(root, ['feedback', '--json']);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stderr, /was pulled 30 h ago/);
  JSON.parse(r.stdout);
});
