// The route drawn over the base map, in screen pixels so pins and labels keep their size at any zoom (port of
// game.js drawOverlay, arrowHead and labelSvgFor). Pure: it returns shapes and labels as data, and RouteMap.svelte
// draws them. Text widths come from the caller (canvas metrics in the browser, a fixed width in tests).
import {
	arc,
	layoutLabels,
	project,
	relaxPins,
	type Dir,
	type LabelItem,
	type Obstacle,
	type Point,
	type Rect,
} from '@atr/shared/routemap';
import type { LongHaul } from '@atr/shared/routemodel';
import { WHOLE_TRIP, fmtDate, fmtWeek, plural, type Leg, type MapView } from './model.ts';

export type TextWidth = (text: string, font: string) => number;

export interface OverlayInput {
	legs: readonly Leg[];
	longHaul: LongHaul | null;
	view: MapView;
	skipped: boolean;
	/** The selected city key. */
	sel: string | null;
	W: number;
	H: number;
	vb: Rect;
	/** false while the zoom animates (labels are skipped). */
	labels: boolean;
	textW: TextWidth;
	/** The font family for text metrics. */
	sans: string;
}

export type OverlayLine =
	| { kind: 'land'; id: string; d: string }
	| { kind: 'hop'; id: string; d: string; head: string }
	| {
			kind: 'long';
			id: 'in' | 'out';
			d: string;
			near: Point;
			far: Point;
			head: string;
	  };

export type PinKind = 'stop' | 'must' | 'maybe' | 'skip';

export interface OverlayPin {
	key: string;
	kind: PinKind;
	x: number;
	y: number;
	r: number;
	sel: boolean;
	label: string;
	/** Stop number (stops only). */
	n?: number;
	/** Font size of the stop number. */
	fontSize?: number;
}

export type LabelKind = 'stop' | 'must' | 'maybe' | 'skip' | 'leg' | 'hop';

export interface OverlayLabel {
	id: string;
	kind: LabelKind;
	box: Rect;
	name: string;
	sub: string;
	textX: number;
	textY: number;
	subX: number;
	/** A leader line from the pin to the label. */
	lead: { x1: number; y1: number; x2: number; y2: number } | null;
	/** Tapping the label zooms to this country. */
	zoom: string | null;
	/** Tapping the label selects this city. */
	city: string | null;
	sel: boolean;
}

export interface OverlayFixed {
	id: string;
	box: Rect;
	lines: readonly [string, string];
}

export interface Overlay {
	lines: OverlayLine[];
	pins: OverlayPin[];
	labels: OverlayLabel[];
	fixed: OverlayFixed[];
	/** The map's accessible name. */
	aria: string;
}

const r1 = (n: number): number => Math.round(n * 10) / 10;
const f = (n: number): string => String(r1(n));

/** A small open arrowhead at p pointing along angle (degrees). */
export function arrowHead(p: Point, angle: number, back = 0): string {
	const a = (angle * Math.PI) / 180;
	const tip = { x: p.x - Math.cos(a) * back, y: p.y - Math.sin(a) * back };
	const s = 7;
	const l = { x: tip.x - Math.cos(a - 0.5) * s, y: tip.y - Math.sin(a - 0.5) * s };
	const r = { x: tip.x - Math.cos(a + 0.5) * s, y: tip.y - Math.sin(a + 0.5) * s };
	return `M${f(l.x)} ${f(l.y)}L${f(tip.x)} ${f(tip.y)}L${f(r.x)} ${f(r.y)}`;
}

const rank = (v: string | null): number => (v === 'must' ? 3 : v === 'maybe' ? 2 : 1);

/** Extra data a label item carries besides what layoutLabels reads. */
interface LabelMeta {
	id: string;
	kind: LabelKind;
	x: number;
	y: number;
	w: number;
	h: number;
	r: number;
	priority: number;
	must?: boolean;
	prefer?: Dir;
	name: string;
	sub: string;
	font: string;
	/** A shared label of a cluster: the first city's key. */
	city?: string;
	leg?: string;
}

