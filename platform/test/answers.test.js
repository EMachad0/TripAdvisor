// Answer cards: the loader/validator (lib/answers.js), the card renderer (lib/render/answers.js), the publish
// command (lib/publish.js, on temp repos with gh stubbed) and `./atr answers`. Moved from the retired old
// site's game/test/answers.test.js; the fixtures are platform/test/site-fixtures (the site's test places and cards).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parseAnswer, validateAnswers, checkAnswers, siteAnswers, resolveAbout, loadAnswers } from '../lib/answers.js';
import { renderAnswerCard, renderAnswersSection } from '../lib/render/answers.js';
import { publishAnswers, describeChanges, PublishError, COMMIT_TRAILER, PR_FOOTER, sh } from '../lib/publish.js';
import { ROOT } from '../lib/paths.js';
import { SITE } from '../lib/site.js';

const FIX = path.join(path.dirname(fileURLToPath(import.meta.url)), 'site-fixtures');
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'atr-answers-test-'));
const FX = { root: FIX, includeFixtures: true };
const md = (fm, body = '') => `---\n${fm}\n---\n${body}`;
const GOOD = 'question: Open on Christmas?\nasked: 2026-11-20\nabout: harbin-ice-world\ntldr: Yes, 11:00–21:30.';
const PLACES = [{ id: 'yu-garden', name: 'Yu Garden', country: 'china' }, { id: 'twin', name: 'Twin place', country: 'japan' }];
const AREAS = [{ id: 'kyoto', name: 'Kyoto', country: 'japan' }, { id: 'twin', name: 'Twin area', country: 'japan' }];

// ---------------- loader + validator ----------------
test('answers: a good file parses; body and sources come through', () => {
  const a = parseAnswer(md(`${GOOD}\nsources:\n  - title: Official\n    url: https://example.com/x`, 'Full **answer**.\n'), '/x/answers/2026-11-20-ice-xmas.md');
  assert.deepEqual(a.errors, []);
  assert.equal(a.id, '2026-11-20-ice-xmas');
  assert.equal(a.slug, 'ice-xmas');
  assert.equal(a.asked, '2026-11-20');
  assert.equal(a.body, 'Full **answer**.');
  assert.deepEqual(a.sources, [{ title: 'Official', url: 'https://example.com/x' }]);
});

test('answers: every broken field gets a clear error', () => {
  const errs = (text, name = '2026-11-20-x.md') => parseAnswer(text, name).errors.join(' | ');
  assert.match(errs('no front matter'), /no front matter/);
  assert.match(errs(md('question: q\nasked: 2026-11-20\nabout: trip')), /missing tldr/);
  assert.match(errs(md(GOOD.replace('2026-11-20', '2026-02-30')), '2026-02-30-x.md'), /must be a real date/);
  assert.match(errs(md(GOOD), '2026-11-21-x.md'), /file name starts with 2026-11-21 but asked is 2026-11-20/);
  assert.match(errs(md(GOOD), 'Bad Name.md'), /file name "Bad Name.md" must be <asked>-<short-slug>\.md/);
  assert.match(errs(md(`${GOOD}\ntitle: nope`)), /unknown field "title"/);
  assert.match(errs(md(`${GOOD}\nsources:\n  - title: x\n    url: javascript:alert(1)`)), /sources\[0\]\.url must be an http\(s\) link/);
  assert.match(errs(md(`${GOOD}\nsources: https://x.y`)), /sources must be a list/);
  assert.match(errs(md(GOOD.replace('tldr: Yes, 11:00–21:30.', `tldr: ${'x'.repeat(401)}`))), /tldr is 401 characters/);
  assert.match(errs(md(`${GOOD}\nupdated: 2026-11-01`)), /updated \(2026-11-01\) is before asked/);
  assert.match(errs(md('question: [unclosed')), /YAML error/);
});

