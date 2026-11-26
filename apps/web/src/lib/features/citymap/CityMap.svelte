<!--
	The city map: a Leaflet slippy map (drag to pan, wheel / pinch / the buttons to zoom) over OpenStreetMap tiles from
	our own server (GET /tiles/<z>/<x>/<y>.png), with one marker per pin (pins.ts). Leaflet loads in the browser
	only, on this page; the server render shows a skeleton the size of the map.
	- A pin is a real <button> with an accessible name: a click, a tap, Enter or Space calls `onactivate`. Hover (or
	  focus) calls `onhover`, and `hot` raises and rings the pin the list is pointing at. On a touch screen every pin
	  has a 44 px tap area, whatever its drawn size.
	- Pins closer than a pin's width on screen fold into a stack with a count (model.ts stackPoints); a booked stay
	  keeps its spot and the pins under it become a "+N" stack beside it. A tap on a stack zooms in when that pulls
	  its pins apart, else fans them out around it (Escape, a tap on the map or a zoom folds them back).
	- Permanent labels (the booked stay's name and dates, a hub's Arrive / Leave) sit in their own pane under every
	  pin, so they never take a tap meant for a pin, and are kept inside the map near its edges.
	- The first view waits for the trip legs (`ready`), then fits `focus` (the booked stay's neighbourhood); "Fit all"
	  fits every pin shown, "Recenter" goes back to the first view.
	- An in / out hub outside the view gets a chip on the map's edge ("✈ PVG 31 km →") that pans to it.
	- The popup of a hub or of a booked stay without a card sits at the top of the map; the pan that opens it puts
	  the target in the free part of the map, not under the popup.
	- If Leaflet or the tiles fail, the map says so; the page's list keeps working.
-->
<script lang="ts">
	import 'leaflet/dist/leaflet.css';
	import LocateFixedIcon from '@lucide/svelte/icons/locate-fixed';
	import MaximizeIcon from '@lucide/svelte/icons/maximize';
	import MinusIcon from '@lucide/svelte/icons/minus';
	import PlusIcon from '@lucide/svelte/icons/plus';
	import XIcon from '@lucide/svelte/icons/x';
	import type * as Leaflet from 'leaflet';
	import { untrack } from 'svelte';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Skeleton } from '#lib/components/ui/skeleton/index.js';
	import { cn } from '#lib/utils.js';
	import {
		arrowTo,
		boundsOf,
		fanOffsets,
		stackPoints,
		type LatLng,
		type PinStack,
		type ScreenPoint,
	} from './model.ts';
	import { labelHtml, pinHtml, stackHtml } from './pin-html.ts';
	import type { EdgeTarget, MapPin, MapPopup } from './pins.ts';

	interface Props {
		pins: readonly MapPin[];
		/** What the first view fits. */
		focus: readonly LatLng[];
		/** False until the data the first view depends on (the trip legs: the booked stay) has loaded. */
		ready: boolean;
		/** In / out hubs that get an edge chip while outside the view. */
		edges: readonly EdgeTarget[];
		/** The pin the list points at (raised and ringed). */
		hot: string | null;
		popup: MapPopup | null;
		/** Bumped by the page to pan to `panTo`. */
		panSeq: number;
		panTo: LatLng | null;
		onactivate: (key: string) => void;
		onhover: (key: string | null) => void;
		onclosepopup: () => void;
	}

	let {
		pins,
		focus,
		ready,
		edges,
		hot,
		popup,
		panSeq,
		panTo,
		onactivate,
		onhover,
		onclosepopup,
	}: Props = $props();

	const MAX_FIT_ZOOM = 16;
	const PAD = 48;
	/** Pins whose centres are closer than this on screen fold into a stack (a pin is 28 to 34 px wide). */
	const STACK_PX = 32;
	/** The popup's width from md up (md:w-88) plus its inset: the pan keeps the target right of it. */
	const POPUP_W = 22 * 16 + 12;

	let box = $state<HTMLDivElement | null>(null);
	let ctlEl = $state<HTMLDivElement | null>(null);
	let L: typeof Leaflet | null = null;
	let map = $state<Leaflet.Map | null>(null);
	let status = $state<'loading' | 'ready' | 'failed'>('loading');
	let tilesOk = $state(0);
	let tilesBad = $state(0);
	let home: { center: Leaflet.LatLng; zoom: number } | null = null;
	/** The map has a view (Leaflet throws on bounds and points before one is set). */
	let fitted = $state(false);
	/** Bumped on every move or zoom, so the edge chips follow the view. */
	let moved = $state(0);
	// Leaflet's own bookkeeping (markers by pin key, stacks, labels), not state the template reads.
	// eslint-disable-next-line svelte/prefer-svelte-reactivity -- see above
	const markers = new Map<string, { m: Leaflet.Marker; sig: string; el: HTMLButtonElement }>();
	let stacks: { m: Leaflet.Marker; el: HTMLButtonElement; s: PinStack }[] = [];
	let labels: { m: Leaflet.Marker; el: HTMLElement; tone: string }[] = [];
	/** An opened stack: its pins' fanned-out spots and the leader lines to them. */
	let spread: {
		keys: string[];
		at: Map<string, LatLng>;
		lines: Leaflet.Polyline[];
	} | null = null;
	let layer: Leaflet.LayerGroup | null = null;
	const reduced = (): boolean => matchMedia('(prefers-reduced-motion: reduce)').matches;

	// ---------------------------------------------------------------- the map

	$effect(() => {
		const el = box;
		if (el === null) return;
		let dead = false;
		let ro: ResizeObserver | null = null;
		let made: Leaflet.Map | null = null;
		const onKey = (e: KeyboardEvent): void => {
			if (e.key === 'Escape' && spread !== null) {
				e.stopPropagation();
				closeSpread();
			}
		};
		el.addEventListener('keydown', onKey);
		import('leaflet')
			.then((mod) => {
				if (dead) return;
				L = mod;
				const m = mod.map(el, {
					zoomControl: false,
					minZoom: 3,
					maxZoom: 18,
					// Whole zoom levels only: a fractional zoom scales the tiles and leaves hairline seams between them.
					zoomSnap: 1,
					zoomDelta: 1,
					wheelPxPerZoomLevel: 90,
					keyboard: true,
				});
				m.attributionControl.setPrefix(false);
				m.createPane('cm-labels');
				mod
					.tileLayer('/tiles/{z}/{x}/{y}.png', {
						minZoom: 2,
						maxZoom: 18,
						className: 'cm-tiles',
						attribution:
							'© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors',
					})
					.on('tileload', () => {
						tilesOk++;
					})
					.on('tileerror', () => {
						tilesBad++;
					})
					.addTo(m);
				layer = mod.layerGroup().addTo(m);
				m.on('moveend zoomend resize', () => {
					moved++;
				});
				m.on('move zoomend resize', clampLabels);
				m.on('zoomstart', () => {
					if (spread !== null) closeSpread(false);
				});
				m.on('zoomend', relayout);
				m.on('click', () => {
					if (spread !== null) closeSpread();
					onclosepopup();
				});
				ro = new ResizeObserver(() => {
					m.invalidateSize({ animate: false });
				});
				ro.observe(el);
				made = m;
				map = m;
				status = 'ready';
			})
			.catch(() => {
				if (!dead) status = 'failed';
			});
		return () => {
			dead = true;
			el.removeEventListener('keydown', onKey);
			ro?.disconnect();
			made?.remove();
			markers.clear();
			stacks = [];
			labels = [];
			spread = null;
			layer = null;
			map = null;
		};
	});

	/** The tiles are failing (offline, server down): say so once a few have failed and none loaded. */
	const tilesFailed = $derived(tilesBad >= 4 && tilesOk === 0);

	// ---------------------------------------------------------------- markers

	/**
	 * Calls `go` on a click, a tap, Enter or Space. Pointer clicks come through Leaflet's marker 'click' (which ignores
	 * the click that ends a drag); a keyboard click (detail 0) is taken from the button itself, because Leaflet also
	 * drops those after any mouse pan until the next mousedown.
	 */
	function onActivate(m: Leaflet.Marker, el: HTMLButtonElement, go: () => void): void {
		m.on('click', go);
		el.addEventListener('click', (e) => {
			if (e.detail !== 0) return;
			e.stopPropagation();
			go();
		});
	}

	function addMarker(lib: typeof Leaflet, pin: MapPin): void {
		const el = document.createElement('button');
		el.type = 'button';
		pinHtml(el, pin);
		const m = lib.marker([pin.at.lat, pin.at.lng], {
			icon: lib.divIcon({ className: 'cm-host', html: el, iconSize: [0, 0], iconAnchor: [0, 0] }),
			keyboard: false,
			riseOnHover: false,
			zIndexOffset: pin.z,
		});
		const key = pin.key;
		onActivate(m, el, () => {
			onactivate(key);
		});
		m.on('mouseover', () => {
			onhover(key);
		});
		m.on('mouseout', () => {
			onhover(null);
		});
		el.addEventListener('focus', () => {
			onhover(key);
		});
		el.addEventListener('blur', () => {
			onhover(null);
		});
		if (pin.tip !== '' && matchMedia('(hover: hover)').matches) {
			m.bindTooltip(pin.tip, {
				direction: 'top',
				offset: [0, -16],
				className: 'cm-tip',
				opacity: 1,
			});
		}
		markers.set(key, { m, sig: JSON.stringify(pin), el });
	}

	$effect(() => {
		const list = pins;
		const lib = L;
		const group = layer;
		if (map === null || lib === null || group === null) return;
		untrack(() => {
			const keep = new Set(list.map((p) => p.key));
			for (const [k, x] of markers) {
				if (!keep.has(k)) {
					group.removeLayer(x.m);
					markers.delete(k);
				}
			}
			for (const pin of list) {
				const x = markers.get(pin.key);
				if (x === undefined) {
					addMarker(lib, pin);
					continue;
				}
				const sig = JSON.stringify(pin);
				if (x.sig === sig) continue;
				x.sig = sig;
				pinHtml(x.el, pin);
				x.m.setTooltipContent(pin.tip);
			}
			relayout();
		});
	});

	const ptOf = (m: Leaflet.Map, at: LatLng, z: number): Leaflet.Point =>
		m.project([at.lat, at.lng], z);

	/**
	 * Draws what the pins and the zoom call for: which pins show alone, which fold into stacks, the opened stack's
	 * fan, and the labels. Runs on a pin change and after every zoom (a pan keeps the screen distances).
	 */
	function relayout(): void {
		const m = map;
		const lib = L;
		const group = layer;
		if (m === null || lib === null || group === null || !fitted) return;
		const z = m.getZoom();
		const byKey = new Map(pins.map((p) => [p.key, p]));
		const visible = pins.filter((p) => p.visible);
		// An opened stack stays open while all its pins are still shown.
		if (spread !== null && !spread.keys.every((k) => byKey.get(k)?.visible === true)) {
			closeSpread(false);
		}
		const fanned = spread?.at ?? new Map<string, LatLng>();
		const points: ScreenPoint[] = visible
			.filter((p) => p.kind !== 'hub' && !fanned.has(p.key))
			.sort((a, b) => b.z - a.z)
			.map((p) => {
				const pt = ptOf(m, p.at, z);
				return { key: p.key, x: pt.x, y: pt.y, anchor: p.kind === 'booked' };
			});
		const groups = stackPoints(points, STACK_PX);
		// eslint-disable-next-line svelte/prefer-svelte-reactivity -- local to this call
		const alone = new Set<string>();
		for (const g of groups) {
			if (g.anchor !== null) alone.add(g.anchor);
			const only = g.keys[0];
			if (g.anchor === null && g.keys.length === 1 && only !== undefined) alone.add(only);
		}

		for (const p of pins) {
			const x = markers.get(p.key);
			if (x === undefined) continue;
			const fan = fanned.get(p.key);
			const show = p.visible && (p.kind === 'hub' || alone.has(p.key) || fan !== undefined);
			const at = fan ?? p.at;
			x.m.setLatLng([at.lat, at.lng]);
			x.m.setZIndexOffset(p.z + (fan !== undefined ? 8000 : 0) + (p.key === hot ? 10_000 : 0));
			if (show && !group.hasLayer(x.m)) group.addLayer(x.m);
			if (!show && group.hasLayer(x.m)) group.removeLayer(x.m);
		}

		// Stacks: rebuilt from scratch (a handful of markers).
		for (const s of stacks) group.removeLayer(s.m);
		stacks = [];
		for (const g of groups) {
			const n = g.keys.length;
			if (n === 0 || (g.anchor === null && n === 1)) continue;
			const names = g.keys.map((k) => byKey.get(k)?.name ?? k);
			const listed =
				names.length > 3
					? `${names.slice(0, 3).join(', ')} and ${String(names.length - 3)} more`
					: names.join(', ');
			const beside = g.anchor !== null;
			const label = `${String(n)} ${n === 1 ? 'place' : 'places'} ${beside ? `next to ${byKey.get(g.anchor ?? '')?.name ?? 'the booked stay'}` : 'here'}: ${listed}. Show them`;
			const el = document.createElement('button');
			el.type = 'button';
			stackHtml(el, n, label, beside);
			const anchorPin = g.anchor === null ? undefined : byKey.get(g.anchor);
			const at = anchorPin?.at ?? m.unproject([g.x, g.y], z);
			const sm = lib.marker([at.lat, at.lng], {
				icon: lib.divIcon({ className: 'cm-host', html: el, iconSize: [0, 0], iconAnchor: [0, 0] }),
				keyboard: false,
				riseOnHover: false,
				zIndexOffset: 4500,
			});
			onActivate(sm, el, () => {
				openStack(g);
			});
			el.classList.toggle('is-hot', hot !== null && g.keys.includes(hot));
			group.addLayer(sm);
			stacks.push({ m: sm, el, s: g });
		}

		// Labels: one per shown pin that has tags, in the pane under the pins.
		for (const l of labels) group.removeLayer(l.m);
		labels = [];
		for (const p of visible) {
			if (p.tags.length === 0) continue;
			const x = markers.get(p.key);
			if (x === undefined || !group.hasLayer(x.m)) continue;
			const el = document.createElement('div');
			labelHtml(el, p);
			const at = x.m.getLatLng();
			const lm = lib.marker(at, {
				icon: lib.divIcon({
					className: 'cm-lhost',
					html: el,
					iconSize: [0, 0],
					iconAnchor: [0, 0],
				}),
				pane: 'cm-labels',
				interactive: false,
				keyboard: false,
			});
			group.addLayer(lm);
			labels.push({ m: lm, el, tone: p.tone });
		}
		clampLabels();
	}

	/** Keeps every label of a pin in view inside the map: shifted sideways at the edges, above the pin at the bottom. */
	function clampLabels(): void {
		const m = map;
		if (m === null || !fitted) return;
		const size = m.getSize();
		for (const l of labels) {
			const tags = l.el.firstElementChild;
			if (!(tags instanceof HTMLElement)) continue;
			const p = m.latLngToContainerPoint(l.m.getLatLng());
			const inside = p.x >= 0 && p.x <= size.x && p.y >= 0 && p.y <= size.y;
			// A pin outside the view takes its label with it (its edge chip, if any, stands in for it).
			if (!inside) {
				l.el.dataset['off'] = '';
				continue;
			}
			delete l.el.dataset['off'];
			const half = tags.offsetWidth / 2;
			const left = p.x - half - 6;
			const right = p.x + half + 6;
			const dx = left < 0 ? -left : right > size.x ? size.x - right : 0;
			l.el.style.setProperty('--dx', `${String(Math.round(dx))}px`);
			const below = size.y - p.y;
			if (below < tags.offsetHeight + 32) l.el.dataset['flip'] = '';
			else delete l.el.dataset['flip'];
		}
	}

	/** A tap on a stack: zoom in when that pulls its pins apart, else fan them out around it. */
	function openStack(g: PinStack): void {
		const m = map;
		const lib = L;
		const group = layer;
		if (m === null || lib === null || group === null) return;
		const byKey = new Map(pins.map((p) => [p.key, p]));
		const members = g.keys.flatMap((k) => byKey.get(k) ?? []);
		const anchor = g.anchor === null ? undefined : byKey.get(g.anchor);
		const maxZ = m.getMaxZoom();
		const atMax = members.map((p) => {
			const pt = ptOf(m, p.at, maxZ);
			return { key: p.key, x: pt.x, y: pt.y, anchor: false };
		});
		const comesApart = stackPoints(atMax, STACK_PX).length > 1;
		if (comesApart && m.getZoom() < maxZ) {
			const b = boundsOf([...members.map((p) => p.at), ...(anchor ? [anchor.at] : [])]);
			if (b === null) return;
			m.fitBounds(
				[
					[b.south, b.west],
					[b.north, b.east],
				],
				{ padding: [PAD * 2, PAD * 2], maxZoom: maxZ, animate: !reduced() },
			);
			return;
		}
		closeSpread(false);
		const z = m.getZoom();
		const centre = anchor?.at ?? m.unproject([g.x, g.y], z);
		const c = ptOf(m, { lat: centre.lat, lng: centre.lng }, z);
		const offsets = fanOffsets(members.length, anchor !== undefined);
		// eslint-disable-next-line svelte/prefer-svelte-reactivity -- Leaflet bookkeeping, not template state
		const at = new Map<string, LatLng>();
		const lines: Leaflet.Polyline[] = [];
		members.forEach((p, i) => {
			const o = offsets[i] ?? { dx: 0, dy: 0 };
			const ll = m.unproject([c.x + o.dx, c.y + o.dy], z);
			at.set(p.key, { lat: ll.lat, lng: ll.lng });
			const line = lib.polyline(
				[
					[centre.lat, centre.lng],
					[ll.lat, ll.lng],
				],
				{ className: 'cm-leg', interactive: false, weight: 1.5 },
			);
			group.addLayer(line);
			lines.push(line);
		});
		spread = { keys: members.map((p) => p.key), at, lines };
		relayout();
		// Keyboard users land on the first fanned pin.
		const first = members[0];
		if (first !== undefined) {
			requestAnimationFrame(() => {
				markers.get(first.key)?.el.focus({ preventScroll: true });
			});
		}
	}

	function closeSpread(redraw = true): void {
		if (spread === null) return;
		const group = layer;
		for (const l of spread.lines) group?.removeLayer(l);
		spread = null;
		if (redraw) relayout();
	}

	// The hot pin (or the stack holding it): raised and ringed.
	$effect(() => {
		const k = hot;
		if (map === null) return;
		for (const p of pins) {
			const x = markers.get(p.key);
			if (x === undefined) continue;
			const on = p.key === k;
			x.el.classList.toggle('is-hot', on);
			x.m.setZIndexOffset(p.z + (spread?.at.has(p.key) ? 8000 : 0) + (on ? 10_000 : 0));
		}
		for (const s of stacks) s.el.classList.toggle('is-hot', k !== null && s.s.keys.includes(k));
	});

	// ---------------------------------------------------------------- views

	function fit(points: readonly LatLng[], animate: boolean): void {
		const m = map;
		const b = boundsOf(points);
		if (m === null || b === null) return;
		if (b.south === b.north && b.west === b.east) {
			m.setView([b.south, b.west], 15, { animate });
			return;
		}
		m.fitBounds(
			[
				[b.south, b.west],
				[b.north, b.east],
			],
			{ padding: [PAD, PAD], maxZoom: MAX_FIT_ZOOM, animate },
		);
	}

	// The first view, once the map, the trip legs (the booked stay) and the pins are there.
	$effect(() => {
		const m = map;
		// Everything filtered out: fit the hidden pins, so the map still has a view.
		const f = focus.length > 0 ? focus : pins.map((p) => p.at);
		if (m === null || !ready || home !== null || f.length === 0) return;
		untrack(() => {
			fit(f, false);
			home = { center: m.getCenter(), zoom: m.getZoom() };
			fitted = true;
			relayout();
		});
	});

	function recenter(): void {
		if (map === null || home === null) return;
		map.setView(home.center, home.zoom, { animate: !reduced() });
	}

	function fitAll(): void {
		fit(
			pins.filter((p) => p.visible).map((p) => p.at),
			!reduced(),
		);
	}

	function zoom(by: number): void {
		map?.setZoom(map.getZoom() + by, { animate: !reduced() });
	}

	// The page asks to pan to a pin (a list row, an edge chip): the target lands clear of the popup that opens with
	// it (the popup sits at the top; from md up at the top left).
	let lastPan = 0;
	$effect(() => {
		const seq = panSeq;
		const to = panTo;
		const m = map;
		if (m === null || !fitted || to === null || seq === lastPan) return;
		lastPan = seq;
		untrack(() => {
			const z = Math.max(m.getZoom(), 13);
			const size = m.getSize();
			const wide = size.x >= POPUP_W + 280;
			const want = wide
				? { x: (POPUP_W + size.x) / 2, y: size.y / 2 }
				: { x: size.x / 2, y: size.y * 0.72 };
			const t = ptOf(m, to, z);
			const centre = m.unproject([t.x - (want.x - size.x / 2), t.y - (want.y - size.y / 2)], z);
			if (reduced()) m.setView(centre, z, { animate: false });
			else m.flyTo(centre, z, { duration: 0.6 });
		});
	});

	// ---------------------------------------------------------------- edge chips

	interface Edge {
		key: string;
		text: string;
		/** "Show PVG 31 km on the map". */
		name: string;
		x: number;
		y: number;
		at: LatLng;
	}

	const edgeChips = $derived.by((): Edge[] => {
		const m = map;
		// `moved` changes on every pan and zoom: the chips follow the view.
		if (m === null || !fitted || moved < 0) return [];
		const size = m.getSize();
		if (size.x === 0 || size.y === 0) return [];
		const view = m.getBounds();
		const c = m.getCenter();
		const out: Edge[] = [];
		for (const e of edges) {
			if (view.contains([e.at.lat, e.at.lng])) continue;
			const p = m.latLngToContainerPoint([e.at.lat, e.at.lng]);
			const cx = size.x / 2;
			const cy = size.y / 2;
			const dx = p.x - cx;
			const dy = p.y - cy;
			// Where the line from the middle to the hub leaves the inset frame (the chip is kept inside the map later).
			const hw = Math.max(1, cx - 28);
			const hh = Math.max(1, cy - 28);
			const t = Math.min(hw / Math.max(Math.abs(dx), 1e-6), hh / Math.max(Math.abs(dy), 1e-6));
			out.push({
				key: e.key,
				at: e.at,
				text: `${e.text} ${arrowTo({ lat: c.lat, lng: c.lng }, e.at)}`,
				name: `Show ${e.name} on the map`,
				x: cx + dx * t,
				y: cy + dy * t,
			});
		}
		return out;
	});

	/**
	 * Places an edge chip with its own measured size: the whole chip stays inside the map, and clear of the zoom
	 * buttons at the top right. Sets --x / --y (the stylesheet positions it).
	 */
	const placeAt = (x: number, y: number) => (node: HTMLElement) => {
		const frame = node.parentElement;
		if (frame === null) return;
		const W = frame.clientWidth;
		const H = frame.clientHeight;
		const w = node.offsetWidth;
		const h = node.offsetHeight;
		const m = 8;
		const clamp = (v: number, lo: number, hi: number): number =>
			hi < lo ? (lo + hi) / 2 : Math.min(hi, Math.max(lo, v));
		let cx = clamp(x, w / 2 + m, W - w / 2 - m);
		const cy = clamp(y, h / 2 + m, H - h / 2 - m);
		const ctl = ctlEl;
		if (ctl !== null && cy - h / 2 < ctl.offsetTop + ctl.offsetHeight + m) {
			cx = Math.min(cx, ctl.offsetLeft - m - w / 2);
		}
		node.style.setProperty('--x', `${String(Math.round(cx))}px`);
		node.style.setProperty('--y', `${String(Math.round(cy))}px`);
	};