export function computeOverlay(input: OverlayInput): Overlay {
	const { legs, longHaul: lh, view, skipped, sel, W, H, vb, textW, sans } = input;
	const k = W / vb.w;
	const raw = (o: { lat: number | null; lng: number | null }): Point => {
		const p = project(o.lat ?? 0, o.lng ?? 0);
		return { x: (p.x - vb.x) * k, y: (p.y - vb.y) * k };
	};
	const inView = (p: Point, m = 30): boolean => p.x > -m && p.x < W + m && p.y > -m && p.y < H + m;
	const zoomed = view !== WHOLE_TRIP;
	const phone = W < 520;
	const rStop = zoomed ? 11 : phone ? 8.5 : 10;
	const show = (x: { verdict: string | null }): boolean =>
		x.verdict === 'must' || x.verdict === 'maybe' || skipped;
	const radius = (x: { verdict: string | null }, stop: boolean): number =>
		stop
			? rStop
			: x.verdict === 'must'
				? zoomed
					? 7.5
					: 6.5
				: x.verdict === 'maybe'
					? zoomed
						? 5.5
						: 4.5
					: 3.5;

	// Cities closer than their pins (Kyoto and Osaka on the whole-trip view) are nudged apart so every pin shows;
	// lines and labels use the nudged spots.
	const nodes = [
		...legs.flatMap((l) => l.others.filter(show).map((x) => ({ x, stop: false }))),
		...legs.flatMap((l) => l.stops.filter((s) => s.located).map((x) => ({ x, stop: true }))),
	].map(({ x, stop }) => ({ key: x.key, r: radius(x, stop), p: raw(x) }));
	relaxPins(nodes, { gap: 3 });
	const pos = new Map(nodes.map((n) => [n.key, n.p]));
	const P = (o: { key: string; lat: number | null; lng: number | null }): Point =>
		pos.get(o.key) ?? raw(o);

	const lines: OverlayLine[] = [];
	const pins: OverlayPin[] = [];
	const labelItems: LabelMeta[] = [];
	const obstacles: Obstacle[] = [];

	// 1. long-haul flights: only a short stub at the stop that fades out. The real flight path isn't known, so the
	//    stub marks "to / from São Paulo" without claiming a direction.
	const fixed: OverlayFixed[] = [];
	const stubBoxes: Obstacle[] = [];
	// what a stub should steer clear of: every pin, and points along the lines between consecutive stops
	const clutter: { key?: string; x: number; y: number; r: number }[] = nodes.map((n) => ({
		key: n.key,
		x: n.p.x,
		y: n.p.y,
		r: n.r,
	}));
	{
		const seq = legs.flatMap((l) => l.stops.filter((s) => s.located)).map(P);
		for (let i = 0; i + 1 < seq.length; i++) {
			const a = seq[i];
			const b = seq[i + 1];
			if (a === undefined || b === undefined) continue;
			for (let t = 1; t < 10; t++)
				clutter.push({ x: a.x + (b.x - a.x) * (t / 10), y: a.y + (b.y - a.y) * (t / 10), r: 4 });
		}
	}
	const firstStop = legs[0]?.stops.find((s) => s.located);
	const lastLeg = legs.at(-1);
	const lastStop = lastLeg ? [...lastLeg.stops].reverse().find((s) => s.located) : undefined;
	const longHaul = (
		stop: { key: string; lat: number | null; lng: number | null },
		dir: 'in' | 'out',
		text: readonly [string, string],
	): void => {
		const p = P(stop);
		if (!inView(p, 0)) return;
		const len = phone ? 56 : 76;
		const w = Math.max(textW(text[0], `600 12px ${sans}`), textW(text[1], `500 11px ${sans}`)) + 22;
		const h = 34;
		// Point the stub at the emptiest side of the stop: away from other pins and from the route's own lines.
		const boxFor = (v: Point): Rect => {
			const e = { x: p.x + v.x * (rStop + len), y: p.y + v.y * (rStop + len) };
			return { x: e.x + v.x * (w / 2 + 3) - w / 2, y: e.y + v.y * (h / 2 + 3) - h / 2, w, h };
		};
		let u: Point | null = null;
		let best = -Infinity;
		for (let i = 0; i < 16; i++) {
			const ang = (i / 16) * 2 * Math.PI;
			const v = { x: Math.cos(ang), y: Math.sin(ang) };
			const bx = boxFor(v);
			if (bx.x < 8 || bx.y < 8 || bx.x + w > W - 8 || bx.y + h > H - 26) continue;
			const probes = [0.5, 1].map((t) => ({
				x: p.x + v.x * (rStop + len * t),
				y: p.y + v.y * (rStop + len * t),
			}));
			for (const fx of [0.1, 0.5, 0.9])
				for (const fy of [0.2, 0.8]) probes.push({ x: bx.x + w * fx, y: bx.y + h * fy });
			let score = Infinity;
			for (const q of probes)
				for (const c of clutter)
					if (c.key !== stop.key) score = Math.min(score, Math.hypot(q.x - c.x, q.y - c.y) - c.r);
			for (const o of fixed)
				score = Math.min(
					score,
					Math.hypot(
						bx.x + w / 2 - (o.box.x + o.box.w / 2),
						bx.y + h / 2 - (o.box.y + o.box.h / 2),
					) -
						(w + o.box.w) / 2,
				);
			score += v.y * 6; // a slight lean downwards, towards the open sea on most of these maps
			if (score > best) {
				best = score;
				u = v;
			}
		}
		u ??= { x: dir === 'in' ? 0.42 : -0.42, y: 0.908 };
		const near = { x: p.x + u.x * (rStop + 3), y: p.y + u.y * (rStop + 3) };
		const far = { x: p.x + u.x * (rStop + len), y: p.y + u.y * (rStop + len) };
		const ang = (Math.atan2(u.y, u.x) * 180) / Math.PI;
		// arriving: the head points into the stop; leaving: it sits a little way out, pointing away
		const head =
			dir === 'in'
				? arrowHead(near, ang + 180)
				: arrowHead({ x: near.x + u.x * len * 0.42, y: near.y + u.y * len * 0.42 }, ang);
		lines.push({
			kind: 'long',
			id: dir,
			d: `M${f(near.x)} ${f(near.y)}L${f(far.x)} ${f(far.y)}`,
			near,
			far,
			head,
		});
		// the label sits just past the faded end; the stub itself is kept clear of city labels too
		const bx = boxFor(u);
		fixed.push({
			id: `lh-${dir}`,
			box: {
				x: Math.max(8, Math.min(W - w - 8, bx.x)),
				y: Math.max(8, Math.min(H - h - 8, bx.y)),
				w,
				h,
			},
			lines: text,
		});
		stubBoxes.push({
			id: `lhs-${dir}`,
			x: Math.min(near.x, far.x) - 4,
			y: Math.min(near.y, far.y) - 4,
			w: Math.abs(far.x - near.x) + 8,
			h: Math.abs(far.y - near.y) + 8,
		});
	};
	// on a country's map, only that country's own long-haul flight
	if (lh && firstStop && (!zoomed || view === lh.in.country))
		longHaul(firstStop, 'in', [`✈︎ From ${lh.in.from}`, `lands ${fmtWeek(lh.in.date)}`]);
	if (lh && lastStop && (!zoomed || view === lh.out.country))
		longHaul(lastStop, 'out', [
			`✈︎ Home to ${lh.out.to}`,
			`~${fmtWeek(lh.out.date)}${lh.out.booked ? '' : ' · not booked'}`,
		]);
	const [fa, fb] = fixed;
	if (fa !== undefined && fb !== undefined) {
		const a = fa.box;
		const b = fb.box;
		const hit =
			a.x < b.x + b.w + 6 && b.x < a.x + a.w + 6 && a.y < b.y + b.h + 6 && b.y < a.y + a.h + 6;
		if (hit) {
			// pull them apart sideways: home-bound to the left, arriving to the right
			const mid = (a.x + a.w / 2 + b.x + b.w / 2) / 2;
			b.x = Math.max(8, mid - b.w - 4);
			a.x = Math.min(W - a.w - 8, mid + 4);
		}
	}

	// 2. flights between countries (dashed arcs) and 3. overland legs (solid)
	const hops: { mid: Point; date: string; id: string }[] = [];
	for (let i = 0; i + 1 < legs.length; i++) {
		const la = legs[i];
		const lb = legs[i + 1];
		if (la === undefined || lb === undefined) continue;
		const a = [...la.stops].reverse().find((s) => s.located);
		const b = lb.stops.find((s) => s.located);
		if (!a || !b) continue;
		const ar = arc(P(a), P(b), 0.16);
		hops.push({ mid: ar.mid, date: lb.c.from, id: `hop-${String(i)}` });
		lines.push({ kind: 'hop', id: `hop-${String(i)}`, d: ar.d, head: arrowHead(ar.mid, ar.angle) });
	}
	for (const l of legs) {
		const st = l.stops.filter((s) => s.located);
		if (st.length < 2) continue;
		const d = st
			.map((s, i) => {
				const p = P(s);
				return `${i ? 'L' : 'M'}${f(p.x)} ${f(p.y)}`;
			})
			.join('');
		lines.push({ kind: 'land', id: `land-${l.c.id}`, d });
	}

	// 4. pins: other cities first (skipped, maybe, must not placed), stops on top
	const others = legs
		.flatMap((l) => l.others)
		.filter(show)
		.sort((a, b) => rank(a.verdict) - rank(b.verdict));
	for (const x of others) {
		const p = P(x);
		if (!inView(p)) continue;
		const kind: PinKind = x.verdict === 'must' ? 'must' : x.verdict === 'maybe' ? 'maybe' : 'skip';
		const r = radius(x, false);
		const state =
			kind === 'must'
				? 'Must, not placed yet'
				: kind === 'maybe'
					? 'Maybe'
					: x.verdict === 'skip'
						? 'Skip'
						: 'not swiped';
		pins.push({
			key: x.key,
			kind,
			x: p.x,
			y: p.y,
			r,
			sel: sel === x.key,
			label: `${x.name}: ${state}`,
		});
		obstacles.push({ id: x.key, x: p.x - r - 1, y: p.y - r - 1, w: 2 * r + 2, h: 2 * r + 2 });
		if (kind === 'skip' && !zoomed) continue;
		const font =
			kind === 'must' ? `600 12px ${sans}` : `500 ${kind === 'maybe' ? '11.5' : '11'}px ${sans}`;
		const sub = kind === 'must' && !(phone && !zoomed) ? 'not placed' : '';
		const w =
			textW(x.name, font) +
			(sub ? textW(sub, `italic 500 10.5px ${sans}`) + 6 : 0) +
			(kind === 'must' ? 16 : 4);
		labelItems.push({
			id: x.key,
			x: p.x,
			y: p.y,
			w,
			h: kind === 'must' ? 22 : 16,
			r: r + 3,
			priority: kind === 'must' ? 3 : kind === 'maybe' ? 5 : 7,
			kind,
			name: x.name,
			sub,
			font,
		});
	}
	// Stops of one leg whose pins sit close together share one label in travel order ("Tokyo · Kyoto · Osaka").
	type Located = Leg['stops'][number];
	const grouped = new Map<string, Located[]>();
	for (const l of legs) {
		const st = l.stops.filter((s) => s.located && inView(P(s)));
		let run: Located[] = [];
		const flush = (): void => {
			if (run.length > 1) for (const s of run) grouped.set(s.key, run);
			run = [];
		};
		for (const s of st) {
			const near =
				run.length > 0 &&
				run.some((o) => Math.hypot(P(o).x - P(s).x, P(o).y - P(s).y) < Math.max(34, rStop * 3.4));
			if (run.length > 0 && !near) flush();
			run.push(s);
		}
		flush();
	}
	const stopLabels: LabelMeta[] = [];
	for (const l of legs)
		for (const s of l.stops) {
			if (!s.located) continue;
			const p = P(s);
			if (!inView(p)) continue;
			pins.push({
				key: s.key,
				kind: 'stop',
				x: p.x,
				y: p.y,
				r: rStop,
				sel: sel === s.key,
				label: `Stop ${String(s.n)}: ${s.name}${s.nights ? `, ${plural(s.nights, 'night')}` : ''}`,
				n: s.n,
				fontSize: rStop > 9 ? 11 : 9.5,
			});
			obstacles.push({
				id: s.key,
				x: p.x - rStop - 1,
				y: p.y - rStop - 1,
				w: 2 * rStop + 2,
				h: 2 * rStop + 2,
			});
			const font = `600 12.5px ${sans}`;
			const sub = s.nights ? `${String(s.nights)}n` : '';
			stopLabels.push({
				id: s.key,
				x: p.x,
				y: p.y,
				w: textW(s.name, font) + (sub ? textW(sub, `500 11px ${sans}`) + 5 : 0) + 17,
				h: 22,
				r: rStop + 3,
				priority: 1,
				must: true,
				kind: 'stop',
				name: s.name,
				sub,
				font,
			});
		}
	/** Stop labels with the given clusters merged into one label each. */
	const withGroups = (merge: Set<string>): LabelMeta[] => {
		const out: LabelMeta[] = [];
		const done = new Set<string>();
		for (const it of stopLabels) {
			const group = grouped.get(it.id);
			const head = group?.[0];
			if (group === undefined || head === undefined || !merge.has(head.key)) {
				out.push(it);
				continue;
			}
			if (done.has(head.key)) continue;
			done.add(head.key);
			const ps = group.map(P);
			const cx = ps.reduce((n, q) => n + q.x, 0) / ps.length;
			const cy = ps.reduce((n, q) => n + q.y, 0) / ps.length;
			const spread = Math.max(...ps.map((q) => Math.hypot(q.x - cx, q.y - cy)));
			const name = group.map((g) => g.name).join(' · ');
			out.push({
				id: group.map((g) => g.key).join('|'),
				city: head.key,
				x: cx,
				y: cy,
				w: textW(name, it.font) + 17,
				h: 22,
				r: spread + rStop + 3,
				priority: 1,
				must: true,
				kind: 'stop',
				name,
				sub: '',
				font: it.font,
			});
		}
		return out;
	};

	// 5. labels (skipped while the zoom animates)
	const labels: OverlayLabel[] = [];
	if (input.labels) {
		for (const fx of fixed) obstacles.push({ id: fx.id, ...fx.box });
		obstacles.push(...stubBoxes);
		obstacles.push(
			{ id: 'osm', x: W - 190, y: H - 22, w: 190, h: 22 },
			{ id: 'back', x: 0, y: 0, w: zoomed ? 130 : 0, h: zoomed ? 52 : 0 },
		);
		// leg badges on the whole-trip map (wide maps only: on a phone the chip row above the map carries the legs)
		if (!zoomed && !phone)
			for (const l of legs) {
				const st = l.stops.filter((s) => s.located);
				if (st.length === 0) continue;
				const pts = st.map(P);
				const cx = pts.reduce((n, p) => n + p.x, 0) / pts.length;
				const cy = pts.reduce((n, p) => n + p.y, 0) / pts.length;
				const text = `${String(l.c.n)} ${l.c.name}`;
				const sub = `${String(l.c.nights)}n`;
				labelItems.push({
					id: `leg-${l.c.id}`,
					x: cx,
					y: cy,
					w: textW(text, `700 11px ${sans}`) + textW(sub, `500 10.5px ${sans}`) + 20,
					h: 20,
					r: rStop + 26,
					priority: 4,
					kind: 'leg',
					name: text,
					sub,
					font: `700 11px ${sans}`,
					leg: l.c.id,
					prefer: 'S',
				});
			}
		for (const h of hops) {
			const p = h.mid;
			if (!inView(p, -10)) continue;
			const text = `✈︎ ${fmtDate(h.date)}`;
			labelItems.push({
				id: h.id,
				x: p.x,
				y: p.y,
				w: textW(text, `600 10.5px ${sans}`) + 12,
				h: 18,
				r: 6,
				priority: 6,
				kind: 'hop',
				name: text,
				sub: '',
				font: `700 11px ${sans}`,
			});
		}
		// First each stop gets its own label; a cluster whose labels collide (Kyoto and Osaka on the whole-trip map)
		// is laid out again with one shared label.
		const opts = { obstacles, bounds: { x: 0, y: 0, w: W, h: H }, margin: 4 };
		const asItems = (xs: readonly LabelMeta[]): LabelItem[] =>
			xs.map((x) => ({
				id: x.id,
				x: x.x,
				y: x.y,
				w: x.w,
				h: x.h,
				r: x.r,
				priority: x.priority,
				must: x.must,
				prefer: x.prefer,
			}));
		let items = [...withGroups(new Set()), ...labelItems];
		let placed = layoutLabels(asItems(items), opts);
		const merge = new Set<string>();
		for (const it of stopLabels) {
			const g = grouped.get(it.id);
			const pl = placed.get(it.id);
			if (g?.[0] !== undefined && (pl?.overlap === true || pl?.leader === true))
				merge.add(g[0].key);
		}
		if (merge.size > 0) {
			items = [...withGroups(merge), ...labelItems];
			placed = layoutLabels(asItems(items), opts);
		}
		for (const it of items) {
			const pl = placed.get(it.id);
			if (pl === undefined || pl.hidden || pl.box === null) continue;
			labels.push(labelOf(it, pl.box, pl.leader, view, sel, textW, sans));
		}
	}
	const aria = `Map of the route: ${legs
		.map((l) => `${l.c.name}${l.stops.length ? ` (${l.stops.map((s) => s.name).join(', ')})` : ''}`)
		.join(', then ')}`;
	return { lines, pins, labels, fixed, aria };
}

