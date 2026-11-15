// Headless curator runner: claude -p with the curator guide, then validate → feed errors back.
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { ROOT, dataRoots } from './paths.js';
import { validateAll } from './validate.js';
import { resolvePlace, resolveArea } from './load.js';
import { commandWrites, commandWritesFile } from './attribution.js';
import { sessionCost } from './review.js';

// With `--permission-mode dontAsk`, a tool that needs permission runs only when it is on this list;
// everything else is denied without a prompt. Agent (subagents, e.g. the web-fetch helper) and ToolSearch
// (loads deferred tools such as WebSearch) need no permission and ran anyway; they are listed so the
// allow-list matches what a session really uses. Subagents inherit the same allow/deny rules.
export const ALLOWED_TOOLS = ['Read', 'Write', 'Edit', 'Bash', 'WebSearch', 'WebFetch', 'Glob', 'Grep', 'Agent', 'ToolSearch'];
const PROTECTED = ['platform', 'docs', 'config', 'feedback', 'game', 'apps', 'packages', 'tooling', 'deploy', 'scripts', 'package.json', 'package-lock.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml', 'atr', 'README.md'];
// Deny rules win over the allow-list, in the main session and in subagents.
export const DISALLOWED_TOOLS = PROTECTED.flatMap((p) => [`Edit(./${p}/**)`, `Write(./${p}/**)`, `Edit(./${p})`, `Write(./${p})`]);
const SKIP_SNAPSHOT = new Set(['node_modules', '.git', 'build', 'runs', '.cache', 'places', 'areas']);
const SKIP_ANYWHERE = new Set(['node_modules', '.git', '.DS_Store']);
const WRITE_TOOLS = new Set(['Write', 'Edit', 'MultiEdit', 'NotebookEdit']);

export function systemPrompt() {
  const guide = fs.readFileSync(path.join(ROOT, 'docs', 'CURATOR-GUIDE.md'), 'utf8');
  return `You are the CURATOR for the Asia Trip Ranker project (repo root: ${ROOT}). You are running headless and fully AFK: never ask questions, make sensible decisions and note them in your final report.

HARD RULES
- You may only create or modify files under places/ and areas/ (including places/_friction.md for tool friction). Never edit platform/, docs/, config/, feedback/ or any other file.
- Use the ./atr CLI for scaffolding, fx rates, media, validation, builds and screenshots.
- Before you finish, run ./atr validate --all and fix every error in the files YOU created or changed. Other curators work in this repo at the same time: if a file you did not touch has errors, leave it alone and mention it in your report.

The curator guide follows. Follow it exactly.

${guide}`;
}

export function taskPrompt(task, { fixtures } = {}) {
  return `TASK: ${task}

Work through the curator workflow in the guide. ${fixtures ? 'This is a platform smoke test in fixture mode (ATR_FIXTURES=1 is set); do not create or change any files.' : ''}
When done, reply with a short report: what you added/changed (ids), validation result, anything you could not verify, and any friction you logged.`;
}

export function fixPrompt(report) {
  return `\`./atr validate\` still reports errors in the files you created or changed. Fix every error below (edit only your own files under places/ or areas/; leave other curators' files alone even if \`./atr validate --all\` lists errors in them), re-run \`./atr validate <id>\` until your files are clean, then reply with a short report.

${report}`;
}

export function linksFixPrompt(report) {
  return `The link check found dead links on pages you created or changed. For each one, find the page's new URL or replace the source with one you can open (never keep a source you can't open), re-check the facts that came from it, run \`./atr links <id>\` and \`./atr validate --all\`, then reply with a short report.

${report}`;
}

export function reviewFixPrompt(report) {
  return `An independent reviewer opened your sources and checked your pages. Fix every finding below (edit only files under places/ or areas/). If the reviewer is wrong about one, leave the page as it is and say why in \`confidence_note\`. Then run \`./atr validate --all\` until it is clean and reply with a short report: what you changed, and which findings you rejected and why. The same places will be reviewed once more.

${report}`;
}

/** Build the claude CLI argv (without the binary). */
export function claudeArgs({ prompt, resume, model, effort = 'medium', maxBudgetUsd, system = true }) {
  const args = ['-p', prompt, '--output-format', 'stream-json', '--verbose',
    '--permission-mode', 'dontAsk',
    '--allowedTools', ALLOWED_TOOLS.join(','),
    '--disallowedTools', DISALLOWED_TOOLS.join(',')];
  if (system) args.push('--append-system-prompt', systemPrompt());
  if (resume) args.push('--resume', resume);
  if (model) args.push('--model', model);
  if (effort) args.push('--effort', effort);
  if (maxBudgetUsd) args.push('--max-budget-usd', String(maxBudgetUsd));
  return args;
}

