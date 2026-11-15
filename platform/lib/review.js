// Independent review: a fresh headless session fact-checks a page it did not write.
// Results live in reviews/<id>.yaml (written only here; never by curators or the game).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { parse } from 'yaml';
import { ROOT, dataRoots, localDate } from './paths.js';
import { t, check } from './schema/dsl.js';
import { toYaml } from './yamlio.js';
import { loadPlaces, loadAreas, resolvePlace, resolveArea } from './load.js';

export const REVIEW_TOOLS = ['Read', 'Glob', 'Grep', 'Bash', 'WebSearch', 'WebFetch', 'Agent', 'ToolSearch'];
// No file edits anywhere, and no `atr` command that writes content or starts other sessions.
export const REVIEW_DENIED = ['Write', 'Edit', 'MultiEdit', 'NotebookEdit', ...['new', 'media', 'run', 'review', 'schema'].flatMap((c) => [`Bash(./atr ${c}:*)`, `Bash(npm run atr -- ${c}:*)`, `Bash(node platform/cli/atr.js ${c}:*)`])];

const issueSpec = t.object({
  severity: t.enum(['blocker', 'should', 'nit'], { desc: 'blocker = wrong or unverifiable fact the traveler would act on, or a broken page; should = worth fixing before the traveler sees it; nit = polish.', example: 'blocker' }),
  field: t.string({ max: 120, desc: 'The YAML path the problem is in.', example: 'hours.summary' }),
  problem: t.string({ max: 600, example: "Page says trains run until 23:00; the operator's page says last train 22:30." }),
  evidence: t.opt(t.string({ max: 600, desc: 'URL (and a short quote) that shows it.', example: 'https://example.org/timetable' })),
  fix: t.string({ max: 600, example: 'Change to 06:30–22:30 and cite the operator page.' }),
});
const factsSpec = t.object({ supported: t.int({ min: 0, example: 9 }), unsupported: t.int({ min: 0, example: 2 }), contradicted: t.int({ min: 0, example: 1 }) }, { desc: 'How many hard facts were checked, by result.' });
/** What the reviewer session must answer with. */
export const reviewOutputSpec = t.object({
  facts: factsSpec,
  earlier: t.opt(t.array(t.object({
    n: t.int({ min: 1, desc: 'Number of the earlier finding, as listed in the re-review prompt.', example: 1 }),
    status: t.enum(['resolved', 'open'], { example: 'resolved' }),
    evidence: t.opt(t.string({ max: 600, desc: 'What shows it: the new text, a URL, a quote.', example: 'hours.summary now reads 06:30–22:30 and cites the operator page.' })),
  }), { max: 40, desc: 'Re-reviews only: one entry per earlier blocker / should.' })),
  issues: t.array(issueSpec, { max: 40 }),
  summary: t.string({ max: 600, desc: 'One or two sentences.', example: 'Solid page; one closing time is wrong.' }),
  verdict: t.opt(t.enum(['pass', 'fix'], { desc: 'Ignored: the runner derives it from the issues.' })),
});
/** reviews/<id>.yaml */
export const reviewSpec = t.object({
  id: t.slug({ example: 'liziba-station' }),
  type: t.opt(t.enum(['place', 'area'], { desc: 'What was reviewed. Missing = place (files written before areas could be reviewed).', example: 'place' })),
  reviewed: t.date({ example: '2026-11-10' }),
  verdict: t.enum(['pass', 'fix'], { desc: 'fix when there is any blocker or should.', example: 'fix' }),
  content_hash: t.string({ max: 80, desc: 'sha256 of place.yaml at review time.' }),
  facts: factsSpec,
  issues: t.array(issueSpec, { max: 40 }),
  resolved: t.opt(t.array(t.object({
    field: t.string({ max: 120 }),
    problem: t.string({ max: 600 }),
    evidence: t.opt(t.string({ max: 600 })),
  }), { max: 40, desc: 'Re-reviews: findings of the earlier review that are now resolved.' })),
  rereview_of: t.opt(t.string({ max: 80, desc: 'Re-reviews: content_hash of the earlier review this one followed up on.' })),
  summary: t.string({ max: 600 }),
  model: t.opt(t.string({ max: 80 })),
  cost_usd: t.opt(t.number({ min: 0 })),
});
// Plain JSON Schema for `claude --json-schema` (no DSL extras).
export const REVIEW_JSON_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['facts', 'issues', 'summary'],
  properties: {
    facts: { type: 'object', additionalProperties: false, required: ['supported', 'unsupported', 'contradicted'], properties: { supported: { type: 'integer' }, unsupported: { type: 'integer' }, contradicted: { type: 'integer' } } },
    issues: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['severity', 'field', 'problem', 'fix'], properties: { severity: { enum: ['blocker', 'should', 'nit'] }, field: { type: 'string' }, problem: { type: 'string' }, evidence: { type: 'string' }, fix: { type: 'string' } } } },
    summary: { type: 'string' },
  },
};

