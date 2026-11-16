// The route: the traveler's order of stops inside each country leg (port of platform/lib/route.js).
// Seed: `route:` per country in config/trip.yaml. Edits: route events (feedback/route.jsonl; the latest per country
// wins). See docs/FEEDBACK-FORMAT.md ("feedback/route.jsonl").
import { check, type Issue } from './schema/check.ts';
import { joinPath, t } from './schema/dsl.ts';
import { COUNTRIES } from './schema/enums.ts';
import { jsString, lookup, orStr, truthy } from './util.ts';

export const MAX_STOPS = 30;
export const MAX_NIGHTS = 90;

/** One stop. `area` is an area id (areas/<country>/<id>.yaml); name/lat/lng are for a stop with no area file (e.g. Hong Kong). */
export const ROUTE_STOP_SPEC = t.object({
	area: t.slug({
		desc: 'Area id (the area file name), or an id of your choice for a stop with no area file',
		example: 'shanghai',
	}),
	nights: t.opt(
		t.int({ min: 1, max: MAX_NIGHTS, desc: 'Nights at this stop; leave out while undecided' }),
	),
	name: t.opt(
		t.string({
			max: 80,
			desc: 'Display name; needed when there is no area file',
			example: 'Hong Kong',
		}),
	),
	lat: t.opt(
		t.number({
			min: -90,
			max: 90,
			desc: 'WGS84 latitude; needed when there is no area file',
			example: 22.2793,
		}),
	),
	lng: t.opt(
		t.number({
			min: -180,
			max: 180,
			desc: 'WGS84 longitude; needed when there is no area file',
			example: 114.1628,
		}),
	),
});
export const ROUTE_STOPS_SPEC = t.array(ROUTE_STOP_SPEC, { max: MAX_STOPS });

/** A stop as stored: only these fields, in this order. */
export interface RouteStop {
	area: string;
	nights?: number;
	name?: string;
	lat?: number;
	lng?: number;
}

/** A route event (one line of feedback/route.jsonl, or its Convex row). */
export interface RouteEvent {
	readonly ts: string;
	readonly country: string;
	readonly stops: readonly RouteStop[];
}

const iso = (d: unknown): string => (d === undefined || d === null ? '' : jsString(d)).slice(0, 10);
const dayNum = (d: unknown): number => Date.parse(`${iso(d)}T00:00:00Z`) / 86400000;

/** Nights between two YYYY-MM-DD dates (Dec 6 → Jan 2 = 27); 0 when not positive or not dates. */
export function nightsBetween(from: unknown, to: unknown): number {
	const n = Math.round(dayNum(to) - dayNum(from));
	return Number.isFinite(n) && n > 0 ? n : 0;
}

const titleCase = (s: string): string =>
	s
		.split('-')
		.map((w) => (w ? (w[0] ?? '').toUpperCase() + w.slice(1) : w))
		.join(' ');

const isRecord = (v: unknown): v is Record<string, unknown> =>
	typeof v === 'object' && v !== null && !Array.isArray(v);

/** Keep only the stop fields, in a fixed order. */
export function clean(s: Readonly<Record<string, unknown>>): RouteStop {
	const o: RouteStop = { area: String(s['area']) };
	const { nights, name, lat, lng } = s;
	if (typeof nights === 'number' && Number.isInteger(nights)) o.nights = nights;
	if (typeof name === 'string' && name.trim()) o.name = name.trim();
	if (typeof lat === 'number' && typeof lng === 'number') {
		o.lat = lat;
		o.lng = lng;
	}
	return o;
}

const errorsOnly = (issues: Issue[]): Issue[] => issues.filter((x) => x.level === 'error');

/**
 * Validate and normalise `route:` on every country of a trip config, in place.
 * A missing `route:` is fine (it becomes []). Bad stops are dropped with a warning; a stop may be written as just its
 * area id (`- shanghai`). Duplicate areas keep the first. Returns the warnings
 * ("config/trip.yaml countries[0] (china).route[1].nights: …").
 */
