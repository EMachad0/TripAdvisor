// Coder round 11B: renderer, schema, validate, scaffold, runner, shot/build (2026-11-12).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { parse } from 'yaml';
import { tmpDir, fixturePlace, fixtureCredits, fixtureMedia } from './helpers.js';
import { FIXTURES } from '../lib/paths.js';
import { renderPlacePage, renderAreaPage, renderIndexPage, areaPlaces, styles, copyAssets, hasPlaceholders, bookBadgeText, markSeen, readSeenState, newFeedback } from '../lib/index.js';
import { validatePlace, validateArea, validateAreaFile } from '../lib/validate.js';
import { labelHasDates, titleStyle } from '../lib/render/blocks.js';
import { whenLabel, eventDates } from '../lib/when.js';
import { methodLabel } from '../lib/render/util.js';
import { roundFailure } from '../lib/runner.js';
import { placeTemplate, areaTemplate } from '../lib/scaffold.js';

const ctx = () => ({ credits: fixtureCredits(), mediaFiles: fixtureMedia(), fixtureMode: true, now: '2026-11-12' });
const errors = (issues) => issues.filter((i) => i.level === 'error');
const page = (p, o = {}) => renderPlacePage(p, { credits: fixtureCredits(), fragment: true, ...o });

test('cost block: the real budget share in the text, the bar capped at 100%, marked over budget; one number format per column', () => {
  const p = fixturePlace();
  const cb = p.blocks.find((b) => b.type === 'cost_breakdown');
  const total = cb.items.filter((i) => !i.optional).reduce((n, i) => n + (i.brl || 0), 0);
  const budget = Math.round(total / 1.12 * 100) / 100; // ≈ 112%
  const html = page(p, { budgetPerDay: budget });
  const m = html.match(/<div class="budget-bar[^"]*">.*?<\/div><\/div><\/div>/s)[0];
  assert.match(m, /budget-bar--over/);
  assert.match(m, /Over budget:<\/b> 11[12]% of your/);
  assert.match(m, /width:100%/, 'only the fill stops at 100%');
  assert.doesNotMatch(m, /\b100% of your/);
  const under = page(p, { budgetPerDay: total * 4 });
  assert.doesNotMatch(under, /budget-bar--over/);
  // mixed rows: R$ 2,48 next to R$ 49 → every row gets centavos
  p.blocks = p.blocks.map((b) => (b.type === 'cost_breakdown' ? { ...b, items: [{ label: 'Metro', local: 3, brl: 2.48 }, { label: 'Ticket', local: 65, brl: 49 }] } : b));
  const rows = [...page(p).matchAll(/<td class="num brl">([^<]*)<\/td>/g)].map((x) => x[1]);
  assert.ok(rows.includes('R$ 2,48') && rows.includes('R$ 49,00'), rows.join(' | '));
});

test('runner: a usage-limit result is a failed round, not "clean · nothing"; no retries; the summary says when it resets', async () => {
  const limitEvents = [
    { type: 'assistant', message: { content: [{ type: 'text', text: "You've hit your 5-hour limit · resets 5am" }] }, error: 'rate_limit', api_error: 'usage_limit_reached', api_error_params: { rate_limit_info: { resetsAt: 1794470400 } } },
  ];
  const result = { type: 'result', is_error: true, api_error: 'usage_limit_reached', result: "You've hit your 5-hour limit · resets 5am", num_turns: 1, total_cost_usd: 0 };
  const f = roundFailure({ code: 1, result, events: limitEvents });
  assert.equal(f.kind, 'usage_limit');
  assert.equal(f.resetsAt, new Date(1794470400 * 1000).toISOString());
  assert.equal(roundFailure({ code: 0, result: { type: 'result', result: 'done' }, events: [] }), null);
  assert.equal(roundFailure({ code: 1, result: { type: 'result', is_error: true, result: 'boom' }, events: [] }).kind, 'api_error');
  assert.equal(roundFailure({ code: null, timedOut: true, result: null, events: [] }).kind, 'timeout');

  const root = tmpDir();
  fs.mkdirSync(path.join(root, 'places'), { recursive: true });
  const fake = path.join(root, 'fake-claude.mjs');
  fs.writeFileSync(fake, `#!/usr/bin/env node
import fs from 'node:fs';
fs.appendFileSync(${JSON.stringify(path.join(root, 'calls.log'))}, 'x\\n');
console.log(JSON.stringify({ type: 'system', subtype: 'init', session_id: 'sess-lim' }));
console.log(${JSON.stringify(JSON.stringify(limitEvents[0]))});
console.log(${JSON.stringify(JSON.stringify({ ...result, session_id: 'sess-lim' }))});
process.exit(1);
`);
  fs.chmodSync(fake, 0o755);
  process.env.ATR_DATA_ROOT = root; process.env.ATR_CLAUDE_BIN = fake;
  try {
    const { runCurator, runAuto } = await import('../lib/runner.js');
    const r = await runCurator({ task: 'test', maxRounds: 3, log: () => {}, links: false, review: false });
    assert.equal(r.clean, false);
    assert.equal(r.rounds.length, 1, 'no retry after a usage limit');
    assert.equal(r.usage_limit.round, 1);
    assert.match(r.why_not_clean[0], /usage limit reached in round 1 \(resets .*\): the session stopped and the task is NOT done/);
    fs.rmSync(r.dir, { recursive: true, force: true });
    // --auto stops after the first task hits the limit
    const seen = [];
    const a = await runAuto({ count: 3, log: () => {}, next: () => ({ tasks: [{ task: 'a' }, { task: 'b' }, { task: 'c' }] }), run: async (o) => { seen.push(o.task); return { clean: false, usage_limit: { round: 1 }, rounds: [], violations: [] }; } });
    assert.deepEqual(seen, ['a']);
    assert.equal(a.runs.length, 1);
  } finally { delete process.env.ATR_DATA_ROOT; delete process.env.ATR_CLAUDE_BIN; }
});

