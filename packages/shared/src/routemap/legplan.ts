// Dates and nights for the stops of one country leg.

const DAY = 86400000;
export const addDays = (iso: string, n: number): string =>
	new Date(Date.parse(`${iso}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);

/** Whole nights from one YYYY-MM-DD to another; 0 when not positive or not a date. */
export function nightsBetween(from: string | undefined, to: string | undefined): number {
	const n = Math.round(
		(Date.parse(`${String(to)}T00:00:00Z`) - Date.parse(`${String(from)}T00:00:00Z`)) / DAY,
	);
	return Number.isFinite(n) && n > 0 ? n : 0;
}

export interface PlanStop {
	readonly area: string;
	/** Whole nights; anything else counts as not decided yet. */
	readonly nights?: unknown;
}

export type PlannedStop<S> = S & { start: string | null; end: string | null };

export interface LegPlan<S> {
	stops: PlannedStop<S>[];
	planned: number;
	left: number;
	status: 'empty' | 'under' | 'ok' | 'over';
}

const positiveInt = (v: unknown): number | null =>
	typeof v === 'number' && Number.isInteger(v) && v > 0 ? v : null;

/**
 * Dates for each stop of a leg. A stop's dates are known when every stop before it has nights
 * (the leg starts on `from`). start/end are null when unknown (end null too when the stop has no nights).
 */
export function legPlan<S extends PlanStop>({
	from,
	nights: available,
	stops = [],
}: {
	readonly from: string;
	readonly nights: number;
	readonly stops?: readonly S[];
}): LegPlan<S> {
	let cur = from,
		known = true,
		planned = 0;
	const out = stops.map((s): PlannedStop<S> => {
		const n = positiveInt(s.nights);
		const start = known ? cur : null;
		const end = known && n !== null ? addDays(cur, n) : null;
		if (n !== null) planned += n;
		if (end !== null) cur = end;
		else known = false;
		return { ...s, start, end };
	});
	const status =
		planned === 0 ? 'empty' : planned > available ? 'over' : planned < available ? 'under' : 'ok';
	return { stops: out, planned, left: available - planned, status };
}
