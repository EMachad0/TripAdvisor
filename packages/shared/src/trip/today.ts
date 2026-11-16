// Everything the Today view shows for one day.
import { lookup, orStr } from '../util.ts';
import { SHIFT } from './constants.ts';
import { dayKey, diffDays, localKey, localStamp } from './dates.ts';
import { onDay, upcomingEvents, type OnDay, type Upcoming } from './events.ts';
import { hereOn, legsSorted, nextFlight, stayCities, stayOn, tripSpan } from './legs.ts';
import type { DayDoc, IdDoc, Leg, Task, TripPlace } from './types.ts';

export interface TodayInput<L extends Leg, P extends TripPlace, T extends Task, D extends DayDoc> {
	readonly legs?: readonly L[];
	readonly places?: readonly P[];
	readonly tasks?: readonly T[];
	readonly days?: readonly D[];
	readonly visited?: readonly IdDoc[];
	/** YYYY-MM-DD; today in local time by default. */
	readonly today?: string;
	/** Local stamp "YYYY-MM-DDTHH:MM"; now by default. */
	readonly now?: string;
}

export interface TodayModel<L extends Leg, P extends TripPlace, T extends Task, D extends DayDoc> {
	today: string;
	phase: 'none' | 'before' | 'during' | 'after';
	span: { first: string; last: string; days: number } | null;
	dayNumber: number | null;
	toDeparture: number | null;
	stay: L | null;
	tonight: L | null;
	nextStay: L | null;
	country: string | null;
	cities: readonly string[];
	flight: L | null;
	moves: L[];
	day: D | null;
	shift: string | null;
	onlyToday: OnDay<P>[];
	endingSoon: OnDay<P>[];
	upcoming: Upcoming<P, L>[];
	musts: P[];
	tasks: T[];
	tasksTotal: number;
}

const taskStatus = (t: Task): string => orStr(t.status, t.done === true ? 'done' : 'todo');

/** Everything the Today view shows for one day. */
export function todayModel<L extends Leg, P extends TripPlace, T extends Task, D extends DayDoc>({
	legs = [],
	places = [],
	tasks = [],
	days = [],
	visited = [],
	today = localKey(),
	now = localStamp(),
}: TodayInput<L, P, T, D> = {}): TodayModel<L, P, T, D> {
	const sorted = legsSorted(legs);
	const span = tripSpan(sorted);
	const phase = !span
		? 'none'
		: today < span.first
			? 'before'
			: today > span.last
				? 'after'
				: 'during';
	const stay = phase === 'during' ? hereOn(sorted, today) : null;
	const tonight = phase === 'during' ? stayOn(sorted, today) : null;
	const country = orStr(stay?.country, null),
		cities = stayCities(stay);
	const nextStay =
		sorted.find((l) => l.type === 'stay' && dayKey(l.start) > today && l !== stay) ?? null;
	const been = new Set(visited.map((v) => v.id));
	// only what can be reached from where you sleep; a stay with no city on file keeps the whole country
	const happening =
		country !== null
			? onDay(places, today, { country, cities }).filter(
					(h) => cities.length === 0 || h.reach !== 'far',
				)
			: [];
	const onlyToday = happening.filter((h) => h.kind !== 'on');
	const endingSoon = happening.filter((h) => h.kind === 'on' && h.left <= 7 && !h.season);
	const listed = new Set([...onlyToday, ...endingSoon].map((h) => h.place.id));
	const musts = places
		.filter(
			(p) =>
				p.verdict === 'must' &&
				p.city !== undefined &&
				cities.includes(p.city) &&
				!been.has(p.id) &&
				!listed.has(p.id),
		)
		.sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0));
	const open = tasks
		.filter((t) => taskStatus(t) !== 'done')
		.sort(
			(a, b) =>
				Number(taskStatus(b) === 'doing') - Number(taskStatus(a) === 'doing') ||
				(a.order ?? 0) - (b.order ?? 0),
		);
	return {
		today,
		phase,
		span,
		dayNumber: phase === 'during' && span ? diffDays(span.first, today) + 1 : null,
		toDeparture: phase === 'before' && span ? diffDays(today, span.first) : null,
		stay,
		tonight,
		nextStay,
		country,
		cities,
		flight: nextFlight(sorted, now),
		moves: sorted.filter(
			(l) =>
				l.type !== 'stay' &&
				(dayKey(l.start) === today || (l.type === 'flight' && dayKey(l.end) === today)),
		),
		day: days.find((d) => d.id === today) ?? null,
		shift: country !== null ? (lookup(SHIFT, country) ?? null) : null,
		onlyToday,
		endingSoon,
		upcoming: upcomingEvents(
			places.filter((p) => !listed.has(p.id)),
			sorted,
			today,
			{ limit: 6 },
		),
		musts,
		tasks: open,
		tasksTotal: tasks.length,
	};
}