export function displayCommand(args) {
  return 'claude ' + args.map((a) => {
    if (a.length > 160) a = a.slice(0, 120).replace(/\n/g, ' ') + `… [${a.length} chars]`;
    return /[\s"'$`\\*()]/.test(a) ? `'${a.replace(/'/g, `'\\''`)}'` : a;
  }).join(' ');
}

function snapshot(dir = ROOT, out = new Map(), rel = '', skipTop = SKIP_SNAPSHOT) {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if ((!rel && skipTop.has(e.name)) || SKIP_ANYWHERE.has(e.name)) continue;
    const r = rel ? `${rel}/${e.name}` : e.name;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) snapshot(full, out, r, skipTop);
    else if (e.isFile()) { try { const s = fs.statSync(full); out.set(r, `${s.size}:${s.mtimeMs}`); } catch { /* removed meanwhile */ } }
  }
  return out;
}

const NONE = new Set();
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const mentions = (cmd, p) => new RegExp(`(^|[\\s'"=<>(/])${esc(p)}($|[\\s'";|&<>)/])`).test(cmd);

/** What the session itself wrote, from stream-json events (main session and subagents). */
export function sessionWrites(events) {
  const files = new Set(), commands = [];
  for (const ev of events) {
    if (ev?.type !== 'assistant') continue;
    for (const c of ev.message?.content || []) {
      if (c?.type !== 'tool_use') continue;
      if (WRITE_TOOLS.has(c.name)) { const f = c.input?.file_path || c.input?.notebook_path; if (f) files.add(path.resolve(ROOT, f)); }
      else if (c.name === 'Bash' && typeof c.input?.command === 'string') commands.push(c.input.command);
    }
  }
  return { files, commands };
}

/** Did a Bash command WRITE to this repo-relative file? (Reading it — cat, head, grep — is not touching it.) */
export function commandTouches(cmd, rel) {
  return commandWritesFile(cmd, rel, { abs: path.join(ROOT, rel) });
}

/**
 * Split files changed outside places/ and areas/ into what the session did (violations) and the rest.
 * changed: repo-relative paths (a deleted file ends in " (deleted)"); writes: sessionWrites() output.
 * A violation needs a Write/Edit tool call on the path, or a Bash command that writes to it.
 */
export function attributeChanges(changed, writes) {
  const violations = [], elsewhere = [];
  for (const entry of changed) {
    const deleted = entry.endsWith(' (deleted)');
    const rel = entry.replace(/ \(deleted\)$/, '');
    const abs = path.join(ROOT, rel);
    const byTool = writes.files.has(abs);
    const byBash = writes.commands.some((cmd) => commandWritesFile(cmd, rel, { abs, deleted }));
    (byTool || byBash ? violations : elsewhere).push(entry);
  }
  return { violations, elsewhere };
}

/** Place and area ids created / changed / deleted between two content snapshots. */
export function contentChanges(before, after, roots = dataRoots()) {
  const out = { places: { created: new Set(), changed: new Set(), deleted: new Set() }, areas: { created: new Set(), changed: new Set(), deleted: new Set() } };
  const keys = new Set([...before.keys(), ...after.keys()]);
  const main = { places: (id, parts) => parts.slice(0, 3).join('/') + '/place.yaml', areas: (id, parts) => parts.join('/') };
  for (const k of keys) {
    if (before.get(k) === after.get(k)) continue;
    const [kind, ...parts] = k.split('/');
    let id = null, mainFile = null;
    if (kind === 'places' && parts.length >= 4) { id = parts[2]; mainFile = `places/${main.places(id, parts)}`; }
    else if (kind === 'areas' && parts.length === 2 && /\.ya?ml$/.test(parts[1])) { id = parts[1].replace(/\.ya?ml$/, ''); mainFile = k; }
    if (!id || id.startsWith('_')) continue;
    const bucket = !before.has(mainFile) && after.has(mainFile) ? 'created' : before.has(mainFile) && !after.has(mainFile) ? 'deleted' : 'changed';
    out[kind][bucket].add(id);
  }
  const arr = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, [...v].sort()]));
  return { places: arr(out.places), areas: arr(out.areas) };
}

function contentSnapshot(roots) {
  const m = new Map();
  for (const kind of ['places', 'areas']) for (const [k, v] of snapshot(roots[kind], new Map(), '', NONE)) m.set(`${kind}/${k}`, v);
  return m;
}

/**
 * The part of a content diff this session did itself: ids named in its Write/Edit paths or Bash commands.
 * (Another curator may be working in the same repo.) With no tool events at all, everything counts.
 */
