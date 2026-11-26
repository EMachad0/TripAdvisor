import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { validate } from 'convex-helpers/validators';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { contentIndex } from '../../convex/tables/app';
import { ContentCache, contentFingerprint, readContent } from './content';
import { publishContentIndex, PublishError, startContentPublisher } from './content-publish';

const ROOT = path.resolve(import.meta.dirname, '../../../../..');
const E2E_CONTENT = path.join(ROOT, 'packages/migrate/fixtures/e2e/content');
const source = { root: E2E_CONTENT, includeFixtures: true };

const dirs: string[] = [];
afterEach(() => {
	for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

/** A small writable content root: one place, one area, a config. */
function scratchRoot(): string {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), 'atr-content-'));
	dirs.push(root);
	const place = path.join(root, 'places/china/shanghai/yu-garden');
	fs.mkdirSync(place, { recursive: true });
	fs.writeFileSync(
		path.join(place, 'place.yaml'),
		'id: yu-garden\nname: Yu Garden\ncountry: china\ncity: shanghai\ncategory: culture\n',
	);
	fs.mkdirSync(path.join(root, 'areas/china'), { recursive: true });
	fs.writeFileSync(
		path.join(root, 'areas/china/shanghai.yaml'),
		'id: shanghai\nname: Shanghai\ncountry: china\nlat: 31.2\nlng: 121.4\n',
	);
	fs.mkdirSync(path.join(root, 'config'));
	fs.writeFileSync(
		path.join(root, 'config/trip.yaml'),
		'countries:\n  - id: china\n    from: 2026-12-06\n    to: 2027-01-02\n    route:\n      - { area: shanghai, nights: 4 }\n',
	);
	return root;
}

describe('readContent', () => {
	test('the e2e root: every place and area, answers, and an index Convex accepts', () => {
		const { payload, index } = readContent(source);
		expect(payload.places.length).toBe(21);
		expect(payload.areas.length).toBe(10);
		expect(payload.answers.length).toBeGreaterThan(0);
		expect(payload.places.every((p) => p.tz !== null)).toBe(true);
		expect(payload.areas.filter((a) => a.lat !== null)).toHaveLength(10);
		expect(validate(contentIndex.validator, index)).toBe(true);
		expect(index.legs.map((l) => l.country)).toEqual([
			'china',
			'thailand',
			'singapore',
			'korea',
			'japan',
			'hong-kong',
		]);
		expect(index.holidays).toEqual([
			{ id: 'christmas', pickMany: false },
			{ id: 'nye', pickMany: false },
			{ id: 'lny', pickMany: true },
		]);
	});

	test('fixture files are skipped unless includeFixtures', () => {
		expect(readContent({ ...source, includeFixtures: false }).payload.places).toEqual([]);
	});

	test('the index sha is a hash of its contents: equal content, equal sha', () => {
		expect(readContent(source).index.sha).toBe(readContent(source).index.sha);
		expect(readContent(source).index.sha).toMatch(/^[0-9a-f]{40}$/);
	});

	test('structured card data replaces the card HTML', () => {
		const p = readContent(source).payload.places.find((x) => x.id === 'harbin-ice-world');
		expect(p?.card.cover?.srcset.length).toBeGreaterThan(0);
		expect(p?.card.cover?.src).toMatch(/^\/media\/harbin-ice-world\/.+-\d+\.webp$/);
		expect(p?.card.categoryLabel).not.toBe('');
		const a = readContent(source).payload.areas.find((x) => x.id === 'harbin');
		expect(a?.image?.src).toMatch(/^\/area-media\/china\/snow-sculpture-\d+\.webp$/);
		expect(a?.winterHtml).toContain('<strong>cold</strong>');
	});
});

describe('hubs (config/hubs.yaml)', () => {
	test('the e2e root: well-formed hubs only, the bad entry dropped', () => {
		const { hubs } = readContent(source).payload;
		expect(hubs.map((h) => h.id)).toEqual(['pvg', 'shanghai-hongqiao']);
		expect(hubs[0]).toMatchObject({ kind: 'airport', code: 'PVG', city: 'shanghai', lat: 31.1443 });
		expect(hubs[1]?.code).toBeNull();
	});

	test('a root without the file has no hubs; a broken file is no hubs, not an error', () => {
		const root = scratchRoot();
		expect(readContent({ root, includeFixtures: false }).payload.hubs).toEqual([]);
		fs.writeFileSync(path.join(root, 'config/hubs.yaml'), 'hubs: [ {id: pvg, : :\n');
		expect(readContent({ root, includeFixtures: false }).payload.hubs).toEqual([]);
		fs.writeFileSync(path.join(root, 'config/hubs.yaml'), '');
		expect(readContent({ root, includeFixtures: false }).payload.hubs).toEqual([]);
	});

	test('adding the file changes the content version', () => {
		const root = scratchRoot();
		const before = contentFingerprint({ root, includeFixtures: false });
		fs.writeFileSync(
			path.join(root, 'config/hubs.yaml'),
			'hubs:\n  - { id: pvg, kind: airport, name: Pudong, country: china, city: shanghai, lat: 31.1, lng: 121.8 }\n',
		);
		expect(contentFingerprint({ root, includeFixtures: false })).not.toBe(before);
		expect(readContent({ root, includeFixtures: false }).payload.hubs.map((h) => h.id)).toEqual([
			'pvg',
		]);
	});
});

