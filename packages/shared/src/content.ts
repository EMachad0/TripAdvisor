// Content derivations the old server computed per place and area for GET /api/state (game/server.js thumbUrl,
// holidayFacts, the first-seen "New" rule) and the responsive image set of platform/lib/render/util.js img().
// Pure and runtime-neutral: the SvelteKit load runs them on loaded place files, the browser re-runs isNewCard
// on live feedback.
import { jsString, truthy } from './util.ts';

/** One entry of a place's media/credits.yaml, as far as these functions read it. */
export interface MediaCredit {
	readonly file?: unknown;
	readonly widths?: unknown;
	readonly width?: unknown;
	readonly height?: unknown;
	readonly description?: unknown;
	readonly title?: unknown;
}

/** The parts of a place file these functions read. Extra fields are allowed and ignored. */
export interface PlaceSource {
	readonly id: string;
	readonly cover?: unknown;
	readonly blocks?: unknown;
	readonly tags?: unknown;
	readonly hours?: unknown;
	readonly best_time?: unknown;
	readonly book_ahead?: unknown;
}

const obj = (v: unknown): Readonly<Record<string, unknown>> | undefined =>
	typeof v === 'object' && v !== null && !Array.isArray(v)
		? (v as Readonly<Record<string, unknown>>)
		: undefined;

const list = (v: unknown): readonly unknown[] => (Array.isArray(v) ? v : []);

const strings = (v: unknown): string[] => list(v).filter((x): x is string => typeof x === 'string');

/** A truthy string (the old `x || …` on a field that should be text). */
const text = (v: unknown): string | undefined =>
	typeof v === 'string' && v !== '' ? v : undefined;

function blockOf(p: PlaceSource, type: string): Readonly<Record<string, unknown>> | undefined {
	for (const b of list(p.blocks)) {
		const block = obj(b);
		if (block?.['type'] === type) return block;
	}
	return undefined;
}

/** The cover image name: `cover`, else the hero block's image. */
export function coverOf(p: PlaceSource): string | undefined {
	return text(p.cover) ?? text(blockOf(p, 'hero')?.['image']);
}

function widthsOf(c: MediaCredit | undefined): number[] {
	const ws = list(c?.widths).filter((w): w is number => typeof w === 'number');
	return (ws.length > 0 ? ws : [1280]).slice().sort((a, b) => a - b);
}

/** `/media/<id>/<file>-<w>.webp`, the old server's media URL. */
export const mediaUrl = (id: string, file: string, width: number): string =>
	`/media/${encodeURIComponent(id)}/${encodeURIComponent(file)}-${String(width)}.webp`;

/** `/area-media/<country>/<file>-<w>.webp`, the old server's area media URL. */
export const areaMediaUrl = (country: string, file: string, width: number): string =>
	`/area-media/${encodeURIComponent(country)}/${encodeURIComponent(file)}-${String(width)}.webp`;

/** The smallest rendition of the cover (game/server.js thumbUrl), or null without a cover. */
export function thumbUrl(p: PlaceSource, credits: readonly MediaCredit[]): string | null {
	const cover = coverOf(p);
	if (cover === undefined) return null;
	const c = credits.find((x) => x.file === cover);
	const [w = 1280] = widthsOf(c);
	return mediaUrl(p.id, cover, w);
}

export interface ImageSet {
	/** The rendition the old <img src> used (the first width ≥ 1280, else the largest). */
	src: string;
	srcset: { url: string; width: number }[];
	/** Intrinsic size of `src` when the credit has the original's dimensions. */
	width: number | null;
	height: number | null;
	alt: string;
}

/** The responsive image the old card rendered (platform/lib/render/util.js img), as data. */
export function imageSet(
	file: string | undefined,
	credits: readonly MediaCredit[],
	url: (file: string, width: number) => string,
	alt?: string,
): ImageSet | null {
	if (file === undefined || file === '') return null;
	const c = credits.find((x) => x.file === file);
	const widths = widthsOf(c);
	const pick = widths.find((w) => w >= 1280) ?? widths.at(-1) ?? 1280;
	const cw = typeof c?.width === 'number' ? c.width : null;
	const ch = typeof c?.height === 'number' ? c.height : null;
	const ratio = cw !== null && ch !== null && cw !== 0 ? ch / cw : null;
	const title =
		typeof c?.title === 'string'
			? c.title.replace(/^File:/, '').replace(/\.[a-z]+$/i, '')
			: undefined;
	const description = typeof c?.description === 'string' ? c.description : undefined;
	return {
		src: url(file, pick),
		srcset: widths.map((w) => ({ url: url(file, w), width: w })),
		width: ratio === null ? null : pick,
		height: ratio === null ? null : Math.round(pick * ratio),
		alt: (alt ?? description ?? title ?? '').slice(0, 200),
	};
}