export function ownContent(content, writes) {
  if (!writes.files.size && !writes.commands.length) return content;
  const files = [...writes.files];
  // Write/Edit on the page's files, or a Bash command that writes to it (a mutating ./atr command with the id,
  // a redirect / mv / cp / rm / sed -i on its path, an inline script naming it). Reading a file is not touching it.
  const touched = (id) => files.some((f) => f.includes(`/${id}/`) || f.endsWith(`/${id}.yaml`)) || writes.commands.some((c) => commandWrites(c, id));
  const pick = (o) => Object.fromEntries(Object.entries(o).map(([k, ids]) => [k, ids.filter(touched)]));
  return { places: pick(content.places), areas: pick(content.areas) };
}

/** "+2 places (a, b) · ~1 place (c) · +1 area (d)" */
export function describeContent(c) {
  const part = (sign, n, word, ids) => (ids.length ? `${sign}${ids.length} ${word}${ids.length === 1 ? '' : 's'} (${ids.join(', ')})` : '');
  return [part('+', 0, 'place', c.places.created), part('~', 0, 'place', c.places.changed), part('−', 0, 'place', c.places.deleted), part('+', 0, 'area', c.areas.created), part('~', 0, 'area', c.areas.changed), part('−', 0, 'area', c.areas.deleted)].filter(Boolean).join(' · ') || 'nothing';
}

/**
 * Post-validate steps: the seam for checks that run once `validate` is clean (round 6: link checks, an
 * independent review pass). A step is `async ({ task, dir, round, fixtures, content }) => ({ name, ok, report })`.
 * When a step returns ok: false, its `report` is fed back to the session like validation errors.
 */
export const POST_VALIDATE_STEPS = [];

function diffSnap(a, b) {
  const changed = [];
  for (const [k, v] of b) if (a.get(k) !== v) changed.push(k);
  for (const k of a.keys()) if (!b.has(k)) changed.push(`${k} (deleted)`);
  return changed;
}

export function runClaude(args, logBase, { env, timeoutMs, onEvent }) {
  return new Promise((resolve) => {
    const out = fs.createWriteStream(`${logBase}.jsonl`);
    const err = fs.createWriteStream(`${logBase}.stderr.log`);
    const child = spawn(process.env.ATR_CLAUDE_BIN || 'claude', args, { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'] });
    let buf = '', sessionId = null, result = null, timedOut = false;
    const events = [];
    const timer = setTimeout(() => { timedOut = true; child.kill('SIGTERM'); }, timeoutMs);
    child.stdout.on('data', (d) => {
      out.write(d);
      buf += d;
      let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i); buf = buf.slice(i + 1);
        try {
          const ev = JSON.parse(line);
          if (ev.session_id) sessionId = ev.session_id;
          if (ev.type === 'result') result = ev;
          events.push(ev);
          onEvent?.(ev);
        } catch { /* partial or non-JSON */ }
      }
    });
    child.stderr.on('data', (d) => err.write(d));
    child.on('close', (code) => { clearTimeout(timer); out.end(); err.end(); resolve({ code, sessionId, result, events, ...(timedOut ? { timedOut: true } : {}) }); });
    child.on('error', (e) => { clearTimeout(timer); err.write(String(e)); out.end(); err.end(); resolve({ code: -1, sessionId, result: null, events, error: e.message }); });
  });
}

/**
 * Why a claude round did not do its work, or null when it ran normally.
 * - usage_limit: the account hit its usage limit (`api_error: usage_limit_reached`); nothing can run until it resets.
 * - api_error: the result says is_error (another API failure).
 * - timeout: the runner stopped the round after --timeout-min; the session was cut off mid-task.
 * - exit: claude exited non-zero without a result.
 */
export function roundFailure(res) {
  const r = res?.result;
  // Only when the round ended on it: a session that hit a limit mid-way and then finished normally is fine.
  const limitEv = (r?.is_error || !r) && [r, ...(res?.events || []).slice(-5)].find((e) => e?.api_error === 'usage_limit_reached');
  if (limitEv) {
    const info = (res.events || []).map((e) => e?.api_error_params?.rate_limit_info).find(Boolean);
    const resetsAt = typeof info?.resetsAt === 'number' ? new Date(info.resetsAt * 1000).toISOString() : undefined;
    return { kind: 'usage_limit', resetsAt, message: (typeof r?.result === 'string' && r.result) || 'usage limit reached' };
  }
  if (res?.timedOut) return { kind: 'timeout', message: 'stopped by the runner timeout' };
  if (r?.is_error) return { kind: 'api_error', message: String(r.result || r.api_error || r.subtype || 'error result') };
  if (res && res.code !== 0 && !r) return { kind: 'exit', message: `claude exited with code ${res.code}${res.error ? ` (${res.error})` : ''}` };
  return null;
}

