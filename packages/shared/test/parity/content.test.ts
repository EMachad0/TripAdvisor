// Parity: holidayFacts against game/server.js on every real place and every game fixture place, plus edge shapes.
import path from 'node:path';
import { beforeAll, describe, expect, test } from 'vitest';
import * as content from '../../src/content.ts';
import { FIXTURES, legacy, ROOT } from '../support.ts';
import { same } from './harness.ts';

type Place = content.PlaceSource & Record<string, unknown>;
interface OldServer {
	holidayFacts: typeof content.holidayFacts;
}
interface Platform {
	loadPlaces: (opts: Record<string, unknown>) => Place[];
}

let old: OldServer;
let places: Place[];
beforeAll(async () => {
	old = await legacy<OldServer>('game/server.js');
	const platform = await legacy<Platform>('platform/lib/load.js');
	places = [
		...platform.loadPlaces({ root: ROOT }),
		...platform.loadPlaces({ root: FIXTURES, includeFixtures: true }),
	];
});

const EDGE: Place[] = [
	{ id: 'a' },
	{ id: 'b', tags: ['cold', 'outdoor', 'crowded'] },
	{ id: 'c', tags: ['indoor'] },
	{ id: 'd', blocks: [{ type: 'weather', temp_low_c: -12, temp_high_c: -3, conditions: 'Snow' }] },
	{ id: 'e', blocks: [{ type: 'weather', temp_low_c: 4, temp_high_c: 11, conditions: 'Grey' }] },
	{ id: 'f', blocks: [{ type: 'weather', temp_low_c: 14, temp_high_c: 22, conditions: 'Sun' }] },
	{ id: 'g', blocks: [null, { type: 'weather' }] },
	{
		id: 'h',
		hours: {
			winter: 'Open **09:00–17:00**. Queues are huge at [the gate](https://x.y) on weekends.',
			summary: 'Daily',
		},
		best_time: 'Early. It sells out by noon.',
		book_ahead: { lead_time: 'Packed in December.' },
	},
	{ id: 'i', hours: { winter: 'x'.repeat(260) } },
	// A non-text hours.summary is the one deliberate difference: the port returns it as text (typed string | null).
	{ id: 'j', hours: { winter: 0, summary: '' } },
	{ id: 'k', hours: 'not an object', best_time: 'Busiest on Sundays' },
];

describe('holidayFacts', () => {
	test('same facts as game/server.js on every real and fixture place', () => {
		expect(places.length).toBeGreaterThan(100);
		expect(same(old.holidayFacts, content.holidayFacts)(places.map((p) => () => [p]))).toBe(
			places.length,
		);
	});

	test('same facts on edge shapes (weather levels, crowd text, clipping, odd types)', () => {
		expect(same(old.holidayFacts, content.holidayFacts)(EDGE.map((p) => () => [p]))).toBe(
			EDGE.length,
		);
	});
});

test('fixture root path is the game fixtures', () => {
	expect(path.basename(FIXTURES)).toBe('fixtures');
});
