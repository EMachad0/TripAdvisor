import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { validatePlace, validatePlaceFile } from '../lib/validate.js';
import { toJsonSchema } from '../lib/schema/dsl.js';
import { placeSpec } from '../lib/schema/specs.js';
import { COUNTRIES, CURRENCIES } from '../lib/schema/enums.js';
import { SYMBOLS, fmtLocal } from '../lib/render/util.js';
import { fixturePlace, fixtureCredits, fixtureMedia, tmpDir } from './helpers.js';

const ctx = () => ({ credits: fixtureCredits(), mediaFiles: fixtureMedia(), fixtureMode: true, now: '2026-11-09', knownIds: new Set(['yu-garden', 'nanxiang-mantou-dian', 'the-bund']) });
const errors = (issues) => issues.filter((i) => i.level === 'error');

test('fixture place is valid', () => {
  assert.deepEqual(errors(validatePlace(fixturePlace(), ctx())), []);
});

test('unknown block type suggests the nearest name and lists valid ones', () => {
  const p = fixturePlace();
  p.blocks[1].type = 'quickfacts';
  const e = errors(validatePlace(p, ctx()));
  const i = e.find((x) => x.path === 'blocks[1].type');
  assert.ok(i, 'error on blocks[1].type');
  assert.match(i.message, /Did you mean "quick_facts"/);
  assert.match(i.expected, /hero, quick_facts, highlights/);
  assert.equal(i.example, 'quick_facts');
});

test('number written as text: says so with the fixed example', () => {
  const p = fixturePlace();
  p.cost.local = '30';
  const i = errors(validatePlace(p, ctx())).find((x) => x.path === 'cost.local');
  assert.match(i.message, /write the number without quotes/);
  assert.equal(i.example, 30);
});

test('missing required field has path, expectation and example', () => {
  const p = fixturePlace();
  delete p.why;
  const i = errors(validatePlace(p, ctx())).find((x) => x.path === 'why');
  assert.match(i.message, /missing required field `why`/);
  assert.match(i.expected, /20–160 characters/);
  assert.ok(typeof i.example === 'string' && i.example.length > 10);
});

test('unknown field suggests the nearest field', () => {
  const p = fixturePlace();
  p.blocks[2].itmes = p.blocks[2].items;
  const i = errors(validatePlace(p, ctx())).find((x) => x.path === 'blocks[2].itmes');
  assert.match(i.message, /Did you mean `items`/);
});

test('enum typo suggests the right value', () => {
  const p = fixturePlace();
  p.category = 'nightlif';
  const i = errors(validatePlace(p, ctx())).find((x) => x.path === 'category');
  assert.match(i.message, /Did you mean "nightlife"/);
});

test('book-ahead required needs method and lead_days', () => {
  const p = fixturePlace();
  delete p.book_ahead.method; delete p.book_ahead.lead_days;
  const paths = errors(validatePlace(p, ctx())).map((x) => x.path);
  assert.ok(paths.includes('book_ahead.method'));
  assert.ok(paths.includes('book_ahead.lead_days'));
});

test('R$ mismatch is a warning, not an error', () => {
  const p = fixturePlace();
  p.cost.brl = 99;
  const issues = validatePlace(p, ctx());
  const w = issues.find((x) => x.path === 'cost.brl');
  assert.equal(w.level, 'warning');
  assert.match(w.message, /does not match/);
  assert.equal(errors(issues).length, 0);
});

test('future checked date and missing image credit are errors', () => {
  const p = fixturePlace();
  p.sources[0].checked = '2027-05-01';
  p.blocks[0].image = 'not-fetched';
  const paths = errors(validatePlace(p, ctx())).map((x) => x.path);
  assert.ok(paths.includes('sources[0].checked'));
  assert.ok(paths.includes('blocks[0].image'));
});

test('fewer than 2 sources is an error; fixture flag outside fixture mode is an error', () => {
  const p = fixturePlace();
  p.sources = p.sources.slice(0, 1);
  const e = errors(validatePlace(p, { ...ctx(), fixtureMode: false })).map((x) => x.path);
  assert.ok(e.includes('sources'));
  assert.ok(e.includes('fixture'));
});

test('TODO placeholders are errors with the field expectation', () => {
  const p = fixturePlace();
  p.area = 'TODO';
  const i = errors(validatePlace(p, ctx())).find((x) => x.path === 'area');
  assert.match(i.message, /placeholder/);
  assert.match(i.expected, /Neighbourhood/);
});

test('file validation reports YAML line numbers and syntax errors', () => {
  const dir = path.join(tmpDir(), 'places/china/shanghai/bad-place');
  fs.mkdirSync(dir, { recursive: true });
  const f = path.join(dir, 'place.yaml');
  fs.writeFileSync(f, 'id: bad-place\nname: Bad\ncategory: food\nkind: Eat\nfoo: 1\n');
  const r = validatePlaceFile(f, { now: '2026-11-09' });
  const foo = r.issues.find((i) => i.path === 'foo');
  assert.equal(foo.line, 5);
  fs.writeFileSync(f, 'id: [unclosed\n');
  const r2 = validatePlaceFile(f, {});
  assert.match(r2.issues[0].message, /YAML syntax error/);
});

test('JSON Schema export has required fields and block variants', () => {
  const s = toJsonSchema(placeSpec);
  assert.ok(s.required.includes('why'));
  assert.ok(s.properties.blocks.items.oneOf.length >= 14);
});

test('every trip country\'s currency is an allowed cost.currency with a symbol', () => {
  for (const [id, c] of Object.entries(COUNTRIES)) {
    assert.ok(CURRENCIES.includes(c.currency), `${id}: ${c.currency} missing from CURRENCIES`);
    assert.ok(SYMBOLS[c.currency], `${id}: ${c.currency} missing from SYMBOLS`);
  }
  const p = fixturePlace();
  p.cost = { ...p.cost, local: 5.6, currency: 'SGD' };
  assert.deepEqual(errors(validatePlace(p, ctx())).filter((i) => i.path === 'cost.currency'), []);
  assert.equal(fmtLocal(5.6, 'SGD'), 'S$5.60');
});