/** The schema for a re-review: the same answer plus a status for every earlier finding. */
export const REREVIEW_JSON_SCHEMA = {
  ...REVIEW_JSON_SCHEMA, required: ['facts', 'earlier', 'issues', 'summary'],
  properties: { ...REVIEW_JSON_SCHEMA.properties, earlier: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['n', 'status'], properties: { n: { type: 'integer' }, status: { enum: ['resolved', 'open'] }, evidence: { type: 'string' } } } } },
};

/** Where copies of reviewed files are kept (keyed by content hash), so a later review can diff against them. */
export function reviewedCopyDir(opts = {}) {
  const roots = dataRoots(opts);
  return roots.fixtures ? path.join(roots.cache, 'reviewed') : path.join(path.dirname(roots.reviews), '.cache', 'reviewed');
}
const copyFile = (id, hash, opts) => path.join(reviewedCopyDir(opts), `${id}-${hash}.yaml`);

/** Line diff (LCS) as unified-style text with a little context. Empty string when nothing changed. */
export function lineDiff(before, after, { context = 2, maxChars = 14000 } = {}) {
  const a = String(before).split('\n'), b = String(after).split('\n');
  const n = a.length, m = b.length;
  const lcs = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) lcs[i][j] = a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
  const ops = [];
  for (let i = 0, j = 0; i < n || j < m;) {
    if (i < n && j < m && a[i] === b[j]) { ops.push({ t: ' ', s: a[i], la: ++i, lb: ++j }); }
    else if (i < n && (j === m || lcs[i + 1][j] >= lcs[i][j + 1])) { ops.push({ t: '-', s: a[i], la: ++i }); } // removals before additions
    else { ops.push({ t: '+', s: b[j], lb: ++j }); }
  }
  if (!ops.some((o) => o.t !== ' ')) return '';
  const keep = new Uint8Array(ops.length);
  ops.forEach((o, k) => { if (o.t !== ' ') for (let x = Math.max(0, k - context); x <= Math.min(ops.length - 1, k + context); x++) keep[x] = 1; });
  const out = [];
  let last = -2;
  ops.forEach((o, k) => {
    if (!keep[k]) return;
    if (k !== last + 1) out.push(`@@ line ${o.lb ?? o.la} @@`);
    out.push(`${o.t}${o.s}`);
    last = k;
  });
  const text = out.join('\n');
  return text.length > maxChars ? `${text.slice(0, maxChars)}\n… (diff cut; read the file for the rest)` : text;
}

/**
 * What a re-review builds on: the earlier review of the same page (same type) and, when a copy of the file as
 * reviewed exists, the diff since then. Returns null when there is no earlier review or no copy (→ full review).
 */
export function rereviewContext(ref, type, opts = {}) {
  let prev;
  try { prev = parse(fs.readFileSync(path.join(dataRoots(opts).reviews, `${ref.id}.yaml`), 'utf8')); } catch { return null; }
  if (!prev || (prev.type || 'place') !== type || !prev.content_hash) return null;
  const copy = copyFile(ref.id, prev.content_hash, opts);
  if (!fs.existsSync(copy)) return null;
  const open = (Array.isArray(prev.issues) ? prev.issues : []).filter((i) => i.severity === 'blocker' || i.severity === 'should');
  return { previous: prev, open, diff: lineDiff(fs.readFileSync(copy, 'utf8'), fs.readFileSync(ref.file, 'utf8')) };
}