test('answers: about resolves to a place, an area, a country or the trip; unknown, ambiguous and duplicate slugs fail', () => {
  assert.equal(resolveAbout('yu-garden', { places: PLACES, areas: AREAS }).kind, 'place');
  assert.equal(resolveAbout('kyoto', { places: PLACES, areas: AREAS }).kind, 'area');
  assert.deepEqual(resolveAbout('japan', { places: PLACES, areas: AREAS }), { kind: 'country', id: 'japan', name: 'Japan', country: 'japan' });
  assert.equal(resolveAbout('trip').kind, 'trip');
  assert.equal(resolveAbout('nowhere', { places: PLACES, areas: AREAS }), null);
  assert.equal(resolveAbout('twin', { places: PLACES, areas: AREAS }).ambiguous, true);
  assert.equal(resolveAbout('area:twin', { places: PLACES, areas: AREAS }).name, 'Twin area');
  const mk = (name, about) => parseAnswer(md(`question: q?\nasked: ${name.slice(0, 10)}\nabout: ${about}\ntldr: t.`), `/a/${name}`);
  const r = validateAnswers([mk('2026-11-20-a.md', 'yu-garden'), mk('2026-11-21-a.md', 'japan'), mk('2026-11-22-b.md', 'nowhere'), mk('2026-11-23-c.md', 'twin')], { places: PLACES, areas: AREAS });
  const msgs = r.errors.map((e) => `${path.basename(e.file)}: ${e.message}`).join('\n');
  assert.match(msgs, /2026-11-21-a\.md: slug "a" is also used by 2026-11-20-a\.md/);
  assert.match(msgs, /2026-11-22-b\.md: about "nowhere" is not a place, an area or a country id/);
  assert.match(msgs, /2026-11-23-c\.md: about "twin" is both a place and an area: write place:twin or area:twin/);
  assert.equal(r.errors.length, 3);
});

test('answers: the fixture answers load, validate and sort newest first; a broken file is left off the site', () => {
  const r = checkAnswers(FX);
  assert.deepEqual(r.errors, []);
  assert.equal(r.answers.length, 4);
  assert.deepEqual(siteAnswers(FX).map((a) => a.target.kind), ['trip', 'country', 'area', 'place']);
  const dir = tmp();
  fs.cpSync(path.join(FIX, 'answers'), path.join(dir, 'answers'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'answers', '2026-11-30-broken.md'), md('question: q?\nasked: 2026-11-30\nabout: nowhere\ntldr: t.'));
  fs.writeFileSync(path.join(dir, 'answers', 'README.md'), 'not an answer');
  assert.equal(loadAnswers({ answersDir: path.join(dir, 'answers') }).length, 5, 'README.md is not an answer');
  assert.equal(siteAnswers({ ...FX, answersDir: path.join(dir, 'answers') }).length, 4);
});

// ---------------- renderer ----------------
test('answer card: escapes the question, the body and the sources; folds the full answer away', () => {
  const [a] = siteAnswers(FX).filter((x) => x.target.kind === 'place');
  const html = renderAnswerCard(a);
  assert.match(html, /Is the Ice World open on Christmas Day &lt;b&gt;really&lt;\/b&gt;\?/);
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.match(html, /<strong>cheaper before 13:00<\/strong>/);
  assert.match(html, /<details class="qa__more"><summary>Full answer and sources<\/summary>/);
  assert.match(html, /<li>Last entry 20:30\.<\/li>/);
  assert.match(html, /<a href="https:\/\/example\.com\/ice-world" target="_blank" rel="noopener noreferrer">Harbin Ice and Snow World, official site<\/a> <small>example\.com<\/small>/);
  assert.match(html, /<time datetime="2026-11-20">Asked 20 Nov 2026<\/time>/);
  assert.match(html, /About <a href="\/place\/harbin-ice-world" data-open-kind="place" data-open-id="harbin-ice-world">Harbin Ice and Snow World<\/a>/);
  assert.doesNotMatch(renderAnswerCard(a, { showAbout: false }), /About/);
  const kyoto = siteAnswers(FX).find((x) => x.id === '2026-11-21-kyoto-days');
  assert.doesNotMatch(renderAnswerCard(kyoto), /<details/, 'no body and no sources: nothing to fold');
  const china = siteAnswers(FX).find((x) => x.target.kind === 'country');
  assert.match(renderAnswerCard(china), /<summary>Source<\/summary>/);
  assert.match(renderAnswerCard(china), /About <b data-country="china">China<\/b>/);
  assert.match(renderAnswerCard(siteAnswers(FX)[0]), /About the whole trip/);
  assert.match(renderAnswerCard(siteAnswers(FX)[0]), /Updated 24 Nov 2026/);
  assert.equal(renderAnswersSection([], { name: 'X' }), '');
  assert.match(renderAnswersSection([kyoto], { name: 'Kyoto' }), /<h2 class="h2">One answer about Kyoto<\/h2>/);
});

