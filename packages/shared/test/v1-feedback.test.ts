// The v1 feedback codec: real files round-trip byte for byte; bad lines fail with the old reader's messages;
// x_ fields ride in `extra`; other unknown fields fail.
import fs from 'node:fs';
import path from 'node:path';
import { beforeAll, describe, expect, test } from 'vitest';
import {
	FEEDBACK_KINDS,
	parseFeedbackJsonl,
	parseFeedbackLine,
	serialiseFeedbackJsonl,
	serialiseFeedbackLine,
	V1CodecError,
	type FeedbackKind,
	type SwipeRecord,
} from '../src/v1.ts';
import { legacy, readText, sampleFile, tmpDir } from './support.ts';

type ReadJsonl = (file: string, kind: string) => { events: unknown[]; warnings: string[] };
let readJsonl: ReadJsonl;
beforeAll(async () => {
	({ readJsonl } = await legacy<{ readJsonl: ReadJsonl }>('platform/lib/feedback/index.js'));
});

const SWIPE =
	'{"v":1,"ts":"2026-11-11T01:08:54Z","session":"s-1","round":"area","id":"beijing","verdict":"must","country":"china","ms":159038}';

describe('real feedback files', () => {
	for (const kind of FEEDBACK_KINDS) {
		const file = sampleFile('feedback', `${kind}.jsonl`);
		test.skipIf(!fs.existsSync(file))(
			`${kind}.jsonl parses with no bad line and serialises back byte for byte`,
			() => {
				const text = readText(file);
				const { records, bad } = parseFeedbackJsonl(kind, text);
				expect(bad).toEqual([]);
				expect(records.length).toBeGreaterThan(0);
				expect(records.map((r) => r.line)).toEqual(records.map((_, i) => i + 1));
				expect(
					serialiseFeedbackJsonl(
						kind,
						records.map((r) => r.record),
					),
				).toBe(text);
			},
		);
	}
});

describe('one line', () => {
	test('a record holds the v1 fields only (no seq or userId) and keeps the writer order', () => {
		const r = parseFeedbackLine('swipes', SWIPE);
		expect(r).toStrictEqual({
			ok: true,
			value: {
				v: 1,
				ts: '2026-11-11T01:08:54Z',
				session: 's-1',
				round: 'area',
				id: 'beijing',
				verdict: 'must',
				country: 'china',
				ms: 159038,
			},
		});
		const shuffled =
			'{"verdict":"must","ms":159038,"id":"beijing","v":1,"country":"china","round":"area","session":"s-1","ts":"2026-11-11T01:08:54Z"}';
		const again = parseFeedbackLine('swipes', shuffled);
		if (!again.ok) throw new Error(again.errors.join());
		expect(serialiseFeedbackLine('swipes', again.value)).toBe(SWIPE);
	});

	test('x_ fields go to extra and come back last; other unknown fields fail', () => {
		const withX = SWIPE.replace(/}$/, ',"x_mood":{"a":[1,null]},"x_n":2}');
		const r = parseFeedbackLine('swipes', withX);
		if (!r.ok) throw new Error(r.errors.join());
		expect(r.value.extra).toStrictEqual({ x_mood: { a: [1, null] }, x_n: 2 });
		expect(serialiseFeedbackLine('swipes', r.value)).toBe(withX);
		const middle = SWIPE.replace('"session"', '"x_first":true,"session"');
		const m = parseFeedbackLine('swipes', middle);
		if (!m.ok) throw new Error(m.errors.join());
		expect(serialiseFeedbackLine('swipes', m.value)).toBe(SWIPE.replace(/}$/, ',"x_first":true}'));
		expect(parseFeedbackLine('swipes', SWIPE.replace(/}$/, ',"mood":"x"}'))).toStrictEqual({
			ok: false,
			errors: ['mood: unknown field `mood`'],
		});
	});

	test('fields the old reader let through that would not round-trip fail too', () => {
		const route =
			'{"v":1,"ts":"2026-11-12T10:01:00Z","country":"china","stops":[{"area":"a","x_note":"n"}]}';
		expect(parseFeedbackLine('route', route)).toStrictEqual({
			ok: false,
			errors: ['stops[0].x_note: x_ fields are only kept at the top level of a line'],
		});
		const duel = '{"v":1,"ts":"2026-11-12T10:01:00Z","session":12,"winner":"a","loser":"b"}';
		expect(parseFeedbackLine('duels', duel)).toStrictEqual({
			ok: false,
			errors: ['session: expected text but got number'],
		});
	});

	test('serialising refuses a record that would not make a valid line', () => {
		const ok = parseFeedbackLine('swipes', SWIPE);
		if (!ok.ok) throw new Error(ok.errors.join());
		const bad: SwipeRecord = { ...ok.value, extra: { mood: 1 } };
		expect(() => serialiseFeedbackLine('swipes', bad)).toThrow(V1CodecError);
		const invalid: SwipeRecord = { ...ok.value, id: 'Not A Slug' };
		expect(() => serialiseFeedbackLine('swipes', invalid)).toThrow(
			/id: "Not A Slug" is not a valid slug/,
		);
		expect(serialiseFeedbackJsonl('swipes', [])).toBe('');
	});
});

describe('bad lines fail with the old reader messages', () => {
	const lines: Record<FeedbackKind, string[]> = {
		swipes: [
			SWIPE,
			'{"v":2}',
			'not json',
			'{"v":1,',
			'[]',
			'null',
			'"x"',
			SWIPE.replace('"must"', '"love"'),
			SWIPE.replace('"beijing"', '"Bei Jing"'),
			SWIPE.replace(',"ms":159038', ',"ms":-1'),
			SWIPE.replace('"session":"s-1",', ''),
			SWIPE.replace('"2026-11-11T01:08:54Z"', '"Nov 11"'),
		],
		duels: [
			'{"v":1,"ts":"2026-11-10T20:23:22Z","winner":"a","loser":"b","elo":{"winner":"1500"}}',
			'{"v":1,"ts":"2026-11-10T20:23:22Z","winner":"a","loser":"b","country":"japn"}',
		],
		questions: [
			'{"v":1,"ts":"2026-11-10T20:23:22Z","id":"a","question":""}',
			`{"v":1,"ts":"2026-11-10T20:23:22Z","id":"a","question":"${'q'.repeat(2001)}"}`,
		],
		notes: [
			'{"v":1,"ts":"2026-11-10T20:23:22Z","round":"area","id":"a","text":""}',
			'{"v":1,"ts":"2026-11-10T20:23:22Z","round":"city","id":"a"}',
		],
		route: [
			'{"v":1,"ts":"2026-11-10T20:23:22Z","country":"china","stops":[{"area":"a","nights":0},{"area":"b","label":"x"}]}',
			'{"v":1,"ts":"2026-11-10T20:23:22Z","country":"mars","stops":"a"}',
		],
	};
	for (const kind of FEEDBACK_KINDS) {
		test(kind, () => {
			const dir = tmpDir();
			const file = path.join(dir, `${kind}.jsonl`);
			fs.writeFileSync(file, lines[kind].join('\n') + '\n');
			const old = readJsonl(file, kind);
			const mine = parseFeedbackJsonl(kind, readText(file));
			expect(mine.records).toHaveLength(old.events.length);
			expect(mine.records.map((r) => r.record)).toStrictEqual(old.events);
			const want = old.warnings.map((w) =>
				w.replace(new RegExp(`^${kind}\\.jsonl:\\d+ `), '').replace(/ — skipped$/, ''),
			);
			expect(mine.bad.map((b) => b.errors.join('; '))).toStrictEqual(want);
		});
	}
});
