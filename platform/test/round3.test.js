import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import QR from 'qrcode';
import { bookingLevel, bookingLinks, bookBadgeText, bookAheadList } from '../lib/booking.js';
import { validatePlace } from '../lib/validate.js';
import { gapReport } from '../lib/gaps.js';
import { renderPlacePage, renderPlaceCard } from '../lib/render/index.js';
import { removeMedia, unusedMedia, writeCredits } from '../lib/media/index.js';
import { decodeQr } from '../lib/qr.js';
import { sliceShot } from '../lib/shot.js';
import { toJsonSchema } from '../lib/schema/dsl.js';
import { placeSpec } from '../lib/schema/specs.js';
import { fixturePlace, fixtureCredits, fixtureMedia, tmpDir } from './helpers.js';

const ctx = () => ({ credits: fixtureCredits(), mediaFiles: fixtureMedia(), fixtureMode: true, now: '2026-11-09', knownIds: new Set(['yu-garden', 'nanxiang-mantou-dian', 'the-bund']) });
const msgs = (issues) => issues.map((i) => i.message).join('\n');

test('booking levels, links and the book-ahead list', () => {
  const p = fixturePlace();
  assert.equal(bookingLevel(p), 'required');
  assert.equal(bookingLinks(p).length, 2); // links honoured
  assert.deepEqual(bookingLinks({ link: 'https://a.example.com/x' }).map((l) => l.url), ['https://a.example.com/x']);
  const r = { ...fixturePlace(), id: 'r', book_ahead: { required: 'recommended', lead_days: 1, method: 'website', link: 'https://e.com/t' } };
  assert.equal(bookBadgeText(r.book_ahead), 'Booking recommended · 1 day ahead');
  const n = { ...fixturePlace(), id: 'n', book_ahead: { required: false } };
  assert.deepEqual(bookAheadList([r, n, p]).map((x) => [x.id, x.level]), [['yu-garden', 'required'], ['r', 'recommended']]);
  const html = renderPlacePage(r, { credits: fixtureCredits() });
  assert.match(html, /badge--rec/);
  assert.match(html, /Recommended/);
  assert.match(renderPlaceCard(r, {}), /atr-card__book--rec/);
  assert.ok(toJsonSchema(placeSpec).properties.book_ahead.properties.required.enum.includes('recommended'));
});

test('recommended still needs lead_days and method; walk-in conflict only for required', () => {
  const p = fixturePlace();
  p.book_ahead = { required: 'recommended' };
  const e = validatePlace(p, ctx()).filter((i) => i.level === 'error').map((i) => i.path);
  assert.ok(e.includes('book_ahead.lead_days') && e.includes('book_ahead.method'));
});

test('gaps honours book_ahead.links', () => {
  const p = { ...fixturePlace(), _meta: { mediaDir: '/nonexistent' } };
  const r = gapReport({ places: [p], areas: [], config: { countries: [] }, now: '2026-11-09' });
  assert.ok(!r.items.some((i) => i.kind === 'book-ahead'), JSON.stringify(r.items.filter((i) => i.kind === 'book-ahead')));
});

test('focus silences portrait crop warning; hero in gallery and unused media warn', () => {
  const p = fixturePlace();
  const credits = fixtureCredits().map((c) => (c.file === 'jade-corridor' ? { ...c, width: 800, height: 1200 } : c));
  assert.match(msgs(validatePlace(p, { ...ctx(), credits })), /"jade-corridor" is portrait/);
  p.blocks.find((b) => b.type === 'gallery').images[1].focus = 'top';
  assert.doesNotMatch(msgs(validatePlace(p, { ...ctx(), credits })), /"jade-corridor" is portrait/);
  p.blocks.find((b) => b.type === 'gallery').images.push({ file: 'tingtao-pond' });
  assert.match(msgs(validatePlace(p, ctx())), /already the hero photo/);
  assert.match(msgs(validatePlace(fixturePlace(), { ...ctx(), credits: [...fixtureCredits(), { file: 'spare', widths: [640] }] })), /unused photo in media\/: spare/);
});

test('media remove and prune helpers', () => {
  const d = tmpDir();
  for (const f of ['a-640.webp', 'a-1280.webp', 'ab-640.webp', 'b-640.webp']) fs.writeFileSync(path.join(d, f), 'x');
  writeCredits(d, [{ file: 'a', widths: [640, 1280] }, { file: 'ab', widths: [640] }, { file: 'b', widths: [640] }]);
  assert.deepEqual(unusedMedia(d, new Set(['b'])), ['a', 'ab']);
  assert.deepEqual(removeMedia(d, 'a').sort(), ['a-1280.webp', 'a-640.webp']);
  assert.ok(fs.existsSync(path.join(d, 'ab-640.webp')), 'prefix-sharing name untouched');
  assert.doesNotMatch(fs.readFileSync(path.join(d, 'credits.yaml'), 'utf8'), /file: a\n/);
  assert.throws(() => removeMedia(d, 'zzz'), /no media named/);
});

test('qr decodes several codes in one image', async () => {
  const d = tmpDir();
  const a = await QR.toBuffer('https://www.trip.com/travel-guide/attraction/x-1/', { width: 260 });
  const b = await QR.toBuffer('weixin://dl/business/?t=abc', { width: 260 });
  const f = path.join(d, 'notice.png');
  await sharp({ create: { width: 800, height: 420, channels: 3, background: '#f4efe6' } }).composite([{ input: a, left: 50, top: 80 }, { input: b, left: 480, top: 80 }]).png().toFile(f);
  assert.deepEqual((await decodeQr(f)).sort(), ['https://www.trip.com/travel-guide/attraction/x-1/', 'weixin://dl/business/?t=abc']);
});

test('sliceShot cuts tall PNGs into readable sections', async () => {
  const d = tmpDir();
  const f = path.join(d, 'p-phone-light.png');
  await sharp({ create: { width: 390, height: 3000, channels: 3, background: '#fff' } }).png().toFile(f);
  const parts = await sliceShot(f, 1100);
  assert.equal(parts.length, 3);
  assert.match(parts[0].file, /p-phone-light-s01\.png$/);
  const { sliceMap } = await import('../lib/shot.js');
  const m = sliceMap(parts, [{ type: 'hero', top: 0, bottom: 800 }, { type: 'map', top: 1000, bottom: 1600 }, { type: 'sources', top: 2500, bottom: 3000 }]);
  assert.deepEqual(m.map((x) => x.blocks), [['hero', 'map'], ['map'], ['sources']]);
});

test('info hint when page text and booking level disagree', () => {
  const p = fixturePlace();
  p.book_ahead = { required: false };
  p.blocks.push({ type: 'tips', variant: 'insider', items: ['Booking is required at weekends.'] });
  const i = validatePlace(p, ctx()).find((x) => x.level === 'info');
  assert.match(i.message, /says booking is required/);
});
