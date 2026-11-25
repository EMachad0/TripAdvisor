// Git content for the app (plan section 2): places/, areas/, answers/ and config/ read through @atr/platform from
// the content root (ATR_ROOT, the repo by default), turned into the typed content model (#lib/content/types.ts) and
// the content index Convex validates ids against. Cached per process; the cache is checked against a fingerprint of
// the content files at most every `recheckMs`, so a curator's new card shows up without a restart (the old server
// re-read everything on every request).
//
// Node only. Imports are relative with .ts extensions (no #lib, no $app) so scripts can run this file with plain
// `node` (apps/web/scripts/content-index.ts, used by the e2e seed).
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import * as platform from './platform.js';
import type { AreaFile, PlaceFile, SiteAnswer, TripConfig } from './platform.js';
import { HOLIDAYS, picksMany } from '@atr/shared/board';
import {
	areaMediaUrl,
	coverOf,
	holidayFacts,
	imageSet,
	mediaUrl,
	thumbUrl,
} from '@atr/shared/content';
import { COUNTRY_IDS } from '@atr/shared/schema/enums';
import { TZ_OFFSET } from '@atr/shared/trip';
import type { Infer } from 'convex/values';
import type { contentIndex } from '../../convex/tables/app.ts';
import type {
	Answer,
	CardFlag,
	ContentArea,
	ContentCountry,
	ContentPayload,
	ContentPlace,
	RouteBase,
} from '../content/types.ts';

/** The body of POST /ops/content-index (the contentIndex table document). */
export type ContentIndexBody = Infer<typeof contentIndex.validator>;
type IndexCountry = ContentIndexBody['places'][number]['country'];

export interface ContentSource {
	/** The content root: places/, areas/, answers/, config/trip.yaml. */
	root: string;
	/** Keep `fixture: true` files (test content roots only; real content has none). */
	includeFixtures: boolean;
}

export interface LoadedContent {
	/** Fingerprint of the content files (changes whenever one changes). */
	version: string;
	/** The content model (isNew false everywhere: the layout derives it from feedback). */
	payload: ContentPayload;
	/** What POST /ops/content-index publishes; `sha` is a hash of the rest, so an unchanged index is a no-op. */
	index: ContentIndexBody;
}

/** The content root and fixture switch from the environment (ATR_ROOT, ATR_CONTENT_FIXTURES=1). */
export function sourceFromEnv(env: NodeJS.ProcessEnv = process.env): ContentSource {
	return { root: platform.ROOT, includeFixtures: env['ATR_CONTENT_FIXTURES'] === '1' };
}

const CONTENT_DIRS = ['places', 'areas', 'answers', 'config'] as const;
const CONTENT_FILE = /\.(ya?ml|md|json)$/;

function walk(dir: string, out: string[]): void {
	let entries: fs.Dirent[];
	try {
		entries = fs.readdirSync(dir, { withFileTypes: true });
	} catch {
		return;
	}
	for (const e of entries) {
		if (e.name.startsWith('.') || e.name === 'node_modules') continue;
		const p = path.join(dir, e.name);
		if (e.isDirectory() || (e.isSymbolicLink() && isDir(p))) walk(p, out);
		else if (CONTENT_FILE.test(e.name)) out.push(p);
	}
}

function isDir(p: string): boolean {
	try {
		return fs.statSync(p).isDirectory();
	} catch {
		return false;
	}
}

/** A fingerprint of every content file (path, size, mtime): cheap to recompute, changes on any edit. */
export function contentFingerprint(source: ContentSource): string {
	const files: string[] = [];
	for (const d of CONTENT_DIRS) walk(path.join(source.root, d), files);
	files.sort();
	const h = crypto.createHash('sha256');
	h.update(source.includeFixtures ? 'fx\n' : 'real\n');
	for (const f of files) {
		try {
			const st = fs.statSync(f);
			h.update(`${path.relative(source.root, f)}\t${String(st.size)}\t${String(st.mtimeMs)}\n`);
		} catch {
			// a file removed mid-walk changes the fingerprint on the next check anyway
		}
	}
	return h.digest('hex').slice(0, 16);
}

