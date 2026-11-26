import { describe, expect, test } from 'vitest';
import {
	cacheable,
	offlineHtml,
	precachesToKeep,
	savedPagePaths,
	strategyOf,
	type RequestFacts,
} from './strategy';

const ORIGIN = 'https://trip.example';
const PRECACHED = new Set(['/_app/immutable/entry/start.abc.js', '/embed/place.css']);
const req = (path: string, more: Partial<RequestFacts> = {}): RequestFacts => ({
	url: new URL(path, ORIGIN),
	method: 'GET',
	mode: 'cors',
	range: false,
	...more,
});
const of = (path: string, more: Partial<RequestFacts> = {}) =>
	strategyOf(req(path, more), ORIGIN, PRECACHED);

describe('strategyOf', () => {
	test('never handles auth, sign-in, sign-out, health, ops or the deploy check', () => {
		for (const p of [
			'/api/auth/convex/token',
			'/api/auth/sign-in/username',
			'/login',
			'/login/__data.json',
			'/logout',
			'/healthz',
			'/healthz?deep=1',
			'/ops/export',
			'/_app/version.json',
		]) {
			expect(of(p, { mode: 'navigate' }), p).toBe('skip');
		}
		expect(of('/loginx', { mode: 'navigate' })).toBe('page');
	});
	test('leaves the city map tiles to the browser cache (they would flood the runtime cache)', () => {
		expect(of('/tiles/14/13700/6700.png')).toBe('skip');
		expect(of('/tilesx/1.png')).toBe('runtime');
	});
	test('skips writes, other origins and range requests', () => {
		expect(of('/trip', { method: 'POST', mode: 'navigate' })).toBe('skip');
		expect(strategyOf(req('/x'), 'https://other.example', PRECACHED)).toBe('skip');
		expect(of('/media/a/clip.mp4', { range: true })).toBe('skip');
	});
	test('precache first for this build, any cache for older hashed files', () => {
		expect(of('/_app/immutable/entry/start.abc.js')).toBe('precache');
		expect(of('/embed/place.css')).toBe('precache');
		expect(of('/_app/immutable/nodes/3.old.js')).toBe('immutable');
	});
	test('navigations and __data.json are pages; media, maps and content pages are runtime', () => {
		expect(of('/trip/itinerary', { mode: 'navigate' })).toBe('page');
		expect(of('/trip/itinerary/__data.json?x-sveltekit-invalidated=01')).toBe('page');
		expect(of('/__data.json')).toBe('page');
		for (const p of [
			'/media/yu-garden/1.webp',
			'/map/yu-garden.webp',
			'/area-map/x.webp',
			'/place/x',
		]) {
			expect(of(p), p).toBe('runtime');
		}
	});
});

describe('cacheable', () => {
	const ok = { ok: true, status: 200, redirected: false, type: 'basic' };
	test('only a plain same-origin 200', () => {
		expect(cacheable(ok)).toBe(true);
		expect(cacheable({ ...ok, redirected: true })).toBe(false);
		expect(cacheable({ ...ok, ok: false, status: 503 })).toBe(false);
		expect(cacheable({ ...ok, status: 206 })).toBe(false);
		expect(cacheable({ ...ok, type: 'opaque' })).toBe(false);
	});
});

describe('precachesToKeep', () => {
	test('the current build plus the newest older ones', () => {
		const names = ['pages', 'precache-a', 'precache-b', 'runtime', 'precache-c', 'precache-d'];
		expect(precachesToKeep(names, 'precache-e')).toEqual([
			'precache-c',
			'precache-d',
			'precache-e',
		]);
		expect(precachesToKeep(names, 'precache-d')).toEqual([
			'precache-b',
			'precache-c',
			'precache-d',
		]);
		expect(precachesToKeep([], 'precache-a')).toEqual(['precache-a']);
		expect(precachesToKeep(['precache-a'], 'precache-b', 1)).toEqual(['precache-b']);
	});
});

describe('offline page', () => {
	test('lists saved navigations, not data requests, sorted and escaped', () => {
		const paths = savedPagePaths([
			`${ORIGIN}/trip/itinerary`,
			`${ORIGIN}/trip/itinerary/__data.json?x-sveltekit-invalidated=11`,
			`${ORIGIN}/`,
			`${ORIGIN}/places?q=<b>`,
		]);
		expect(paths).toEqual(['/', '/places?q=%3Cb%3E', '/trip/itinerary']);
		const html = offlineHtml(['/a"b']);
		expect(html).toContain('You are offline');
		expect(html).toContain('href="/a&#34;b"');
		expect(offlineHtml([])).toContain('No pages are saved on this device yet');
	});
});
