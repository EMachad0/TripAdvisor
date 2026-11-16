// Timezone labels (plan section 8): every clock time shown carries its UTC offset. Pure helpers behind TimeTz
// (structured times) and TzText (free text), replacing the old MutationObserver pass (game/public/trip.js
// watchTimes). The time finder is @atr/shared's tzSpots, the same one the old site used.
import { timeOf, tzLabel, tzSpots } from '@atr/shared/trip';

export type TzOffset = number | string | null | undefined;

/** A run of free text, or the label written after a time in it. */
export type TzSegment = { kind: 'text'; text: string } | { kind: 'tz'; label: string };

/** Free text split around the spots where a timezone label belongs (no label: one text segment). */
export function tzSegments(text: string, offset: TzOffset): TzSegment[] {
	const label = tzLabel(offset);
	if (label === '' || text === '') return text === '' ? [] : [{ kind: 'text', text }];
	const out: TzSegment[] = [];
	let from = 0;
	for (const at of tzSpots(text)) {
		out.push({ kind: 'text', text: text.slice(from, at) }, { kind: 'tz', label });
		from = at;
	}
	if (from < text.length) out.push({ kind: 'text', text: text.slice(from) });
	return out;
}

/** "08:30" from "08:30", "2026-12-06T08:30" or a full ISO stamp; '' when there is no clock time. */
export function clockOf(time: string): string {
	if (/^\d{1,2}:\d{2}$/.test(time)) return time.padStart(5, '0');
	return timeOf(time);
}

export { tzLabel };