/** The YYYY-MM-DD part of a config date (the old String(c.from).slice(0, 10)). */
const day = (v: unknown): string => (typeof v === 'string' ? v.slice(0, 10) : '');
const num = (v: unknown): number | null => (typeof v === 'number' ? v : null);
const str = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null);
const strs = (v: unknown): string[] =>
	Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
const tzOf = (country: string): number | null => TZ_OFFSET[country] ?? null;

/** The card chips platform flagChips draws (without the trip-window chip, as on the old game cards). */
function cardFlags(item: {
	when?: unknown;
	must_do?: unknown;
	fame?: unknown;
	category?: unknown;
	kind?: unknown;
}): CardFlag[] {
	const out: CardFlag[] = [];
	const when = platform.whenLabel(item);
	if (when !== null) {
		const w = item.when as { confirmed?: unknown } | undefined;
		out.push({
			kind: 'when',
			label: when,
			title: platform.whenTitle(item),
			whenKind: platform.whenKind(item),
			...(w?.confirmed === false ? { unconfirmed: true as const } : {}),
		});
	}
	if (item.must_do === true) {
		out.push({ kind: 'must', label: platform.MUST_DO_CHIP, title: 'You asked for this by name' });
	}
	const fame = typeof item.fame === 'string' ? item.fame : '';
	const fameLabel = Object.hasOwn(platform.FAME_CHIP, fame) ? platform.FAME_CHIP[fame] : undefined;
	if (fameLabel !== undefined && !platform.isStay(item)) {
		out.push({
			kind: 'fame',
			label: fameLabel,
			title: fame === 'hidden' ? 'Most foreign visitors never hear of it' : 'On every top-10 list',
			fame,
		});
	}
	return out;
}

const HOLIDAY_IDS = Object.keys(HOLIDAYS) as (keyof typeof HOLIDAYS)[];

function placeModel(p: PlaceFile): ContentPlace {
	const credits = p._meta.credits;
	const tags = strs(p.tags);
	const lat = p.location?.lat;
	const lng = p.location?.lng;
	const cost = p.cost ?? {};
	const leadDays = p.book_ahead?.lead_days;
	// YAML reads an unquoted 2026-11-27 as a Date
	const rawDeadline: unknown = p.book_ahead?.deadline;
	const deadline =
		rawDeadline instanceof Date
			? rawDeadline.toISOString().slice(0, 10)
			: typeof rawDeadline === 'string' && rawDeadline !== ''
				? rawDeadline
				: undefined;
	const leadTime = str(p.book_ahead?.lead_time) ?? undefined;
	return {
		id: p.id,
		name: p.name,
		short: str(p.short_name),
		name_local: str(p.name_local),
		country: p.country,
		city: p.city,
		cityName: platform.titleCase(p.city),
		...(p.area === undefined ? {} : { area: p.area }),
		category: p.category,
		...(p.kind === undefined ? {} : { kind: p.kind }),
		tags,
		...(p.why === undefined ? {} : { why: p.why }),
		loc: typeof lat === 'number' && typeof lng === 'number' ? { lat, lng } : null,
		brl: cost.brl ?? 0,
		costLabel: platform.fmtBRL(cost.brl),
		budgeted: platform.countsAgainstBudget(p),
		booking: {
			level: platform.bookingLevel(p),
			...(leadDays === undefined ? {} : { lead_days: leadDays }),
			...(deadline === undefined ? {} : { deadline }),
			...(leadTime === undefined ? {} : { lead_time: leadTime }),
			badge: platform.bookBadgeText(p.book_ahead),
			links: platform.bookingLinks(p),
		},
		drone: tags.includes('drone-show'),
		holidays: HOLIDAY_IDS.filter((h) => tags.includes(HOLIDAYS[h].tag)),
		days: platform.eventDays(p),
		whenLabel: platform.whenLabel(p),
		isNew: false,
		thumb: thumbUrl(p, credits),
		facts: holidayFacts(p),
		tz: tzOf(p.country),
		card: {
			categoryLabel: platform.catLabel(p.category),
			categoryIcon: platform.CATEGORIES[p.category]?.icon ?? '',
			stay: platform.isStay(p),
			cover: imageSet(coverOf(p), credits, (f, w) => mediaUrl(p.id, f, w), ''),
			lang: platform.LANG[p.country] ?? 'und',
			costLocal: platform.fmtLocal(cost.local, cost.currency),
			timeNeeded: str(p.time_needed),
			flags: cardFlags(p),
		},
	};
}