export function normalizeConfigRoutes(
	cfg: { readonly countries?: unknown } | null | undefined,
	{ file = 'config/trip.yaml' }: { file?: string } = {},
): string[] {
	const warnings: string[] = [];
	const countries: unknown = cfg?.countries;
	if (!Array.isArray(countries)) return warnings;
	countries.forEach((c: unknown, i) => {
		if (!isRecord(c)) return;
		const id = c['id'];
		const where = `${file} countries[${String(i)}]${truthy(id) ? ` (${jsString(id)})` : ''}.route`;
		const route = c['route'];
		if (route === undefined || route === null) {
			c['route'] = [];
			return;
		}
		if (!Array.isArray(route)) {
			warnings.push(
				`${where}: expected a list of stops like "- { area: shanghai, nights: 4 }"; ignored`,
			);
			c['route'] = [];
			return;
		}
		const out: RouteStop[] = [],
			seen = new Set<unknown>();
		route.forEach((raw: unknown, j) => {
			const s: unknown = typeof raw === 'string' ? { area: raw } : raw;
			const issues: { path: string; message: string }[] = errorsOnly(check(ROUTE_STOP_SPEC, s, []));
			const rec = isRecord(s) ? s : undefined;
			if ((rec?.['lat'] === undefined) !== (rec?.['lng'] === undefined))
				issues.push({
					path: rec?.['lat'] === undefined ? 'lat' : 'lng',
					message: 'lat and lng go together',
				});
			if (issues.length || !rec) {
				warnings.push(
					`${where}[${String(j)}]: ${issues.map((x) => `${x.path === '(root)' ? '' : `${x.path}: `}${x.message}`).join('; ')}; stop ignored`,
				);
				return;
			}
			if (seen.has(rec['area'])) {
				warnings.push(
					`${where}[${String(j)}]: ${jsString(rec['area'])} is already on this route; the repeat is ignored`,
				);
				return;
			}
			if (out.length >= MAX_STOPS) {
				warnings.push(`${where}: more than ${String(MAX_STOPS)} stops; the rest are ignored`);
				return;
			}
			seen.add(rec['area']);
			out.push(clean(rec));
		});
		c['route'] = out;
	});
	return warnings;
}

/** Validate a stops list (the POST body of a route save). Returns error strings (empty = valid). */
export function stopsErrors(stops: unknown): string[] {
	const errs = errorsOnly(check(ROUTE_STOPS_SPEC, stops, [])).map(
		(x) =>
			`stops${x.path === '(root)' ? '' : x.path.startsWith('[') ? x.path : `.${x.path}`}: ${x.message}`,
	);
	if (Array.isArray(stops)) {
		const seen = new Set<unknown>();
		stops.forEach((s: unknown, i) => {
			const area = isRecord(s) ? s['area'] : undefined;
			if (truthy(area) && seen.has(area))
				errs.push(`stops${joinPath([i])}: ${jsString(area)} is on the route twice`);
			if (truthy(area)) seen.add(area);
		});
	}
	return errs;
}

/** Latest route event per country (latest ts wins; equal ts keep file order). */
export function latestRoutes<E extends Pick<RouteEvent, 'ts' | 'country'>>(
	events: readonly E[] = [],
): Map<string, E> {
	const m = new Map<string, E>();
	const sorted = events
		.map((e, i) => ({ e, i }))
		.sort((a, b) => a.e.ts.localeCompare(b.e.ts) || a.i - b.i)
		.map((x) => x.e);
	for (const e of sorted) m.set(e.country, e);
	return m;
}

/** A country leg of the trip config, after normalizeConfigRoutes. */
export interface RouteLeg {
	readonly id?: string | undefined;
	readonly from?: unknown;
	readonly to?: unknown;
	readonly route?: readonly RouteStop[] | undefined;
}

/** An area file, as far as the route reads it. */
export interface RouteArea {
	readonly id: string;
	readonly country: string;
	readonly name?: string | undefined;
	readonly lat?: unknown;
	readonly lng?: unknown;
}

export interface CurrentStop {
	area: string;
	name: string;
	lat: number | null;
	lng: number | null;
	nights: number | null;
	/** There is an area file for it. */
	hasPage: boolean;
	/** It has coordinates (from the area file, the event or the config seed). */
	located: boolean;
}

export interface CurrentLeg {
	id: string;
	name: string;
	flag: string;
	/** 1-based position in the trip. */
	n: number;
	from: string;
	to: string;
	nights: number;
	source: 'game' | 'config' | 'none';
	ts: string | null;
	stops: CurrentStop[];
	planned: number;
	unset: number;
	status: 'empty' | 'under' | 'ok' | 'over';
}

const num = (v: unknown): number | undefined => (typeof v === 'number' ? v : undefined);

