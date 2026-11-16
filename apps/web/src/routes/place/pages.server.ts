// The place and area full pages (plan section 5): the platform's own HTML (renderPlacePage / renderAreaPage, styled
// by /assets/atr.css), with the old server's chrome added (game/server.js placePage, areaPage, gameChrome): the
// "Back to the game" link, the "Questions and answers" cards marked with their country's UTC offset, and the embed
// glue (/embed/place.css, /embed/place.js, data-embed="1" for ?embed=1, the page inside PlaceSheet's iframe).
// Shared by routes/place/[id] and routes/area/[id].
import {
	contentFiles,
	embeddedMap,
	type ContentFiles,
	type EmbeddedMap,
} from '#lib/server/maps.js';
import * as platform from '#lib/server/platform.js';
import type {
	AnswerTarget,
	AreaFile,
	DataOptions,
	PlaceFile,
	SiteAnswer,
	TripConfig,
} from '#lib/server/platform.js';
import { TZ_OFFSET } from '@atr/shared/trip';

type MediaUrl = (name: string, width: number) => string;
type PlaceUrl = (o: PlaceFile) => string;
type PlaceMediaUrl = (o: PlaceFile, name: string, width: number) => string;

/** The platform renderers these pages use (platform.d.ts declares only what the content layer needs). */
interface RenderApi {
	renderPlacePage(
		p: PlaceFile,
		opts: {
			assetBase: string;
			mediaUrl: MediaUrl;
			homeUrl: string;
			places: Record<string, PlaceFile>;
			placeUrl: PlaceUrl;
			placeMediaUrl: PlaceMediaUrl;
			budgetPerDay: number | undefined;
			cheapMealBrl: number | undefined;
			staticMap: EmbeddedMap | null;
		},
	): string;
	renderAreaPage(
		a: AreaFile,
		opts: {
			assetBase: string;
			homeUrl: string;
			mediaUrl: MediaUrl;
			places: PlaceFile[];
			mustDo: unknown[];
			staticMap: EmbeddedMap | null;
			trip: TripConfig;
			placeUrl: PlaceUrl;
			placeMediaUrl: PlaceMediaUrl;
		},
	): string;
	renderAnswerCard(
		a: SiteAnswer,
		opts: { showAbout?: boolean; hrefOf?: (t: AnswerTarget) => string },
	): string;
	renderAnswersSection(
		answers: SiteAnswer[],
		item: { name: string; short_name?: string },
		opts: { card: (a: SiteAnswer) => string },
	): string;
	loadTaste(opts: DataOptions): unknown;
	mustDoStatus(taste: unknown, places: PlaceFile[], areas: AreaFile[]): unknown[];
}
const render = platform as typeof platform & RenderApi;

export type Kind = 'place' | 'area';

/** What a page is built from: the content files and the map lookup (tests pass their own). */
export interface PageDeps {
	files: ContentFiles;
	map: (kind: Kind, id: string) => Promise<EmbeddedMap | null>;
}

const liveDeps = (): PageDeps => ({ files: contentFiles(), map: embeddedMap });

const enc = encodeURIComponent;
const mediaUrlOf =
	(o: PlaceFile): MediaUrl =>
	(n, w) =>
		`/media/${enc(o.id)}/${enc(n)}-${String(w)}.webp`;
const placeMediaUrl: PlaceMediaUrl = (o, n, w) => mediaUrlOf(o)(n, w);
const placeUrlOf =
	(embed: boolean): PlaceUrl =>
	(o) =>
		`/place/${enc(o.id)}${embed ? '?embed=1' : ''}`;

/** Marks a card's root element with its country's UTC offset, so place.js labels the times in its text. */
export function withTz(html: string, country: string | null | undefined): string {
	const off = country === null || country === undefined ? undefined : TZ_OFFSET[country];
	return off === undefined
		? html
		: html.replace(/^(\s*<[a-z][\w-]*)/i, (m) => `${m} data-tz="${String(off)}"`);
}

const answerHref = (t: AnswerTarget): string => `/${t.kind}/${enc(t.id)}`;