const localTime = (iso) => { const d = new Date(iso); return isNaN(d) ? iso : d.toLocaleString('en-GB', { weekday: 'short', hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short' }); };

export function continuePrompt(minutes) {
  return `The runner stopped your session after ${minutes} minutes (round timeout), possibly in the middle of a step. Check what is left of the task: pages still holding TODOs, images referenced but not downloaded (\`./atr validate <id>\` shows them), media fetches that did not finish. Finish the task, run \`./atr validate --all\` until your files are clean, then reply with a short report.`;
}

function shortReport(v) {
  const lines = [];
  for (const r of v.results.filter((x) => x.kind !== 'taste')) for (const i of r.issues.filter((x) => x.level === 'error')) {
    lines.push(`- ${path.relative(ROOT, r.file)}${i.line ? `:${i.line}` : ''} ${i.path}: ${i.message}${i.expected ? ` (expected ${i.expected})` : ''}${i.example !== undefined ? ` e.g. ${JSON.stringify(i.example)}` : ''}`);
  }
  return lines.join('\n');
}

/**
 * Run the loop. opts: { task, maxRounds=3, dryRun, model, effort, maxBudgetUsd, fixtures, timeoutMin, log(fn), postValidate?: step[],
 *                       links=true, review=true, reviewRounds=1 }
 * After a clean validate: custom post-validate steps, then the link check and the independent review of the pages
 * this session created or changed. Dead links and review findings go back to the same curator session.
 * Returns { dir, rounds, clean, pages, violations, changed_elsewhere, content, cost, cost_curator, cost_review, minutes }
 * - pages: [{ id, type, change, links: 'ok' | 'dead: n' | 'skipped', review: 'pass' | 'fix' | 'error' | 'skipped', open_issues }]
 * - violations: files outside places/ and areas/ that THIS session wrote (Write/Edit tool calls, or named in a Bash command).
 * - changed_elsewhere: other files that changed meanwhile (another process may have done it).
 * - content: place / area ids THIS session created, changed or deleted (attributed from its tool calls).
 * - also_changed_in_repo: the rest of the content diff during the run (other agents); never in headlines or tables.
 */
export async function runCurator(opts) {
  const log = opts.log || console.log;
  const fixtures = !!opts.fixtures;
  const env = { ...process.env, ...(fixtures ? { ATR_FIXTURES: '1' } : {}), FORCE_COLOR: '0', NO_COLOR: '1' };
  const first = claudeArgs({ prompt: taskPrompt(opts.task, { fixtures }), model: opts.model, effort: opts.effort, maxBudgetUsd: opts.maxBudgetUsd });
  if (opts.dryRun) {
    log('Dry run — would execute (cwd ' + ROOT + (fixtures ? ', env ATR_FIXTURES=1' : '') + '):\n');
    log(displayCommand(first));
    log(`\nThen: ./atr validate --all; on errors resume the session with --resume <session_id> and the error list, up to ${opts.maxRounds ?? 3} rounds.${opts.links === false ? '' : ' Then ./atr links on the pages it changed (dead links go back to the session).'}${opts.review === false ? '' : ` Then one reviewer session per changed place (./atr review); findings go back to the session, ${opts.reviewRounds ?? 1} time(s).`} Logs → runs/<timestamp>/`);
    return { dryRun: true, args: first };
  }
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  let dir = path.join(dataRoots().runs, stamp);
  for (let i = 2; fs.existsSync(dir); i++) dir = path.join(dataRoots().runs, `${stamp}-${i}`);
  fs.mkdirSync(dir, { recursive: true });
  const started = Date.now();
  const roots = dataRoots({ fixtures });
  const contentBefore = contentSnapshot(roots);
  const events = [];
  const steps = opts.postValidate ?? POST_VALIDATE_STEPS;
  fs.writeFileSync(path.join(dir, 'task.md'), opts.task + '\n');
  fs.writeFileSync(path.join(dir, 'system-prompt.md'), systemPrompt());
  const before = snapshot();
  const rounds = [];
  let sessionId = null, clean = false;
  const failures = []; // rounds that did not run normally (usage limit, API error, timeout)
  const maxRounds = opts.maxRounds ?? 3;
  // Quality gates after a clean validate: links, then an independent review of the changed places.
  const doLinks = opts.links !== false && !fixtures && process.env.ATR_OFFLINE !== '1';
  const doReview = opts.review !== false && !fixtures;
  const reviewRounds = opts.reviewRounds ?? 1;
  const reviewOpts = { model: opts.reviewModel || opts.model, effort: opts.reviewEffort || opts.effort, maxBudgetUsd: opts.maxBudgetUsd, fixtures, runDir: dir, log, review: opts.reviewFn };
  const linkState = new Map(), reviewState = new Map();   // id → 'ok' | 'dead: n' ; id → reviewPlace result
  let reviewFeedbacks = 0, reviewCost = 0, limit = maxRounds, nextPrompt = taskPrompt(opts.task, { fixtures });
  let prevTotal, otherErrors = [], otherLogged = false;
  const pageErrors = new Map(); // id → error lines of the session's own files (latest round)
  const idOf = (x) => (x.kind === 'place' ? path.basename(path.dirname(x.file)) : path.basename(x.file).replace(/\.ya?ml$/, ''));
  const mine = () => ownContent(contentChanges(contentBefore, contentSnapshot(roots), roots), sessionWrites(events));
  for (let n = 1; n <= limit; n++) {
    const prompt = nextPrompt;
    const args = n === 1 ? first : claudeArgs({ prompt, resume: sessionId, model: opts.model, effort: opts.effort, maxBudgetUsd: opts.maxBudgetUsd, system: !sessionId });
    fs.writeFileSync(path.join(dir, `round-${n}.prompt.md`), prompt + '\n');
    fs.writeFileSync(path.join(dir, `round-${n}.command.txt`), displayCommand(args) + '\n');
    log(`▶ round ${n}/${limit}: running claude${sessionId ? ` (resume ${sessionId.slice(0, 8)})` : ''}…`);
    let tools = 0;
    const res = await runClaude(args, path.join(dir, `round-${n}`), {
      env, timeoutMs: (opts.timeoutMin ?? 60) * 60000,
      onEvent: (ev) => {
        if (ev.type === 'assistant') for (const c of ev.message?.content || []) if (c.type === 'tool_use') { tools++; log(`   · ${c.name} ${JSON.stringify(c.input).slice(0, 110)}`); }
      },
    });
    sessionId = res.sessionId || sessionId;
    events.push(...(res.events || []));
    const failure = roundFailure(res);
    const ran = res.result && !failure; // the gates (links, review) only judge a round that ran to its end
    const v = validateAll({ fixtures });
    // A run is judged only on the files its session touched. Other curators work here too: errors in their
    // files (and in config/taste.yaml) are listed once in the summary and never sent to this session.
    const w = sessionWrites(events);
    const judgeAll = !w.files.size && !w.commands.length; // no tool events at all (tests): everything counts
    const own = mine();
    const ownIds = { place: new Set([...own.places.created, ...own.places.changed]), area: new Set([...own.areas.created, ...own.areas.changed]) };
    const isOwn = (x) => x.kind !== 'taste' && (judgeAll || ownIds[x.kind]?.has(idOf(x)));
    const errsOf = (x) => x.issues.filter((i) => i.level === 'error');
    const ownResults = v.results.filter(isOwn);
    const errors = ownResults.reduce((n, x) => n + errsOf(x).length, 0);
    pageErrors.clear();
    for (const x of ownResults) if (errsOf(x).length) pageErrors.set(idOf(x), errsOf(x).map((i) => `${i.path}: ${i.message}`));
    otherErrors = v.results.filter((x) => x.kind !== 'taste' && !isOwn(x) && errsOf(x).length).map((x) => ({ file: path.relative(ROOT, x.file), errors: errsOf(x).length }));
    if (otherErrors.length && !otherLogged) { otherLogged = true; log(`   note: ${otherErrors.reduce((n, x) => n + x.errors, 0)} validation error(s) in ${otherErrors.length} file(s) this session did not touch (${otherErrors.map((x) => x.file).slice(0, 4).join(', ')}${otherErrors.length > 4 ? ', …' : ''}): not this session's files, not sent to it`); }
    let report = shortReport({ results: ownResults });
    fs.writeFileSync(path.join(dir, `round-${n}.validate.txt`), `${errors} error(s), ${v.warnings} warning(s)\n${report}\n`);
    // Post-validate seam: runs only on a clean validate; a failing step sends the session back to work.
    const post = [];
    const gate = (name, ok, text) => { post.push({ name, ok, report: text || '' }); if (text) fs.writeFileSync(path.join(dir, `round-${n}.${name.replace(/[^a-z0-9-]+/gi, '-')}.txt`), text + '\n'); };
    if (errors === 0 && ran) for (const step of steps) {
      let out;
      try { out = await step({ task: opts.task, dir, round: n, fixtures, content: contentChanges(contentBefore, contentSnapshot(roots), roots) }); } catch (e) { out = { name: step.name || 'post-validate', ok: true, report: `step failed to run: ${e.message}` }; }
      gate(out?.name || step.name || 'post-validate', out?.ok !== false, out?.report);
    }
    let nextKind = 'validate';
    // Gate 1: links of the pages this run created or changed. Dead links go back to the curator.
    if (errors === 0 && ran && doLinks && post.every((x) => x.ok)) {
      const own = mine();
      const files = [...[...own.places.created, ...own.places.changed].map((id) => ({ id, kind: 'place', ...resolvePlace(id, { fixtures }) })), ...[...own.areas.created, ...own.areas.changed].map((id) => ({ id, kind: 'area', ...resolveArea(id, { fixtures }) }))].filter((f) => f.file);
      if (files.length) {
        log(`   checking links of ${files.map((f) => f.id).join(', ')}…`);
        const { linkReport } = await import('./links.js');
        const lr = await (opts.linkReport || linkReport)(files, { fresh: true });
        const dead = [];
        for (const r of lr.results) { const d = r.issues.filter((i) => i.level === 'error'); linkState.set(r.id, d.length ? `dead: ${d.length}` : 'ok'); for (const i of d) dead.push(`- ${path.relative(ROOT, r.file)}${i.line ? `:${i.line}` : ''} ${i.path}: ${i.message}. Fix: ${i.hint}`); }
        gate('links', !dead.length, dead.join('\n'));
        if (dead.length) nextKind = 'links';
      }
    }
    // Gate 2: independent review of the changed places; one feedback round, then a re-review of those places only.
    if (errors === 0 && ran && doReview && post.every((x) => x.ok)) {
      const own = mine();
      const types = Object.fromEntries([...[...own.areas.created, ...own.areas.changed].filter((id) => resolveArea(id, { fixtures })).map((id) => [id, 'area']), ...[...own.places.created, ...own.places.changed].filter((id) => resolvePlace(id, { fixtures })).map((id) => [id, 'place'])]);
      const ids = Object.keys(types).filter((id) => !reviewState.has(id) || reviewState.get(id).verdict !== 'pass');
      if (ids.length) {
        const { reviewPlaces, reviewFeedback } = await import('./review.js');
        const results = await reviewPlaces(ids, { ...reviewOpts, types });
        for (const r of results) { reviewState.set(r.id, r); reviewCost += r.cost_usd || 0; }
        const toFix = results.filter((r) => r.verdict === 'fix');
        if (toFix.length && reviewFeedbacks < reviewRounds) {
          reviewFeedbacks++; limit = Math.max(limit, n + 2); nextKind = 'review'; // the fix round, plus one spare in case the fix breaks validation: the re-review must still happen
          gate('review', false, reviewFeedback(toFix));
        } else gate('review', !toFix.length, toFix.length ? reviewFeedback(toFix) : '');
      }
    }
    const failed = post.filter((x) => !x.ok);
    if (failed.length) report = failed.map((x) => `## ${x.name}\n${x.report}`).join('\n\n');
    // total_cost_usd of a resumed session is cumulative: report what THIS round cost.
    const roundCost = sessionCost(res.result, prevTotal);
    prevTotal = res.result?.total_cost_usd ?? prevTotal;
    const r = { n, exit: res.code, sessionId, tools, cost: roundCost === undefined ? undefined : Math.round(roundCost * 1e4) / 1e4, cost_session_total: res.result?.total_cost_usd, turns: res.result?.num_turns, isError: res.result?.is_error, errors, warnings: v.warnings, post: post.map(({ report: _r, ...x }) => x), validationReport: report, result: res.result?.result };
    rounds.push(r);
    log(`   claude exit ${res.code}${r.cost !== undefined ? `, $${r.cost.toFixed(3)}` : ''}${r.turns ? `, ${r.turns} turns` : ''}; validate: ${errors} error(s), ${v.warnings} warning(s)${post.length ? `; post-validate: ${post.map((x) => `${x.name} ${x.ok ? 'ok' : 'FAILED'}`).join(', ')}` : ''}`);
    if (failure) { r.failure = failure; failures.push({ round: n, ...failure }); }
    // A usage limit or an API error: the session did nothing more and resuming only fails again (the old loop
    // retried at "$0.000, 1 turns" and could report "clean · nothing"). Stop; the summary says why.
    if (failure && failure.kind !== 'timeout') { log(`   ✖ ${failure.kind === 'usage_limit' ? `usage limit reached${failure.resetsAt ? `, resets ${localTime(failure.resetsAt)}` : ''}: no more rounds until then` : `claude failed (${failure.message}); see ${path.join(dir, `round-${n}.stderr.log`)}`}`); break; }
    if (failure?.kind === 'timeout') {
      log(`   ⚠ round ${n} was cut off by the ${opts.timeoutMin ?? 60}-minute timeout`);
      // Clean files after a cut-off do not mean the task is done, and the gates never ran: give the session one more round.
      if (errors === 0 && sessionId) { limit = Math.max(limit, Math.min(n + 1, maxRounds + 1)); if (n < limit) { nextPrompt = continuePrompt(opts.timeoutMin ?? 60); continue; } break; }
    }
    if (errors === 0 && !failed.length) { clean = true; break; }
    // A review that still says "fix" after its feedback round ends the run: the findings stay open in reviews/.
    if (errors === 0 && failed.length === 1 && failed[0].name === 'review' && nextKind !== 'review') break;
    nextPrompt = errors ? fixPrompt(report) : nextKind === 'review' ? reviewFixPrompt(report) : nextKind === 'links' ? linksFixPrompt(report) : fixPrompt(report);
  }
  // Files the runner wrote itself (the reviews of this run) are never violations.
  const runnerWrote = new Set([...reviewState.values()].map((x) => x.reviewFile && path.relative(ROOT, x.reviewFile)).filter(Boolean));
  const { violations, elsewhere } = attributeChanges(diffSnap(before, snapshot()).filter((f) => !runnerWrote.has(f.replace(/ \(deleted\)$/, ''))), sessionWrites(events));
  const content = contentChanges(contentBefore, contentSnapshot(roots), roots);
  const own = ownContent(content, sessionWrites(events));
  const pageOf = (id, type, change) => {
    const rv = reviewState.get(id);
    const open = rv?.issues ? rv.issues.filter((i) => i.severity !== 'nit') : [];
    const errs = pageErrors.get(id) || [];
    // In plain words, why this page keeps the run from being clean.
    const problems = [
      ...(errs.length ? [`${errs.length} validation error${errs.length === 1 ? '' : 's'}: ${errs.slice(0, 2).join('; ')}${errs.length > 2 ? '; …' : ''}`] : []),
      ...(String(linkState.get(id) || '').startsWith('dead') ? [`${linkState.get(id).replace('dead: ', '')} dead link(s): run ./atr links ${id}`] : []),
      ...(rv?.error ? [`review failed: ${rv.error}`] : []),
      ...(open.length && rv.verdict === 'fix' ? [`review still has ${open.length} open issue${open.length === 1 ? '' : 's'}: ${open.slice(0, 3).map((i) => `${i.field} (${i.severity})`).join(', ')}${open.length > 3 ? ', …' : ''}; see reviews/${id}.yaml`] : []),
    ];
    return { id, type, change, validation: errs.length ? `${errs.length} error(s)` : 'ok', links: linkState.get(id) || 'skipped', review: !rv ? 'skipped' : rv.error ? 'error' : rv.verdict, open_issues: open.length, ...(problems.length ? { problems } : {}) };
  };
  const pages = [
    ...['created', 'changed'].flatMap((change) => own.places[change].map((id) => pageOf(id, 'place', change))),
    ...['created', 'changed'].flatMap((change) => own.areas[change].map((id) => pageOf(id, 'area', change))),
  ];
  const lastRound = rounds.at(-1);
  const stopped = failures.find((f) => f.kind !== 'timeout' && f.round === lastRound?.n);
  const cutOff = failures.filter((f) => f.kind === 'timeout');
  if (stopped) clean = false;
  const whyNotClean = clean ? undefined : [
    ...(stopped?.kind === 'usage_limit' ? [`usage limit reached in round ${stopped.round}${stopped.resetsAt ? ` (resets ${localTime(stopped.resetsAt)})` : ''}: the session stopped and the task is NOT done; run it again after the reset`] : []),
    ...(stopped && stopped.kind !== 'usage_limit' ? [`the claude session failed in round ${stopped.round}: ${stopped.message}`] : []),
    ...(cutOff.at(-1)?.round === lastRound?.n ? [`round ${lastRound.n} was cut off by the ${opts.timeoutMin ?? 60}-minute timeout; work may be half done (check for TODOs and images not downloaded)`] : []),
    ...pages.flatMap((p) => (p.problems || []).map((x) => `${p.id}: ${x}`)),
    ...(!stopped && lastRound && lastRound.exit !== 0 && lastRound.cost === undefined ? ['the claude session failed to run (see the stderr log)'] : []),
    ...(lastRound?.post || []).filter((x) => !x.ok && !['links', 'review'].includes(x.name)).map((x) => `post-validate step "${x.name}" failed`),
  ];
  if (whyNotClean && !whyNotClean.length) whyNotClean.push(lastRound?.errors ? `${lastRound.errors} validation error(s) left after ${rounds.length} round(s)` : `ran out of rounds (${rounds.length})`);
  const minus = (all, mine) => Object.fromEntries(Object.entries(all).map(([k, ids]) => [k, ids.filter((id) => !mine[k].includes(id))]));
  const others = { places: minus(content.places, own.places), areas: minus(content.areas, own.areas) };
  const alsoChanged = [...Object.values(others.places), ...Object.values(others.areas)].some((x) => x.length) ? others : undefined;
  const costs = rounds.map((r) => r.cost).filter((x) => typeof x === 'number');
  const curatorCost = costs.reduce((a, b) => a + b, 0);
  const round3 = (x) => Math.round(x * 1000) / 1000;
  const summary = {
    task: opts.task, fixtures, clean, rounds: rounds.map(({ validationReport, ...r }) => r),
    usage_limit: stopped?.kind === 'usage_limit' ? { round: stopped.round, resets_at: stopped.resetsAt, message: stopped.message } : undefined,
    cut_off_rounds: cutOff.length ? cutOff.map((f) => f.round) : undefined,
    why_not_clean: whyNotClean,
    // What THIS session created or changed (from its own tool calls). Headlines and tables use only this.
    content: own, pages,
    // The rest of the content diff: other agents working in the repo at the same time.
    also_changed_in_repo: alsoChanged,
    also_changed_in_repo_note: alsoChanged ? 'Places and areas that changed in the repo during the run, NOT by this session (another curator).' : undefined,
    violations, changed_elsewhere: elsewhere,
    other_errors: otherErrors.length ? otherErrors : undefined,
    other_errors_note: otherErrors.length ? "Validation errors in files this session did not touch (another curator's work in progress). Not counted against this run and never sent to the session." : undefined,
    changed_elsewhere_note: elsewhere.length ? 'Changed outside places/ and areas/ during the run, but not by a tool call of this session: another process (the game agent, the orchestrator) probably did it.' : undefined,
    cost: costs.length || reviewCost ? round3(curatorCost + reviewCost) : undefined,
    cost_curator: costs.length ? round3(curatorCost) : undefined, cost_review: reviewState.size ? round3(reviewCost) : undefined,
    minutes: Math.round(((Date.now() - started) / 60000) * 10) / 10, dir,
  };
  fs.writeFileSync(path.join(dir, 'summary.json'), JSON.stringify(summary, null, 2));
  if (rounds.at(-1)?.result) fs.writeFileSync(path.join(dir, 'final-report.md'), rounds.at(-1).result + '\n');
  return summary;
}

/**
 * Run the top N tasks from `atr next`, one session each, recomputing the list between tasks.
 * opts: runCurator options (no task) + { count=1, country, next?: (opts) => {tasks}, run?: runCurator }
 * Returns { runs: [{ rank, kind, country, task, why, ...summary }], dryRun? }
 */
export async function runAuto(opts = {}) {
  const log = opts.log || console.log;
  const { nextTasks } = await import('./next.js');
  const next = opts.next || ((o) => nextTasks(o));
  const run = opts.run || runCurator;
  const count = Math.max(1, opts.count ?? 1);
  const nextOpts = { fixtures: opts.fixtures || undefined, country: opts.country, count: count + 20 };
  if (opts.dryRun) {
    const tasks = next(nextOpts).tasks.slice(0, count);
    log(`Dry run — would run ${tasks.length} task(s) one after another, recomputing \`atr next\` between them:\n`);
    for (const t of tasks) {
      log(`${t.rank}. [${t.kind}${t.country ? ` · ${t.country}` : ''}] ${t.task}`);
      log(`   ${displayCommand(claudeArgs({ prompt: taskPrompt(t.task, { fixtures: !!opts.fixtures }), model: opts.model, effort: opts.effort, maxBudgetUsd: opts.maxBudgetUsd }))}\n`);
    }
    return { dryRun: true, tasks, runs: [] };
  }
  const runs = [], tried = new Set();
  for (let i = 1; i <= count; i++) {
    const t = next(nextOpts).tasks.find((x) => !tried.has(x.task));
    if (!t) { log('Nothing left to do.'); break; }
    tried.add(t.task);
    log(`\n━━ task ${i}/${count} [${t.kind}${t.country ? ` · ${t.country}` : ''}] ${t.task}`);
    const r = await run({ ...opts, task: t.task, log });
    runs.push({ ...t, ...r });
    if (r.usage_limit) { log(`Usage limit reached${r.usage_limit.resets_at ? ` (resets ${localTime(r.usage_limit.resets_at)})` : ''}: not starting the remaining ${count - i} task(s).`); break; }
  }
  return { runs };
}
