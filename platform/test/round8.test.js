// Round 8: fixes from real runs — runner attribution / cost / gates, area reviews, curator friction.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { parse } from 'yaml';
import { ROOT, FIXTURES } from '../lib/paths.js';
import * as api from '../lib/index.js';
import { commandWrites, commandWritesFile } from '../lib/attribution.js';
import { attributeChanges, ownContent, systemPrompt, fixPrompt } from '../lib/runner.js';
import { sessionCost, reviewPlace, reviewStatus, loadReviews, reviewPrompt, reviewTargets } from '../lib/review.js';
import { gapReport } from '../lib/gaps.js';
import { nextTasks } from '../lib/next.js';
import { validatePlace, validateArea } from '../lib/validate.js';
import { renderPlacePage, renderAreaPage } from '../lib/render/index.js';
import { slugify, folderSlug, fetchCommonsMany } from '../lib/media/index.js';
import { placeTemplate } from '../lib/scaffold.js';
import { checkUrl, linkIssue } from '../lib/links.js';
import { geoSearch, formatGeo } from '../lib/geo.js';
import { renderUrlProblem, tidyText, renderPage } from '../lib/pageview.js';
import { mustDoStatus, formatStatedTaste } from '../lib/taste.js';
import { fixturePlace, fixtureCredits, fixtureMedia, tmpDir } from './helpers.js';

const atr = (args, env = {}) => spawnSync(path.join(ROOT, 'atr'), args, { cwd: ROOT, encoding: 'utf8', env: { ...process.env, NO_COLOR: '1', ATR_OFFLINE: '1', ...env } });
const errors = (issues) => issues.filter((i) => i.level === 'error');
const yuCtx = () => ({ credits: fixtureCredits(), mediaFiles: fixtureMedia(), fixtureMode: true, now: '2026-11-10', knownIds: new Set(['yu-garden', 'nanxiang-mantou-dian', 'the-bund']) });
const OUT = { facts: { supported: 9, unsupported: 1, contradicted: 1 }, issues: [{ severity: 'blocker', field: 'hours.summary', problem: 'Page says 23:00; the operator says 22:30.', evidence: 'https://example.org/t', fix: 'Change to 22:30.' }], summary: 'One wrong closing time.' };
const PASS = { ...OUT, issues: [] };

async function withEnv(env, fn) {
  const old = Object.fromEntries(Object.keys(env).map((k) => [k, process.env[k]]));
  Object.assign(process.env, env);
  try { return await fn(); } finally { for (const [k, v] of Object.entries(old)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; } }
}

/**
 * A data root with one valid place ("mine") and a fake claude that follows a script, one entry per call:
 * { result, structured_output, total (cumulative total_cost_usd), since (cost of this call), file: 'valid' | 'broken' | 'touch', bash: [commands], also: [paths to create without any tool event] }
 */
function scriptedRoot(script, { withArea = false } = {}) {
  const root = tmpDir();
  const dir = path.join(root, 'places/china/shanghai/nanxiang-mantou-dian');
  fs.cpSync(path.join(FIXTURES, 'places/china/shanghai/nanxiang-mantou-dian'), dir, { recursive: true });
  const file = path.join(dir, 'place.yaml');
  const valid = fs.readFileSync(file, 'utf8').replace(/^fixture: true\n/m, '');
  fs.writeFileSync(file, valid);
  let areaFile;
  if (withArea) {
    fs.cpSync(path.join(FIXTURES, 'areas/china/media'), path.join(root, 'areas/china/media'), { recursive: true });
    areaFile = path.join(root, 'areas/china/harbin.yaml');
    fs.writeFileSync(areaFile, fs.readFileSync(path.join(FIXTURES, 'areas/china/harbin.yaml'), 'utf8').replace(/^fixture: true\n/m, '').replace(/^must_do: .*\n/m, ''));
  }
  fs.writeFileSync(path.join(root, 'script.json'), JSON.stringify({ script, file, valid, areaFile }));
  const fake = path.join(root, 'fake-claude.mjs');
  fs.writeFileSync(fake, `#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
const root = ${JSON.stringify(root)};
const { script, file, valid, areaFile } = JSON.parse(fs.readFileSync(root + '/script.json', 'utf8'));
const log = root + '/calls.log';
const n = fs.existsSync(log) ? fs.readFileSync(log, 'utf8').trim().split('\\n').length : 0;
const args = process.argv.slice(2);
const kind = args.includes('--json-schema') ? 'review' : 'curator';
fs.appendFileSync(log, kind + (args.includes('--resume') ? ':resume' : '') + '\\n');
fs.writeFileSync(root + '/prompt-' + n + '.txt', args[args.indexOf('-p') + 1]);
const a = script[n] || { result: 'done' };
const content = [];
const target = a.target === 'area' ? areaFile : file;
if (a.file === 'broken') fs.writeFileSync(file, valid.replace(/^why: .*$/m, 'why: short'));
if (a.file === 'valid') fs.writeFileSync(file, valid + '\\n# fixed ' + n + '\\n');
if (a.file === 'touch') fs.appendFileSync(target, '\\n# touched ' + n + '\\n');
if (a.file) content.push({ type: 'tool_use', name: 'Edit', input: { file_path: a.file === 'touch' ? target : file } });
for (const p of a.also || []) { fs.mkdirSync(path.dirname(path.join(root, p)), { recursive: true }); fs.writeFileSync(path.join(root, p), 'id: x\\n'); }
for (const c of a.bash || []) content.push({ type: 'tool_use', name: 'Bash', input: { command: c } });
console.log(JSON.stringify({ type: 'system', subtype: 'init', session_id: 'sess-' + kind, model: 'fake-model' }));
if (content.length) console.log(JSON.stringify({ type: 'assistant', message: { content } }));
console.log(JSON.stringify({ type: 'result', session_id: 'sess-' + kind, result: a.result ?? '', structured_output: a.structured_output, total_cost_usd: a.total ?? 0.1, model_usage_since_last_result: a.since === undefined ? undefined : { 'fake-model': { costUSD: a.since } }, num_turns: 1 }));
`);
  fs.chmodSync(fake, 0o755);
  return { root, file, areaFile, fake, calls: () => fs.readFileSync(path.join(root, 'calls.log'), 'utf8').trim().split('\n'), prompt: (n) => fs.readFileSync(path.join(root, `prompt-${n}.txt`), 'utf8') };
}
const brokenScaffold = (root, id) => { const d = path.join(root, 'places/china/shanghai', id); fs.mkdirSync(d, { recursive: true }); fs.writeFileSync(path.join(d, 'place.yaml'), `id: ${id}\nname: TODO\ncountry: china\ncity: shanghai\n`); };

