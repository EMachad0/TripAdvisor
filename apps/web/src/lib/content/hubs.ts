// config/hubs.yaml (airports and stations) as content: the parsed YAML in, well-formed hubs out. Pure, so the
// server's content build and the unit tests share it. Bad entries are dropped, never thrown on: a typo in one hub
// must not take the site's content down.
import type { Hub, HubKind } from './types.ts';

const KINDS: readonly HubKind[] = ['airport', 'station', 'bus', 'ferry'];
const SLUG = /^[a-z0-9][a-z0-9-]*$/;

const text = (v: unknown): string | null =>
	typeof v === 'string' && v.trim() !== '' ? v.trim() : null;
const coord = (v: unknown, max: number): number | null =>
	typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= max ? v : null;

/** One entry of `hubs:`, or null when it misses a field the map needs. */
export function parseHub(raw: unknown): Hub | null {
	if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
	const r = raw as Record<string, unknown>;
	const id = text(r['id'])?.toLowerCase() ?? null;
	const kind = KINDS.find((k) => k === r['kind']);
	const name = text(r['name']);
	const country = text(r['country']);
	const city = text(r['city']);
	const lat = coord(r['lat'], 90);
	const lng = coord(r['lng'], 180);
	if (id === null || !SLUG.test(id) || kind === undefined || name === null) return null;
	if (country === null || city === null || lat === null || lng === null) return null;
	return {
		id,
		kind,
		code: text(r['code'])?.toUpperCase() ?? null,
		name,
		name_local: text(r['name_local']),
		country,
		city,
		lat,
		lng,
		note: text(r['note']),
	};
}

/** Every well-formed hub of the file (the first of a repeated id wins); [] for a missing or empty file. */
export function parseHubs(raw: unknown): Hub[] {
	const list: unknown =
		typeof raw === 'object' && raw !== null && !Array.isArray(raw)
			? (raw as Record<string, unknown>)['hubs']
			: raw;
	if (!Array.isArray(list)) return [];
	const out: Hub[] = [];
	const seen = new Set<string>();
	for (const entry of list) {
		const hub = parseHub(entry);
		if (hub === null || seen.has(hub.id)) continue;
		seen.add(hub.id);
		out.push(hub);
	}
	return out;
}