test('runner: a round cut off by the timeout gets one more round to finish, and the summary records it', async () => {
  const root = tmpDir();
  fs.mkdirSync(path.join(root, 'places'), { recursive: true });
  const fake = path.join(root, 'fake-claude.mjs');
  fs.writeFileSync(fake, `#!/usr/bin/env node
const resume = process.argv.includes('--resume');
console.log(JSON.stringify({ type: 'system', subtype: 'init', session_id: 'sess-t' }));
if (!resume) setTimeout(() => {}, 60000); // hangs until the runner kills it
else console.log(JSON.stringify({ type: 'result', session_id: 'sess-t', result: 'finished', total_cost_usd: 0.1, num_turns: 2 }));
`);
  fs.chmodSync(fake, 0o755);
  process.env.ATR_DATA_ROOT = root; process.env.ATR_CLAUDE_BIN = fake;
  try {
    const { runCurator } = await import('../lib/runner.js');
    const r = await runCurator({ task: 'test', maxRounds: 1, timeoutMin: 0.05, log: () => {}, links: false, review: false });
    assert.deepEqual(r.cut_off_rounds, [1]);
    assert.equal(r.rounds.length, 2, 'one extra round to finish');
    assert.match(fs.readFileSync(path.join(r.dir, 'round-2.prompt.md'), 'utf8'), /stopped your session after 0.05 minutes/);
    assert.equal(r.clean, true);
    fs.rmSync(r.dir, { recursive: true, force: true });
  } finally { delete process.env.ATR_DATA_ROOT; delete process.env.ATR_CLAUDE_BIN; }
});

test('build: two builds at once both finish (staging + lock); a private build dir for shots; unfinished pages are not listed', async () => {
  const { buildSite, privateSiteDir, siteDir } = await import('../lib/build.js');
  const buildDir = tmpDir();
  const opts = { fixtures: true, buildDir, noMaps: true };
  const [a, b] = await Promise.all([buildSite(opts), buildSite(opts)]);
  assert.equal(a.dir, path.join(buildDir, 'fixtures'));
  assert.ok(fs.existsSync(path.join(a.dir, 'index.html')) && fs.existsSync(path.join(a.dir, 'places', 'yu-garden', 'index.html')));
  assert.ok(b.places > 0);
  assert.deepEqual(fs.readdirSync(a.dir).filter((d) => d.startsWith('.')).filter((d) => d !== '.private'), [], 'no staging or lock left behind');
  const priv = privateSiteDir(opts);
  assert.ok(priv.startsWith(path.join(siteDir(opts), '.private')));
  const r = await buildSite({ ...opts, siteDir: priv });
  assert.equal(r.dir, priv);
  assert.ok(fs.existsSync(path.join(priv, 'places', 'yu-garden', 'index.html')));
  fs.rmSync(buildDir, { recursive: true, force: true });
});

test('area pages and the index skip unfinished places (scaffold TODOs)', () => {
  const p = fixturePlace();
  const todo = { ...fixturePlace(), id: 'stub', name: 'Stub', why: 'TODO' };
  assert.equal(hasPlaceholders(todo), true);
  assert.equal(hasPlaceholders(p), false);
  const area = { id: 'shanghai', country: 'china', cities: ['shanghai'] };
  assert.deepEqual(areaPlaces(area, [p, todo]).map((x) => x.id), [p.id]);
  const idx = renderIndexPage([p, todo]);
  assert.doesNotMatch(idx, /data-id="stub"/);
  assert.match(idx, new RegExp(`data-id="${p.id}"`));
});