// ───────────────────────── 1. runner ─────────────────────────
test('runner 1.1: a run is judged on its own files; another curator\'s broken scaffold is listed once and never sent to the session', async () => {
  const s = scriptedRoot([{ result: 'added', file: 'touch', bash: ['./atr validate --all'] }, { structured_output: OUT }, { result: 'fixed', file: 'touch' }, { structured_output: PASS }]);
  brokenScaffold(s.root, 'someone-elses-hostel');
  await withEnv({ ATR_DATA_ROOT: s.root, ATR_CLAUDE_BIN: s.fake }, async () => {
    const { runCurator } = await import('../lib/runner.js');
    const logs = [];
    const r = await runCurator({ task: 'test', maxRounds: 3, links: false, log: (x) => logs.push(x) });
    assert.deepEqual(s.calls(), ['curator', 'review', 'curator:resume', 'review'], 'review → fix → re-review, no wasted rounds');
    assert.equal(r.clean, true);
    assert.deepEqual(r.rounds.map((x) => x.errors), [0, 0], "the other curator's errors are not this run's");
    assert.equal(r.other_errors.length, 1);
    assert.match(r.other_errors[0].file, /someone-elses-hostel\/place\.yaml$/);
    assert.ok(r.other_errors[0].errors > 5);
    assert.match(r.other_errors_note, /Not counted against this run and never sent to the session/);
    assert.doesNotMatch(s.prompt(2), /someone-elses-hostel/);
    assert.equal(logs.filter((l) => /did not touch/.test(l)).length, 1, 'said once');
    assert.equal(r.why_not_clean, undefined);
    fs.rmSync(r.dir, { recursive: true, force: true });
  });
  assert.match(systemPrompt(), /fix every error in the files YOU created or changed\. Other curators work in this repo at the same time: if a file you did not touch has errors, leave it alone and mention it in your report/);
  assert.match(fixPrompt('x'), /leave other curators' files alone/);
});

test('runner 1.2: attribution comes only from the session\'s own writes; reading a file is not touching it', async () => {
  // Bash commands from the real run that was wrongly credited with the beijing area
  assert.equal(commandWrites('ls -la areas/china/ && date && head -5 areas/china/beijing.yaml; ls areas/china/media 2>/dev/null', 'beijing'), false);
  assert.equal(commandWrites('cat areas/china/beijing.yaml && ./atr taste 2>&1 | grep -A3 great-wall', 'beijing'), false);
  assert.equal(commandWrites('./atr validate beijing --json | python3 -c "import json,sys; print(json.load(sys.stdin))"', 'beijing'), false, 'piping a read into a script');
  assert.equal(commandWrites('./atr shot beijing > /dev/null', 'beijing'), false);
  assert.equal(commandWrites('./atr links beijing --fresh', 'beijing'), false);
  // mutating atr commands, redirects, mv/cp/rm, sed -i, inline scripts
  assert.equal(commandWrites('./atr media fetch --area beijing "File:Meridian Gate in snow.jpg" --as meridian-gate-snow 2>&1 | tail -2', 'beijing'), true);
  assert.equal(commandWrites('./atr media prune dujiangyan-zhongshuge-bookstore --yes', 'dujiangyan-zhongshuge-bookstore'), true);
  assert.equal(commandWrites('./atr new place --country china --city chengdu --name "Dujiangyan Zhongshuge Bookstore" --category views', 'dujiangyan-zhongshuge-bookstore'), true, '--name slugs to the id');
  assert.equal(commandWrites('./atr new area --country china --name "Beijing" --id beijing', 'beijing'), true);
  assert.equal(commandWrites('f=areas/china/beijing.yaml && python3 - "$f" <<\'EOF\'\nimport sys\np=sys.argv[1];s=open(p).read()\nopen(p,"w").write(s)\nEOF', 'beijing'), true, 'inline script reached through a shell variable');
  assert.equal(commandWrites('sed -i "" "s/a/b/" places/china/chengdu/foo/place.yaml', 'foo'), true);
  assert.equal(commandWrites('echo "- note" >> places/_friction.md', 'places/_friction.md'), true);
  assert.equal(commandWrites('mv places/china/x/old-name places/china/x/new-name', 'new-name'), true);
  assert.equal(commandWrites('rm -rf places/china/x/gone', 'gone'), true);
  assert.equal(commandWrites('grep -rn foo places/ > /tmp/out.txt', 'foo'), false, 'the redirect target is elsewhere');
  const content = { places: { created: ['mine'], changed: [], deleted: [] }, areas: { created: ['beijing'], changed: ['chongqing'], deleted: [] } };
  const writes = { files: new Set([path.join(ROOT, 'places/china/chengdu/mine/place.yaml')]), commands: ['head -5 areas/china/beijing.yaml', 'cat areas/china/chongqing.yaml'] };
  assert.deepEqual(ownContent(content, writes), { places: { created: ['mine'], changed: [], deleted: [] }, areas: { created: [], changed: [], deleted: [] } });

  // end to end: an area appears during the run (another curator) and the session only reads it
  const s = scriptedRoot([{ result: 'added', file: 'touch', also: ['areas/china/beijing.yaml'], bash: ['ls -la areas/china/ && head -5 areas/china/beijing.yaml'] }]);
  await withEnv({ ATR_DATA_ROOT: s.root, ATR_CLAUDE_BIN: s.fake }, async () => {
    const { runCurator } = await import('../lib/runner.js');
    const r = await runCurator({ task: 'test', links: false, review: false, log: () => {} });
    assert.deepEqual(r.content.areas.created, [], 'not in what the run did');
    assert.deepEqual(r.also_changed_in_repo.areas.created, ['beijing'], 'kept apart, named as not this session');
    assert.match(r.also_changed_in_repo_note, /NOT by this session/);
    assert.deepEqual(r.pages.map((p) => `${p.type}:${p.id}`), ['place:nanxiang-mantou-dian'], 'but it is not this session\'s page');
    assert.equal(r.clean, true, 'and its errors do not count');
    assert.match(r.other_errors[0].file, /beijing\.yaml$/);
    fs.rmSync(r.dir, { recursive: true, force: true });
  });
});

test('runner 1.3: reading a review (or any protected file) is not a violation', () => {
  const writes = { files: new Set(), commands: ["cat reviews/liziba-station.yaml && find places -path '*liziba-station*' -name place.yaml | xargs cat -n", 'cat docs/CURATOR-GUIDE.md | head -40', 'grep -n fame platform/lib/schema/specs.js'] };
  const { violations, elsewhere } = attributeChanges(['reviews/liziba-station.yaml', 'docs/CURATOR-GUIDE.md', 'platform/lib/schema/specs.js'], writes);
  assert.deepEqual(violations, []);
  assert.equal(elsewhere.length, 3);
  assert.equal(commandWritesFile('echo x > reviews/liziba-station.yaml', 'reviews/liziba-station.yaml'), true);
  assert.equal(commandWritesFile('cd docs && rm CURATOR-GUIDE.md', 'docs/CURATOR-GUIDE.md'), true);
  assert.equal(commandWritesFile('rm -rf docs', 'docs/x.md', { deleted: true }), true);
  // the runner's own review files are filtered out before attribution (see runCurator: runnerWrote)
  const src = fs.readFileSync(path.join(ROOT, 'platform/lib/runner.js'), 'utf8');
  assert.match(src, /runnerWrote\.has\(/);
});

test('runner 1.4: total_cost_usd of a resumed session is cumulative; rounds and the total report the true cost', async () => {
  assert.equal(sessionCost({ total_cost_usd: 1.632 }, undefined), 1.632);
  assert.ok(Math.abs(sessionCost({ total_cost_usd: 2.523 }, 1.632) - 0.891) < 1e-9, 'delta from the previous total');
  assert.equal(sessionCost({ total_cost_usd: 2.523, model_usage_since_last_result: { a: { costUSD: 0.8 }, b: { costUSD: 0.09 } } }, 1.632), 0.89, 'model_usage_since_last_result wins');
  assert.equal(sessionCost({ total_cost_usd: 0.4 }, 1), 0.4, 'a smaller total is a new session');
  assert.equal(sessionCost({}, 1), undefined);
  // the three rounds of the real run: 1.632, 2.523, 3.013 cumulative
  const s = scriptedRoot([{ result: 'added', file: 'broken', total: 1.632 }, { result: 'again', file: 'broken', total: 2.523 }, { result: 'fixed', file: 'valid', total: 3.013, since: 0.49 }]);
  await withEnv({ ATR_DATA_ROOT: s.root, ATR_CLAUDE_BIN: s.fake }, async () => {
    const { runCurator } = await import('../lib/runner.js');
    const r = await runCurator({ task: 'test', maxRounds: 3, links: false, review: false, log: () => {} });
    assert.deepEqual(r.rounds.map((x) => x.cost), [1.632, 0.891, 0.49]);
    assert.deepEqual(r.rounds.map((x) => x.cost_session_total), [1.632, 2.523, 3.013]);
    assert.equal(r.cost, 3.013, 'not 7.17');
    assert.equal(r.clean, true);
    fs.rmSync(r.dir, { recursive: true, force: true });
  });
});

test('runner 1.5: after a review-fix round the page is re-reviewed even if the fix first broke validation; a run that ends not clean says why per page', async () => {
  // curator → review: fix → curator breaks its own file → validate error → curator fixes → re-review: pass
  const a = scriptedRoot([{ result: 'added', file: 'touch' }, { structured_output: OUT }, { result: 'oops', file: 'broken' }, { result: 'fixed', file: 'valid' }, { structured_output: PASS }]);
  await withEnv({ ATR_DATA_ROOT: a.root, ATR_CLAUDE_BIN: a.fake }, async () => {
    const { runCurator } = await import('../lib/runner.js');
    const r = await runCurator({ task: 'test', maxRounds: 1, links: false, log: () => {} });
    assert.deepEqual(a.calls(), ['curator', 'review', 'curator:resume', 'curator:resume', 'review']);
    assert.equal(r.clean, true);
    assert.deepEqual(r.rounds.map((x) => x.errors), [0, 1, 0]);
    assert.match(a.prompt(3), /still reports errors in the files you created or changed/);
    assert.equal(r.pages[0].review, 'pass');
    fs.rmSync(r.dir, { recursive: true, force: true });
  });
  // still "fix" after the feedback round: not clean, with the reason in plain words
  const b = scriptedRoot([{ result: 'added', file: 'touch' }, { structured_output: OUT }, { result: 'tried', file: 'touch' }, { structured_output: OUT }]);
  await withEnv({ ATR_DATA_ROOT: b.root, ATR_CLAUDE_BIN: b.fake }, async () => {
    const { runCurator } = await import('../lib/runner.js');
    const r = await runCurator({ task: 'test', links: false, log: () => {} });
    assert.equal(r.clean, false);
    assert.deepEqual(r.why_not_clean, ['nanxiang-mantou-dian: review still has 1 open issue: hours.summary (blocker); see reviews/nanxiang-mantou-dian.yaml']);
    assert.deepEqual(r.pages[0].problems, ['review still has 1 open issue: hours.summary (blocker); see reviews/nanxiang-mantou-dian.yaml']);
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(r.dir, 'summary.json'), 'utf8')).why_not_clean, r.why_not_clean);
    fs.rmSync(r.dir, { recursive: true, force: true });
  });
  // validation never gets clean: the reason names the error
  const c = scriptedRoot([{ result: 'added', file: 'broken' }, { result: 'again', file: 'broken' }]);
  await withEnv({ ATR_DATA_ROOT: c.root, ATR_CLAUDE_BIN: c.fake }, async () => {
    const { runCurator } = await import('../lib/runner.js');
    const r = await runCurator({ task: 'test', maxRounds: 2, links: false, review: false, log: () => {} });
    assert.equal(r.clean, false);
    assert.match(r.why_not_clean[0], /^nanxiang-mantou-dian: 1 validation error: why: is 5 characters, too short/);
    assert.equal(r.pages[0].validation, '1 error(s)');
    fs.rmSync(r.dir, { recursive: true, force: true });
  });
});

