import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { readFeedback, readJsonl, tasteSummary, formatTaste } from '../lib/feedback/index.js';
import { loadPlaces, loadAreas } from '../lib/load.js';
import { FIXTURES } from '../lib/paths.js';
import { tmpDir } from './helpers.js';

const DIR = path.join(FIXTURES, 'feedback');

test('bad lines are skipped with line-numbered warnings', () => {
  const fb = readFeedback(DIR);
  assert.equal(fb.swipes.length, 5);
  assert.equal(fb.duels.length, 3);
  assert.equal(fb.questions.length, 3);
  assert.ok(fb.warnings.some((w) => /swipes\.jsonl:5 not valid JSON/.test(w)));
  assert.ok(fb.warnings.some((w) => /swipes\.jsonl:6 verdict/.test(w)));
  assert.ok(fb.warnings.some((w) => /unsupported version v=2/.test(w)));
  assert.ok(fb.warnings.some((w) => /duels\.jsonl:4 loser/.test(w)));
});

test('missing files and --since', () => {
  const d = tmpDir();
  assert.deepEqual(readJsonl(path.join(d, 'nope.jsonl'), 'swipes'), { events: [], warnings: [] });
  const fb = readFeedback(DIR, { since: '2026-11-21' });
  assert.equal(fb.swipes.length, 1);
});

test('taste summary', () => {
  const fb = readFeedback(DIR);
  const s = tasteSummary(fb, { places: loadPlaces({ fixtures: true }), areas: loadAreas({ fixtures: true }) });
  assert.equal(s.top[0].id, 'nanxiang-mantou-dian');
  assert.deepEqual(s.missingIds, ['old-deleted-place']);
  assert.equal(s.questionThemes[0].theme, 'booking');
  assert.equal(s.totals.uniqueSwipes, 4); // latest yu-garden verdict wins
  const text = formatTaste(s);
  assert.match(text, /Category affinity/);
  assert.match(text, /Skipped feedback lines \(4\)/);
});

// ---------------- notes (feedback/notes.jsonl) ----------------
import { spawnSync } from 'node:child_process';
import { latestNotes, currentNotes, newFeedback, formatNewFeedback, placeFeedback, formatPlaceFeedback, FEEDBACK_SPECS } from '../lib/feedback/index.js';
import { ROOT } from '../lib/paths.js';
import { check } from '../lib/schema/dsl.js';

const NOTES = [
  '{"v":1,"ts":"2026-11-20T14:06:00Z","round":"place","id":"yu-garden","text":"first draft"}',
  '{"v":1,"ts":"2026-11-20T14:07:00Z","session":"s1","round":"place","id":"yu-garden","text":"Must, but only early, before the crowds.","country":"china"}',
  '{"v":1,"ts":"2026-11-20T14:08:00Z","round":"place","id":"nanxiang-mantou-dian","text":"Skip: too touristy"}',
  '{"v":1,"ts":"2026-11-20T14:09:00Z","round":"place","id":"nanxiang-mantou-dian","text":""}',
  '{"v":1,"ts":"2026-11-20T14:10:00Z","round":"place","id":"yu-garden"}',
];
function notesDir() {
  const d = tmpDir();
  fs.writeFileSync(path.join(d, 'swipes.jsonl'), '{"v":1,"ts":"2026-11-20T14:05:30Z","session":"s1","round":"place","id":"yu-garden","verdict":"must","country":"china"}\n');
  fs.writeFileSync(path.join(d, 'notes.jsonl'), NOTES.join('\n') + '\n');
  return d;
}

test('notes: spec accepts "" (clears) and rejects missing text and > 2000 chars', () => {
  const errs = (o) => check(FEEDBACK_SPECS.notes, { v: 1, ts: '2026-11-20T14:06:00Z', round: 'area', id: 'harbin', ...o }).filter((x) => x.level === 'error');
  assert.equal(errs({ text: 'too cold' }).length, 0);
  assert.equal(errs({ text: '' }).length, 0);
  assert.ok(errs({}).length);
  assert.ok(errs({ text: 'x'.repeat(2001) }).length);
  assert.ok(errs({ text: 'x', round: 'city' }).length);
  const schema = JSON.parse(fs.readFileSync(path.join(ROOT, 'platform/schema/feedback-notes.schema.json'), 'utf8'));
  assert.deepEqual(schema.required, ['v', 'ts', 'round', 'id', 'text']);
  assert.equal(schema.properties.text.maxLength, 2000);
});

test('notes: readFeedback reads them; the latest per card wins and "" clears', () => {
  const fb = readFeedback(notesDir());
  assert.equal(fb.notes.length, 4);
  assert.ok(fb.warnings.some((w) => /notes\.jsonl:5 .*text/.test(w)));
  const cur = latestNotes(fb.notes);
  assert.deepEqual([...cur.keys()], ['place:yu-garden']);
  assert.equal(cur.get('place:yu-garden').text, 'Must, but only early, before the crowds.');
  assert.equal(latestNotes(fb.notes, { keepCleared: true }).get('place:nanxiang-mantou-dian').text, '');
  const places = loadPlaces({ fixtures: true });
  assert.deepEqual(currentNotes(fb, { places }).map((n) => [n.id, n.name, n.verdict]), [['yu-garden', 'Yu Garden', 'must']]);
});

test('notes: taste summary, --new and --place show the current notes with name and verdict', () => {
  const fb = readFeedback(notesDir());
  const places = loadPlaces({ fixtures: true }), areas = loadAreas({ fixtures: true });
  const s = tasteSummary(fb, { places, areas });
  assert.equal(s.totals.notes, 1);
  const text = formatTaste(s);
  assert.match(text, /Notes: 1/);
  assert.match(text, /## The traveler's notes/);
  assert.match(text, /Yu Garden \(yu-garden, must\)\n {4}“Must, but only early, before the crowds\.”/);
  assert.doesNotMatch(text, /too touristy/);
  const n = newFeedback(fb, { since: null, places, areas });
  assert.equal(n.counts.notes, 4);
  assert.deepEqual(n.notes.map((x) => [x.id, x.text]), [['yu-garden', 'Must, but only early, before the crowds.'], ['nanxiang-mantou-dian', '']]);
  const nt = formatNewFeedback(n);
  assert.match(nt, /0 questions · 4 notes/);
  assert.match(nt, /Nanxiang .* note removed/);
  const pf = formatPlaceFeedback(placeFeedback(fb, 'yu-garden'));
  assert.match(pf, /## Note .*2 edits/);
  assert.match(pf, /“Must, but only early, before the crowds\.”/);
});

test('notes: ./atr feedback and ./atr feedback --new print them', () => {
  const dir = notesDir();
  const run = (args) => spawnSync(path.join(ROOT, 'atr'), ['feedback', '--fixtures', '--dir', dir, ...args], { cwd: ROOT, encoding: 'utf8', env: { ...process.env, NO_COLOR: '1', ATR_OFFLINE: '1' } });
  const all = run([]);
  assert.equal(all.status, 0, all.stderr);
  assert.match(all.stdout, /The traveler's notes/);
  assert.match(all.stdout, /Yu Garden \(yu-garden, must\)/);
  const fresh = run(['--new']);
  assert.equal(fresh.status, 0, fresh.stderr);
  assert.match(fresh.stdout, /“Must, but only early, before the crowds\.”/);
});