/** The prompt for a re-review: close the loop on the earlier findings, check what changed, and only blockers elsewhere. */
export function rereviewPrompt(id, file, ctx, { fixtures, type = 'place' } = {}) {
  const list = ctx.open.map((i, k) => `${k + 1}. [${i.severity}] ${i.field}: ${i.problem}${i.evidence ? `\n   evidence then: ${i.evidence}` : ''}\n   asked fix: ${i.fix}`).join('\n');
  return `RE-REVIEW of the ${type === 'area' ? 'AREA' : 'place'} page \`${id}\` (${path.relative(ROOT, file)})${fixtures ? ' — a platform test fixture; pass --fixtures to every ./atr command' : ''}. It was reviewed on ${String(ctx.previous.reviewed).slice(0, 10)} and has been edited since. Follow the reviewer guide, section "Re-reviewing a page". This is a follow-up, not a new audit.

EARLIER FINDINGS (blockers and shoulds)
${list || '(none)'}

CHANGES SINCE THAT REVIEW (diff of the YAML; "-" was removed, "+" was added)
${ctx.diff || '(no changes)'}

Do three things:
(a) For each earlier finding, decide \`resolved\` or \`open\`, with evidence. Put it in "earlier" as { n, status, evidence }. Repeat every finding that is still open in "issues".
(b) Fact-check what changed in the diff with the normal rules (open the sources the new text relies on). New problems there go in "issues" with their normal severity.
(c) On content that did not change, raise only blockers. Do not look for new shoulds or nits there.
Finish with the JSON object and nothing else.`;
}

