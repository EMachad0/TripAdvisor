// The platform CLI as a client of the new site (slice I): `./atr trip set|update|delete` through trip:adminWrite
// (lib/trip-cli.js, with a stubbed wrapper script), the site settings (lib/site.js) and the /healthz sha wait
// of `./atr answers publish` (lib/publish.js healthz). No backend is started here.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { PLATFORM } from '../lib/paths.js';
import { buildRequest, loadTripFields, parseRunOutput, tripWrite, COLLECTIONS, FUNCTION, FROZEN_FUNCTION, ID_RE, LIMITS, TripCliError } from '../lib/trip-cli.js';
import { SITE, answerLink, answerPageLink } from '../lib/site.js';
import { healthz, publishAnswers, sh } from '../lib/publish.js';
import { tmpDir } from './helpers.js';

const REPO = path.dirname(PLATFORM);

// ---------------- request checks ----------------
test('the collections, id rule and limits are the server\'s', async () => {
  const shared = await import(path.join(REPO, 'packages/shared/src/trip/constants.ts'));
  assert.deepEqual(COLLECTIONS, [...shared.COLLECTIONS]);
  const src = fs.readFileSync(path.join(REPO, 'apps/web/src/convex/lib/logic/trip.ts'), 'utf8');
  assert.ok(src.includes(`export const ID_RE = ${ID_RE.toString()};`), 'ID_RE matches convex/lib/logic/trip.ts');
  for (const [k, v] of Object.entries(LIMITS)) assert.match(src, new RegExp(`${k}: ${v.toLocaleString('en-US').replaceAll(',', '_')},`), `${k} matches TRIP_WRITE_LIMITS`);
});

test('buildRequest: set (new or given id), update, delete', () => {
  assert.deepEqual(buildRequest('set', ['spend'], '{"amount":120,"currency":"CNY"}'), { col: 'spend', op: 'set', data: { amount: 120, currency: 'CNY' } });
  assert.deepEqual(buildRequest('set', ['tasks', 'visa-china'], '{"title":"Visa"}'), { col: 'tasks', op: 'set', id: 'visa-china', data: { title: 'Visa' } });
  assert.deepEqual(buildRequest('update', ['legs', 'l1'], '{"cities":["beijing"],"note":null}'), { col: 'legs', op: 'update', id: 'l1', data: { cities: ['beijing'], note: null } });
  assert.deepEqual(buildRequest('delete', ['bag', 'adapter']), { col: 'bag', op: 'delete', id: 'adapter' });
});

test('buildRequest refuses what the server would, with the reason', () => {
  const no = (args, re) => assert.throws(() => buildRequest(...args), (e) => e instanceof TripCliError && re.test(e.message), String(args));
  no(['move', ['tasks']], /say what to do/);
  no(['set', []], /say which collection/);
  no(['set', ['flights'], '{}'], /unknown collection "flights"/);
  no(['update', ['tasks'], '{}'], /update needs an id/);
  no(['delete', ['tasks']], /delete needs an id/);
  no(['delete', ['tasks', 'a'], '{}'], /delete takes no --data/);
  no(['set', ['tasks', 'bad id!'], '{}'], /bad id/);
  no(['set', ['tasks', 'a', 'b'], '{}'], /unexpected argument "b"/);
  no(['set', ['tasks']], /needs --data/);
  no(['set', ['tasks'], '{nope'], /--data is not JSON/);
  no(['set', ['tasks'], '[1]'], /data must be an object/);
  no(['set', ['tasks'], '{"id":"x"}'], /put the id after the collection/);
  no(['set', ['tasks'], '{"meta":{"a":1}}'], /meta: must be a string, number, boolean, null/);
  no(['set', ['legs'], '{"cities":[1]}'], /a list may only hold strings/);
  no(['set', ['tasks'], JSON.stringify({ note: 'x'.repeat(LIMITS.maxString + 1) })], /note: too long/);
  no(['set', ['legs'], JSON.stringify({ cities: Array.from({ length: LIMITS.maxList + 1 }, () => 'c') })], /too many items/);
  no(['set', ['tasks'], JSON.stringify(Object.fromEntries(Array.from({ length: LIMITS.maxFields + 1 }, (_, i) => [`f${i}`, 1])))], /too many fields/);
  no(['set', ['tasks'], JSON.stringify(Object.fromEntries(Array.from({ length: 8 }, (_, i) => [`f${i}`, 'é'.repeat(LIMITS.maxString)])))], /body too large/);
});

