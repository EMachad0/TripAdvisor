import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { parseBingImages, searchWeb, grabWeb, previewWeb, WEB_LICENSE } from '../lib/media/web.js';
import { readCredits } from '../lib/media/index.js';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'atr-web-'));
const jpeg = (width, height) => sharp({ create: { width, height, channels: 3, background: '#a33' } }).jpeg().toBuffer();
const serve = (buf, type = 'image/jpeg') => async () => new Response(buf, { status: 200, headers: { 'content-type': type } });

test('parseBingImages reads image, page and title from result tiles, without duplicates', async () => {
  const m = (o) => `<a class="iusc" m="${JSON.stringify(o).replace(/&/g, '&amp;').replace(/"/g, '&quot;')}"></a>`;
  const html = m({ murl: 'https://a.example/1.jpg', purl: 'https://a.example/post?x=1&y=2', t: 'Kwan Kee', turl: 'https://t/1' }) + m({ murl: 'https://a.example/1.jpg' }) + m({ murl: 'notaurl' }) + '<a m="{broken">';
  assert.deepEqual(parseBingImages(html), [{ image_url: 'https://a.example/1.jpg', page_url: 'https://a.example/post?x=1&y=2', title: 'Kwan Kee', thumb_url: 'https://t/1' }]);
  assert.equal((await searchWeb('x', { html, limit: 5 })).length, 1);
});

test('grabWeb saves WebP variants and a credit that names the page', async () => {
  const dir = tmp();
  const cr = await grabWeb('https://img.example/photos/dorm%20room.jpg', dir, { name: 'Dorm Room', pageUrl: 'https://www.hostel.example/rooms', fetchImpl: serve(await jpeg(1800, 1200)) });
  assert.equal(cr.file, 'dorm-room');
  assert.deepEqual(cr.widths, [640, 1280, 1800]);
  const [saved] = readCredits(dir);
  assert.equal(saved.license, WEB_LICENSE);
  assert.equal(saved.author, 'hostel.example');
  assert.equal(saved.source_url, 'https://www.hostel.example/rooms');
  assert.equal(saved.origin, 'web');
  assert.ok(fs.existsSync(path.join(dir, 'dorm-room-1280.webp')));
});

test('grabWeb refuses small images, pages and a missing --from', async () => {
  const dir = tmp();
  await assert.rejects(grabWeb('https://img.example/a.jpg', dir, { pageUrl: 'https://x.example/', fetchImpl: serve(await jpeg(800, 600)) }), /only 800 px wide/);
  assert.equal((await grabWeb('https://img.example/a.jpg', dir, { pageUrl: 'https://x.example/', force: true, fetchImpl: serve(await jpeg(800, 600)) })).width, 800);
  await assert.rejects(grabWeb('https://img.example/a.jpg', dir, { pageUrl: 'https://x.example/', fetchImpl: serve('<html>', 'text/html') }), /not an image/);
  await assert.rejects(grabWeb('https://img.example/a.jpg', dir, { fetchImpl: serve(await jpeg(1800, 1200)) }), /--from/);
});

test('previewWeb numbers the usable images, skips small ones and writes a contact sheet', async () => {
  const big = await jpeg(1600, 900), small = await jpeg(200, 200);
  const fetchImpl = async (url) => (/gone/.test(url) ? new Response('', { status: 404 }) : new Response(/small/.test(url) ? small : big, { status: 200, headers: { 'content-type': 'image/jpeg' } }));
  const pv = await previewWeb([{ image_url: 'https://e/small.jpg' }, { image_url: 'https://e/gone.jpg' }, { image_url: 'https://e/big.jpg', page_url: 'https://e/p', title: 'Big' }], 'q', { minWidth: 500, outDir: tmp(), fetchImpl });
  const ok = pv.items.filter((x) => x.file);
  assert.deepEqual(ok.map((x) => [x.n, x.width]), [[1, 1600]]);
  assert.ok(fs.existsSync(pv.sheet));
  assert.ok(pv.items.some((x) => x.error));
});