/** The current route per country leg, in trip order (latest event, else the config seed). */
export function currentRoute({
	cfg,
	areas = [],
	events = [],
}: {
	readonly cfg?:
		{ readonly countries?: readonly (RouteLeg | null | undefined)[] } | null | undefined;
	readonly areas?: readonly RouteArea[];
	readonly events?: readonly RouteEvent[];
} = {}): CurrentLeg[] {
	const latest = latestRoutes(events);
	const areaOf = new Map(areas.map((a) => [`${a.country}/${a.id}`, a]));
	const legs = (cfg?.countries ?? []).filter(
		(c): c is RouteLeg & { id: string } => !!c && c.id !== undefined && c.id !== '',
	);
	return legs.map((c, i): CurrentLeg => {
		const ev = latest.get(c.id);
		const seed = c.route ?? [];
		const raw = ev ? ev.stops : seed;
		// A config-only stop (no area file) keeps its name and coordinates even when the game saved it without them.
		const seedOf = new Map(seed.map((s) => [s.area, s]));
		const stops = raw.map((s): CurrentStop => {
			const a = areaOf.get(`${c.id}/${s.area}`);
			const sd = seedOf.get(s.area);
			const lat = num(a?.lat) ?? s.lat ?? sd?.lat;
			const lng = num(a?.lng) ?? s.lng ?? sd?.lng;
			return {
				area: s.area,
				name: orStr(a?.name, orStr(s.name, orStr(sd?.name, titleCase(s.area)))),
				lat: lat ?? null,
				lng: lng ?? null,
				nights: typeof s.nights === 'number' && Number.isInteger(s.nights) ? s.nights : null,
				hasPage: !!a,
				located: typeof lat === 'number' && typeof lng === 'number',
			};
		});
		const nights = nightsBetween(c.from, c.to);
		const planned = stops.reduce((n, s) => n + (s.nights ?? 0), 0);
		const country = lookup(COUNTRIES, c.id);
		return {
			id: c.id,
			name: country?.name ?? titleCase(c.id),
			flag: country?.flag ?? '',
			n: i + 1,
			from: iso(c.from),
			to: iso(c.to),
			nights,
			source: ev ? 'game' : seed.length ? 'config' : 'none',
			ts: ev ? orStr(ev.ts, null) : null,
			stops,
			planned,
			unset: stops.filter((s) => !(s.nights ?? 0)).length,
			status: !planned ? 'empty' : planned > nights ? 'over' : planned < nights ? 'under' : 'ok',
		};
	});
}

const fmtDay = (d: string): string =>
	new Date(`${d}T00:00:00Z`).toLocaleDateString('en-GB', {
		day: 'numeric',
		month: 'short',
		timeZone: 'UTC',
	});

export interface Colors {
	readonly dim: (s: string) => string;
	readonly bold: (s: string) => string;
	readonly yellow: (s: string) => string;
}
const PLAIN: Colors = { dim: (s) => s, bold: (s) => s, yellow: (s) => s };

const slug = (n: string): string =>
	n
		.toLowerCase()
		.normalize('NFD')
		.replace(/[̀-ͯ]/g, '')
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-|-$/g, '');
const plural = (n: number, word: string): string => `${String(n)} ${word}${n === 1 ? '' : 's'}`;

/** Plain-text route for `./atr feedback`: two lines per country. */
export function formatRoute(route: readonly CurrentLeg[], c: Colors = PLAIN): string {
	const lines: string[] = [];
	for (const r of route) {
		const stops = r.stops.length
			? r.stops
					.map(
						(s) =>
							`${s.name}${s.area !== slug(s.name) ? c.dim(` (${s.area})`) : ''} ${(s.nights ?? 0) ? `${String(s.nights)}n` : c.dim('?n')}`,
					)
					.join(' → ')
			: c.dim('no stops yet');
		const bal =
			r.status === 'over'
				? c.yellow(`${plural(r.planned - r.nights, 'night')} over`)
				: r.status === 'ok'
					? 'all nights placed'
					: r.planned
						? `${String(r.planned)} of ${String(r.nights)} nights placed`
						: 'no nights set yet';
		const source =
			r.source === 'game'
				? `edited in the game ${String(r.ts).slice(0, 16).replace('T', ' ')}`
				: r.source === 'config'
					? 'from config/trip.yaml (not edited in the game yet)'
					: 'nothing planned';
		lines.push(
			`  ${c.bold(`${String(r.n)}. ${r.name}`)} ${c.dim(`${fmtDay(r.from)} – ${fmtDay(r.to)}, ${String(r.nights)} nights`)}: ${stops}`,
		);
		lines.push(
			c.dim(
				`     ${bal}${r.unset && r.stops.length ? ` · ${plural(r.unset, 'stop')} without nights` : ''} · ${source}`,
			),
		);
	}
	return lines.join('\n');
}
