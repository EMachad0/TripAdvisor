// The content model every screen reads (FROZEN: slices code against these types; change them only through the
// integrator). Built on the server by #lib/server/content.ts from places/, areas/, answers/ and config/ (the
// content half of the old GET /api/state, plus GET /api/answers), handed to screens by the (app) layout load and
// kept live by #lib/content/app-data.svelte.ts. Plain data, safe to import in the browser.
import type { HolidayFacts, ImageSet } from '@atr/shared/content';
import type { RouteModel, RouteModelCountry } from '@atr/shared/routemodel';

export type { HolidayFacts, ImageSet } from '@atr/shared/content';
export type { RouteModel, RouteModelLeg, RouteCity, RouteModelStop } from '@atr/shared/routemodel';

export type BookingLevel = 'required' | 'recommended' | 'none';

export interface BookingLink {
	label: string;
	url: string;
	note?: string;
}

/** A dated range (platform when.js eventDays): ISO days; `open` = no end date announced. */
export interface DayRange {
	from: string;
	to: string;
	open?: true;
}

/** A chip on a card (platform flagChips, as data). */
export interface CardFlag {
	kind: 'when' | 'must' | 'fame';
	label: string;
	/** Tooltip text. */
	title: string;
	/** when: only | season | best. */
	whenKind?: 'only' | 'season' | 'best';
	/** when: the dates are not confirmed yet (the old "?" mark). */
	unconfirmed?: true;
	/** fame: iconic | hidden. */
	fame?: string;
}

/** What the old place card HTML showed beyond the GET /api/state fields. */
export interface PlaceCardData {
	categoryLabel: string;
	categoryIcon: string;
	/** A bed (category stay): the price is per night. */
	stay: boolean;
	cover: ImageSet | null;
	/** BCP 47 language of name_local (zh-Hans, ja, ...). */
	lang: string;
	/** The price in local currency ("¥120"), '' when unknown. */
	costLocal: string;
	timeNeeded: string | null;
	flags: CardFlag[];
}

/** One place (GET /api/state `places[]` without the feedback fields and card HTML). */
export interface ContentPlace {
	id: string;
	name: string;
	short: string | null;
	name_local: string | null;
	country: string;
	city: string;
	cityName: string;
	area?: string;
	category: string;
	kind?: string;
	tags: string[];
	why?: string;
	loc: { lat: number; lng: number } | null;
	brl: number;
	costLabel: string;
	budgeted: boolean;
	booking: {
		level: BookingLevel;
		lead_days?: number;
		/** A fixed "book by" day (an early price that ends, a lottery that closes), YYYY-MM-DD. */
		deadline?: string;
		/** The curator's one-line booking hint ("¥425 early-bird price ends Fri 27 Nov"). */
		lead_time?: string;
		badge: string | null;
		links: BookingLink[];
	};
	/** Has a drone show. */
	drone: boolean;
	/** Holiday ids (christmas, nye, lny) this place is tagged for. */
	holidays: string[];
	/** The days it really happens (eventDays). */
	days: DayRange[];
	whenLabel: string | null;
	/** Not swiped and first seen after the first run (live in app-data). */
	isNew: boolean;
	thumb: string | null;
	facts: HolidayFacts;
	/** UTC offset (hours) of the country, for TzText; null when unknown. */
	tz: number | null;
	card: PlaceCardData;
}

/** One area or city card (GET /api/state `areas[]` without the feedback fields, plus the card's data). */
export interface ContentArea {
	id: string;
	name: string;
	country: string;
	cities: string[];
	best_for: string[];
	isNew: boolean;
	name_local: string | null;
	region: string | null;
	scope: string;
	lat: number | null;
	lng: number | null;
	why: string | null;
	highlights: string[];
	/** "2–3 days". */
	daysLabel: string;
	/** "$$ · average". */
	costLabel: string;
	/** Inline markdown, rendered to escaped HTML. */
	winterHtml: string;
	image: ImageSet | null;
	/** Country flag emoji. */
	flag: string;
	flags: CardFlag[];
	tz: number | null;
}

export interface ContentCountry {
	id: string;
	name: string;
	flag: string;
	days?: number;
	budget_brl_per_day?: number;
	from: string;
	to: string;
	cities: string[];
}

/** One answer card (answers/*.md), newest first (GET /api/answers). */
export interface Answer {
	id: string;
	question: string;
	asked: string;
	updated: string | null;
	tldr: string;
	about: { kind: 'place' | 'area' | 'country' | 'trip'; id: string; name: string };
	country: string | null;
	sources: { title: string; url: string }[];
	/** The tldr as escaped inline HTML (platform mdInline). */
	tldrHtml: string;
	/** The full answer as escaped HTML (platform md); '' when there is none. */
	bodyHtml: string;
	/** UTC offset of the country the answer is about, for its clock times; null when unknown. */
	tz: number | null;
}

/** How a hub is reached: a plane, a train, a coach or a boat. */
export type HubKind = 'airport' | 'station' | 'bus' | 'ferry';

/** An airport or station of a city (config/hubs.yaml), drawn on the city map. Added by the city-map change. */
export interface Hub {
	/** Lowercase slug, unique; an airport's IATA code in lowercase. */
	id: string;
	kind: HubKind;
	/** IATA for airports (upper case); matches a flight's from / to. null when none. */
	code: string | null;
	name: string;
	name_local: string | null;
	/** Country id as in places/<country>/. */
	country: string;
	/** City id as in places/<country>/<city>/. */
	city: string;
	lat: number;
	lng: number;
	/** One line a traveler needs, or null. */
	note: string | null;
}

/** What the Route tab model needs from the config besides route.current (see routeModel in @atr/shared). */
export interface RouteBase {
	countries: RouteModelCountry[];
	home: string;
	warnings: string[];
}

/** Everything the content half of the old GET /api/state and GET /api/answers gave the client. */
export interface ContentPayload {
	/** Changes whenever a content file changes (the version poll and the new-cards toast key off it). */
	version: string;
	/** The site runs on test content. */
	fixtures: boolean;
	countries: ContentCountry[];
	categories: Record<string, { label: string; icon: string }>;
	interests: string[];
	dominantShare: number;
	places: ContentPlace[];
	areas: ContentArea[];
	answers: Answer[];
	routeBase: RouteBase;
	/** Airports and stations (config/hubs.yaml); [] when the file is missing or empty. */
	hubs: Hub[];
}

/** The (app) layout's route model: the old GET /api/route body, from route.current (or the seeds). */
export type LayoutRouteModel = RouteModel;