</script>

<div
	class="cm-wrap relative isolate overflow-hidden rounded-2xl border border-border/80 shadow-flat"
>
	<div
		bind:this={box}
		class="cm-map absolute inset-0 z-0"
		data-city-map
		data-ready={status === 'ready' && fitted ? '' : undefined}
		role="region"
		aria-label="Map of the city. Drag to move, use the buttons or the wheel to zoom."
	></div>

	{#if status === 'loading' || (status === 'ready' && !fitted)}
		<div class="absolute inset-0 z-10"><Skeleton class="size-full" /></div>
	{:else if status === 'failed'}
		<p
			class="absolute inset-0 z-10 grid place-items-center bg-muted p-6 text-center text-sm text-muted-foreground"
			role="status"
		>
			The map could not load. Everything is in the list.
		</p>
	{/if}
	{#if tilesFailed}
		<p
			class="absolute inset-x-3 top-3 z-20 mr-14 rounded-xl px-3 py-2 text-xs text-foreground shadow-soft glass"
			role="status"
			data-tiles-failed
		>
			Map tiles are not loading (offline?). The pins and the list still work.
		</p>
	{/if}

	{#if status === 'ready' && fitted}
		<div
			bind:this={ctlEl}
			class="absolute top-3 right-3 z-20 flex flex-col gap-1.5"
			data-map-controls
		>
			<button
				type="button"
				class="ctl grid size-10 place-items-center rounded-full text-foreground shadow-soft glass pointer-coarse:size-11"
				aria-label="Zoom in"
				onclick={() => {
					zoom(1);
				}}><PlusIcon class="size-4.5" /></button
			>
			<button
				type="button"
				class="ctl grid size-10 place-items-center rounded-full text-foreground shadow-soft glass pointer-coarse:size-11"
				aria-label="Zoom out"
				onclick={() => {
					zoom(-1);
				}}><MinusIcon class="size-4.5" /></button
			>
			<button
				type="button"
				class="ctl grid size-10 place-items-center rounded-full text-foreground shadow-soft glass pointer-coarse:size-11"
				aria-label="Fit all"
				title="Fit all"
				onclick={fitAll}><MaximizeIcon class="size-4.5" /></button
			>
			<button
				type="button"
				class="ctl grid size-10 place-items-center rounded-full text-foreground shadow-soft glass pointer-coarse:size-11"
				aria-label="Recenter"
				title="Recenter"
				onclick={recenter}><LocateFixedIcon class="size-4.5" /></button
			>
		</div>

		{#each edgeChips as e (e.key)}
			<button
				type="button"
				class="edge absolute z-20 inline-flex min-h-9 items-center gap-1 rounded-full px-3 text-xs font-semibold whitespace-nowrap text-foreground nums shadow-soft glass pointer-coarse:min-h-11"
				{@attach placeAt(e.x, e.y)}
				data-edge={e.key}
				aria-label={e.name}
				onclick={() => {
					onactivate(e.key);
				}}>{e.text}</button
			>
		{/each}
	{/if}

	{#if popup !== null}
		<div
			class="pop absolute top-2 right-16 left-2 z-30 panel px-4 pt-3 pb-3.5 md:top-3 md:right-auto md:left-3 md:w-88"
			role="dialog"
			aria-label={popup.title}
			data-map-popup={popup.key}
		>
			<Button
				variant="ghost"
				size="icon-lg"
				class="absolute top-1.5 right-1.5 pointer-coarse:size-11"
				aria-label="Close"
				onclick={onclosepopup}><XIcon /></Button
			>
			<h3 class="mr-10 font-serif text-lg leading-tight font-semibold">{popup.title}</h3>
			{#if popup.local !== null}
				<p class="mr-10 font-cjk text-sm text-muted-foreground">{popup.local}</p>
			{/if}
			{#each popup.lines as line, i (i)}
				<p class={cn('mt-1 text-sm nums', i === 0 ? 'text-foreground' : 'text-muted-foreground')}>
					{line}
				</p>
			{/each}
		</div>
	{/if}
</div>

<style>
	/*
	 * The map's height per screen (docs/DESIGN.md): on the phone tall but ending above the floating tab bar on the
	 * first screen (23rem: the top bar, the page head and the tab bar); the first screen on the Fold; the window from xl.
	 */
	.cm-wrap {
		height: clamp(22rem, calc(100svh - 23rem), 62svh);
		background: var(--surface-2);
	}
	@media (min-width: 44rem) {
		.cm-wrap {
			height: calc(100svh - 17rem);
			min-height: 26rem;
		}
	}
	@media (min-width: 80rem) and (min-height: 50rem) {
		.cm-wrap {
			height: 100%;
			min-height: 0;
		}
	}
	.cm-map {
		font: inherit;
		background: var(--surface-2);
	}
	.edge {
		left: var(--x, 50%);
		top: var(--y, 50%);
		translate: -50% -50%;
	}
	.ctl {
		border: 1px solid var(--glass-line);
		transition: background-color 0.15s var(--ease-soft);
	}
	@media (hover: hover) {
		.ctl:hover,
		.edge:hover {
			background: var(--surface);
		}
	}
	.ctl:focus-visible,
	.edge:focus-visible {
		outline: 2px solid var(--note);
		outline-offset: 2px;
	}
	.pop {
		box-shadow: var(--elev-2);
	}
	@media (prefers-reduced-motion: no-preference) {
		.pop {
			animation: pop-in 0.2s var(--ease-soft);
		}
	}
	@keyframes pop-in {
		from {
			opacity: 0;
			transform: translateY(-6px);
		}
	}

	/* ---------------------------------------------------------------- Leaflet chrome, in the site's tokens */
	.cm-map :global(.leaflet-control-attribution) {
		background: var(--glass);
		color: var(--ink-3);
		font-size: 0.75rem;
		border-top-left-radius: 0.5rem;
		padding: 0.125rem 0.5rem;
	}
	.cm-map :global(.leaflet-control-attribution a) {
		color: var(--ink-2);
	}
	.cm-map :global(.leaflet-container),
	.cm-map:global(.leaflet-container) {
		background: var(--surface-2);
		font-family: inherit;
	}
	/* Labels: over the tiles and the leader lines, under every pin, never a tap target. */
	.cm-map :global(.leaflet-cm-labels-pane) {
		z-index: 590;
		pointer-events: none;
	}
	.cm-map :global(path.cm-leg) {
		stroke: var(--ink-2);
		stroke-opacity: 0.7;
	}
	/* Dark mode: the same treatment as the route map's base image; pins keep their colours. */
	:global(:root[data-theme='dark']) .cm-map :global(.cm-tiles) {
		filter: invert(0.9) hue-rotate(180deg) saturate(0.5) brightness(0.85) contrast(0.92);
	}
	@media (prefers-color-scheme: dark) {
		:global(:root:not([data-theme='light'])) .cm-map :global(.cm-tiles) {
			filter: invert(0.9) hue-rotate(180deg) saturate(0.5) brightness(0.85) contrast(0.92);
		}
	}
	.cm-map :global(.cm-tip) {
		background: var(--surface);
		color: var(--ink);
		border: 1px solid var(--line);
		border-radius: 0.625rem;
		box-shadow: var(--elev-1);
		font-size: 0.75rem;
		font-weight: 500;
		padding: 0.25rem 0.5rem;
	}
	.cm-map :global(.cm-tip.leaflet-tooltip-top::before) {
		border-top-color: var(--surface);
	}

	/* ---------------------------------------------------------------- pins (built in pin-html.ts) */
	.cm-map :global(.cm-host),
	.cm-map :global(.cm-lhost) {
		background: none;
		border: 0;
	}
	.cm-map :global(.cm-pin),
	.cm-map :global(.cm-stack) {
		position: absolute;
		left: 0;
		top: 0;
		translate: -50% -50%;
		display: grid;
		place-items: center;
		width: 1.75rem;
		height: 1.75rem;
		border-radius: 999px;
		padding: 0;
		font-size: 0.875rem;
		line-height: 1;
		cursor: pointer;
		border: 2px solid var(--surface);
		box-shadow: var(--pin-shadow);
		transition:
			scale 0.15s var(--ease-soft),
			box-shadow 0.15s var(--ease-soft);
	}
	/* Touch: a 44 px tap area round every pin and stack, whatever its drawn size. */
	@media (pointer: coarse) {
		.cm-map :global(.cm-pin::before),
		.cm-map :global(.cm-stack::before) {
			content: '';
			position: absolute;
			inset: min(0px, calc((100% - 2.75rem) / 2));
			border-radius: 999px;
		}
	}
	.cm-map :global(.cm-pin:focus-visible),
	.cm-map :global(.cm-stack:focus-visible) {
		outline: 3px solid var(--note);
		outline-offset: 2px;
	}
	.cm-map :global(.cm-pin.is-hot),
	.cm-map :global(.cm-stack.is-hot) {
		scale: 1.22;
		box-shadow:
			0 0 0 3px color-mix(in oklab, var(--cat) 45%, transparent),
			var(--pin-shadow-raised);
	}
	@media (hover: hover) {
		.cm-map :global(.cm-pin:hover),
		.cm-map :global(.cm-stack:hover) {
			scale: 1.22;
			box-shadow:
				0 0 0 3px color-mix(in oklab, var(--cat) 45%, transparent),
				var(--pin-shadow-raised);
		}
	}
	/* Must: solid green, larger, with a ring in the category colour. */
	.cm-map :global(.cm-pin[data-tone='must']) {
		width: 2.125rem;
		height: 2.125rem;
		font-size: 1rem;
		background: var(--must);
		box-shadow:
			0 0 0 2.5px var(--cat),
			var(--pin-shadow);
	}
	/* Maybe: solid but lighter and smaller. */
	.cm-map :global(.cm-pin[data-tone='maybe']) {
		background: color-mix(in oklab, var(--maybe) 70%, var(--surface));
	}
	/* Not rated: outlined in the category colour. */
	.cm-map :global(.cm-pin[data-tone='none']) {
		background: var(--surface);
		border: 2.5px solid var(--cat);
	}
	/* Skipped: smaller and plain, but a crisp ink ring and a strike, so it reads as "skipped", not as a map dot. */
	.cm-map :global(.cm-pin[data-tone='skip']) {
		width: 1.375rem;
		height: 1.375rem;
		font-size: 0.6875rem;
		background: var(--surface);
		border: 1.5px solid var(--ink-2);
		box-shadow: var(--pin-shadow);
	}
	.cm-map :global(.cm-pin[data-tone='skip'] .cm-emoji) {
		filter: grayscale(1);
		opacity: 0.75;
	}
	.cm-map :global(.cm-pin[data-tone='skip']::after) {
		content: '';
		position: absolute;
		left: 50%;
		top: 50%;
		width: 125%;
		height: 2px;
		border-radius: 2px;
		background: var(--ink-2);
		translate: -50% -50%;
		rotate: -45deg;
		box-shadow: 0 0 0 1px var(--surface);
	}
	/* The booked stay: a big filled bed pin with a check badge, always on top. */
	.cm-map :global(.cm-pin[data-tone='booked']) {
		width: 2.625rem;
		height: 2.625rem;
		font-size: 1.25rem;
		background: var(--cat);
		border: 3px solid var(--surface);
		box-shadow:
			0 0 0 2px var(--cat),
			var(--pin-shadow-raised);
	}
	.cm-map :global(.cm-check) {
		position: absolute;
		right: -0.375rem;
		top: -0.375rem;
		display: grid;
		place-items: center;
		width: 1.125rem;
		height: 1.125rem;
		border-radius: 999px;
		background: var(--ok);
		color: var(--surface);
		border: 2px solid var(--surface);
	}
	.cm-map :global(.cm-check svg) {
		width: 0.625rem;
		height: 0.625rem;
	}
	/* Hubs: neutral ink, rounded squares, so they never read as a place. */
	.cm-map :global(.cm-pin[data-tone^='hub']) {
		border-radius: 0.5rem;
		width: 1.875rem;
		height: 1.875rem;
		color: var(--surface);
		background: var(--ink);
		border: 2px solid var(--surface);
	}
	.cm-map :global(.cm-pin[data-tone='hub']) {
		color: var(--ink);
		background: var(--surface);
		border: 2px solid var(--ink-3);
	}
	.cm-map :global(.cm-pin svg.cm-ico) {
		width: 1rem;
		height: 1rem;
	}
	/* A stack: the count on a paper disc with a second disc behind it, like a small pile of cards. */
	.cm-map :global(.cm-stack) {
		width: 2.125rem;
		height: 2.125rem;
		font-size: 0.875rem;
		font-weight: 700;
		font-variant-numeric: tabular-nums;
		color: var(--ink);
		background: var(--surface);
		border: 2px solid var(--ink-2);
		box-shadow:
			3px -3px 0 -1px var(--surface),
			3px -3px 0 1px var(--ink-3),
			var(--pin-shadow);
	}
	/* Beside a booked stay: up and to the left of its pin, clear of its check badge and its label. */
	.cm-map :global(.cm-stack[data-beside]) {
		width: 1.875rem;
		height: 1.875rem;
		font-size: 0.75rem;
		translate: calc(-50% - 1.75rem) calc(-50% - 1.25rem);
	}
	/* Permanent labels: under the pin and centred, shifted (--dx) or flipped above to stay inside the map. */
	.cm-map :global(.cm-label) {
		--pin-r: 0.875rem;
		position: absolute;
		left: 0;
		top: 0;
	}
	.cm-map :global(.cm-label[data-tone^='hub']) {
		--pin-r: 0.9375rem;
	}
	.cm-map :global(.cm-label[data-tone='booked']) {
		--pin-r: 1.5rem;
	}
	.cm-map :global(.cm-tags) {
		position: absolute;
		left: 0;
		top: calc(var(--pin-r) + 0.25rem);
		translate: calc(-50% + var(--dx, 0px)) 0;
		justify-items: center;
		display: grid;
		gap: 0.125rem;
		pointer-events: none;
	}
	.cm-map :global(.cm-label[data-off]) {
		display: none;
	}
	.cm-map :global(.cm-label[data-flip] .cm-tags) {
		top: auto;
		bottom: calc(var(--pin-r) + 0.25rem);
	}
	.cm-map :global(.cm-tag) {
		display: block;
		width: max-content;
		max-width: 12rem;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		border-radius: 999px;
		padding: 0.125rem 0.5rem;
		font-size: 0.75rem;
		font-weight: 600;
		line-height: 1rem;
		text-align: left;
		color: var(--ink);
		background: var(--surface);
		border: 1px solid var(--line);
		box-shadow: var(--elev-0);
	}
	.cm-map :global(.cm-label[data-tone='booked'] .cm-tag) {
		max-width: 18rem;
		color: var(--surface);
		background: var(--ink);
		border-color: var(--ink);
	}
</style>