describe('ContentCache', () => {
	test('re-reads only when a content file changed, checked at most every recheckMs', () => {
		const root = scratchRoot();
		let t = 0;
		const cache = new ContentCache({ root, includeFixtures: false }, 1000, () => t);
		const changes: string[] = [];
		cache.onChange((c) => changes.push(c.version));
		const first = cache.get();
		expect(first.payload.places.map((p) => p.id)).toEqual(['yu-garden']);
		const place = path.join(root, 'places/china/shanghai/the-bund');
		fs.mkdirSync(place);
		fs.writeFileSync(
			path.join(place, 'place.yaml'),
			'id: the-bund\nname: The Bund\ncountry: china\ncity: shanghai\ncategory: views\n',
		);
		t = 500;
		expect(cache.get()).toBe(first);
		t = 1500;
		const second = cache.get();
		expect(second.payload.places.map((p) => p.id).sort()).toEqual(['the-bund', 'yu-garden']);
		expect(second.version).not.toBe(first.version);
		expect(changes).toEqual([second.version]);
		t = 3000;
		expect(cache.get()).toBe(second);
	});

	test('the fingerprint follows file edits', () => {
		const root = scratchRoot();
		const before = contentFingerprint({ root, includeFixtures: false });
		fs.appendFileSync(path.join(root, 'areas/china/shanghai.yaml'), 'why: More text.\n');
		expect(contentFingerprint({ root, includeFixtures: false })).not.toBe(before);
	});
});

describe('content publisher', () => {
	const target = { siteUrl: 'http://127.0.0.1:9', token: 'tok' };
	const index = readContent(source).index;

	test('POSTs the index with the bearer token', async () => {
		const fetchFn = vi.fn<typeof fetch>(() =>
			Promise.resolve(new Response(JSON.stringify({ ok: true, changed: true, sha: index.sha }))),
		);
		expect(await publishContentIndex(index, target, fetchFn)).toEqual({
			changed: true,
			sha: index.sha,
		});
		const [url, init] = fetchFn.mock.calls[0] ?? [];
		expect(url).toEqual(new URL('http://127.0.0.1:9/ops/content-index'));
		expect(new Headers(init?.headers).get('authorization')).toBe('Bearer tok');
		expect(JSON.parse(init?.body as string)).toEqual(index);
	});

	test('a refusal and an unreachable backend throw PublishError', async () => {
		const refuse = vi.fn<typeof fetch>(() =>
			Promise.resolve(new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401 })),
		);
		await expect(publishContentIndex(index, target, refuse)).rejects.toMatchObject({
			name: 'PublishError',
			status: 401,
		});
		const down = vi.fn<typeof fetch>(() => Promise.reject(new TypeError('fetch failed')));
		const error = await publishContentIndex(index, target, down).catch((e: unknown) => e);
		expect(error).toBeInstanceOf(PublishError);
		expect((error as PublishError).status).toBe(0);
	});

	test('retries with backoff until Convex accepts, then stays quiet', async () => {
		let calls = 0;
		const fetchFn = vi.fn<typeof fetch>(() => {
			calls++;
			return calls < 3
				? Promise.reject(new TypeError('fetch failed'))
				: Promise.resolve(new Response(JSON.stringify({ ok: true, changed: true })));
		});
		const timers: { fn: () => void; ms: number }[] = [];
		const logs: string[] = [];
		const cache = new ContentCache(source, 60_000);
		const publishNow = startContentPublisher({
			cache,
			target,
			fetchFn,
			retryMs: 100,
			log: (m) => logs.push(m),
			setTimer: (fn, ms) => timers.push({ fn, ms }),
		});
		await vi.waitFor(() => {
			expect(timers).toHaveLength(1);
		});
		timers[0]?.fn();
		await vi.waitFor(() => {
			expect(timers).toHaveLength(2);
		});
		expect(timers.map((t) => t.ms)).toEqual([100, 200]);
		timers[1]?.fn();
		await vi.waitFor(() => {
			expect(calls).toBe(3);
		});
		await publishNow();
		expect(calls).toBe(3);
		expect(logs).toHaveLength(1);
		expect(logs[0]).not.toContain('tok');
	});
});