const AREA_COST: Readonly<Record<string, string>> = {
	low: '$ · cheap',
	medium: '$$ · average',
	high: '$$$ · pricey',
};

function areaModel(a: AreaFile): ContentArea {
	const d = a.days_suggested ?? {};
	const days =
		d.min === d.max
			? `${String(d.min)} day${d.min === 1 ? '' : 's'}`
			: `${String(d.min)}–${String(d.max)} days`;
	const cost = a.cost_level === undefined ? '' : (AREA_COST[a.cost_level] ?? a.cost_level);
	return {
		id: a.id,
		name: a.name,
		country: a.country,
		cities: strs(a.cities),
		best_for: strs(a.best_for),
		isNew: false,
		name_local: str(a.name_local),
		region: str(a.region),
		scope: str(a.scope) ?? 'city',
		lat: num(a.lat),
		lng: num(a.lng),
		why: str(a.why),
		highlights: strs(a.highlights),
		daysLabel: days,
		costLabel: cost,
		winterHtml: platform.mdInline(a.winter_note),
		image: imageSet(
			str(a.image) ?? undefined,
			a._meta.credits,
			(f, w) => areaMediaUrl(a.country, f, w),
			a.name,
		),
		flag: platform.COUNTRIES[a.country]?.flag ?? '',
		flags: cardFlags({ must_do: a.must_do, when: a.when, fame: a.fame }),
		tz: tzOf(a.country),
	};
}

function countryModel(c: NonNullable<TripConfig['countries']>[number]): ContentCountry {
	return {
		id: c.id,
		name: platform.COUNTRIES[c.id]?.name ?? platform.titleCase(c.id),
		flag: platform.COUNTRIES[c.id]?.flag ?? '',
		...(c.days === undefined ? {} : { days: c.days }),
		...(c.budget_brl_per_day === undefined ? {} : { budget_brl_per_day: c.budget_brl_per_day }),
		from: day(c.from),
		to: day(c.to),
		cities: c.cities ?? [],
	};
}

function answerModel(a: SiteAnswer): Answer {
	const country = a.target.country;
	return {
		id: a.id,
		question: a.question,
		asked: a.asked,
		updated: a.updated,
		tldr: a.tldr,
		about: { kind: a.target.kind, id: a.target.id, name: a.target.name },
		country,
		sources: a.sources,
		tldrHtml: platform.mdInline(a.tldr),
		bodyHtml: a.body.trim() === '' ? '' : platform.md(a.body),
		tz: country === null ? null : tzOf(country),
	};
}

const isIndexCountry = (c: string): c is IndexCountry =>
	(COUNTRY_IDS as readonly string[]).includes(c);

/** The content index Convex validates writes against (ids, countries, legs with their route seeds, holidays). */
export function buildContentIndex(
	places: readonly PlaceFile[],
	areas: readonly AreaFile[],
	cfg: TripConfig,
): ContentIndexBody {
	const body: Omit<ContentIndexBody, 'sha'> = {
		places: places
			.filter((p) => isIndexCountry(p.country))
			.map((p) => ({ id: p.id, country: p.country as IndexCountry, city: p.city })),
		areas: areas
			.filter((a) => isIndexCountry(a.country))
			.map((a) => ({
				id: a.id,
				country: a.country as IndexCountry,
				name: a.name,
				...(typeof a.lat === 'number' ? { lat: a.lat } : {}),
				...(typeof a.lng === 'number' ? { lng: a.lng } : {}),
			})),
		legs: (cfg.countries ?? [])
			.filter((c) => isIndexCountry(c.id))
			.map((c) => ({
				country: c.id as IndexCountry,
				from: day(c.from),
				to: day(c.to),
				routeSeed: (c.route ?? []).map((s) => ({
					area: s.area,
					...(s.nights === undefined ? {} : { nights: s.nights }),
					...(s.name === undefined ? {} : { name: s.name }),
					...(s.lat === undefined ? {} : { lat: s.lat }),
					...(s.lng === undefined ? {} : { lng: s.lng }),
				})),
			})),
		holidays: HOLIDAY_IDS.map((id) => ({ id, pickMany: picksMany(id) })),
	};
	const sha = crypto.createHash('sha256').update(JSON.stringify(body)).digest('hex').slice(0, 40);
	return { sha, ...body };
}

