// The v1 codec for feedback/game-state.json: { v, firstRun, firstSeen, days, locks }.
import { jsString } from '../util.ts';
import {
	badExtraKeys,
	fail,
	isJsonObject,
	ok,
	splitExtra,
	V1CodecError,
	type Extra,
	type Json,
	type Result,
} from './json.ts';

export interface GameStateRecord {
	v: 1;
	/** When the game first ran (the baseline for "new" cards), or null before that. */
	firstRun: string | null;
	/** Place id, or `area:<id>` → when it was first shown. */
	firstSeen: Record<string, string>;
	/** Country id → days (the local what-if). */
	days: Record<string, number>;
	/** Holiday id → locked place id. */
	locks: Record<string, string>;
	extra?: Extra;
}

const KEYS = ['v', 'firstRun', 'firstSeen', 'days', 'locks'] as const;

function mapOf<T>(
	name: string,
	v: Json | undefined,
	is: (x: Json) => x is Json & T,
	what: string,
	errors: string[],
): Record<string, T> {
	if (v === undefined) return {};
	if (!isJsonObject(v)) {
		errors.push(`${name}: expected an object`);
		return {};
	}
	const out: Record<string, T> = {};
	for (const [k, x] of Object.entries(v))
		if (is(x)) out[k] = x;
		else errors.push(`${name}.${k}: expected ${what}`);
	return out;
}

const isString = (x: Json): x is string => typeof x === 'string';
const isNumber = (x: Json): x is number => typeof x === 'number';

/**
 * Parse game-state.json. Missing maps read as empty, like the old reader (game/lib/store.js readState);
 * x_ keys go to `extra`; any other key, or a wrong type, fails.
 */
export function parseGameState(text: string): Result<GameStateRecord> {
	let obj: Json;
	try {
		obj = JSON.parse(text) as Json;
	} catch (e) {
		return fail([`not valid JSON (${e instanceof Error ? e.message : jsString(e)})`]);
	}
	if (!isJsonObject(obj)) return fail(['(root): expected an object']);
	const { fields, extra, unknown } = splitExtra(obj, KEYS);
	const errors = unknown.map((k) => `${k}: unknown field`);
	if (fields['v'] !== 1) errors.push(`v: expected 1 but got ${jsString(fields['v'])}`);
	const firstRun = fields['firstRun'] ?? null;
	if (firstRun !== null && typeof firstRun !== 'string')
		errors.push('firstRun: expected text or null');
	const record: GameStateRecord = {
		v: 1,
		firstRun: typeof firstRun === 'string' ? firstRun : null,
		firstSeen: mapOf('firstSeen', fields['firstSeen'], isString, 'text', errors),
		days: mapOf('days', fields['days'], isNumber, 'a number', errors),
		locks: mapOf('locks', fields['locks'], isString, 'text', errors),
		...(extra ? { extra } : {}),
	};
	return errors.length > 0 ? fail(errors) : ok(record);
}

/** game-state.json as the old writer formats it (two-space indent, trailing newline). */
export function serialiseGameState(record: GameStateRecord): string {
	const bad = badExtraKeys(record.extra);
	if (bad.length > 0)
		throw new V1CodecError(
			'game state',
			bad.map((k) => `extra.${k}: not an x_ field`),
		);
	const { v, firstRun, firstSeen, days, locks, extra } = record;
	return JSON.stringify({ v, firstRun, firstSeen, days, locks, ...extra }, null, 2) + '\n';
}
