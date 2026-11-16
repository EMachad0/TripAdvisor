// The e2e data set (plan section 10, packages/migrate/fixtures/e2e): a believable mid-game state with at least
// one row in every data table. The feedback part ports seed() from game/tools/shots.js (same ids, verdicts, duels,
// notes, question and game state, 2026-11-10T09:MM:00Z one minute apart, session s-shots), and adds a route per
// country, one line with an x_ field and one swipe with ms. Ids match game/test/fixtures. The trip part covers all
// nine collections. Written by scripts/write-e2e-fixtures.ts; e2e.test.ts checks the files match.
import { v1 } from '@atr/shared';
import type { Json, JsonObject } from '../json.ts';
import type { V1Files } from '../v1/files.ts';

const at = (minute: number): string =>
	new Date(Date.UTC(2026, 10, 10, 9, minute)).toISOString().replace(/\.\d{3}Z$/, 'Z');

const PLACE_COUNTRY: Readonly<Record<string, string>> = {
	'harbin-ice-world': 'china',
	'bund-countdown': 'china',
	'great-wall-mutianyu': 'china',
	'xintiandi-christmas-market': 'china',
	'bund-techno-club': 'china',
	'nanxiang-dumplings': 'china',
	'hongyadong-night': 'china',
	'lol-park-t1': 'korea',
	'gwangjang-food-alley': 'korea',
	'bukhansan-snow-hike': 'korea',
	'shibuya-sky': 'japan',
	'suga-shrine-stairs': 'japan',
	'victoria-peak-tram': 'hong-kong',
	'chatuchak-weekend-market': 'thailand',
};

const VERDICTS: readonly (readonly [string, string])[] = [
	['harbin-ice-world', 'must'],
	['bund-countdown', 'must'],
	['great-wall-mutianyu', 'must'],
	['xintiandi-christmas-market', 'maybe'],
	['bund-techno-club', 'maybe'],
	['nanxiang-dumplings', 'must'],
	['hongyadong-night', 'must'],
	['lol-park-t1', 'must'],
	['gwangjang-food-alley', 'maybe'],
	['bukhansan-snow-hike', 'maybe'],
	['shibuya-sky', 'must'],
	['suga-shrine-stairs', 'maybe'],
	['victoria-peak-tram', 'must'],
	['chatuchak-weekend-market', 'skip'],
];

const DUELS: readonly (readonly [string, string])[] = [
	['harbin-ice-world', 'great-wall-mutianyu'],
	['bund-countdown', 'xintiandi-christmas-market'],
	['hongyadong-night', 'nanxiang-dumplings'],
	['harbin-ice-world', 'bund-countdown'],
	['great-wall-mutianyu', 'bund-techno-club'],
	['lol-park-t1', 'gwangjang-food-alley'],
	['bukhansan-snow-hike', 'gwangjang-food-alley'],
	['shibuya-sky', 'suga-shrine-stairs'],
	['hongyadong-night', 'great-wall-mutianyu'],
];

const NOTES: readonly (readonly [string, string, string])[] = [
	['area', 'harbin', 'Must, but only if I go in January: the ice festival is the whole point.'],
	[
		'place',
		'harbin-ice-world',
		'Go at dusk when the lights come on. Worth the cold, but bring real boots.',
	],
	['place', 'great-wall-mutianyu', 'Only on a clear day; skip it if Beijing is grey.'],
	['place', 'chatuchak-weekend-market', 'Skip: too hot and crowded for me.'],
];

function feedback(): Map<string, Json[]> {
	let minute = 0;
	const next = (): string => at(minute++);
	const swipes: JsonObject[] = [
		{
			v: 1,
			ts: next(),
			session: 's-shots',
			round: 'area',
			id: 'harbin',
			verdict: 'must',
			country: 'china',
		},
	];
	for (const [id, verdict] of VERDICTS) {
		swipes.push({
			v: 1,
			ts: next(),
			session: 's-shots',
			round: 'place',
			id,
			verdict,
			country: PLACE_COUNTRY[id] ?? 'china',
		});
	}
	const duels: JsonObject[] = DUELS.map(([winner, loser]) => ({
		v: 1,
		ts: next(),
		session: 's-shots',
		winner,
		loser,
	}));
	const notes: JsonObject[] = NOTES.map(([round, id, text]) => ({
		v: 1,
		ts: next(),
		session: 's-shots',
		round,
		id,
		text,
	}));
	const questions: JsonObject[] = [
		{
			v: 1,
			ts: next(),
			session: 's-shots',
			id: 'harbin-ice-world',
			question: 'Is it open on Christmas Day?',
			answer_summary: 'Yes, open daily from mid-December including Dec 25.',
		},
	];
	// Beyond the shots seed: a timed swipe, an x_ field, an elo-stamped duel and a route per leg kind.
	swipes.push({
		v: 1,
		ts: next(),
		session: 's-e2e',
		round: 'place',
		id: 'shibuya-sky',
		verdict: 'must',
		country: 'japan',
		ms: 5400,
	});
	swipes.push({
		v: 1,
		ts: next(),
		session: 's-e2e',
		round: 'area',
		id: 'kyoto',
		verdict: 'maybe',
		country: 'japan',
		x_source: 'e2e-fixture',
	});
	duels.push({
		v: 1,
		ts: next(),
		session: 's-e2e',
		winner: 'shibuya-sky',
		loser: 'suga-shrine-stairs',
		country: 'japan',
		elo: { winner: 1561.3, loser: 1438.7 },
	});
	const route: JsonObject[] = [
		{
			v: 1,
			ts: next(),
			session: 's-e2e',
			country: 'china',
			stops: [
				{ area: 'harbin', nights: 4 },
				{ area: 'chongqing', nights: 5 },
				{ area: 'shanghai', nights: 6, name: 'Shanghai', lat: 31.2304, lng: 121.4737 },
			],
		},
		{ v: 1, ts: next(), session: 's-e2e', country: 'japan', stops: [{ area: 'kyoto', nights: 5 }] },
	];
	return new Map<string, Json[]>([
		['swipes', swipes],
		['duels', duels],
		['questions', questions],
		['notes', notes],
		['route', route],
	]);
}

