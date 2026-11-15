import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateAll } from '../lib/validate.js';
import { loadPlaces, loadAreas } from '../lib/load.js';
import { FIXTURES } from '../lib/paths.js';
import { gapReport } from '../lib/gaps.js';
import * as api from '../lib/index.js';

test('all fixtures validate without errors', () => {
  const r = validateAll({ fixtures: true, now: '2026-11-09' });
  const errs = r.results.flatMap((x) => x.issues.filter((i) => i.level === 'error').map((i) => `${x.file} ${i.path}: ${i.message}`));
  assert.deepEqual(errs, []);
  assert.ok(r.results.length >= 3);
});

test('fixtures load in fixture mode and are excluded from real loads', () => {
  assert.ok(loadPlaces({ fixtures: true }).length >= 2);
  assert.equal(loadAreas({ fixtures: true }).length, 4);
  // pointing the real loader at the fixtures dir still skips fixture:true
  assert.equal(loadPlaces({ fixtures: false, root: FIXTURES }).length, 0);
  assert.equal(loadPlaces({ fixtures: false, root: FIXTURES, includeFixtures: true }).length >= 2, true);
});

test('gap report runs on fixtures', () => {
  const r = gapReport({ fixtures: true, now: '2026-11-09' });
  assert.ok(r.items.some((i) => i.kind === 'too-few' && i.country === 'korea'));
  assert.equal(r.stats.china.places, 3);
});

test('public API exports what the game needs', () => {
  for (const k of ['loadPlaces', 'loadAreas', 'validatePlace', 'validateAll', 'renderPlacePage', 'renderPlaceCard', 'renderAreaCard', 'readFeedback', 'tasteSummary', 'CATEGORIES']) assert.ok(api[k], k);
});