test('schema: area short_name, tel: booking links, the platform method, a booking deadline, an open-ended `when`', () => {
  const area = parse(fs.readFileSync(path.join(FIXTURES, 'areas/china/xian.yaml'), 'utf8'));
  assert.deepEqual(errors(validateArea({ ...area, short_name: "Xi'an" }, { fixtureMode: true })).filter((i) => /short_name/.test(i.path)), []);
  assert.match(areaTemplate({ country: 'china', name: 'X', today: '2026-11-12' }), /# short_name:/);

  const p = fixturePlace();
  p.book_ahead = { required: true, method: 'phone', lead_days: 1, links: [{ label: 'Call', url: 'tel:+66 2 246 5472' }] };
  assert.deepEqual(errors(validatePlace(p, ctx())).filter((i) => i.path.startsWith('book_ahead')), []);
  p.book_ahead.method = 'website';
  assert.ok(validatePlace(p, ctx()).some((i) => i.level === 'warning' && /tel: link but method/.test(i.message)));
  p.book_ahead = { required: true, method: 'phone', lead_days: 1, links: [{ label: 'Call', url: 'tel:12' }] };
  assert.ok(errors(validatePlace(p, ctx())).some((i) => /not a full URL or phone link/.test(i.message)));
  p.book_ahead = { required: true, method: 'phone', lead_days: 1, links: [{ label: 'Call +66 2 246 5472', url: 'tel:+66 2 246 5472' }] };
  assert.match(page(p), /<a class="btn btn--call btn--warm" href="tel:\+6622465472"/);

  p.book_ahead = { required: true, method: 'platform', lead_days: 3, links: [{ label: 'Hostelworld', url: 'https://www.hostelworld.com/hostels/p/1/x/' }] };
  assert.equal(methodLabel('platform', p.book_ahead), 'Book on Hostelworld');
  assert.deepEqual(errors(validatePlace(p, ctx())), []);
  p.book_ahead.method = 'website';
  assert.ok(validatePlace(p, ctx()).some((i) => i.level === 'info' && /method: platform/.test(i.expected)));

  p.book_ahead = { required: true, method: 'website', deadline: '2026-11-30', links: [{ label: 'Lottery', url: 'https://museum-tickets.nintendo.com/en' }] };
  assert.deepEqual(errors(validatePlace(p, ctx())), [], 'lead_days is not needed with a deadline');
  assert.equal(bookBadgeText(p.book_ahead), 'Book by 30 Nov');
  assert.match(page(p), /Book by 30 Nov/);
  assert.match(page(p), /<p class="fact__value[^"]*">By 30 Nov<\/p>/);
  assert.ok(validatePlace(p, { ...ctx(), now: '2026-12-02' }).some((i) => i.level === 'warning' && /deadline 2026-11-30 has passed/.test(i.message)));

  const w = { ...fixturePlace(), when: { dates: [{ from: '2026-12-18' }], kind: 'season' } };
  assert.deepEqual(errors(validatePlace(w, ctx())), []);
  assert.ok(validatePlace(w, ctx()).some((i) => i.level === 'info' && /open-ended/.test(i.message)));
  assert.equal(whenLabel(w), 'From 18 Dec');
  assert.equal(eventDates(w)[0].open, true);
  assert.equal(whenLabel({ when: { dates: [{ from: '2026-12-18' }] } }), 'From 18 Dec');
  assert.match(page(w), /end date not announced/);
});

test('scaffold: deadline, platform and the open-ended `to` are in the comments; faq `asked` says it is a date', async () => {
  const t = placeTemplate({ country: 'china', city: 'x', name: 'X', today: '2026-11-12' });
  assert.match(t, /# deadline: 2026-11-30/);
  assert.match(t, /platform = Hostelworld/);
  assert.match(t, /leave out \\`to\\` → "From 18 Dec"|leave out `to` → "From 18 Dec"/);
  const { BLOCKS } = await import('../lib/schema/blocks.js');
  assert.match(BLOCKS.faq.spec.fields.items.of.fields.asked.desc, /DATE the question was asked/);
  assert.match(BLOCKS.hero.spec.fields.focus.desc, /y has no effect/);
});

test('validate: credits.yaml errors land on the area that uses the photo, not on every area of the country', () => {
  const root = tmpDir();
  const dir = path.join(root, 'areas/china');
  fs.mkdirSync(path.join(dir, 'media'), { recursive: true });
  const base = parse(fs.readFileSync(path.join(FIXTURES, 'areas/china/xian.yaml'), 'utf8'));
  const write = (id, image) => fs.writeFileSync(path.join(dir, `${id}.yaml`), JSON.stringify({ ...base, id, image }));
  write('aaa', 'ok-photo'); write('bbb', 'long-author'); write('ccc', 'ok-photo');
  const credit = (file, author, extra = {}) => ({ file, author, license: 'CC BY-SA 4.0', source_url: 'https://commons.wikimedia.org/wiki/File:X.jpg', widths: [640], fetched: '2026-11-12', ...extra });
  fs.writeFileSync(path.join(dir, 'media/credits.yaml'), JSON.stringify([credit('ok-photo', 'Jane'), credit('long-author', 'x'.repeat(400)), credit('orphan', 'y'.repeat(400))]));
  const credErrs = (id) => validateAreaFile(path.join(dir, `${id}.yaml`), { fixtureMode: true }).issues.filter((i) => i.level === 'error' && /credits\.yaml/.test(i.path));
  assert.deepEqual(credErrs('bbb').map((i) => i.path), ['media/credits.yaml [1].author ("long-author")']);
  assert.deepEqual(credErrs('aaa').map((i) => i.path), ['media/credits.yaml [2].author ("orphan")'], 'an entry nobody uses goes to the first area file only');
  assert.deepEqual(credErrs('ccc'), []);
  fs.rmSync(root, { recursive: true, force: true });
});

test('rendering: the When fact does not repeat dates already in the label; long words shrink the phone title; NFC names; latin-ext fonts', () => {
  assert.equal(labelHasDates('Christmas, 24–25 Dec', [{ from: '2026-12-24', to: '2026-12-25' }]), true);
  assert.equal(labelHasDates('Christmas', [{ from: '2026-12-24', to: '2026-12-25' }]), false);
  const p = { ...fixturePlace(), when: { dates: [{ from: '2026-12-24', to: '2026-12-25' }], label: 'Christmas, 24-25 Dec' } };
  const fact = page(p).match(/<div class="fact fact--when[\s\S]*?<\/div>/)[0];
  assert.doesNotMatch(fact, /fact__sub/);
  assert.equal(titleStyle('Gyeongbokgung Palace'), ' style="--lw:13"');
  assert.equal(titleStyle('Yu Garden'), '');
  const decomposed = 'Xī Jiē';
  assert.match(page({ ...fixturePlace(), name_romanized: decomposed }), /Xī Jiē/);
  const css = styles('');
  assert.match(css, /fraunces-latin-ext-400-italic\.woff2[^}]*unicode-range: U\+0100-02BA/);
  assert.match(css, /\.site-foot \{ padding: 28px 16px 40px/);
  const dest = tmpDir();
  copyAssets(dest);
  assert.ok(fs.existsSync(path.join(dest, 'fonts', 'fraunces-latin-ext-400-italic.woff2')));
  assert.ok(fs.existsSync(path.join(dest, 'fonts', 'inter-latin-ext-400-normal.woff2')));
  fs.rmSync(dest, { recursive: true, force: true });
});

test('validate: info hints for long words in the name and long local / romanized names', () => {
  const p = { ...fixturePlace(), name: 'Gyeongbokgung Palace', name_local: '西安大唐不夜城步行街夜市小吃一条街', name_romanized: 'Xian Datang Buyecheng Buxingjie Night Market' };
  const iss = validatePlace(p, ctx());
  assert.ok(iss.some((i) => i.level === 'info' && i.path === 'name' && /Gyeongbokgung/.test(i.message)));
  assert.ok(iss.some((i) => i.level === 'info' && i.path === 'name_local'));
  assert.ok(iss.some((i) => i.level === 'info' && i.path === 'name_romanized'));
  assert.deepEqual(errors(iss), []);
});

test('feedback: --mark-seen --place marks one page done; other pages stay new', () => {
  const root = tmpDir();
  fs.mkdirSync(path.join(root, 'places'), { recursive: true });
  const fb = { swipes: [], duels: [], notes: [], questions: [
    { ts: '2026-11-12T10:00:00Z', id: 'huangshan', question: 'Is the cable car open?' },
    { ts: '2026-11-12T11:00:00Z', id: 'harbin', question: 'How cold?' },
  ] };
  const opts = { root };
  const r = markSeen(fb, { ...opts, place: 'huangshan' });
  assert.equal(r.ts, '2026-11-12T10:00:00Z');
  assert.deepEqual(readSeenState(opts).places, { huangshan: '2026-11-12T10:00:00Z' });
  assert.deepEqual(newFeedback(fb, opts).questions.map((q) => q.id), ['harbin']);
  markSeen(fb, opts); // a global mark past it drops the per-page entry
  assert.deepEqual(readSeenState(opts).places, {});
  assert.equal(newFeedback(fb, opts).questions.length, 0);
  fs.rmSync(root, { recursive: true, force: true });
});
