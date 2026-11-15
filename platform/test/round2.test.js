import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gallerySlots, factSpans, balancedRows } from '../lib/render/layout.js';
import { renderPlacePage, renderPlaceCard } from '../lib/render/index.js';
import { validatePlace } from '../lib/validate.js';
import { placeTemplate, annotateLimits } from '../lib/scaffold.js';
import { searchHint } from '../cli/atr-hint.js';
import { fixturePlace, fixtureCredits, fixtureMedia } from './helpers.js';

const ctx = () => ({ credits: fixtureCredits(), mediaFiles: fixtureMedia(), fixtureMode: true, now: '2026-11-09', knownIds: new Set(['yu-garden', 'nanxiang-mantou-dian', 'the-bund']) });
const warn = (issues, re) => issues.filter((i) => i.level === 'warning' && re.test(i.message));

test('gallery and quick-facts layouts never leave an orphan tile', () => {
  for (let n = 1; n <= 8; n++) {
    for (const feature of [true, false]) {
      const s = gallerySlots(n, { feature });
      const rows = {};
      s.forEach((x) => { rows[x.row] = (rows[x.row] || 0) + x.dSpan; });
      assert.ok(Object.values(rows).every((v) => v === 12), `desktop n=${n}`);
      assert.equal(s.reduce((a, x) => a + x.mSpan, 0) % 2, 0, `phone n=${n}`);
    }
    const f = factSpans(n);
    assert.equal(f.reduce((a, x) => a + x.mSpan, 0) % 2, 0);
  }
  assert.deepEqual(balancedRows(7), [4, 3]);
  assert.deepEqual(gallerySlots(2, { portraits: [true, true] }).map((s) => s.aspect), ['4 / 5', '4 / 5']);
});

test('media search hint strips punctuation and does not repeat the city', () => {
  assert.equal(searchHint('Shanghai Museum: Ancient Americas', 'shanghai'), 'Shanghai Museum Ancient Americas');
  assert.equal(searchHint('Gwangjang Market', 'seoul'), 'Gwangjang Market Seoul');
  assert.equal(searchHint('Hong Kong Park', 'hong-kong'), 'Hong Kong Park');
});

test('scaffold comments show max lengths', () => {
  const t = placeTemplate({ country: 'china', city: 'shanghai', name: 'X Y', today: '2026-11-09' });
  assert.match(t, /area: TODO\s+# ≤80 chars/);
  assert.match(t, /# lead_time: TODO\s+# ≤80 chars/);
  assert.match(t, /# confidence_note: TODO\s+# ≤400 chars/);
  assert.match(annotateLimits('name: x', { kind: 'object', fields: { name: { kind: 'string', max: 5 } } }), /≤5 chars/);
});

test('validator warns on duplicate quick-fact labels, long values, soft/portrait images', () => {
  const p = fixturePlace();
  p.blocks[1].extra = [{ label: 'Booking', value: 'Not needed' }, { label: 'Payment', value: 'Bring cash. Many stalls do not take cards' }];
  const credits = fixtureCredits().map((c) => (c.file === 'tingtao-pond' ? { ...c, width: 800, height: 1200 } : c));
  const files = fixtureMedia().filter((f) => !/^rooftops-(1280|2048)/.test(f));
  const issues = validatePlace(p, { ...ctx(), credits, mediaFiles: files });
  assert.equal(warn(issues, /duplicates an automatic quick fact/).length, 1);
  assert.equal(warn(issues, /long values wrap/).length, 1);
  assert.ok(warn(issues, /hero "tingtao-pond" is portrait/).length);
  assert.ok(warn(issues, /"rooftops" is 640 px wide but this slot is full-width/).length);
});

test('book_ahead links + rules_changed render once; homepage link warns', () => {
  const p = fixturePlace();
  delete p.book_ahead.link;
  p.book_ahead.links = [{ label: 'Trip.com', url: 'https://www.trip.com/x/1', note: 'No Chinese number needed' }, { label: 'Official', url: 'https://example.gov.cn/t' }];
  p.book_ahead.rules_changed = { date: '2025-09-01', note: 'General reservations dropped.' };
  const html = renderPlacePage(p, { credits: fixtureCredits() });
  assert.match(html, /href="https:\/\/www.trip.com\/x\/1"/);
  assert.match(html, /Rules changed Sep/);
  assert.equal((html.match(/class="note"/g) || []).length, 1);
  assert.doesNotMatch(html, /Real-name booking with your passport number \(common/);
  const q = fixturePlace(); q.book_ahead.link = 'https://www.trip.com/';
  assert.ok(warn(validatePlace(q, ctx()), /is a homepage/).length);
});

test('typographic hero, caption, short name, food budget, lede and zero formatting', () => {
  const p = fixturePlace();
  p.name = 'Shanghai Museum: Ancient Americas';
  p.why = '₩5,000 bowls of noodles in a lively alley, cheap and very local.';
  delete p.blocks[0].image; p.blocks[0].caption = 'No free photo of the venue';
  p.category = 'food'; p.kind = 'Eat';
  p.blocks.find((b) => b.type === 'cost_breakdown').items.push({ label: 'Garden walk', local: 0, brl: 0 });
  const html = renderPlacePage(p, { credits: fixtureCredits(), budgetPerDay: 170, cheapMealBrl: 20 });
  assert.match(html, /hero hero--type/);
  assert.match(html, /hero__type[^>]*>豫园/);
  assert.match(html, /No free photo of the venue/);
  assert.match(html, /Finding Shanghai Museum</);
  assert.match(html, /Meal cost/);
  assert.doesNotMatch(html, /% of daily budget/);
  assert.match(html, /meal money/);
  assert.doesNotMatch(html, /lede--cap/);
  assert.doesNotMatch(html, />free</);
  assert.match(html, /<td class="num loc">–<\/td><td class="num brl">Free<\/td>/);
  p.cover = undefined;
  assert.match(renderPlaceCard(p, {}), /atr-card__media--type/);
  assert.match(renderPlacePage(fixturePlace(), { staticMap: { url: 'map.webp', width: 1200, height: 720 } }), /map__frame--static[\s\S]*© OpenStreetMap contributors/);
});