function labelOf(
	it: LabelMeta,
	b: Rect,
	leader: boolean,
	view: MapView,
	sel: string | null,
	textW: TextWidth,
	sans: string,
): OverlayLabel {
	let lead: OverlayLabel['lead'] = null;
	if (leader || it.city !== undefined) {
		// a shared label always points at its cluster
		const cx = Math.max(b.x, Math.min(it.x, b.x + b.w));
		const cy = Math.max(b.y, Math.min(it.y, b.y + b.h));
		lead = { x1: r1(it.x), y1: r1(it.y), x2: r1(cx), y2: r1(cy) };
	}
	// a shared label ("Tokyo · Kyoto · Osaka") zooms to its country, where each city gets its own label
	let zoom: string | null = null;
	let city: string | null = null;
	if (it.kind === 'leg') zoom = it.leg ?? null;
	else if (it.kind === 'hop') {
		/* not tappable */
	} else if (it.city !== undefined) {
		if (view === WHOLE_TRIP) zoom = it.city.split('/')[0] ?? null;
		else city = it.city;
	} else city = it.id;
	const pad = it.kind === 'leg' ? 10 : it.kind === 'hop' ? 6 : 8;
	const plain = it.kind === 'maybe' || it.kind === 'skip';
	return {
		id: it.id,
		kind: it.kind,
		box: b,
		name: it.name,
		sub: it.sub,
		textX: r1(plain ? b.x + 2 : b.x + pad),
		textY: r1(plain ? b.y + b.h - 4 : b.y + b.h / 2 + 4.2),
		subX: r1(b.x + pad + textW(it.name, it.font || `700 11px ${sans}`) + (it.sub ? 5 : 0)),
		lead,
		zoom,
		city,
		sel: sel === it.id,
	};
}
