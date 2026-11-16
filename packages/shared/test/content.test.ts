import { describe, expect, test } from 'vitest';
import { imageSet, isNewCard, mediaUrl, seenKey, thumbUrl, tzHtml } from '../src/content.ts';
import { tzSpots } from '../src/trip.ts';

describe('thumbUrl and imageSet', () => {
	const credits = [
		{
			file: 'hero',
			widths: [2048, 640, 1280],
			width: 4000,
			height: 3000,
			title: 'File:Hero shot.jpg',
		},
	];
	test('the smallest rendition of the cover, or of the hero block image', () => {
		expect(thumbUrl({ id: 'yu garden', cover: 'hero' }, credits)).toBe(
			'/media/yu%20garden/hero-640.webp',
		);
		expect(thumbUrl({ id: 'p', blocks: [{ type: 'hero', image: 'hero' }] }, credits)).toBe(
			'/media/p/hero-640.webp',
		);
		expect(thumbUrl({ id: 'p', cover: 'other' }, credits)).toBe('/media/p/other-1280.webp');
		expect(thumbUrl({ id: 'p' }, credits)).toBeNull();
	});
	test('the old <img>: src at the first width ≥ 1280, srcset, size from the credit, alt from the title', () => {
		expect(imageSet('hero', credits, (f, w) => mediaUrl('p', f, w))).toEqual({
			src: '/media/p/hero-1280.webp',
			srcset: [640, 1280, 2048].map((w) => ({ url: `/media/p/hero-${String(w)}.webp`, width: w })),
			width: 1280,
			height: 960,
			alt: 'Hero shot',
		});
		expect(imageSet(undefined, credits, () => '')).toBeNull();
	});
});

describe('isNewCard', () => {
	const seen = { a: '2026-11-02T00:00:00Z', 'area:x': '2026-10-30T00:00:00Z' };
	const run = '2026-11-01T00:00:00Z';
	test('not swiped, first seen after the first run', () => {
		expect(isNewCard('a', false, seen, run, '2026-11-15T00:00:00Z')).toBe(true);
		expect(isNewCard('a', true, seen, run, '2026-11-15T00:00:00Z')).toBe(false);
		expect(isNewCard(seenKey('area', 'x'), false, seen, run, '2026-11-15T00:00:00Z')).toBe(false);
	});
	test('a key with no row yet counts as seen now; nothing is new before the first run', () => {
		expect(isNewCard('b', false, seen, run, '2026-11-15T00:00:00Z')).toBe(true);
		expect(isNewCard('b', false, seen, null, '2026-11-15T00:00:00Z')).toBe(false);
	});
});

describe('tzHtml', () => {
	test('labels times in text between tags, never inside tags or attributes', () => {
		const html = '<p>Open 09:00–17:00 <a href="/x?t=10:30">daily</a>, last entry at 16:30.</p>';
		expect(tzHtml(html, 'UTC+8', tzSpots)).toBe(
			'<p>Open 09:00–17:00 UTC+8 <a href="/x?t=10:30">daily</a>, last entry at 16:30 UTC+8.</p>',
		);
		expect(tzHtml(html, '', tzSpots)).toBe(html);
	});
});