const plain = (s: unknown): string =>
	(truthy(s) ? jsString(s) : '')
		.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
		.replace(/[*_`]/g, '')
		.replace(/\s+/g, ' ')
		.trim();

const clip = (s: string, n: number): string =>
	s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s;

const CROWD_RE =
	/[^.!?]*\b(crowd\w*|queue\w*|packed|busy|busiest|sell(?:s)? out|sold out|million)\b[^.!?]*[.!?]?/i;

export type ColdLevel = 'brutal' | 'freezing' | 'chilly' | 'mild';

/** Key facts for the holiday picker (game/server.js holidayFacts). */
export interface HolidayFacts {
	cold: string | null;
	coldLevel: ColdLevel | null;
	/** true, or absent (the old object had `outdoor: undefined`). */
	outdoor: true | undefined;
	crowd: string | null;
	winter: string | null;
	hours: string | null;
}

/** Crowd, cold and winter notes for the holiday picker. Same output as game/server.js holidayFacts. */
export function holidayFacts(p: PlaceSource): HolidayFacts {
	const weather = blockOf(p, 'weather');
	const tags = strings(p.tags);
	const hours = obj(p.hours);
	const winterRaw = hours?.['winter'];
	const lead = obj(p.book_ahead)?.['lead_time'];
	const all = [winterRaw, p.best_time, lead].map(plain).join(' . ');
	const crowdHit = CROWD_RE.exec(all)?.[0].trim();
	const low = weather?.['temp_low_c'];
	const high = weather?.['temp_high_c'];
	const lowN = typeof low === 'number' ? low : Number(low);
	const highN = typeof high === 'number' ? high : Number(high);
	let cold: string | null;
	let coldLevel: ColdLevel | null;
	if (weather) {
		cold = `${jsString(low)} to ${jsString(high)} °C · ${jsString(weather['conditions'])}`;
		coldLevel = lowN <= -10 ? 'brutal' : lowN <= 0 ? 'freezing' : highN <= 12 ? 'chilly' : 'mild';
	} else {
		cold = tags.includes('cold')
			? 'Cold, mostly outdoors'
			: tags.includes('indoor')
				? 'Indoors'
				: null;
		coldLevel = tags.includes('cold') ? 'freezing' : null;
	}
	const winter = truthy(winterRaw)
		? clip(
				plain(winterRaw)
					.replace(crowdHit !== undefined && crowdHit !== '' ? crowdHit : '\u0000', '')
					.replace(/\s+\.?\s*$/, '')
					.trim(),
				200,
			) || null
		: null;
	const summary = hours?.['summary'];
	return {
		cold,
		coldLevel,
		outdoor: tags.includes('outdoor') ? true : undefined,
		crowd:
			crowdHit !== undefined && crowdHit !== ''
				? clip(crowdHit.replace(/^[\s.]+/, ''), 140)
				: tags.includes('crowded')
					? 'Expect big crowds'
					: null,
		winter,
		hours: truthy(summary) ? jsString(summary) : null,
	};
}

/** firstSeen key of a card: the place id, or `area:<id>` (an area and a place may share an id). */
export const seenKey = (round: 'place' | 'area', id: string): string =>
	round === 'area' ? `area:${id}` : id;

/**
 * The "New" flag (game/lib/store.js trackSeen): not swiped yet, and first seen after the first run. A key with no
 * firstSeen row yet counts as seen `now` (the old server recorded it during the same request), so a card that
 * arrives before the owner's client calls feedback.trackSeen is already new. Nothing is new before the first run.
 */
export function isNewCard(
	key: string,
	swiped: boolean,
	firstSeen: Readonly<Record<string, string>>,
	firstRun: string | null,
	now: string,
): boolean {
	if (swiped || firstRun === null) return false;
	return (Object.hasOwn(firstSeen, key) ? (firstSeen[key] ?? now) : now) > firstRun;
}

/**
 * Every place where a timezone label belongs in rendered HTML: the text between tags gets `label` after each
 * time (tzSpots), tags and attributes are left alone. For platform-rendered markdown (answer bodies), whose text is
 * already escaped.
 */
export function tzHtml(
	html: string,
	label: string | null | undefined,
	spots: (text: string) => number[],
): string {
	if (label === undefined || label === null || label === '') return html;
	return html.replace(/(^|>)([^<]+)/g, (_m, open: string, chunk: string) => {
		let s = chunk;
		for (const at of spots(s).reverse()) s = `${s.slice(0, at)} ${label}${s.slice(at)}`;
		return `${open}${s}`;
	});
}