const GAME_STATE: JsonObject = {
	v: 1,
	firstRun: '2026-11-01T00:00:00Z',
	firstSeen: {
		'hongyadong-night': '2026-11-09T00:00:00Z',
		'khao-san-road': '2026-11-09T00:00:00Z',
		'dotonbori-kani-doraku': '2026-11-09T00:00:00Z',
	},
	days: { china: 25, japan: 11 },
	locks: { nye: 'harbin-ice-world' },
};

const TRIP: Readonly<Record<string, JsonObject[]>> = {
	tasks: [
		{
			id: 'visa-check',
			title: 'Check China visa-free entry',
			status: 'done',
			note: 'Transit rule covers 30 days.',
			order: 1,
			done: true,
		},
		{ id: 'esim', title: 'Buy an eSIM', suggested: true, status: 'todo', note: '', order: 2 },
		{ id: 'jr-pass', title: 'Decide on the JR pass', status: 'doing', order: 3 },
	],
	legs: [
		{
			id: 'gru-pvg',
			type: 'flight',
			status: 'booked',
			cabin: 'economy',
			carrier: 'Air China',
			flight: 'CA908',
			from: 'GRU',
			fromName: 'São Paulo',
			to: 'PVG',
			toName: 'Shanghai',
			start: '2026-12-04T23:55',
			end: '2026-12-06T06:10',
			duration: '30h 15m',
			ref: 'ABC123',
			note: 'Via Madrid.',
			order: 1,
			tzStart: -3,
			tzEnd: 8,
		},
		{
			id: 'stay-harbin',
			type: 'stay',
			country: 'china',
			city: 'harbin',
			title: 'Harbin hostel',
			start: '2026-12-20',
			end: '2026-12-24',
			status: 'planned',
			host: 'Old Town Hostel',
			checkIn: '14:00',
			checkOut: '12:00',
			address: '1 Central Street',
			note: 'Check in 14:00 (UTC+8).',
			order: 2,
		},
		{
			id: 'stay-kansai',
			type: 'stay',
			country: 'japan',
			city: 'kyoto',
			title: 'Kansai base',
			start: '2027-01-10',
			end: '2027-01-15',
			status: 'tbd',
			cities: ['kyoto', 'osaka'],
			order: 3,
			tz: 'Asia/Tokyo',
		},
		{
			id: 'train-osaka',
			type: 'transport',
			status: 'onday',
			mode: 'train',
			title: 'Kyoto to Osaka',
			start: '2027-01-15T10:00',
			fromName: 'Kyoto',
			toName: 'Osaka',
			duration: '15m',
			plan: 'Shinkansen or the JR special rapid at 08:30.',
			order: 4,
		},
		{
			id: 'note-nye',
			type: 'note',
			title: 'New Year in Chongqing',
			start: '2026-12-31',
			note: 'Countdown at Jiefangbei.',
			order: 5,
		},
	],
	bag: [
		{
			id: 'boots',
			category: 'Clothes',
			item: 'Winter boots',
			note: 'For Harbin.',
			qty: 1,
			packed: false,
			order: 1,
		},
		{ id: 'adapter', category: 'Tech', item: 'Plug adapter', qty: 2, packed: true, order: 2 },
	],
	budget: [
		{
			id: 'china',
			country: 'china',
			currency: 'CNY',
			bed: 120,
			food: 90,
			other: 60,
			pay: 'Alipay with a foreign card.',
			order: 1,
		},
	],
	fixed: [
		{
			id: 'flights',
			title: 'Flights',
			amount: 9000,
			status: 'paid',
			note: 'All long-haul legs.',
			order: 1,
		},
	],
	spend: [
		{
			id: 'xm1abc',
			date: '2026-12-06',
			note: 'Metro card',
			amount: 50,
			currency: 'CNY',
			amountBRL: 38.5,
			category: 'other',
			country: 'china',
			order: 1,
		},
	],
	settings: [{ id: 'main', cap: 40000, tips: 'Convert a few days at a time.' }],
	days: [
		{ id: '2026-12-24', status: 'vacation', holiday: 'Christmas Eve', note: 'Harbin.' },
		{ id: '2026-12-25', status: 'off', holiday: 'Christmas' },
		{ id: '2027-01-05', status: 'work' },
	],
	visited: [{ id: 'yu-garden', at: '2026-12-07T10:30:00+08:00' }],
};

export function e2eFiles(): V1Files {
	const files = new Map<string, string>();
	for (const [kind, lines] of feedback()) files.set(`feedback/${kind}.jsonl`, v1.jsonlText(lines));
	files.set('feedback/game-state.json', v1.jsonText(GAME_STATE));
	for (const [col, docs] of Object.entries(TRIP)) files.set(`trip/${col}.json`, v1.jsonText(docs));
	return files;
}