/**
 * The old gameChrome: the back link label, the answers about this item, the embed stylesheet and script, and
 * data-embed="1" when the page sits in the sheet.
 */
export function gameChrome(
	html: string,
	item: { id: string; name: string; short_name?: string },
	kind: Kind,
	embed: boolean,
	answers: readonly SiteAnswer[],
): string {
	const mine = answers.filter((a) => a.target.kind === kind && a.target.id === item.id);
	const qa = render.renderAnswersSection(mine, item, {
		card: (a) =>
			withTz(
				render.renderAnswerCard(a, { hrefOf: answerHref, showAbout: false }),
				a.target.country,
			),
	});
	let out = html.replace(
		/<span class="lbl">All (places|areas)<\/span>/,
		'<span class="lbl">Back to the game</span>',
	);
	out = out.includes('<p class="site-foot">')
		? out.replace('<p class="site-foot">', () => `${qa}\n<p class="site-foot">`)
		: out.replace('</main>', () => `${qa}</main>`);
	out = out.replace('</head>', '<link rel="stylesheet" href="/embed/place.css">\n</head>');
	out = out.replace('</body>', '<script type="module" src="/embed/place.js"></script></body>');
	if (embed) out = out.replace('<html lang="en"', '<html lang="en" data-embed="1"');
	return out;
}

/** The full page of a place, or null when no place has this id. */
export async function placePageHtml(
	id: string,
	embed: boolean,
	deps: PageDeps = liveDeps(),
): Promise<string | null> {
	const { files } = deps;
	const p = files.byId.get(id);
	if (p === undefined) return null;
	const cfgC = files.cfg.countries?.find((c) => c.id === p.country);
	const staticMap = await deps.map('place', p.id);
	const html = render.renderPlacePage(p, {
		assetBase: '/assets/',
		mediaUrl: mediaUrlOf(p),
		homeUrl: '/',
		places: Object.fromEntries(files.places.map((x) => [x.id, x])),
		placeUrl: placeUrlOf(embed),
		placeMediaUrl,
		budgetPerDay: cfgC?.budget_brl_per_day,
		cheapMealBrl: cfgC?.cheap_meal_brl,
		staticMap,
	});
	return gameChrome(html, p, 'place', embed, files.answers);
}

/** Where an area page's back link goes when the page is opened on its own: the area deck (old: /#/areas). */
export const AREA_HOME = '/decide/areas';

/** The curator's full page for a city or region, or null when no area has this id. */
export async function areaPageHtml(
	id: string,
	embed: boolean,
	deps: PageDeps = liveDeps(),
): Promise<string | null> {
	const { files } = deps;
	const a = files.areas.find((x) => x.id === id);
	if (a === undefined) return null;
	const staticMap = await deps.map('area', a.id);
	let mustDo: unknown[] = [];
	try {
		mustDo = render.mustDoStatus(render.loadTaste(files.opts), files.places, files.areas);
	} catch {
		// a malformed taste file only hides "On your list here", as on the old server
	}
	const html = render.renderAreaPage(a, {
		assetBase: '/assets/',
		homeUrl: AREA_HOME,
		mediaUrl: (n, w) => `/area-media/${enc(a.country)}/${enc(n)}-${String(w)}.webp`,
		places: files.places,
		mustDo,
		staticMap,
		trip: files.cfg,
		placeUrl: placeUrlOf(embed),
		placeMediaUrl,
	});
	return gameChrome(html, a, 'area', embed, files.answers);
}

/** The old 404 page for a place or area that does not exist (any more). */
export function notFoundHtml(kind: Kind): string {
	return `<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="/assets/atr.css"><body><main class="wrap"><p class="empty">This ${kind} doesn't exist (any more). <a href="/">Back to the game</a></p></main>`;
}

const HTML_HEADERS = { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' };

/** The response of GET /place/:id or /area/:id (the old server sent both with Cache-Control: no-store). */
export function pageResponse(kind: Kind, html: string | null): Response {
	return html === null
		? new Response(notFoundHtml(kind), { status: 404, headers: HTML_HEADERS })
		: new Response(html, { status: 200, headers: HTML_HEADERS });
}