test('field names are checked against @atr/shared TRIP_FIELDS when packages/ is there', async () => {
  const fields = await loadTripFields(REPO);
  assert.ok(fields && fields.spend && 'amount' in fields.spend);
  assert.throws(() => buildRequest('set', ['spend'], '{"what":"dumplings"}', fields), /spend has no field "what" \(fields: .*note/);
  assert.equal(buildRequest('set', ['spend'], '{"what":"dumplings"}', null).data.what, 'dumplings', 'without the list the backend decides');
  assert.equal(await loadTripFields(tmpDir()), null);
  // every field the real trip files use is known
  for (const col of COLLECTIONS) {
    for (const doc of JSON.parse(fs.readFileSync(path.join(REPO, 'trip', `${col}.json`), 'utf8'))) {
      const { id: _id, ...rest } = doc;
      buildRequest('set', [col, doc.id], JSON.stringify(rest), fields);
    }
  }
});

test('parseRunOutput reads the value convex run prints, after a host line too', () => {
  assert.deepEqual(parseRunOutput('{\n  "ok": true\n}\n'), { ok: true });
  assert.deepEqual(parseRunOutput('convex-prod: api.example\n{\n  "writesFrozen": false\n}\n'), { writesFrozen: false });
  assert.equal(parseRunOutput('nothing here'), undefined);
});

// ---------------- the write path, with a stub wrapper ----------------
/** A checkout with both wrapper scripts present (never run: `run` is stubbed) and a recorder. */
function stubRoot({ frozen = false, write = { code: 0, stdout: JSON.stringify({ ok: true, doc: { id: 'xnew1', amount: 120 } }, null, 2) } } = {}) {
  const root = tmpDir();
  fs.mkdirSync(path.join(root, 'scripts'));
  for (const s of ['convex-prod.sh', 'convex-local.sh']) fs.writeFileSync(path.join(root, 'scripts', s), '#!/bin/sh\nexit 99\n', { mode: 0o755 });
  const calls = [];
  const run = (cmd, args, o) => {
    calls.push({ cmd, args, cwd: o?.cwd });
    if (args.includes(FROZEN_FUNCTION)) return typeof frozen === 'object' ? frozen : { code: 0, stdout: `{\n  "writesFrozen": ${frozen}\n}\n` };
    return write;
  };
  return { root, calls, run };
}
const base = { fields: null, log: () => {} };

test('local: runs convex-local.sh convex run, checks the freeze first, never passes force', async () => {
  const s = stubRoot();
  const r = await tripWrite({ ...base, op: 'set', pos: ['spend'], data: '{"amount":120}', target: 'local', root: s.root, run: s.run });
  assert.equal(r.ok, true);
  assert.equal(r.doc.id, 'xnew1');
  assert.equal(s.calls.length, 2);
  assert.deepEqual(s.calls[0].args, ['convex', 'run', FROZEN_FUNCTION, '{}']);
  assert.equal(s.calls[1].cmd, path.join(s.root, 'scripts/convex-local.sh'));
  assert.deepEqual(s.calls[1].args.slice(0, 3), ['convex', 'run', FUNCTION]);
  assert.deepEqual(JSON.parse(s.calls[1].args[3]), { col: 'spend', op: 'set', data: { amount: 120 } });
  assert.ok(!s.calls[1].args[3].includes('force'));
  assert.equal(s.calls[1].cwd, s.root);
});

test('frozen writes, an unreachable backend and a refused write all say nothing was written', async () => {
  const frozen = stubRoot({ frozen: true });
  await assert.rejects(tripWrite({ ...base, op: 'delete', pos: ['bag', 'a'], target: 'local', root: frozen.root, run: frozen.run }), /writes are frozen on the local backend.*nothing was written/);
  assert.equal(frozen.calls.length, 1, 'adminWrite is never called while frozen');

  const down = stubRoot({ frozen: { code: 1, stdout: '', stderr: 'Error: fetch failed ECONNREFUSED' } });
  await assert.rejects(tripWrite({ ...base, op: 'delete', pos: ['bag', 'a'], target: 'local', root: down.root, run: down.run }), /could not reach the local backend: Error: fetch failed ECONNREFUSED\. Nothing was written/);

  const refused = stubRoot({ write: { code: 1, stdout: '', stderr: '✖ Failed to run function "trip:adminWrite":\nConvexError: [Request ID: abc123] Server Error\n' } });
  await assert.rejects(tripWrite({ ...base, op: 'update', pos: ['tasks', 'nope'], data: '{"status":"done"}', target: 'local', root: refused.root, run: refused.run }), (e) => /refused the write \(ConvexError: Server Error\)\. Nothing was written/.test(e.message) && !/Request ID/.test(e.message));

  const odd = stubRoot({ write: { code: 0, stdout: 'hm' } });
  await assert.rejects(tripWrite({ ...base, op: 'delete', pos: ['bag', 'a'], target: 'local', root: odd.root, run: odd.run }), /answered something unexpected/);
});

test('prod: asks first on a terminal, refuses without one unless --yes; a missing wrapper writes nothing', async () => {
  const s = stubRoot();
  const req = { ...base, op: 'update', pos: ['tasks', 'visa'], data: '{"status":"done"}', target: 'prod', root: s.root, run: s.run };
  await assert.rejects(tripWrite({ ...req, isTTY: false }), /run it in a terminal to confirm, or add --yes/);
  assert.equal(s.calls.filter((c) => c.args.includes(FUNCTION)).length, 0);
  const asked = [];
  await assert.rejects(tripWrite({ ...req, isTTY: true, ask: async (q) => { asked.push(q); return 'n'; } }), /not confirmed; nothing was written/);
  assert.match(asked[0], /write to the live trip data: update tasks\/visa \{"status":"done"\}\? \[y\/N\]/);
  assert.equal((await tripWrite({ ...req, isTTY: true, ask: async () => 'y' })).ok, true);
  assert.equal((await tripWrite({ ...req, yes: true, isTTY: false })).ok, true);
  const writes = s.calls.filter((c) => c.args.includes(FUNCTION));
  assert.equal(writes.length, 2);
  assert.equal(writes[0].cmd, path.join(s.root, 'scripts/convex-prod.sh'));
  assert.deepEqual(writes[0].args.slice(0, 2), ['run', FUNCTION]);

  const bare = tmpDir();
  await assert.rejects(tripWrite({ ...req, root: bare, yes: true, run: () => assert.fail('nothing runs') }), /scripts\/convex-prod\.sh is not in this checkout yet.*nothing was written/);
});

test('--dry-run checks and prints, runs nothing', async () => {
  const r = await tripWrite({ ...base, op: 'set', pos: ['days', '2026-12-25'], data: '{"status":"off"}', dryRun: true, root: tmpDir(), run: () => assert.fail('nothing runs') });
  assert.deepEqual(r.command, ['scripts/convex-prod.sh', 'run', FUNCTION, '{"col":"days","op":"set","id":"2026-12-25","data":{"status":"off"}}']);
});

test('cli: ./atr trip set --dry-run, bad requests and unknown verbs', () => {
  const atr = (args) => spawnSync(path.join(REPO, 'atr'), args, { cwd: REPO, encoding: 'utf8', env: { ...process.env, NO_COLOR: '1' } });
  const ok = atr(['trip', 'set', 'spend', '--data', '{"amount":1,"note":"it\'s"}', '--dry-run']);
  assert.equal(ok.status, 0, ok.stderr);
  assert.match(ok.stdout, /dry run: nothing sent\. Would run on prod:\n {2}scripts\/convex-prod\.sh run trip:adminWrite '\{"col":"spend","op":"set","data":\{"amount":1,"note":"it'\\''s"\}\}'/);
  const json = atr(['trip', 'update', 'tasks', 'visa', '--data', '{"status":"done"}', '--local', '--dry-run', '--json']);
  assert.equal(JSON.parse(json.stdout).target, 'local');
  const bad = atr(['trip', 'update', 'spend', 'x', '--data', '{"what":1}', '--dry-run']);
  assert.equal(bad.status, 1);
  assert.match(bad.stderr, /spend has no field "what"/);
  const verb = atr(['trip', 'push']);
  assert.equal(verb.status, 1);
  assert.match(verb.stderr, /say what to do: \.\/atr trip pull \| set \| update \| delete \(not "push"\)/);
});

// ---------------- the site ----------------
test('site.js: the new app\'s links and its Convex export origin', () => {
  assert.equal(SITE.branch, 'main');
  assert.equal(answerLink('2026-11-21-a b'), `${SITE.url}/places/answers/2026-11-21-a%20b`);
  assert.equal(answerPageLink({ kind: 'area', id: 'kyoto' }, 'a'), `${SITE.url}/area/kyoto#answer-a`);
  assert.equal(answerPageLink({ kind: 'country', id: 'japan' }, 'a'), null);
  assert.match(SITE.exportUrl, /^https:\/\/cvx\./);
});

// ---------------- /healthz sha wait ----------------
const SHA = 'a'.repeat(40), OLD = 'b'.repeat(40);
/** fetch that answers each call with the next body in `seq` (the last one repeats). */
function healthSeq(seq) {
  const urls = [];
  let i = 0;
  const fetchImpl = async (u) => {
    urls.push(String(u));
    const s = seq[Math.min(i++, seq.length - 1)];
    if (s instanceof Error) throw s;
    return { ok: s.status === 200, status: s.status, json: async () => (s.body === undefined ? JSON.parse('not json') : s.body) };
  };
  return { fetchImpl, urls, calls: () => i };
}
const noSleep = async () => {};

test('healthz waits until /healthz reports the merge commit', async () => {
  const h = healthSeq([{ status: 502 }, { status: 200, body: { ok: true, sha: OLD } }, { status: 200, body: { ok: true, sha: SHA } }]);
  const r = await healthz({ fetchImpl: h.fetchImpl, sleep: noSleep, tries: 10, expectSha: SHA, site: SITE });
  assert.equal(r.ok, true);
  assert.equal(r.shaMatched, true);
  assert.equal(h.calls(), 3);
  assert.equal(h.urls[0], `${SITE.url}/healthz`);
});

test('healthz: a site that never reports the sha (or reports none) is not up', async () => {
  const stale = await healthz({ ...healthSeq([{ status: 200, body: { ok: true, sha: OLD } }]), sleep: noSleep, tries: 4, expectSha: SHA, site: SITE });
  assert.equal(stale.ok, false);
  assert.equal(stale.sha, OLD);
  const none = await healthz({ ...healthSeq([{ status: 200, body: { ok: true } }]), sleep: noSleep, tries: 2, expectSha: SHA, site: SITE });
  assert.equal(none.ok, false);
  assert.equal(none.shaMissing, true);
  const down = await healthz({ ...healthSeq([new Error('boom')]), sleep: noSleep, tries: 2, expectSha: SHA, site: SITE });
  assert.deepEqual(down, { ok: false, error: 'boom' });
});

test('healthz without an expected sha: 200 is enough', async () => {
  const plain = await healthz({ fetchImpl: async () => ({ ok: true, status: 200 }), sleep: noSleep, tries: 1 });
  assert.equal(plain.ok, true);
  assert.equal(plain.shaMissing, true);
});

/** A bare origin and a clone holding the site fixtures (places, areas, answers); gh is stubbed, ssh must not run. */
function fakeRepo() {
  const dir = tmpDir();
  const git = (cwd, ...args) => { const r = spawnSync('git', ['-C', cwd, ...args], { encoding: 'utf8' }); assert.equal(r.status, 0, r.stderr); return r.stdout.trim(); };
  const origin = path.join(dir, 'origin.git'), work = path.join(dir, 'work');
  git(dir, 'init', '-q', '--bare', '-b', 'main', origin);
  git(dir, 'clone', '-q', origin, work);
  for (const d of ['places', 'areas', 'answers']) fs.cpSync(path.join(PLATFORM, 'test/site-fixtures', d), path.join(work, d), { recursive: true });
  git(work, 'config', 'user.name', 't'); git(work, 'config', 'user.email', 't@t');
  git(work, 'add', '-A'); git(work, 'commit', '-q', '-m', 'seed'); git(work, 'push', '-q', 'origin', 'main');
  const calls = [];
  const run = (cmd, args, o = {}) => {
    calls.push([cmd, ...args]);
    if (cmd === 'ssh') assert.fail('nothing goes over ssh');
    if (cmd === 'gh') {
      if (args[0] === 'auth') return { code: 0, stdout: '', stderr: '' };
      if (args[1] === 'create') return { code: 0, stdout: 'https://github.com/x/y/pull/9', stderr: '' };
      if (args[1] === 'merge') {
        const create = calls.find((c) => c[0] === 'gh' && c[2] === 'create');
        const m = path.join(dir, 'merge');
        fs.rmSync(m, { recursive: true, force: true });
        git(dir, 'clone', '-q', origin, m);
        git(m, '-c', 'user.name=gh', '-c', 'user.email=gh@gh', 'merge', '-q', '--no-ff', '-m', 'Merge', `origin/${create[create.indexOf('--head') + 1]}`);
        git(m, 'push', '-q', 'origin', 'main');
        return { code: 0, stdout: '', stderr: '' };
      }
      if (args[1] === 'view') return { code: 0, stdout: JSON.stringify({ state: 'MERGED', mergeCommit: { oid: git(origin, 'rev-parse', 'main') } }), stderr: '' };
    }
    return sh(cmd, args, o);
  };
  return { dir, origin, work, git, run };
}

test('publish: waits for /healthz to report the merge commit, prints the new card link', async () => {
  const r = fakeRepo();
  const file = path.join(r.dir, '2026-11-25-kyoto-temples.md');
  fs.writeFileSync(file, '---\nquestion: Which temples first?\nasked: 2026-11-25\nabout: kyoto\ntldr: Fushimi Inari at 07:00 UTC+9.\n---\n');
  let merged = null;
  const seen = [];
  // the site serves the previous commit twice, then the merge commit
  const fetchImpl = async (u) => {
    merged ??= r.git(r.origin, 'rev-parse', 'main');
    seen.push(String(u));
    const sha = seen.length < 3 ? OLD : merged;
    return { ok: true, status: 200, json: async () => ({ ok: true, sha }) };
  };
  const lines = [];
  const res = await publishAnswers({ root: r.work, run: r.run, fetchImpl, sleep: noSleep, log: (l) => lines.push(l), dataOpts: { includeFixtures: true }, site: SITE, files: [file] });
  assert.equal(res.ok, true);
  assert.equal(res.live, true);
  assert.equal(res.health.sha, res.sha);
  assert.equal(seen.length, 3);
  assert.equal(res.deploy, undefined, 'no Coolify deploy is followed');
  const out = lines.join('\n');
  assert.match(out, new RegExp(`waiting until ${SITE.url.replaceAll('.', '\\.')}/healthz reports ${res.sha.slice(0, 7)}`));
  assert.match(out, new RegExp(`the site serves ${res.sha.slice(0, 7)} \\(/healthz 200\\): the card is live\\.`));
  assert.ok(res.links.includes(`${SITE.url}/places/answers/2026-11-25-kyoto-temples`));
});

test('publish: a site stuck on the old commit is reported as not confirmed, never live', async () => {
  const r = fakeRepo();
  const file = path.join(r.dir, '2026-11-25-kyoto-temples.md');
  fs.writeFileSync(file, '---\nquestion: Which temples first?\nasked: 2026-11-25\nabout: kyoto\ntldr: Fushimi Inari.\n---\n');
  let n = 0;
  const fetchImpl = async () => { n++; return { ok: true, status: 200, json: async () => ({ ok: true, sha: OLD }) }; };
  const lines = [];
  const res = await publishAnswers({ root: r.work, run: r.run, fetchImpl, sleep: noSleep, log: (l) => lines.push(l), dataOpts: { includeFixtures: true }, site: SITE, files: [file], deployTimeoutMs: 60e3 });
  assert.equal(res.live, false);
  assert.equal(n, 6, 'polls for the whole deploy timeout (60 s / 10 s)');
  assert.match(lines.join('\n'), /deploy not confirmed: \/healthz still reports bbbbbbb, not [0-9a-f]{7}/);
  assert.doesNotMatch(lines.join('\n'), /the card is live/);
});