/** Read every content file and build the model and the index (no cache). */
export function readContent(
	source: ContentSource,
	version = contentFingerprint(source),
): LoadedContent {
	const opts = {
		root: source.root,
		includeFixtures: source.includeFixtures,
		configFile: path.join(source.root, 'config', 'trip.yaml'),
	};
	const places = platform.loadPlaces(opts).filter((p) => p.id && p.name && p.country);
	const areas = platform.loadAreas(opts).filter((a) => a.id && a.name && a.country);
	const cfg: TripConfig = platform.loadTripConfig(opts) ?? { countries: [] };
	const answers = platform.siteAnswers({ ...opts, places, areas });
	const countries = cfg.countries ?? [];
	const routeBase: RouteBase = {
		countries: countries.map((c) => ({
			id: c.id,
			notes: c.notes ?? '',
			route: (c.route ?? []).map((s) => ({ ...s })),
		})),
		home: cfg.traveler?.home ?? '',
		warnings: [...(cfg.warnings ?? [])],
	};
	const payload: ContentPayload = {
		version,
		fixtures: source.includeFixtures,
		countries: countries.map(countryModel),
		categories: Object.fromEntries(
			Object.entries(platform.CATEGORIES).map(([k, v]) => [k, { label: v.label, icon: v.icon }]),
		),
		interests: (cfg.traveler?.interests ?? []).filter((c) => Object.hasOwn(platform.CATEGORIES, c)),
		dominantShare: cfg.gaps?.dominant_category_share ?? 0.4,
		places: places.map(placeModel),
		areas: areas.map(areaModel),
		answers: answers.map(answerModel),
		routeBase,
	};
	return { version, payload, index: buildContentIndex(places, areas, cfg) };
}

type Listener = (content: LoadedContent) => void;

/** A per-process content cache: re-reads only when the fingerprint changes, checked at most every recheckMs. */
export class ContentCache {
	private current: LoadedContent | null = null;
	private checkedAt = 0;
	private readonly listeners = new Set<Listener>();
	private readonly source: ContentSource;
	private readonly recheckMs: number;
	private readonly now: () => number;

	constructor(source: ContentSource, recheckMs = 10_000, now: () => number = Date.now) {
		this.source = source;
		this.recheckMs = recheckMs;
		this.now = now;
	}

	/** The content, re-read when a file changed since the last check. */
	get(): LoadedContent {
		const t = this.now();
		if (this.current !== null && t - this.checkedAt < this.recheckMs) return this.current;
		this.checkedAt = t;
		const version = contentFingerprint(this.source);
		if (this.current?.version === version) return this.current;
		const changed = this.current !== null;
		this.current = readContent(this.source, version);
		if (changed) for (const l of this.listeners) l(this.current);
		return this.current;
	}

	/** Called after the content changed (not for the first read). Returns an unsubscribe function. */
	onChange(listener: Listener): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}
}

let shared: ContentCache | null = null;

/** The process-wide cache over the environment's content root. */
export function contentCache(): ContentCache {
	if (shared === null) {
		const raw = Number(process.env['ATR_CONTENT_RECHECK_MS'] ?? '10000');
		shared = new ContentCache(sourceFromEnv(), Number.isFinite(raw) && raw >= 0 ? raw : 10_000);
	}
	return shared;
}

/** The current content (cached). */
export function getContent(): LoadedContent {
	return contentCache().get();
}
