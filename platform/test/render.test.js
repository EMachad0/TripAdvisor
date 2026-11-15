import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderPlacePage, renderPlaceCard, renderAreaCard, md, mdInline } from '../lib/render/index.js';
import { BLOCKS, BLOCK_TYPES } from '../lib/schema/blocks.js';
import { fixturePlace, fixtureCredits } from './helpers.js';

test('markdown subset escapes HTML and neutralises non-http links', () => {
  assert.equal(mdInline('<script>alert(1)</script>'), '&lt;script&gt;alert(1)&lt;/script&gt;');
  assert.doesNotMatch(mdInline('[x](javascript:alert(1))'), /<a /);
  assert.match(mdInline('[ok](https://e.com/a?b=1&c=2)'), /<a href="https:\/\/e.com\/a\?b=1&amp;c=2"/);
  assert.match(mdInline('**b** and *i*'), /<strong>b<\/strong> and <em>i<\/em>/);
  assert.match(md('- a\n- b'), /<ul><li>a<\/li><li>b<\/li><\/ul>/);
  assert.equal(md('a\n\nb'), '<p>a</p>\n<p>b</p>');
});

test('place page escapes content everywhere', () => {
  const p = fixturePlace();
  p.name = 'Evil <img src=x onerror=alert(1)>';
  p.why = '"><script>bad()</script> long enough why text';
  p.blocks.push({ type: 'prose', text: '<b>raw</b> [x](javascript:bad())' });
  p.blocks.push({ type: 'tips', variant: 'insider', items: ['<iframe src=evil>'] });
  const html = renderPlacePage(p, { credits: fixtureCredits() });
  assert.doesNotMatch(html, /<img src=x/);
  assert.doesNotMatch(html, /<script>bad/);
  assert.doesNotMatch(html, /<iframe src=evil/);
  assert.doesNotMatch(html, /href="javascript:/);
  assert.match(html, /Evil &lt;img/);
});

test('every block example renders', () => {
  const p = fixturePlace();
  p.blocks = BLOCK_TYPES.map((t) => BLOCKS[t].example);
  const html = renderPlacePage(p, { credits: fixtureCredits(), budgetPerDay: 170 });
  assert.doesNotMatch(html, /block .* failed/);
  for (const cls of ['hero', 'facts', 'hl', 'gallery', 'tl', 'receipt', 'map', 'tips', 'menu', 'vibe', 'pairs', 'weather', 'sources']) assert.match(html, new RegExp(`class="[^"]*\\b${cls}\\b`), cls);
});

test('fixture page: sources footer, credits, deep links, budget share', () => {
  const html = renderPlacePage(fixturePlace(), { credits: fixtureCredits(), budgetPerDay: 170, places: { 'nanxiang-mantou-dian': { id: 'nanxiang-mantou-dian', name: 'Nanxiang', category: 'food' } } });
  assert.match(html, /uri\.amap\.com/);
  assert.match(html, /api\.map\.baidu\.com/);
  assert.match(html, /CC BY-SA 3\.0/);
  assert.match(html, /Stefan Fussan/);
  assert.match(html, /% of your R\$ 170\/day China budget/);
  assert.match(html, /srcset="media\/tingtao-pond-640\.webp 640w/);
  assert.match(html, /href="\.\.\/nanxiang-mantou-dian\/"/);
  assert.match(html, /pair--missing/); // the-bund does not exist
  assert.match(html, /prefers-color-scheme|atr-theme/);
});

test('fragment + inline css options', () => {
  const frag = renderPlacePage(fixturePlace(), { fragment: true });
  assert.match(frag, /^<body/);
  const inl = renderPlacePage(fixturePlace(), { inlineCss: true, assetBase: '/a/' });
  assert.match(inl, /<style>/);
  assert.match(inl, /url\("\/a\/fonts\//);
});

test('swipe card and area card', () => {
  const card = renderPlaceCard(fixturePlace(), { credits: fixtureCredits(), href: '/p/yu-garden', isNew: true });
  assert.match(card, /^<a class="atr-card"/);
  assert.match(card, /Book 1 day ahead · passport/);
  assert.match(card, /R\$ 25/);
  assert.match(card, /New/);
  const area = renderAreaCard({ id: 'x', country: 'china', name: 'X <b>', region: 'R', why: 'w', best_for: ['nature'], days_suggested: { min: 2, max: 3 }, cost_level: 'low', winter_note: 'cold', image: 'none' });
  assert.match(area, /X &lt;b&gt;/);
  assert.match(area, /2–3 days/);
});