// ---------------- publish ----------------
test('publish: commit and PR text end with the attribution lines', () => {
  const one = describeChanges([{ status: 'added', name: '2026-11-20-x.md', question: 'Open on Christmas?' }]);
  assert.equal(one.title, 'Add answer card: Open on Christmas?');
  assert.ok(one.commit.trimEnd().endsWith(COMMIT_TRAILER));
  assert.ok(one.prBody.trimEnd().endsWith(PR_FOOTER));
  assert.equal(describeChanges([{ status: 'added', name: 'a.md' }, { status: 'updated', name: 'b.md' }, { status: 'removed', name: 'c.md' }]).title, 'Answer cards: add 1, update 1, remove 1');
});

/** A throwaway "origin" (bare repo) and a clone with fixture places and answers; gh is stubbed, ssh must not run. */
function fakeRepo() {
  const dir = tmp();
  const git = (cwd, ...args) => { const r = spawnSync('git', ['-C', cwd, ...args], { encoding: 'utf8' }); assert.equal(r.status, 0, r.stderr); return r.stdout.trim(); };
  const origin = path.join(dir, 'origin.git'), work = path.join(dir, 'work');
  git(dir, 'init', '-q', '--bare', '-b', 'main', origin);
  git(dir, 'clone', '-q', origin, work);
  for (const d of ['places', 'areas', 'answers']) fs.cpSync(path.join(FIX, d), path.join(work, d), { recursive: true });
  git(work, '-c', 'user.name=t', '-c', 'user.email=t@t', 'add', '-A');
  git(work, '-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '-m', 'seed');
  git(work, 'push', '-q', 'origin', 'main');
  git(work, 'config', 'user.name', 't'); git(work, 'config', 'user.email', 't@t');
  const calls = [];
  const run = (cmd, args, o = {}) => {
    calls.push([cmd, ...args]);
    if (cmd === 'gh') {
      if (args[0] === 'auth') return { code: 0, stdout: '', stderr: '' };
      if (args[0] === 'pr' && args[1] === 'create') return { code: 0, stdout: 'https://github.com/x/y/pull/7', stderr: '' };
      if (args[0] === 'pr' && args[1] === 'merge') {
        // merge the branch into the bare origin's main the way GitHub would (a merge commit)
        const head = args[2] && calls.find((c) => c[0] === 'gh' && c[2] === 'create');
        const branch = head[head.indexOf('--head') + 1];
        const m = path.join(dir, 'merge');
        fs.rmSync(m, { recursive: true, force: true });
        git(dir, 'clone', '-q', origin, m);
        git(m, '-c', 'user.name=gh', '-c', 'user.email=gh@gh', 'merge', '-q', '--no-ff', '-m', 'Merge', `origin/${branch}`);
        git(m, 'push', '-q', 'origin', 'main');
        return { code: 0, stdout: '', stderr: '' };
      }
      if (args[0] === 'pr' && args[1] === 'view') return { code: 0, stdout: JSON.stringify({ state: 'MERGED', mergeCommit: { oid: git(origin, 'rev-parse', 'main') } }), stderr: '' };
    }
    if (cmd === 'ssh') assert.fail('nothing goes over ssh');
    return sh(cmd, args, o);
  };
  // the site serves whatever origin/main is (so the merge commit right after the merge)
  const fetchImpl = async () => ({ ok: true, status: 200, json: async () => ({ ok: true, sha: git(origin, 'rev-parse', 'main') }) });
  const opts = { site: SITE, root: work, run, fetchImpl, sleep: async () => {}, log: () => {}, dataOpts: { includeFixtures: true } };
  return { dir, origin, work, git, calls, opts };
}

test('publish: validates first and refuses bad files or a missing gh login, touching nothing', async () => {
  const r = fakeRepo();
  const bad = path.join(r.dir, '2026-11-25-bad.md');
  fs.writeFileSync(bad, md('question: q?\nasked: 2026-11-25\nabout: nowhere\ntldr: t.'));
  await assert.rejects(publishAnswers({ ...r.opts, files: [bad] }), (e) => e instanceof PublishError && /about "nowhere" is not a place/.test(e.message));
  await assert.rejects(publishAnswers({ ...r.opts, files: [] }), /nothing to publish/);
  const good = path.join(r.dir, '2026-11-25-good.md');
  fs.writeFileSync(good, md('question: Good?\nasked: 2026-11-25\nabout: kyoto\ntldr: Yes.'));
  const noGh = (cmd, args, o) => (cmd === 'gh' ? { code: 1, stdout: '', stderr: 'not logged in' } : r.opts.run(cmd, args, o));
  await assert.rejects(publishAnswers({ ...r.opts, run: noGh, files: [good] }), /gh is not logged in/);
  assert.equal(r.git(r.origin, 'branch', '--list').split('\n').filter(Boolean).length, 1, 'no branch was pushed');
  assert.equal(r.git(r.work, 'worktree', 'list').split('\n').length, 1, 'no worktree left behind');
});

test('publish: dry run validates and prints the plan, nothing fetched or pushed', async () => {
  const r = fakeRepo();
  const good = path.join(r.dir, '2026-11-25-good.md');
  fs.writeFileSync(good, md('question: Good?\nasked: 2026-11-25\nabout: kyoto\ntldr: Yes.'));
  const lines = [];
  const res = await publishAnswers({ ...r.opts, log: (l) => lines.push(l), files: [good], remove: ['2026-11-21-kyoto-days.md'], dryRun: true });
  assert.equal(res.ok, true);
  assert.deepEqual(res.changes.map((c) => c.status), ['added', 'removed']);
  assert.match(lines.join('\n'), /dry run: nothing fetched, written or pushed/);
  assert.ok(!r.calls.some((c) => c[0] === 'git' && ['fetch', 'push', 'worktree'].includes(c[3])), 'no fetch, push or worktree');
  assert.ok(!r.calls.some((c) => c[0] === 'gh' && c[1] === 'pr'));
});

test('publish: worktree from origin/main, only the answer files, PR, merge, cleanup, live once /healthz serves the merge', async () => {
  const r = fakeRepo();
  // the checkout has unrelated uncommitted work that must not be touched or shipped
  fs.writeFileSync(path.join(r.work, 'places', 'WIP.txt'), 'someone else is working here');
  const good = path.join(r.work, 'answers', '2026-11-25-kyoto-temples.md');
  fs.writeFileSync(good, md('question: Which temples first?\nasked: 2026-11-25\nabout: kyoto\ntldr: Fushimi Inari at 07:00.'));
  const res = await publishAnswers({ ...r.opts, files: [good], remove: ['answers/2026-11-23-esim.md'] });
  assert.equal(res.ok, true);
  assert.equal(res.merged, true);
  assert.equal(res.live, true);
  assert.equal(res.health.sha, res.sha);
  assert.equal(res.pr, 'https://github.com/x/y/pull/7');
  assert.deepEqual(res.tidy, ['rm answers/2026-11-25-kyoto-temples.md'], 'says how to drop the local copy so a later pull works');
  assert.ok(res.links.some((l) => l.endsWith('/places/answers/2026-11-25-kyoto-temples')));
  assert.ok(res.links.some((l) => l.endsWith('/area/kyoto#answer-2026-11-25-kyoto-temples')));
  // what landed on origin/main: exactly the answer change, one commit with the trailer, merged with a merge commit
  const files = r.git(r.origin, 'diff', '--name-status', 'main~1', 'main');
  assert.equal(files, 'D\tanswers/2026-11-23-esim.md\nA\tanswers/2026-11-25-kyoto-temples.md');
  assert.equal(r.git(r.origin, 'rev-list', '--count', '--merges', 'main~1..main'), '1');
  assert.match(r.git(r.origin, 'log', '-1', '--format=%B', 'main^2'), /Co-Authored-By: Claude <noreply@anthropic\.com>\s*$/);
  const create = r.calls.find((c) => c[0] === 'gh' && c[2] === 'create');
  assert.ok(create[create.indexOf('--body') + 1].trimEnd().endsWith(PR_FOOTER));
  // cleanup: no worktree, no local branch, the remote branch deleted; the working tree untouched
  assert.equal(r.git(r.work, 'worktree', 'list').split('\n').length, 1);
  assert.equal(r.git(r.work, 'branch', '--list', 'answers/*'), '');
  assert.equal(r.git(r.origin, 'branch', '--list', 'answers/*'), '');
  assert.equal(fs.readFileSync(path.join(r.work, 'places', 'WIP.txt'), 'utf8'), 'someone else is working here');
  assert.match(r.git(r.work, 'status', '--porcelain'), /\?\? answers\/2026-11-25-kyoto-temples\.md/);
  // publishing the same file again: nothing to do
  const again = await publishAnswers({ ...r.opts, files: [good] });
  assert.equal(again.unchanged, true);
});

test('publish: opens the card pages as the guest; a page without the card fails the publish', async () => {
  const site = (pages) => async (url, init = {}) => {
    const u = new URL(url), cookie = init.headers?.cookie || '';
    const res = (status, body = '', headers = {}) => ({ ok: status >= 200 && status < 300, status, headers: { get: (n) => headers[n] ?? null, getSetCookie: () => headers.cookies || [] }, text: async () => body, json: async () => JSON.parse(body) });
    if (u.pathname === '/healthz') return res(200, JSON.stringify({ ok: true, sha: pages.sha() }));
    if (u.pathname === '/api/auth/sign-in/username') return JSON.parse(init.body).password === 'pw' ? res(200, '{}', { cookies: ['__Secure-better-auth.session_token=s1; Path=/; HttpOnly'] }) : res(401);
    if (u.pathname === '/api/auth/sign-out') { pages.signedOut = true; return res(200, '{}'); }
    if (!cookie.includes('session_token=s1')) return res(303, '', { location: '/login' });
    pages.opened.push(u.pathname);
    return res(200, pages.html(u.pathname));
  };
  const publish = async (name, html, login = { username: 'guest', password: 'pw' }) => {
    const r = fakeRepo(), lines = [];
    const pages = { opened: [], sha: () => r.git(r.origin, 'rev-parse', 'main'), html };
    const good = path.join(r.work, 'answers', `${name}.md`);
    fs.writeFileSync(good, md('question: Which temples first?\nasked: 2026-11-25\nabout: kyoto\ntldr: Fushimi Inari at 07:00.'));
    const res = await publishAnswers({ ...r.opts, fetchImpl: site(pages), guestLogin: login, log: (l) => lines.push(l), files: [good] });
    return { res, pages, lines };
  };
  const id = '2026-11-25-kyoto-temples';
  const ok = await publish(id, () => `<article id="answer-${id}">…</article>`);
  assert.equal(ok.res.ok, true);
  assert.deepEqual(ok.pages.opened, [`/places/answers/${id}`, '/area/kyoto']);
  assert.ok(ok.res.pages.every((p) => p.ok && p.status === 200));
  assert.equal(ok.pages.signedOut, true, 'the guest session is signed out afterwards');
  assert.ok(!ok.lines.join('\n').includes('pw'));
  // the area page does not show the card
  const bad = await publish(id, (p) => (p.startsWith('/area/') ? '<p>nothing here</p>' : `<article id="answer-${id}">`));
  assert.equal(bad.res.ok, false);
  assert.equal(bad.res.live, true);
  assert.deepEqual(bad.res.pages.map((p) => p.ok), [true, false]);
  assert.match(bad.lines.join('\n'), /PROBLEM on .*\/area\/kyoto: the page opens but the card is not on it/);
  // a wrong password: the check is skipped and said so, the publish itself stands
  const wrong = await publish(id, () => '', { username: 'guest', password: 'nope' });
  assert.equal(wrong.res.ok, true);
  assert.match(wrong.res.pagesSkipped, /refused the guest login/);
  assert.match(wrong.lines.join('\n'), /pages not opened: /);
});

test('publish: --no-merge stops after the PR', async () => {
  const r = fakeRepo();
  const good = path.join(r.dir, '2026-11-25-good.md');
  fs.writeFileSync(good, md('question: Good?\nasked: 2026-11-25\nabout: kyoto\ntldr: Yes.'));
  const res = await publishAnswers({ ...r.opts, files: [good], merge: false });
  assert.equal(res.merged, false);
  assert.equal(res.pr, 'https://github.com/x/y/pull/7');
  assert.ok(!r.calls.some((c) => c[0] === 'gh' && c[2] === 'merge'));
  assert.ok(r.git(r.origin, 'branch', '--list', 'answers/*'), 'the PR branch stays on the remote');
  assert.equal(r.git(r.work, 'branch', '--list', 'answers/*'), '', 'but not locally');
});

test('cli: ./atr answers --check passes on the fixtures and fails with a message on a broken answer', () => {
  const atr = (args, env = {}) => spawnSync(path.join(ROOT, 'atr'), args, { cwd: ROOT, encoding: 'utf8', env: { ...process.env, NO_COLOR: '1', ...env } });
  const ok = atr(['answers', '--check', '--fixtures']);
  assert.equal(ok.status, 0, ok.stdout + ok.stderr);
  assert.match(ok.stdout, /1 answer · 0 errors/);
  const root = tmp();
  fs.mkdirSync(path.join(root, 'answers'));
  fs.writeFileSync(path.join(root, 'answers', '2026-11-20-x.md'), md('question: q?\nasked: 2026-11-20\nabout: nowhere\ntldr: t.'));
  const bad = atr(['answers', '--check'], { ATR_DATA_ROOT: root });
  assert.equal(bad.status, 1);
  assert.match(bad.stdout, /about "nowhere" is not a place/);
  const list = atr(['answers', '--fixtures']);
  assert.match(list.stdout, /2026-11-20 {2}place yu-garden/);
  const ids = JSON.parse(atr(['answers', '--ids', '--fixtures', '--json']).stdout);
  assert.ok(ids.places.some((p) => p.id === 'yu-garden') && ids.countries.includes('china') && ids.trip === 'trip');
  const dry = atr(['answers', 'publish', '--dry-run', '--fixtures', path.join(root, 'answers', '2026-11-20-x.md')]);
  assert.equal(dry.status, 1);
  assert.match(dry.stderr, /invalid answer file/);
});
