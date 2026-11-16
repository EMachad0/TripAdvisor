// File serving shared by /media, /area-media, /map, /area-map and /assets: the old server's inside() guard,
// content types, Cache-Control and its JSON 404.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, test } from 'vitest';
import { fileResponse, inside, notFound, WEBP_FILE } from './serve.server';

const base = fs.mkdtempSync(path.join(os.tmpdir(), 'atr-serve-'));
fs.mkdirSync(path.join(base, 'sub'));
fs.writeFileSync(path.join(base, 'a.webp'), 'webp-bytes');
fs.writeFileSync(path.join(base, 'atr.css'), 'body{}');
afterAll(() => {
	fs.rmSync(base, { recursive: true, force: true });
});

describe('inside', () => {
	test('keeps paths under the base and refuses the rest', () => {
		expect(inside(base, 'a.webp')).toBe(path.join(base, 'a.webp'));
		expect(inside(base, 'sub/x.webp')).toBe(path.join(base, 'sub', 'x.webp'));
		expect(inside(base, '../a.webp')).toBeNull();
		expect(inside(base, 'sub/../../etc/passwd')).toBeNull();
		expect(inside(base, '/etc/passwd')).toBeNull();
		expect(inside(base, '.')).toBeNull();
	});
});

describe('fileResponse', () => {
	test('a file goes out with its type and the given Cache-Control', async () => {
		const r = await fileResponse(path.join(base, 'a.webp'), 'max-age=600');
		expect(r.status).toBe(200);
		expect(r.headers.get('content-type')).toBe('image/webp');
		expect(r.headers.get('cache-control')).toBe('max-age=600');
		expect(await r.text()).toBe('webp-bytes');
		const css = await fileResponse(path.join(base, 'atr.css'), 'max-age=3600');
		expect(css.headers.get('content-type')).toBe('text/css; charset=utf-8');
	});

	test('missing, a folder, or no path at all: the JSON 404 with no-store', async () => {
		for (const f of [path.join(base, 'nope.webp'), path.join(base, 'sub'), null, undefined]) {
			const r = await fileResponse(f, 'max-age=600');
			expect(r.status).toBe(404);
			expect(r.headers.get('cache-control')).toBe('no-store');
			expect(await r.json()).toEqual({ error: 'not found' });
		}
		expect(notFound().status).toBe(404);
	});

	test('media names are one .webp segment', () => {
		expect(WEBP_FILE.test('cover-640.webp')).toBe(true);
		expect(WEBP_FILE.test('cover-640.png')).toBe(false);
		expect(WEBP_FILE.test('a/b.webp')).toBe(false);
	});
});
