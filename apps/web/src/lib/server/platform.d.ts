// Types for platform.js, the app's one door into @atr/platform (plain JS ESM, no .d.ts). Only what is used is
// declared; a new call adds its signature here. TypeScript reads this file instead of following platform.js into
// the platform's JS (which it would type-check under checkJs). Server only: the platform reads files.
/** Options every platform loader takes (platform/lib/paths.js dataRoots). */
export interface DataOptions {
	/** Another data root with places/, areas/, answers/ (and config/taste.yaml). */
	root?: string;
	/** Keep `fixture: true` files (only the fixture data root has them). */
	includeFixtures?: boolean;
	fixtures?: boolean;
	configFile?: string;
	answersDir?: string;
}

/** One media/credits.yaml entry. */
export interface Credit {
	file?: string;
	widths?: number[];
	width?: number;
	height?: number;
	title?: string;
	description?: string;
	author?: string;
	license?: string;
}

export interface FileMeta {
	file: string;
	dir: string;
	mediaDir: string;
	credits: Credit[];
}

export interface BookAhead {
	required?: boolean | 'recommended';
	lead_days?: number;
	lead_time?: string;
	deadline?: string;
	method?: string;
	passport?: boolean;
	link?: string;
	links?: { label: string; url: string; note?: string }[];
}

export interface WhenRange {
	from: string;
	to: string;
	open?: true;
}

/** A place.yaml as loaded (validated by the curator tools; the app reads it defensively). */
export interface PlaceFile {
	id: string;
	name: string;
	country: string;
	city: string;
	area?: string;
	short_name?: string;
	name_local?: string;
	category: string;
	kind?: string;
	tags?: string[];
	why?: string;
	location?: { lat?: unknown; lng?: unknown; address?: string };
	cost?: { brl?: number; local?: number; currency?: string };
	book_ahead?: BookAhead;
	time_needed?: string;
	cover?: string;
	blocks?: unknown[];
	hours?: unknown;
	best_time?: unknown;
	must_do?: boolean;
	fame?: string;
	when?: unknown;
	fixture?: boolean;
	_meta: FileMeta;
}

/** An areas/<country>/<id>.yaml as loaded. */
export interface AreaFile {
	id: string;
	name: string;
	country: string;
	name_local?: string;
	region?: string;
	scope?: string;
	cities?: string[];
	best_for?: string[];
	why?: string;
	highlights?: string[];
	days_suggested?: { min?: number; max?: number };
	cost_level?: string;
	winter_note?: string;
	image?: string;
	lat?: unknown;
	lng?: unknown;
	must_do?: boolean;
	fame?: string;
	when?: unknown;
	fixture?: boolean;
	_meta: FileMeta;
}

export interface RouteStopConfig {
	area: string;
	nights?: number;
	name?: string;
	lat?: number;
	lng?: number;
}

export interface TripConfigCountry {
	id: string;
	from?: unknown;
	to?: unknown;
	days?: number;
	budget_brl_per_day?: number;
	cheap_meal_brl?: number;
	cities?: string[];
	route?: RouteStopConfig[];
	notes?: string;
	stays?: boolean;
}

/** config/trip.yaml after loadTripConfig (routes normalised; `warnings` is non-enumerable). */
export interface TripConfig {
	traveler?: { home?: string; interests?: string[] };
	countries?: TripConfigCountry[];
	gaps?: { dominant_category_share?: number };
	warnings?: string[];
}

export interface AnswerTarget {
	kind: 'place' | 'area' | 'country' | 'trip';
	id: string;
	name: string;
	country: string | null;
	city?: string;
}

export interface SiteAnswer {
	id: string;
	slug: string;
	file: string;
	question: string;
	asked: string;
	about: string;
	tldr: string;
	sources: { title: string; url: string }[];
	body: string;
	updated: string | null;
	target: AnswerTarget;
}

export declare const ROOT: string;
export declare function loadPlaces(opts?: DataOptions): PlaceFile[];
export declare function loadAreas(opts?: DataOptions): AreaFile[];
export declare function loadTripConfig(opts?: DataOptions): TripConfig | null;
export declare function siteAnswers(
	opts?: DataOptions & { places?: readonly PlaceFile[]; areas?: readonly AreaFile[] },
): SiteAnswer[];

export declare function bookingLevel(p: unknown): 'required' | 'recommended' | 'none';
export declare function bookingLinks(p: unknown): { label: string; url: string; note?: string }[];
export declare function bookBadgeText(ba: unknown): string | null;
export declare function countsAgainstBudget(p: unknown): boolean;
export declare function isStay(p: unknown): boolean;
export declare function eventDays(item: unknown): WhenRange[];
export declare function whenLabel(item: unknown): string | null;
export declare function whenKind(item: unknown): 'only' | 'season' | 'best';
export declare function whenTitle(item: unknown): string;

export declare const COUNTRIES: Readonly<Record<string, { name: string; flag: string }>>;
export declare const CATEGORIES: Readonly<Record<string, { label: string; icon: string }>>;
export declare const LANG: Readonly<Record<string, string>>;
export declare const MUST_DO_CHIP: string;
export declare const FAME_CHIP: Readonly<Record<string, string>>;
export declare function fmtBRL(n: unknown): string;
export declare function fmtLocal(n: unknown, currency: unknown): string;
export declare function titleCase(slug: unknown): string;
export declare function catLabel(id: unknown): string;
/** Markdown to escaped HTML (block). */
export declare function md(text: unknown): string;
/** Markdown to escaped HTML (inline). */
export declare function mdInline(text: unknown): string;