// ───────────────────────── 2. reviewer covers areas ─────────────────────────
test('review: an area is reviewed like a place; reviews/<id>.yaml carries type: area; gaps, next and the runner gate follow', async () => {
  assert.match(reviewPrompt('harbin', path.join(ROOT, 'areas/china/harbin.yaml'), { type: 'area' }), /Review the AREA page `harbin`.*section "Reviewing an area".*\.\/atr shot harbin --area/);
  assert.match(fs.readFileSync(path.join(ROOT, 'docs/REVIEWER-GUIDE.md'), 'utf8'), /## Reviewing an area[\s\S]*getting_there[\s\S]*days_suggested[\s\S]*winter_note/);
  const areaOut = { ...OUT, issues: [{ severity: 'blocker', field: 'getting_there', problem: 'Says 3 h from Beijing; the fastest train takes 4 h 40.', evidence: 'https://example.org/rail', fix: 'Change to about 5 h.' }] };
  const s = scriptedRoot([{ structured_output: areaOut, total: 0.4 }, { result: 'edited the area', file: 'touch', target: 'area' }, { structured_output: PASS }], { withArea: true });
  await withEnv({ ATR_DATA_ROOT: s.root, ATR_CLAUDE_BIN: s.fake }, async () => {
    const r = await reviewPlace({ id: 'harbin', runDir: path.join(s.root, 'runs') });
    assert.deepEqual([r.type, r.verdict], ['area', 'fix']);
    const saved = parse(fs.readFileSync(path.join(s.root, 'reviews/harbin.yaml'), 'utf8'));
    assert.equal(saved.type, 'area');
    assert.match(s.prompt(0), /Review the AREA page `harbin`/);
    const [area] = api.loadAreas({});
    assert.equal(reviewStatus(area, loadReviews({})).state, 'fix');
    assert.equal(reviewStatus({ id: 'harbin', category: 'culture' }, loadReviews({})).state, 'none', 'a place with the same id is not covered by an area review');
    const g = gapReport({ config: { countries: [{ id: 'china', days: 27 }] }, taste: null, now: '2026-11-10', linkCache: {} }).items.filter((i) => i.kind === 'review');
    assert.deepEqual(g.filter((i) => i.id).map((i) => [i.severity, i.id, i.area]), [['high', 'harbin', true]]);
    assert.match(g.find((i) => !i.id).message, /1 never reviewed \(nanxiang-mantou-dian\)/);
    const tasks = nextTasks({ config: { countries: [] }, taste: null, now: '2026-11-10', linkCache: {}, feedback: { swipes: [], duels: [], questions: [] }, seen: null, validation: { results: [] }, count: 10 }).tasks;
    assert.match(tasks[0].task, /^Fix review findings on harbin: getting_there: Says 3 h from Beijing/);
    assert.deepEqual(reviewTargets({ changed: true }).sort(), ['nanxiang-mantou-dian']);
    // old review files without `type` stay valid and count as place reviews
    fs.writeFileSync(path.join(s.root, 'reviews/nanxiang-mantou-dian.yaml'), `id: nanxiang-mantou-dian\nreviewed: 2026-11-10\nverdict: pass\ncontent_hash: ${api.contentHash(s.file)}\nfacts: { supported: 1, unsupported: 0, contradicted: 0 }\nissues: []\nsummary: ok\n`);
    assert.equal(reviewStatus(api.loadPlaces({})[0], loadReviews({})).state, 'pass');
    // runner gate: a changed area is reviewed too
    fs.rmSync(path.join(s.root, 'reviews/harbin.yaml'));
    const { runCurator } = await import('../lib/runner.js');
    const run = await runCurator({ task: 'test', links: false, log: () => {} });
    assert.deepEqual(s.calls(), ['review', 'curator', 'review']);
    assert.deepEqual(run.pages.map((p) => [p.type, p.id, p.review]), [['area', 'harbin', 'pass']]);
    assert.match(s.prompt(2), /Review the AREA page `harbin`/);
    fs.rmSync(run.dir, { recursive: true, force: true });
  });
  assert.equal(JSON.parse(fs.readFileSync(path.join(ROOT, 'platform/schema/review.schema.json'), 'utf8')).properties.type.enum.join(), 'place,area');
});

// ───────────────────────── 3. friction ─────────────────────────
test('3.1 slugs: apostrophes are dropped, and `new` accepts --id', () => {
  assert.equal(slugify("Jiefangbei New Year's Eve Countdown"), 'jiefangbei-new-years-eve-countdown');
  assert.equal(slugify('Xi’an City Wall'), 'xian-city-wall');
  const root = tmpDir();
  const env = { ATR_DATA_ROOT: root };
  assert.equal(atr(['new', 'place', '--country', 'china', '--city', 'chongqing', '--name', "Jiefangbei New Year's Eve Countdown"], env).status, 0);
  assert.ok(fs.existsSync(path.join(root, 'places/china/chongqing/jiefangbei-new-years-eve-countdown/place.yaml')));
  const r = atr(['new', 'place', '--country', 'china', '--city', 'chongqing', '--name', 'Hongyadong Night Market', '--id', 'hongyadong'], env);
  assert.equal(r.status, 0, r.stderr);
  const text = fs.readFileSync(path.join(root, 'places/china/chongqing/hongyadong/place.yaml'), 'utf8');
  assert.match(text, /^id: hongyadong /m);
  assert.match(text, /^name: "Hongyadong Night Market"/m);
  assert.match(text, /\.\/atr validate places\/china\/chongqing\/hongyadong/);
  assert.match(atr(['new', 'area', '--country', 'japan', '--name', 'Kansai Region', '--id', 'Kansai!'], env).stderr, /--id "Kansai!" is not a valid slug/);
  assert.equal(atr(['new', 'area', '--country', 'japan', '--name', 'Kansai Region', '--id', 'kansai'], env).status, 0);
  assert.ok(fs.existsSync(path.join(root, 'areas/japan/kansai.yaml')));
});

test('3.2–3.3 media: a CJK-only query gets its own preview folder; several files fetch in one paced call; area credits are recorded', async () => {
  assert.equal(folderSlug('Yu Garden Shanghai'), 'yu-garden-shanghai');
  const a = folderSlug('哈尔滨冰雪大世界'), b = folderSlug('慕田峪长城');
  assert.match(a, /^q-[a-z0-9]+$/);
  assert.notEqual(a, b);
  assert.equal(folderSlug('哈尔滨冰雪大世界'), a, 'stable');
  const calls = [];
  const fetchOne = async (ref, dir, o) => { calls.push([ref, o.name, o.area]); if (/Bad/.test(ref)) throw new Error('Rejected File:Bad.jpg: non-free license'); return { file: o.name || 'x', widths: [640], license: 'CC0', author: 'A' }; };
  const seen = [];
  const rs = await fetchCommonsMany([{ ref: 'File:A.jpg', name: 'a' }, { ref: 'File:Bad.jpg', name: 'bad' }, { ref: 'File:C.jpg' }], '/tmp/none', { area: 'harbin', gapMs: 1, fetchOne, onItem: (r, i, n) => seen.push(`${i + 1}/${n}`) });
  assert.deepEqual(calls, [['File:A.jpg', 'a', 'harbin'], ['File:Bad.jpg', 'bad', 'harbin'], ['File:C.jpg', undefined, 'harbin']]);
  assert.deepEqual(rs.map((r) => (r.credit ? r.credit.file : r.error)), ['a', 'Rejected File:Bad.jpg: non-free license', 'x'], 'one failure does not stop the rest');
  assert.deepEqual(seen, ['1/3', '2/3', '3/3']);
  const help = atr(['media', '--help']).stdout;
  assert.match(help, /"File:A\.jpg" --as a "File:B\.jpg" --as b/);
  assert.match(atr(['media', 'fetch', 'yu-garden', 'File:A.jpg', '--as', 'a', '--as', 'b', '--fixtures']).stderr, /2 --as names for 1 file/);
  const src = fs.readFileSync(path.join(ROOT, 'platform/lib/media/index.js'), 'utf8');
  assert.match(src, /progress\(`rate-limited \(\$\{reason\}\) while \$\{what\}; next try in /, 'a visible retry line (round 11A wording)');
});

test('3.10 area media: list and prune --area only touch photos recorded for that area', () => {
  const root = tmpDir();
  const dir = path.join(root, 'areas/china');
  fs.cpSync(path.join(FIXTURES, 'areas/china'), dir, { recursive: true });
  for (const f of ['harbin.yaml', 'xian.yaml', 'shanghai.yaml', 'dali.yaml']) fs.writeFileSync(path.join(dir, f), fs.readFileSync(path.join(dir, f), 'utf8').replace(/^fixture: true\n/m, '').replace(/^must_do: .*\n/m, ''));
  const cf = path.join(dir, 'media/credits.yaml');
  const base = parse(fs.readFileSync(cf, 'utf8'))[0];
  const mk = (file, area) => { fs.copyFileSync(path.join(dir, 'media/snow-sculpture-640.webp'), path.join(dir, `media/${file}-640.webp`)); return { ...base, file, widths: [640], ...(area ? { area } : {}) }; };
  fs.writeFileSync(cf, JSON.stringify([base, mk('harbin-old', 'harbin'), mk('xian-wall', 'xian'), mk('mystery')]));
  const env = { ATR_DATA_ROOT: root };
  const list = atr(['media', 'list', '--area', 'harbin'], env).stdout;
  assert.match(list, /snow-sculpture/);
  assert.match(list, /harbin-old.*not used/);
  assert.doesNotMatch(list, /^xian-wall/m);
  assert.match(list, /2 other photo\(s\).*1 of them have no area recorded: mystery/);
  const dry = atr(['media', 'prune', '--area', 'harbin'], env).stdout;
  assert.match(dry, /not used by the page: harbin-old\n/);
  assert.match(dry, /not touched: mystery/);
  const done = atr(['media', 'prune', '--area', 'harbin', '--yes'], env);
  assert.equal(done.status, 0, done.stderr);
  const left = parse(fs.readFileSync(cf, 'utf8')).map((c) => c.file);
  assert.deepEqual(left, ['snow-sculpture', 'xian-wall', 'mystery'], "other areas' photos and untagged ones stay");
  assert.ok(!fs.existsSync(path.join(dir, 'media/harbin-old-640.webp')));
  assert.ok(fs.existsSync(path.join(dir, 'media/snow-sculpture-640.webp')), 'the shared photo every card uses is kept');
  assert.equal(atr(['validate', '--all'], env).status, 0, 'credits with `area` stay valid');
});

test('3.4 long text in the hero: info hints, wrapping chips, a scrim attached to the text block', () => {
  const p = { ...fixturePlace(), area: "Nan'an · Nanbin Road and Changjiahui, facing Chaotianmen", name: 'Shanghai Christmas Markets at Jing An Kerry Centre and the Bund Finance Center' };
  const issues = validatePlace(p, yuCtx());
  const a = issues.find((i) => i.path === 'area'), n = issues.find((i) => i.path === 'name');
  assert.deepEqual([a.level, n.level], ['info', 'info']);
  assert.match(a.message, /area is 56 characters; the hero chip wraps/);
  assert.match(n.hint, /shorten, or set `short_name`/);
  assert.ok(!validatePlace(fixturePlace(), yuCtx()).some((i) => i.path === 'area' || i.path === 'name'));
  const area = parse(fs.readFileSync(path.join(FIXTURES, 'areas/china/harbin.yaml'), 'utf8'));
  const r = validateArea({ ...area, region: 'Chongqing Municipality · Southwest China, where the rivers meet' }, { fixtureMode: true, now: '2026-11-10' }).find((i) => i.path === 'region');
  assert.equal(r.level, 'info');
  const css = fs.readFileSync(path.join(ROOT, 'platform/lib/render/assets/atr.css'), 'utf8');
  assert.match(css, /\.hero \.chip \{ white-space: normal; max-width: 100%/);
  assert.match(css, /\.hero__content \{[^}]*background: linear-gradient\(0deg, rgba\(10, 8, 5, \.9\) 0%/, 'the scrim is on the text block');
  assert.match(css, /\.area-card__media img \{ position: absolute; inset: 0;/, '3.12: same image height on every area card');
});

test('3.5–3.7 estimate, approximate pins and must_do_note', () => {
  const p = fixturePlace();
  p.blocks.find((b) => b.type === 'cost_breakdown').items[1].estimate = true;
  p.location.approximate = true;
  p.must_do_note = 'The viral branch closed in 2024; this is the closest open one.';
  assert.deepEqual(errors(validatePlace(p, yuCtx())), []);
  const html = renderPlacePage(p, { credits: fixtureCredits(), staticMap: { url: 'map.webp', width: 1200, height: 720 } });
  assert.match(html, /<td class="num loc">≈ ¥6<\/td><td class="num brl">≈ R\$ 4,96<\/td>/);
  assert.match(html, /<td class="num loc">¥30<\/td>/, 'other items are exact');
  assert.match(html, /<span class="map__approx">Approximate location<\/span>/);
  assert.match(html, /The pin is approximate/);
  assert.match(html, /<p class="hero__note">.*<b>On your list:<\/b> The viral branch closed in 2024; this is the closest open one\.<\/span><\/p>/);
  const plain = renderPlacePage(fixturePlace(), { credits: fixtureCredits(), staticMap: { url: 'map.webp', width: 1200, height: 720 } });
  assert.doesNotMatch(plain, /map__approx|hero__note|≈ ¥/);
  const w = validatePlace({ ...fixturePlace(), must_do: undefined, must_do_note: 'x' }, yuCtx()).find((i) => i.path === 'must_do_note');
  assert.equal(w.level, 'warning');
  // areas
  const area = { ...parse(fs.readFileSync(path.join(FIXTURES, 'areas/china/harbin.yaml'), 'utf8')), approximate: true, must_do_note: 'The festival, not the city.' };
  assert.deepEqual(errors(validateArea(area, { fixtureMode: true, now: '2026-11-10', credits: [{ file: 'snow-sculpture' }], mediaFiles: ['snow-sculpture-640.webp'] })), []);
  const ah = renderAreaPage(area, { credits: [], staticMap: { url: 'map.webp', width: 1200, height: 720 } });
  assert.match(ah, /map__approx/);
  assert.match(ah, /On your list:<\/b> The festival, not the city\./);
  // taste shows the note
  const st = mustDoStatus({ must_do: [{ key: 'classical-garden', said: 'a real chinese garden', country: 'china' }] }, [p], []);
  assert.equal(st[0].claims[0].note, p.must_do_note);
  assert.match(formatStatedTaste({ taste: {}, mustDo: st, summary: { totals: {}, categories: [] } }), /note \(yu-garden\): The viral branch closed in 2024/);
  const scaffold = placeTemplate({ country: 'china', city: 'x', name: 'Y', today: '2026-11-10' });
  assert.match(scaffold, /^# must_do_note: TODO/m);
  assert.match(scaffold, /# approximate: true .*\.\/atr geo "<name>" --country china/);
});

test('3.6 geo: OpenStreetMap and Wikidata candidates, cached, offline says so', async () => {
  const urls = [];
  const fake = async (url) => {
    urls.push(String(url));
    const json = (o) => ({ ok: true, status: 200, json: async () => o });
    if (/nominatim/.test(url)) return json([{ name: '钟书阁', category: 'shop', type: 'books', display_name: '钟书阁, 都江堰市, Chengdu, Sichuan, China', lat: '30.99812345', lon: '103.61234567' }]);
    if (/wbsearchentities/.test(url)) return json({ search: [{ id: 'Q1', label: 'Zhongshuge' }, { id: 'Q2', label: 'Zhongshuge (Paris)' }, { id: 'Q3', label: 'Same spot' }] });
    return json({ entities: { Q1: { labels: { en: { value: 'Zhongshuge Dujiangyan' } }, descriptions: { en: { value: 'bookstore in Sichuan' } }, claims: { P625: [{ mainsnak: { datavalue: { value: { latitude: 31.01, longitude: 103.65 } } } }] } }, Q2: { claims: { P625: [{ mainsnak: { datavalue: { value: { latitude: 48.85, longitude: 2.35 } } } }] } }, Q3: { claims: { P625: [{ mainsnak: { datavalue: { value: { latitude: 30.9982, longitude: 103.6124 } } } }] } } } });
  };
  const cacheFile = path.join(tmpDir(), 'geo.json');
  const r = await geoSearch('钟书阁 都江堰', { country: 'china', fetch: fake, cacheFile, offline: false });
  assert.deepEqual(r.candidates.map((c) => [c.source, c.name, c.lat, c.lng]), [['osm', '钟书阁', 30.99812, 103.61235], ['wikidata', 'Zhongshuge Dujiangyan', 31.01, 103.65]], 'outside the country and duplicates of an OSM hit are dropped');
  assert.match(urls[0], /countrycodes=cn/);
  assert.match(urls[0], /q=%E9%92%9F/, 'local-script query');
  assert.match(urls[1], /language=zh/);
  assert.equal(r.candidates[0].link, 'https://www.openstreetmap.org/?mlat=30.99812&mlon=103.61235#map=17/30.99812/103.61235');
  const again = await geoSearch('钟书阁 都江堰', { country: 'china', fetch: async () => { throw new Error('must come from the cache'); }, cacheFile, offline: false });
  assert.equal(again.cached, true);
  const text = formatGeo(r);
  assert.match(text, /1\. 钟书阁 \(OpenStreetMap: shop \/ books\)\n {3}lat: 30\.99812\n {3}lng: 103\.61235/);
  assert.match(text, /location\.approximate: true/);
  assert.match(formatGeo(await geoSearch('nothing', { offline: true, cacheFile })), /can't search for coordinates offline/);
  const none = await geoSearch('zzz', { fetch: async () => ({ ok: true, json: async () => ([]) }), cacheFile: path.join(tmpDir(), 'g.json'), offline: false });
  assert.match(formatGeo({ ...none, candidates: [] }), /0 results for "zzz"\. Try the local-script name/);
  const failed = await geoSearch('x', { fetch: async () => ({ ok: false, status: 503 }), cacheFile: path.join(tmpDir(), 'g.json'), offline: false });
  assert.deepEqual(failed.errors, ['OpenStreetMap: OpenStreetMap search answered HTTP 503', 'Wikidata: Wikidata answered HTTP 503']);
  assert.match(atr(['geo', 'Yu Garden', '--country', 'china', '--json'], { ATR_OFFLINE: '1' }).stdout, /"offline": true|"candidates"/);
  assert.match(atr(['geo']).stderr, /give a name/);
});

test('3.8 links: a timeout is retried once with more time; the message says what to do', async () => {
  const srv = http.createServer((req, res) => { if (req.url === '/slow-then-ok') setTimeout(() => { res.writeHead(200, { 'Content-Type': 'text/html' }); res.end('<title>ok</title>'); }, 250); });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${srv.address().port}`;
  try {
    assert.equal((await checkUrl(base + '/slow-then-ok', { timeoutMs: 120, retryTimeoutMs: 2000 })).status, 'ok', 'the second, longer try gets through');
    const t = await checkUrl(base + '/never', { timeoutMs: 100, retryTimeoutMs: 200 });
    assert.equal(t.status, 'timeout');
    assert.match(t.detail, /couldn't connect from this machine \(tried 0 s, then 0 s\)/);
    const i = linkIssue({ url: base + '/never', pathArr: ['sources', 0, 'url'], what: 'source' }, t);
    assert.equal(i.level, 'warning');
    assert.match(i.hint, /couldn't connect from this machine; if a web fetch opens it, keep the source and say so in `confidence_note`/);
  } finally { srv.close(); srv.closeAllConnections?.(); }
});

test('3.9 render: public pages only, tidy text; the stay block takes beds[].url and rating.atmosphere', async (t) => {
  assert.equal(renderUrlProblem('https://www.hostelworld.com/x?from=2026-12-08'), null);
  assert.match(renderUrlProblem('file:///etc/passwd'), /only http\(s\)/);
  assert.match(renderUrlProblem('http://localhost:3000/'), /local or private/);
  assert.match(renderUrlProblem('http://192.168.1.5/'), /local or private/);
  assert.match(renderUrlProblem('not a url'), /is not a URL/);
  assert.match(renderUrlProblem('https://user:pw@example.com/'), /user name or password/);
  assert.deepEqual(tidyText('  a   b \n\n\n\n c \n'), { text: 'a b\n\nc', truncated: 0 });
  assert.deepEqual(tidyText('abcdefgh', 3), { text: 'abc', truncated: 5 });
  assert.match(atr(['render']).stderr, /give a URL/);
  assert.match(atr(['render', 'https://example.com']).stderr, /can't load web pages offline/);
  for (const g of ['CURATOR-GUIDE.md', 'REVIEWER-GUIDE.md']) assert.match(fs.readFileSync(path.join(ROOT, 'docs', g), 'utf8'), /\.\/atr render/, g);
  // stay fields
  const hostel = parse(fs.readFileSync(path.join(FIXTURES, 'places/china/shanghai/bund-rooftop-hostel/place.yaml'), 'utf8'));
  const stay = hostel.blocks.find((b) => b.type === 'stay');
  stay.beds[0].url = 'https://www.hostelworld.com/pwa/hosteldetails.php/X/Shanghai/1?from=2026-12-08&to=2026-12-09';
  stay.rating.atmosphere = 9.4;
  assert.deepEqual(errors(validatePlace(hostel, { fixtureMode: true, now: '2026-11-10' })).filter((i) => /stay|beds|rating/.test(i.path)), []);
  const html = renderPlacePage(hostel, { credits: [] });
  assert.match(html, /Weeknight in January · <a href="https:\/\/www\.hostelworld\.com\/pwa\/hosteldetails\.php\/X\/Shanghai\/1\?from=2026-12-08&amp;to=2026-12-09"[^>]*>price source<\/a>/);
  assert.match(html, /<span class="stay__atmo">Atmosphere 9\.4 \/ 10<\/span>/);
  // a real render of a local page, when Chrome is installed
  const srv = http.createServer((req, res) => { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end('<title>Dorm prices</title><body><h1>Loading…</h1><script>setTimeout(function(){document.querySelector("h1").textContent="8-bed dorm: ¥60 per night";},50)</script></body>'); });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  try {
    let r;
    try { r = await renderPage(`http://127.0.0.1:${srv.address().port}/`, { allowLocal: true, waitS: 0.3, shot: true, cacheDir: undefined }); } catch (e) { if (/Could not launch Google Chrome/.test(e.message)) return t.skip('Chrome not installed'); throw e; }
    assert.equal(r.title, 'Dorm prices');
    assert.equal(r.text, '8-bed dorm: ¥60 per night', 'the text after JavaScript ran');
    assert.ok(fs.existsSync(r.shot) && /\.cache\/render\/127\.0\.0\.1-[0-9a-f]{8}\.png$/.test(r.shot));
    fs.rmSync(r.shot, { force: true });
  } finally { srv.close(); srv.closeAllConnections?.(); }
});

test('3.11 stay scaffold has weather and book_ahead blocks uncommented', () => {
  const s = placeTemplate({ country: 'japan', city: 'tokyo', name: 'Nine Pods', category: 'stay', today: '2026-11-10' });
  assert.match(s, /^  - type: book_ahead/m);
  assert.match(s, /^  - type: weather/m);
  assert.match(s, /^        url: https:\/\/TODO\s+# optional: the date-search URL/m);
  assert.match(s, /^      atmosphere: TODO/m);
  assert.equal((s.match(/type: book_ahead/g) || []).length, 1, 'not repeated in the commented examples');
  const n = placeTemplate({ country: 'japan', city: 'tokyo', name: 'Some Shrine', category: 'culture', today: '2026-11-10' });
  assert.match(n, /^  - type: weather/m);
  assert.match(n, /^  # - type: book_ahead/m);
});

test('public API and CLI: round 8 additions', () => {
  for (const k of ['commandWrites', 'geoSearch', 'renderPage', 'folderSlug', 'fetchCommonsMany', 'sessionCost']) assert.ok(api[k], k);
  const help = atr(['--help']).stdout;
  assert.match(help, /^ {2}geo\s/m);
  assert.match(help, /^ {2}render\s/m);
  for (const c of ['geo', 'render']) assert.equal(atr([c, '--help']).status, 0);
});

// ───────────────────────── round 10: re-reviews converge; summaries credit only the session ─────────────────────────
import { lineDiff, rereviewContext, rereviewPrompt, reviewedCopyDir, REREVIEW_JSON_SCHEMA, reviewArgs } from '../lib/review.js';
import { describeContent } from '../lib/runner.js';

test('round 10: a page with an earlier review gets a re-review (earlier findings + diff), which records what was resolved', async () => {
  assert.equal(lineDiff('a\nb\nc', 'a\nb\nc'), '');
  assert.equal(lineDiff('a\nb\nc\nd\ne\nf\ng', 'a\nb\nX\nd\ne\nf\ng', { context: 1 }), '@@ line 2 @@\n b\n-c\n+X\n d');
  assert.match(lineDiff('x', 'x\ny'.repeat(4000), { maxChars: 50 }), /diff cut/);
  const two = { ...OUT, issues: [OUT.issues[0], { severity: 'should', field: 'why', problem: 'Generic pitch.', fix: 'Say what is special.' }, { severity: 'nit', field: 'blocks[0].hook', problem: 'Wordy.', fix: 'Trim.' }] };
  const s = scriptedRoot([
    { structured_output: two },                                                                                     // 1st: full review → fix
    { structured_output: { ...PASS, earlier: [{ n: 1, status: 'resolved', evidence: 'hours.summary now says 22:30' }, { n: 2, status: 'open', evidence: 'why is unchanged' }], issues: [] } },   // re-review forgets to repeat #2
    { structured_output: { ...PASS, earlier: [], issues: [{ severity: 'should', field: 'cost.note', problem: 'The new price has no source.', fix: 'Cite it.' }] } }, // new issue in the diff
    { structured_output: { ...PASS, earlier: [{ n: 1, status: 'resolved' }, { n: 2, status: 'resolved' }], issues: [{ severity: 'nit', field: 'x', problem: 'y', fix: 'z' }] } },             // all resolved → pass
    { structured_output: PASS },                                                                                    // --full
  ]);
  await withEnv({ ATR_DATA_ROOT: s.root, ATR_CLAUDE_BIN: s.fake }, async () => {
    const runDir = path.join(s.root, 'runs');
    const first = await reviewPlace({ id: 'nanxiang-mantou-dian', runDir });
    assert.deepEqual([first.verdict, first.rereview], ['fix', false]);
    assert.match(s.prompt(0), /^Review the place page/);
    assert.ok(fs.existsSync(path.join(reviewedCopyDir({}), `nanxiang-mantou-dian-${first.content_hash}.yaml`)), 'a copy of the reviewed file is kept, keyed by its hash');
    assert.ok(reviewedCopyDir({}).startsWith(s.root), 'next to the data root, not in the repo cache');

    // the curator edits the page
    fs.writeFileSync(s.file, fs.readFileSync(s.file, 'utf8').replace('summary: Daily 10:00–21:00', 'summary: Daily 10:00–22:30'));
    const ctx = rereviewContext({ id: 'nanxiang-mantou-dian', file: s.file }, 'place', {});
    assert.deepEqual(ctx.open.map((i) => i.field), ['hours.summary', 'why'], 'blockers and shoulds, not nits');
    assert.match(ctx.diff, /-  summary: Daily 10:00–21:00\n\+  summary: Daily 10:00–22:30/);

    const second = await reviewPlace({ id: 'nanxiang-mantou-dian', runDir });
    const p = s.prompt(1);
    assert.match(p, /^RE-REVIEW of the place page `nanxiang-mantou-dian`/);
    assert.match(p, /section "Re-reviewing a page"\. This is a follow-up, not a new audit\./);
    assert.match(p, /1\. \[blocker\] hours\.summary: Page says 23:00; the operator says 22:30\.\n {3}evidence then: https:\/\/example\.org\/t\n {3}asked fix: Change to 22:30\.\n2\. \[should\] why: Generic pitch\./);
    assert.doesNotMatch(p, /Wordy/);
    assert.match(p, /\+  summary: Daily 10:00–22:30/);
    assert.match(p, /\(c\) On content that did not change, raise only blockers/);
    assert.equal(second.rereview, true);
    assert.equal(second.verdict, 'fix', 'the finding the reviewer called open stays open although it forgot to repeat it');
    assert.deepEqual(second.issues.map((i) => i.field), ['why']);
    assert.deepEqual(second.resolved, [{ field: 'hours.summary', problem: 'Page says 23:00; the operator says 22:30.', evidence: 'hours.summary now says 22:30' }]);
    const saved = parse(fs.readFileSync(path.join(s.root, 'reviews/nanxiang-mantou-dian.yaml'), 'utf8'));
    assert.equal(saved.resolved.length, 1);
    assert.equal(saved.rereview_of, first.content_hash);
    assert.deepEqual(errors(api.reviewSpec ? (await import('../lib/schema/dsl.js')).check(api.reviewSpec, saved) : []), []);

    // an earlier finding the reviewer does not mention at all is not closed by omission; a new issue in the diff counts
    fs.appendFileSync(s.file, '\n# edit 2\n');
    const third = await reviewPlace({ id: 'nanxiang-mantou-dian', runDir });
    assert.match(s.prompt(2), /1\. \[should\] why: Generic pitch\./);
    assert.deepEqual(third.issues.map((i) => i.field), ['why', 'cost.note']);
    assert.equal(third.verdict, 'fix');

    // everything resolved, only a nit left → pass
    fs.appendFileSync(s.file, '\n# edit 3\n');
    const fourth = await reviewPlace({ id: 'nanxiang-mantou-dian', runDir });
    assert.deepEqual([fourth.verdict, fourth.resolved.map((x) => x.field)], ['pass', ['why', 'cost.note']]);
    assert.equal(reviewStatus(api.loadPlaces({})[0], loadReviews({})).state, 'pass');

    // --full forces a new audit; so does a missing copy of the reviewed file
    await reviewPlace({ id: 'nanxiang-mantou-dian', runDir, full: true });
    assert.match(s.prompt(4), /^Review the place page/);
    fs.rmSync(reviewedCopyDir({}), { recursive: true, force: true });
    assert.equal(rereviewContext({ id: 'nanxiang-mantou-dian', file: s.file }, 'place', {}), null, 'no copy → full review');
    assert.equal(rereviewContext({ id: 'nanxiang-mantou-dian', file: s.file }, 'area', {}), null);
  });
  assert.deepEqual(REREVIEW_JSON_SCHEMA.required, ['facts', 'earlier', 'issues', 'summary']);
  const a = reviewArgs({ prompt: 'x', rereview: true });
  assert.ok(JSON.parse(a[a.indexOf('--json-schema') + 1]).properties.earlier);
  assert.match(fs.readFileSync(path.join(ROOT, 'docs/REVIEWER-GUIDE.md'), 'utf8'), /## Re-reviewing a page[\s\S]*not a second audit[\s\S]*raise only blockers/);
  assert.match(rereviewPrompt('x', path.join(ROOT, 'areas/china/x.yaml'), { previous: { reviewed: '2026-11-10' }, open: [], diff: '' }, { type: 'area' }), /RE-REVIEW of the AREA page `x`[\s\S]*\(none\)[\s\S]*\(no changes\)/);
});

test('round 10: in a run, the re-review after the fix round is a follow-up, and the run converges', async () => {
  const s = scriptedRoot([{ result: 'added', file: 'touch' }, { structured_output: OUT }, { result: 'fixed', file: 'touch' }, { structured_output: { ...PASS, earlier: [{ n: 1, status: 'resolved', evidence: 'fixed' }] } }]);
  await withEnv({ ATR_DATA_ROOT: s.root, ATR_CLAUDE_BIN: s.fake }, async () => {
    const { runCurator } = await import('../lib/runner.js');
    const r = await runCurator({ task: 'test', links: false, log: () => {} });
    assert.deepEqual(s.calls(), ['curator', 'review', 'curator:resume', 'review']);
    assert.match(s.prompt(1), /^Review the place page/);
    assert.match(s.prompt(3), /^RE-REVIEW of the place page/);
    assert.match(s.prompt(3), /\+# touched 2/, 'the diff shows what the fix round changed');
    assert.equal(r.clean, true);
    assert.deepEqual(parse(fs.readFileSync(path.join(s.root, 'reviews/nanxiang-mantou-dian.yaml'), 'utf8')).resolved.map((x) => x.field), ['hours.summary']);
    fs.rmSync(r.dir, { recursive: true, force: true });
  });
});

test('round 10: the headline, the table and summary.json describe only what the session did', async () => {
  const s = scriptedRoot([{ result: 'added', file: 'touch', also: ['places/china/chengdu/chengdu-christmas/place.yaml', 'areas/china/beijing.yaml'], bash: ['./atr gaps', 'cat areas/china/beijing.yaml'] }]);
  await withEnv({ ATR_DATA_ROOT: s.root, ATR_CLAUDE_BIN: s.fake }, async () => {
    const { runCurator } = await import('../lib/runner.js');
    const r = await runCurator({ task: 'test', links: false, review: false, log: () => {} });
    assert.deepEqual(r.content, { places: { created: [], changed: ['nanxiang-mantou-dian'], deleted: [] }, areas: { created: [], changed: [], deleted: [] } });
    assert.equal(describeContent(r.content), '~1 place (nanxiang-mantou-dian)', 'what the CLI prints in the headline and the --auto table');
    assert.deepEqual(r.also_changed_in_repo, { places: { created: ['chengdu-christmas'], changed: [], deleted: [] }, areas: { created: ['beijing'], changed: [], deleted: [] } });
    assert.deepEqual(r.pages.map((p) => p.id), ['nanxiang-mantou-dian']);
    const saved = JSON.parse(fs.readFileSync(path.join(r.dir, 'summary.json'), 'utf8'));
    assert.deepEqual(saved.content, r.content);
    assert.ok(!JSON.stringify(saved.content).includes('chengdu-christmas'));
    assert.match(saved.also_changed_in_repo_note, /NOT by this session/);
    fs.rmSync(r.dir, { recursive: true, force: true });
  });
  const src = fs.readFileSync(path.join(ROOT, 'platform/cli/atr.js'), 'utf8');
  assert.match(src, /also changed in the repo during the run \(not by this session\)/);
});