export const contentHash = (file) => { try { return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'); } catch { return null; } };
export const verdictOf = (issues) => ((issues || []).some((i) => i.severity === 'blocker' || i.severity === 'should') ? 'fix' : 'pass');

/** All reviews: Map id → review object (invalid files are skipped). */
export function loadReviews(opts = {}) {
  const dir = dataRoots(opts).reviews;
  const out = new Map();
  if (!fs.existsSync(dir)) return out;
  for (const f of fs.readdirSync(dir).sort()) {
    if (!/\.ya?ml$/.test(f) || f.startsWith('_') || f.startsWith('.')) continue;
    try { const r = parse(fs.readFileSync(path.join(dir, f), 'utf8')); if (r && typeof r === 'object' && r.id) out.set(r.id, r); } catch { /* skip */ }
  }
  return out;
}

/**
 * Review state of a loaded place. reviews: Map from loadReviews() (loaded when omitted).
 * Returns { state: 'none' | 'pass' | 'fix' | 'stale', reviewed, issues, summary }.
 * stale = place.yaml changed since the review, so its findings may no longer apply.
 */
export function reviewStatus(place, reviews) {
  const map = reviews instanceof Map ? reviews : loadReviews(reviews || {});
  const r = map.get(place?.id);
  const type = place && !('category' in place) && ('region' in place || 'scope' in place) ? 'area' : 'place';
  if (!r || (r.type || 'place') !== type) return { state: 'none', reviewed: null, issues: [] };
  const reviewed = String(r.reviewed).slice(0, 10);
  const hash = place?._meta?.file ? contentHash(place._meta.file) : null;
  if (hash && r.content_hash && hash !== r.content_hash) return { state: 'stale', reviewed, issues: [], summary: r.summary };
  const issues = Array.isArray(r.issues) ? r.issues : [];
  return { state: verdictOf(issues), reviewed, issues, summary: r.summary };
}

export function reviewerSystemPrompt() {
  const guide = fs.readFileSync(path.join(ROOT, 'docs', 'REVIEWER-GUIDE.md'), 'utf8');
  return `You are the REVIEWER for the Asia Trip Ranker project (repo root: ${ROOT}). You are running headless and fully AFK: never ask questions. You did not write the page you review.

HARD RULES
- Read-only. Never create, edit or delete any file, and never run a command that does (no ./atr new, ./atr media, ./atr run, ./atr review; no redirects into files). ./atr shot, ./atr validate, ./atr taste, ./atr gaps and ./atr links are fine.
- Your final message is ONLY the JSON object described in the guide.

The reviewer guide follows. Follow it exactly.

${guide}`;
}

export function reviewPrompt(id, file, { fixtures, type = 'place' } = {}) {
  if (type === 'area') return `Review the AREA page \`${id}\` (${path.relative(ROOT, file)})${fixtures ? ' — a platform test fixture; pass --fixtures to every ./atr command' : ''}. Follow the reviewer guide, section "Reviewing an area": fact-check getting there, the suggested days, the winter note and every hard fact in the blocks against the listed sources, look at the page (./atr shot ${id} --area), judge it for this traveler. Finish with the JSON object and nothing else.`;
  return `Review the place page \`${id}\` (${path.relative(ROOT, file)})${fixtures ? ' — a platform test fixture; pass --fixtures to every ./atr command' : ''}. Work through the reviewer guide: fact-check every hard fact against the listed sources, look at the page, judge it for this traveler. Finish with the JSON object and nothing else.`;
}

export function reviewArgs({ prompt, model, effort = 'medium', maxBudgetUsd, resume, system = true, rereview = false }) {
  const args = ['-p', prompt, '--output-format', 'stream-json', '--verbose', '--permission-mode', 'dontAsk',
    '--allowedTools', REVIEW_TOOLS.join(','), '--disallowedTools', REVIEW_DENIED.join(','),
    '--json-schema', JSON.stringify(rereview ? REREVIEW_JSON_SCHEMA : REVIEW_JSON_SCHEMA)];
  if (system) args.push('--append-system-prompt', reviewerSystemPrompt());
  if (resume) args.push('--resume', resume);
  if (model) args.push('--model', model);
  if (effort) args.push('--effort', effort);
  if (maxBudgetUsd) args.push('--max-budget-usd', String(maxBudgetUsd));
  return args;
}

/** Find the JSON object in a session result: structured output first, then a fenced block, then the outermost braces. */
export function extractJson(result) {
  const so = result?.structured_output;
  if (so && typeof so === 'object') return so;
  const text = String(result?.result ?? result ?? '');
  const tries = [...[...text.matchAll(/```(?:json)?\s*([\s\S]*?)```/g)].map((m) => m[1]).reverse(), text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1), text];
  for (const s of tries) { try { const j = JSON.parse(s.trim()); if (j && typeof j === 'object' && !Array.isArray(j)) return j; } catch { /* next */ } }
  return null;
}

/** Parse + validate a reviewer answer. Returns { data } or { errors: [text] }. */
export function parseReviewOutput(result) {
  const j = extractJson(result);
  if (!j) return { errors: ['the final message has no JSON object'] };
  const errs = check(reviewOutputSpec, j).filter((i) => i.level === 'error');
  if (errs.length) return { errors: errs.map((e) => `${e.path}: ${e.message}${e.expected ? ` (expected ${e.expected})` : ''}`) };
  return { data: { facts: j.facts, issues: j.issues, summary: j.summary }, earlier: Array.isArray(j.earlier) ? j.earlier : null };
}

/**
 * Review one place. opts: { id, model, effort, maxBudgetUsd, fixtures, timeoutMin, dryRun, log, runDir }
 * Returns { id, file, verdict, issues, facts, summary, cost_usd, model, parsedFirstTime, error?, reviewFile }
 */
export async function reviewPlace(opts) {
  const { runClaude, displayCommand } = await import('./runner.js');
  const log = opts.log || (() => {});
  const fixtures = !!opts.fixtures;
  // A place id wins; an area id (or opts.type: 'area') reviews the area page.
  const place = opts.type === 'area' ? null : resolvePlace(opts.id, { fixtures });
  const ref = place || (opts.type === 'place' ? null : resolveArea(opts.id, { fixtures }));
  const type = place ? 'place' : 'area';
  if (!ref) return { id: opts.id, error: `place "${opts.id}" not found` };
  const roots = dataRoots({ fixtures });
  // A page with an earlier review (and a copy of the file as it was reviewed) gets a re-review: the earlier
  // findings plus the diff since then. `full: true` forces a new audit.
  const ctx = opts.full ? null : rereviewContext(ref, type, { fixtures });
  const prompt = ctx ? rereviewPrompt(ref.id, ref.file, ctx, { fixtures, type }) : reviewPrompt(ref.id, ref.file, { fixtures, type });
  const first = reviewArgs({ prompt, model: opts.model, effort: opts.effort, maxBudgetUsd: opts.maxBudgetUsd, rereview: !!ctx });
  if (opts.dryRun) { log(displayCommand(first)); return { id: ref.id, dryRun: true, args: first }; }
  const hash = contentHash(ref.file);
  const reviewedText = fs.readFileSync(ref.file, 'utf8'); // kept after the review, so the next one can diff against it
  const dir = opts.runDir || path.join(roots.runs, `${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}-review`);
  fs.mkdirSync(dir, { recursive: true });
  const env = { ...process.env, ...(fixtures ? { ATR_FIXTURES: '1' } : {}), FORCE_COLOR: '0', NO_COLOR: '1' };
  const timeoutMs = (opts.timeoutMin ?? 30) * 60000;
  let cost = 0, prevTotal, model, sessionId, parsed, parsedFirstTime = true, tools = 0;
  const onEvent = (ev) => {
    if (ev.type === 'system' && ev.model) model = ev.model;
    if (ev.type === 'assistant') for (const c of ev.message?.content || []) if (c.type === 'tool_use') { tools++; log(`   · ${c.name} ${JSON.stringify(c.input).slice(0, 110)}`); }
  };
  for (let attempt = 1; attempt <= 2; attempt++) {
    const args = attempt === 1 ? first : reviewArgs({ prompt: `Your last message could not be used: ${parsed.errors.join('; ')}. Reply again with ONLY the JSON object from the reviewer guide (facts, ${ctx ? 'earlier, ' : ''}issues, summary). No prose, no code fence.`, resume: sessionId, model: opts.model, effort: opts.effort, maxBudgetUsd: opts.maxBudgetUsd, system: !sessionId, rereview: !!ctx });
    fs.writeFileSync(path.join(dir, `review-${ref.id}-${attempt}.command.txt`), displayCommand(args) + '\n');
    const res = await runClaude(args, path.join(dir, `review-${ref.id}-${attempt}`), { env, timeoutMs, onEvent });
    sessionId = res.sessionId || sessionId;
    cost += sessionCost(res.result, prevTotal) || 0; prevTotal = res.result?.total_cost_usd; // total_cost_usd is cumulative across --resume
    if (!res.result) return { id: ref.id, file: ref.file, error: `reviewer session failed (exit ${res.code}); see ${dir}`, cost_usd: cost, dir };
    parsed = parseReviewOutput(res.result);
    if (parsed.data) break;
    parsedFirstTime = false;
    log(`   reviewer answer not usable (${parsed.errors[0]}); asking once more`);
  }
  if (!parsed.data) return { id: ref.id, file: ref.file, error: `reviewer did not return valid JSON: ${parsed.errors.join('; ')}`, cost_usd: cost, parsedFirstTime, dir };
  const tampered = contentHash(ref.file) !== hash;
  // Re-review: close the loop on the earlier findings. One the reviewer calls open (or does not mention at all,
  // when it reported statuses) stays open even if it forgot to repeat it; the rest are recorded as resolved.
  let resolved;
  if (ctx) {
    const same = (a, b) => a.field === b.field;
    const status = new Map((parsed.earlier || []).map((e) => [e.n, e]));
    resolved = [];
    ctx.open.forEach((old, k) => {
      const st = status.get(k + 1);
      const repeated = parsed.data.issues.some((i) => same(i, old));
      const isOpen = repeated || (parsed.earlier ? st?.status !== 'resolved' : false);
      if (isOpen && !repeated) parsed.data.issues.unshift(old);
      if (!isOpen) resolved.push({ field: old.field, problem: old.problem, ...(st?.evidence ? { evidence: st.evidence } : {}) });
    });
  }
  const review = { id: ref.id, type, reviewed: localDate(), verdict: verdictOf(parsed.data.issues), content_hash: hash, facts: parsed.data.facts, issues: parsed.data.issues, ...(ctx ? { resolved, rereview_of: ctx.previous.content_hash } : {}), summary: parsed.data.summary, ...(model ? { model } : {}), cost_usd: Math.round(cost * 1000) / 1000 };
  try { fs.mkdirSync(reviewedCopyDir({ fixtures }), { recursive: true }); fs.writeFileSync(copyFile(ref.id, hash, { fixtures }), reviewedText); } catch { /* the next review is then a full one */ }
  fs.mkdirSync(roots.reviews, { recursive: true });
  const reviewFile = path.join(roots.reviews, `${ref.id}.yaml`);
  fs.writeFileSync(reviewFile, `# Independent review of ${type === 'area' ? 'area ' : ''}${ref.id}. Written by \`./atr review\`; do not edit by hand.\n${toYaml(review)}`);
  return { ...review, file: ref.file, reviewFile, parsedFirstTime, tools, changedDuringReview: tampered, rereview: !!ctx, dir };
}

/** Place ids to review: given ids, or every place (all), or those never reviewed / stale (changed). */
export function reviewTargets({ ids = [], changed, all, fixtures } = {}) {
  if (ids.length) return ids;
  const items = [...loadPlaces({ fixtures }), ...loadAreas({ fixtures })];
  if (all) return [...new Set(items.map((p) => p.id))];
  if (!changed) return [];
  const reviews = loadReviews({ fixtures });
  return [...new Set(items.filter((p) => ['none', 'stale'].includes(reviewStatus(p, reviews).state)).map((p) => p.id))];
}

/**
 * Cost of ONE claude call from its result event. `total_cost_usd` of a resumed session is cumulative, so
 * prefer `model_usage_since_last_result`, else subtract the previous call's total.
 */
export function sessionCost(result, prevTotal) {
  const total = result?.total_cost_usd;
  if (typeof total !== 'number') return undefined;
  const since = result.model_usage_since_last_result;
  if (since && typeof since === 'object' && Object.keys(since).length) return Object.values(since).reduce((n, m) => n + (m?.costUSD || 0), 0);
  return typeof prevTotal === 'number' && total >= prevTotal ? total - prevTotal : total;
}

/** Review several places, one session each, sequentially. Returns [reviewPlace result]. */
export async function reviewPlaces(ids, opts = {}) {
  const out = [];
  const runDir = opts.runDir || path.join(dataRoots({ fixtures: opts.fixtures }).runs, `${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}-review`);
  for (const id of ids) {
    opts.log?.(`▶ review ${id}…`);
    const r = await (opts.review || reviewPlace)({ ...opts, id, runDir, type: opts.types?.[id] });
    if (!r.dryRun) opts.log?.(r.error ? `   ✖ ${r.error}` : `   ${r.verdict === 'pass' ? '✔ pass' : '✖ fix'}${r.rereview ? ` (re-review: ${r.resolved?.length ?? 0} earlier finding(s) resolved)` : ''} · ${r.issues.length} issue(s) · facts ${r.facts.supported}/${r.facts.unsupported}/${r.facts.contradicted} (supported/unsupported/contradicted)${r.cost_usd !== undefined ? ` · $${r.cost_usd.toFixed(2)}` : ''}`);
    out.push(r);
  }
  return out;
}

/** Issues as text for the curator session (blockers and shoulds, with evidence). */
export function reviewFeedback(results) {
  return results.filter((r) => r.verdict === 'fix').map((r) => `### ${r.id}\n${r.issues.filter((i) => i.severity !== 'nit').map((i) => `- [${i.severity}] ${i.field}: ${i.problem}${i.evidence ? `\n  evidence: ${i.evidence}` : ''}\n  fix: ${i.fix}`).join('\n')}`).join('\n\n');
}
