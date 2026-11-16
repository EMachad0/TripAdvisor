// `./atr answers publish`: ship answer files to the hosted site without touching the working tree.
// validate → temp worktree from fresh origin/main → copy (or remove) only those files → commit → push a branch →
// PR with gh → merge (merge commit) → clean up → wait until /healthz reports the merge commit. That, not Coolify's
// deploy status, is what proves the card is live (site.js has the site).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { ROOT } from './paths.js';
import { parseAnswer, checkAnswers, resolveAbout, FILE_RE } from './answers.js';
import { loadPlaces, loadAreas } from './load.js';
import { SITE, answerLink, answerPageLink } from './site.js';

const MIN = 60e3;

export const COMMIT_TRAILER = 'Co-Authored-By: Claude <noreply@anthropic.com>';
export const PR_FOOTER = '🤖 Generated with [Claude Code](https://claude.com/claude-code)';

/** Run a command; never throws. → { code, stdout, stderr } */
export function sh(cmd, args, { cwd, input } = {}) {
  const r = spawnSync(cmd, args, { cwd, input, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
  if (r.error) return { code: 127, stdout: '', stderr: r.error.code === 'ENOENT' ? `${cmd}: command not found` : r.error.message };
  return { code: r.status ?? 1, stdout: (r.stdout || '').trim(), stderr: (r.stderr || '').trim() };
}

export class PublishError extends Error {}
const clip = (s, n) => (s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s);

/** The name an answer has in the repo (answers/<name>.md) from a path, a file name or an id. */
export const answerName = (ref) => { const b = path.basename(String(ref)); return b.endsWith('.md') ? b : `${b}.md`; };

/** Commit title, body and PR title for a set of changes [{ status: added|updated|removed, name, question }]. */
export function describeChanges(changes) {
  const n = (s) => changes.filter((c) => c.status === s).length;
  const title = changes.length === 1
    ? `${{ added: 'Add', updated: 'Update', removed: 'Remove' }[changes[0].status]} answer card: ${clip(changes[0].question || changes[0].name.replace(/\.md$/, ''), 60)}`
    : `Answer cards: ${[['added', 'add'], ['updated', 'update'], ['removed', 'remove']].filter(([s]) => n(s)).map(([s, w]) => `${w} ${n(s)}`).join(', ')}`;
  const lines = changes.map((c) => `- ${c.status}: answers/${c.name}${c.question ? ` (${clip(c.question, 80)})` : ''}`);
  return {
    title,
    commit: `${title}\n\n${lines.join('\n')}\n\nPublished with ./atr answers publish.\n\n${COMMIT_TRAILER}\n`,
    prBody: `Answer cards for the trip site, published with \`./atr answers publish\` (only files under \`answers/\`).\n\n${lines.join('\n')}\n\nMerging deploys them: they show on the place/area pages, on Places › Answers and on Today.\n\n${PR_FOOTER}\n`,
  };
}

/** Errors in the given answer files on their own and against a data root (places, areas, the other answers). */
function precheck(files, dataOpts) {
  const places = loadPlaces(dataOpts).filter((p) => p?.id), areas = loadAreas(dataOpts).filter((a) => a?.id);
  const errs = [], parsed = [];
  for (const f of files) {
    const a = parseAnswer(fs.readFileSync(f, 'utf8'), f);
    for (const e of a.errors) errs.push(`${path.basename(f)}: ${e}`);
    if (a.about) {
      const t = resolveAbout(a.about, { places, areas });
      if (!t || t.ambiguous) errs.push(`${path.basename(f)}: about "${a.about}" ${t?.ambiguous ? 'is ambiguous (write place:<id> or area:<id>)' : 'is not a place, area or country id, nor "trip"'}`);
      else a.target = t;
    }
    parsed.push(a);
  }
  return { errs, parsed };
}

/**
 * Publish answer files. opts: { files, remove, merge = true, dryRun, root = ROOT, run = sh, log, fetchImpl, sleep,
 * remote = 'origin', base = SITE.branch, deployTimeoutMs, dataOpts, site = SITE } → result object.
 * Throws PublishError with a clear message when something is wrong (nothing half-done is left behind locally).
 */
export async function publishAnswers(opts = {}) {
  const site = opts.site || SITE;
  const { files = [], remove = [], merge = true, dryRun = false, root = ROOT, run = sh, log = console.log, remote = 'origin', base = site.branch } = opts;
  const fetchImpl = opts.fetchImpl || fetch;
  const sleep = opts.sleep || ((ms) => new Promise((r) => setTimeout(r, ms)));
  const dataOpts = opts.dataOpts || {};
  const git = (args, cwd = root) => run('git', ['-C', cwd, ...args]);
  const must = (r, what) => { if (r.code !== 0) throw new PublishError(`${what} failed: ${(r.stderr || r.stdout || `exit ${r.code}`).split('\n').slice(0, 4).join(' | ')}`); return r; };

  if (!files.length && !remove.length) throw new PublishError('nothing to publish: give answer files (answers/<date>-<slug>.md) and/or --remove <file>');
  const abs = files.map((f) => path.resolve(f));
  for (const f of abs) {
    if (!fs.existsSync(f) || !fs.statSync(f).isFile()) throw new PublishError(`${f} does not exist`);
    if (!FILE_RE.test(path.basename(f))) throw new PublishError(`${path.basename(f)}: answer files are named <asked>-<short-slug>.md, e.g. 2026-11-21-yu-garden-passport.md`);
  }
  const removeNames = remove.map(answerName);
  for (const n of removeNames) if (!FILE_RE.test(n)) throw new PublishError(`--remove ${n}: not an answer file name (<asked>-<short-slug>.md)`);
  const dup = [...abs.map((f) => path.basename(f)), ...removeNames].find((n, i, xs) => xs.indexOf(n) !== i);
  if (dup) throw new PublishError(`${dup} is given twice`);

  // 1. the files on their own, against this checkout's places and areas
  const pre = precheck(abs, { ...dataOpts, root });
  if (pre.errs.length) throw new PublishError(`invalid answer file${pre.errs.length === 1 ? '' : 's'}:\n  ${pre.errs.join('\n  ')}\nFix them and run ./atr answers --check.`);

  const slug = (abs[0] ? path.basename(abs[0]) : removeNames[0]).replace(/\.md$/, '');
  const branch = `answers/${slug}${abs.length + removeNames.length > 1 ? `-and-${abs.length + removeNames.length - 1}-more` : ''}-${Date.now().toString(36).slice(-5)}`;

  // gh must be there and logged in (checked in a dry run too, as a warning)
  const gh = run('gh', ['auth', 'status']);
  const ghProblem = gh.code === 127 ? 'the GitHub CLI (gh) is not installed' : gh.code !== 0 ? 'gh is not logged in (run `gh auth login`)' : null;

  if (dryRun) {
    const onMain = (n) => git(['cat-file', '-e', `${remote}/${base}:answers/${n}`]).code === 0;
    const changes = [...pre.parsed.map((a) => ({ status: onMain(path.basename(a.file)) ? 'updated' : 'added', name: path.basename(a.file), question: a.question })), ...removeNames.map((n) => ({ status: onMain(n) ? 'removed' : 'missing', name: n }))];
    const d = describeChanges(changes.filter((c) => c.status !== 'missing'));
    const plan = [
      `dry run: nothing fetched, written or pushed. Compared with the local ${remote}/${base} (as of your last fetch).`,
      ...changes.map((c) => `  ${c.status.padEnd(8)} answers/${c.name}${c.status === 'missing' ? `  ← not on ${remote}/${base}: --remove would fail` : ''}`),
      `would: fetch ${remote}/${base}, make a temp worktree, branch ${branch}, commit "${d.title}", push, open a PR to ${base}${merge ? `, merge it (merge commit), wait until /healthz reports the merge commit` : ' and stop (--no-merge)'}.`,
      ...(ghProblem ? [`warning: ${ghProblem}; a real publish would stop there.`] : []),
      ...pre.parsed.map((a) => `card: ${answerLink(a.id, site)}`),
    ];
    for (const l of plan) log(l);
    return { ok: !changes.some((c) => c.status === 'missing'), dryRun: true, branch, changes, title: d.title, ghProblem };
  }
  if (ghProblem) throw new PublishError(`${ghProblem}. Nothing was changed.`);

  // 2. a temp worktree from fresh origin/main
  must(git(['fetch', '-q', remote, base]), `git fetch ${remote} ${base}`);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'atr-answers-'));
  const result = { ok: false, branch, pr: null, merged: false, sha: null, links: [] };
  let worktree = false;
  try {
    must(git(['worktree', 'add', '-q', '-b', branch, tmp, `${remote}/${base}`]), 'git worktree add');
    worktree = true;
    fs.mkdirSync(path.join(tmp, 'answers'), { recursive: true });
    for (const f of abs) fs.copyFileSync(f, path.join(tmp, 'answers', path.basename(f)));
    for (const n of removeNames) {
      if (!fs.existsSync(path.join(tmp, 'answers', n))) throw new PublishError(`--remove ${n}: there is no answers/${n} on ${remote}/${base}`);
      must(git(['rm', '-q', '--', `answers/${n}`], tmp), `git rm answers/${n}`);
    }
    // 3. the whole set as it will be on main: ids exist there, slugs are unique
    const chk = checkAnswers({ ...dataOpts, root: tmp });
    if (chk.errors.length) throw new PublishError(`the answers would not be valid on ${base}:\n  ${chk.errors.map((e) => `${path.basename(e.file)}: ${e.message}`).join('\n  ')}${chk.errors.some((e) => /is not a place/.test(e.message)) ? `\n(an id that exists here but not on ${base} means its place or area is not merged yet)` : ''}`);
    must(git(['add', '-A', '--', 'answers'], tmp), 'git add');
    const st = must(git(['status', '--porcelain', '--', 'answers'], tmp), 'git status').stdout;
    if (!st) {
      log(`nothing to publish: ${remote}/${base} already has these exact files.`);
      for (const a of pre.parsed) result.links.push(answerLink(a.id, site));
      return Object.assign(result, { ok: true, unchanged: true });
    }
    const byName = new Map(pre.parsed.map((a) => [path.basename(a.file), a]));
    const changes = st.split('\n').map((l) => ({ code: l.slice(0, 2).trim(), name: path.basename(l.slice(3).trim()) })).map(({ code, name }) => ({ status: code.startsWith('D') ? 'removed' : code.startsWith('A') ? 'added' : 'updated', name, question: byName.get(name)?.question }));
    const d = describeChanges(changes);
    result.changes = changes;
    // 4. commit, push, PR
    must(run('git', ['-C', tmp, 'commit', '-q', '-F', '-'], { input: d.commit }), 'git commit');
    log(`committed: ${d.title}`);
    must(git(['push', '-q', '-u', remote, branch], tmp), `git push ${branch}`);
    const pr = must(run('gh', ['pr', 'create', '--base', base, '--head', branch, '--title', d.title, '--body', d.prBody], { cwd: tmp }), 'gh pr create');
    result.pr = pr.stdout.split('\n').filter((l) => /^https?:\/\//.test(l)).pop() || pr.stdout;
    log(`pull request: ${result.pr}`);
    for (const a of pre.parsed) result.links.push(answerLink(a.id, site), ...(answerPageLink(a.target, a.id, site) ? [answerPageLink(a.target, a.id, site)] : []));
    if (!merge) {
      log('stopped before merging (--no-merge): merge the pull request to put the card live.');
      for (const l of result.links) log(`card (after the merge and deploy): ${l}`);
      return Object.assign(result, { ok: true });
    }
    // 5. merge (a merge commit), then drop the remote branch
    must(run('gh', ['pr', 'merge', result.pr, '--merge'], { cwd: tmp }), `gh pr merge (the pull request stays open: ${result.pr})`);
    const view = run('gh', ['pr', 'view', result.pr, '--json', 'state,mergeCommit'], { cwd: tmp });
    let info = {};
    try { info = JSON.parse(view.stdout); } catch {}
    if (info.state !== 'MERGED') throw new PublishError(`the pull request is not merged (state ${info.state || 'unknown'}): ${result.pr}`);
    result.merged = true;
    result.sha = info.mergeCommit?.oid || null;
    log(`merged into ${base}${result.sha ? ` as ${result.sha.slice(0, 7)}` : ''}`);
    git(['push', '-q', remote, '--delete', branch], tmp);
  } finally {
    if (worktree) git(['worktree', 'remove', '--force', tmp]);
    else fs.rmSync(tmp, { recursive: true, force: true });
    git(['branch', '-q', '-D', branch]);
    git(['worktree', 'prune']);
  }

  // 6. wait until the site serves that merge commit
  const deployTimeoutMs = opts.deployTimeoutMs ?? 15 * MIN;
  const every = 10e3;
  const tries = result.sha ? Math.max(3, Math.ceil(deployTimeoutMs / every)) : 3;
  if (result.sha) log(`waiting until ${site.url}/healthz reports ${result.sha.slice(0, 7)}…`);
  const health = await healthz({ fetchImpl, sleep, tries, every, expectSha: result.sha, site });
  result.health = health;
  const live = health.ok && health.shaMatched;
  if (live) log(`the site serves ${result.sha.slice(0, 7)} (/healthz ${health.status}): the card is live.`);
  else log(`deploy not confirmed: /healthz ${healthSummary(health, result.sha)}. Check again in a few minutes.`);
  result.live = live;
  // Your copy of a published file is now also on main: a later `git pull` refuses to overwrite a local copy, so say how to drop it.
  result.tidy = [];
  for (const f of abs) {
    const rel = path.relative(root, f);
    if (rel.startsWith('..') || path.isAbsolute(rel)) continue;
    const tracked = git(['ls-files', '--error-unmatch', '--', rel]).code === 0;
    result.tidy.push(tracked ? `git restore -- ${rel}` : `rm ${rel}`);
  }
  if (result.tidy.length) log(`your local copy is on ${base} now; drop it so the next pull brings the merged one: ${result.tidy.join(' && ')}`);
  for (const l of result.links) log(`card: ${l}`);
  result.ok = true;
  return result;
}

/** One phrase for the deploy-not-confirmed line. */
function healthSummary(h, sha) {
  if (h.error) return `did not answer (${h.error})`;
  if (!h.ok && !h.status) return 'did not answer';
  if (h.sha && sha && h.sha !== sha) return `still reports ${h.sha.slice(0, 7)}, not ${sha.slice(0, 7)}`;
  if (h.status === 200 && h.shaMissing) return 'answers 200 but reports no commit sha';
  return `answers ${h.status}`;
}

/**
 * GET <site>/healthz until it is up: HTTP 200 and, when `expectSha` is given, that sha in the body ({ok, sha}).
 * → { ok, status, sha, shaMatched, shaMissing } or { ok: false, error }
 */
export async function healthz({ fetchImpl = fetch, sleep, tries = 3, every = 10e3, expectSha = null, site = SITE } = {}) {
  let last = {};
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetchImpl(`${site.url}/healthz`, { signal: AbortSignal.timeout(10e3), headers: { accept: 'application/json' } });
      let sha = null;
      if (typeof r.json === 'function') {
        try { const body = await r.json(); if (body && typeof body.sha === 'string' && body.sha) sha = body.sha; } catch { /* not JSON: no sha */ }
      }
      const shaMatched = !!(expectSha && sha && sha === expectSha);
      const shaMissing = !sha;
      last = { ok: false, status: r.status, sha, shaMatched, shaMissing };
      const up = r.ok && (!expectSha || shaMatched);
      if (up) return { ...last, ok: true };
    } catch (e) { last = { ok: false, error: e.cause?.code || e.message }; }
    if (i < tries - 1) await sleep(every);
  }
  return last;
}
