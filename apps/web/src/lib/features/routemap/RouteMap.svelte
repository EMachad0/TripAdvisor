<!--
	The route map (old #rmap: initMap, drawBase, zoomTo, drawOverlay, onMapClick): cached OSM base images stitched by
	the server (/route-map/<key>.webp) in an SVG whose viewBox is a rect of world pixels, and over it an SVG overlay
	drawn in screen pixels so pins and labels keep their size at any zoom (overlay.ts). A change of view animates the
	viewBox for 520 ms (labels come back when it ends); a resize refits it.
	- Tap a pin (or Enter / Space on a focused pin) to select its city; a label zooms or selects; tapping the empty
	  map closes the card, or zooms to the nearest country within reach.
	- The selected city's card (CityPopup) sits at the bottom of the map, or at the top when the pin is in the
	  lower half.
-->
<script lang="ts">
	import ChevronLeftIcon from '@lucide/svelte/icons/chevron-left';
	import { untrack } from 'svelte';
	import { lerpView, project, type Rect } from '@atr/shared/routemap';
	import type { LongHaul, RouteFrame } from '@atr/shared/routemodel';
	import { cn } from '#lib/utils.js';
	import CityPopup from './CityPopup.svelte';
	import { WHOLE_TRIP, type CityCard, type Leg, type MapView } from './model.ts';
	import { computeOverlay } from './overlay.ts';
	import { countryAt, targetView } from './view.ts';

	interface Props {
		legs: readonly Leg[];
		longHaul: LongHaul | null;
		frames: Record<string, RouteFrame | null>;
		view: MapView;
		/** Changes on every zoom request (the same view again refits it). */
		zoomSeq: number;
		skipped: boolean;
		sel: string | null;
		card: CityCard | null;
		edit: boolean;
		onselect: (key: string) => void;
		onzoom: (view: MapView) => void;
		onclose: () => void;
		onadd: (key: string) => void;
		onremove: (key: string) => void;
		onopenarea: (area: string) => void;
	}

	let {
		legs,
		longHaul,
		frames,
		view,
		zoomSeq,
		skipped,
		sel,
		card,
		edit,
		onselect,
		onzoom,
		onclose,
		onadd,
		onremove,
		onopenarea,
	}: Props = $props();

	const ZOOM_MS = 520;

	let W = $state(0);
	let H = $state(0);
	let vb = $state<Rect | null>(null);
	let animating = $state(false);
	/** Bumped once the web fonts are in, so labels are measured again. */
	let fontsReady = $state(0);
	let raf = 0;
	let shownView: MapView | null = null;
	let shownSeq = 0;

	const reduced = (): boolean => matchMedia('(prefers-reduced-motion: reduce)').matches;

	// The viewBox follows the view (animated) and the map's size (at once). Edits do not refit it, as before.
	$effect(() => {
		const v = view;
		const seq = zoomSeq;
		const w = W;
		const h = H;
		untrack(() => {
			const to = targetView(legs, v, skipped, w, h);
			if (to === null) return;
			const from = vb;
			const changed = shownView !== null && (shownView !== v || shownSeq !== seq);
			shownView = v;
			shownSeq = seq;
			cancelAnimationFrame(raf);
			if (!changed || from === null || reduced()) {
				vb = to;
				animating = false;
				return;
			}
			animating = true;
			const t0 = performance.now();
			const step = (now: number): void => {
				const t = Math.min(1, (now - t0) / ZOOM_MS);
				vb = lerpView(from, to, t);
				if (t < 1) raf = requestAnimationFrame(step);
				else animating = false;
			};
			raf = requestAnimationFrame(step);
		});
	});
	$effect(() => () => {
		cancelAnimationFrame(raf);
	});
	$effect(() => {
		void document.fonts.ready.then(() => {
			fontsReady++;
		});
	});

	// ---------------------------------------------------------------- base images

	let loaded = $state<Record<string, boolean>>({});
	let failed = $state<Record<string, boolean>>({});
	const want = $derived(
		['overview', ...(view !== WHOLE_TRIP ? [view] : [])].flatMap((k) => {
			const f = frames[k];
			return f ? [{ key: k, ...f }] : [];
		}),
	);
	const shown = $derived(want.filter((f) => failed[f.url] !== true));
	const overview = $derived(frames['overview'] ?? null);
	const bare = $derived(overview === null || failed[overview.url] === true);
	const waiting = $derived(!bare && overview !== null && loaded[overview.url] !== true);
	/**
	 * Where the map is wider or taller than the overview image (the monitor), its edges fade into the map's own
	 * background instead of ending on a hard line.
	 */
	const feather = $derived.by(() => {
		const f = shown.find((x) => x.key === 'overview');
		if (!f || vb === null) return null;
		const r = f.rect;
		const out = vb.x < r.x || vb.y < r.y || vb.x + vb.w > r.x + r.w || vb.y + vb.h > r.y + r.h;
		return out ? { rect: r, edge: Math.min(r.w, r.h) * 0.06 } : null;
	});

	// ---------------------------------------------------------------- overlay

	let measure: CanvasRenderingContext2D | null = null;
	const textW = (s: string, font: string): number => {
		measure ??= document.createElement('canvas').getContext('2d');
		if (measure === null) return s.length * 7;
		measure.font = font;
		return measure.measureText(s).width;
	};
	let sans = '';
	const sansFont = (): string => {
		if (sans === '')
			sans =
				getComputedStyle(document.documentElement).getPropertyValue('--font-sans').trim() ||
				'system-ui, sans-serif';
		return sans;
	};

	const overlay = $derived.by(() => {
		// fontsReady < 0 never holds: reading it re-measures the labels once the web fonts are in
		if (fontsReady < 0 || vb === null || W === 0 || H === 0) return null;
		return computeOverlay({
			legs,
			longHaul,
			view,
			skipped,
			sel,
			W,
			H,
			vb,
			labels: !animating,
			textW,
			sans: sansFont(),
		});
	});

	/** The card goes to the top of the map when the selected pin is in the lower half. */
	const popTop = $derived.by(() => {
		const lat = card?.lat ?? null;
		const lng = card?.lng ?? null;
		if (lat === null || lng === null || vb === null || W === 0) return false;
		const y = (project(lat, lng).y - vb.y) * (W / vb.w);
		return y > H * 0.5;
	});

	/** Clicks and keys on the overlay, delegated like the old onMapClick (pins and labels carry data attributes). */
	function overlayEvents(svg: SVGSVGElement): () => void {
		const onClick = (e: MouseEvent): void => {
			const t = e.target instanceof Element ? e.target : null;
			const city = t?.closest('[data-city]')?.getAttribute('data-city');
			if (city) {
				onselect(city);
				return;
			}
			const zoom = t?.closest('[data-zoom]')?.getAttribute('data-zoom');
			if (zoom) {
				onzoom(zoom);
				return;
			}
			if (sel !== null) {
				onclose();
				return;
			}
			if (vb === null) return;
			// tapping a country: the country of the nearest city (within reach) that isn't the one already shown
			const r = svg.getBoundingClientRect();
			const best = countryAt(legs, vb, W, e.clientX - r.left, e.clientY - r.top, view);
			if (best !== null) onzoom(best);
		};
		const onKey = (e: KeyboardEvent): void => {
			if (e.key !== 'Enter' && e.key !== ' ') return;
			const city =
				e.target instanceof Element
					? e.target.closest('[data-city]')?.getAttribute('data-city')
					: null;
			if (!city) return;
			e.preventDefault();
			onselect(city);
		};
		svg.addEventListener('click', onClick);
		svg.addEventListener('keydown', onKey);
		return () => {
			svg.removeEventListener('click', onClick);
			svg.removeEventListener('keydown', onKey);
		};
	}

	const f1 = (n: number): number => Math.round(n * 10) / 10;
</script>

<div
	class="map-box relative overflow-hidden rounded-2xl border border-border/80 bg-cool shadow-soft select-none max-md:-mx-2 3xl:rounded-3xl"
	bind:clientWidth={W}
	bind:clientHeight={H}
	data-route-map
	data-view={view}
	data-ready={vb !== null && overlay !== null ? '' : undefined}
	data-bare={bare ? '' : undefined}
	data-animating={animating ? '' : undefined}
>
	{#if vb !== null}
		<svg
			class="absolute inset-0 block size-full"
			viewBox="{vb.x} {vb.y} {vb.w} {vb.h}"
			preserveAspectRatio="none"
			aria-hidden="true"
		>
			<defs>
				<linearGradient id="feather-l" x1="0" x2="1" y1="0" y2="0">
					<stop offset="0" class="feather" />
					<stop offset="1" class="feather" stop-opacity="0" />
				</linearGradient>
				<linearGradient id="feather-r" x1="1" x2="0" y1="0" y2="0">
					<stop offset="0" class="feather" />
					<stop offset="1" class="feather" stop-opacity="0" />
				</linearGradient>
				<linearGradient id="feather-t" x1="0" x2="0" y1="0" y2="1">
					<stop offset="0" class="feather" />
					<stop offset="1" class="feather" stop-opacity="0" />
				</linearGradient>
				<linearGradient id="feather-b" x1="0" x2="0" y1="1" y2="0">
					<stop offset="0" class="feather" />
					<stop offset="1" class="feather" stop-opacity="0" />
				</linearGradient>
			</defs>
			{#each shown as f (f.key)}
				<image
					href={f.url}
					x={f.rect.x}
					y={f.rect.y}
					width={f.rect.w}
					height={f.rect.h}
					preserveAspectRatio="none"
					class={cn('map-img', loaded[f.url] === true && 'is-in')}
					data-frame={f.key}
					onload={() => {
						loaded[f.url] = true;
					}}
					onerror={() => {
						failed[f.url] = true;
					}}
				/>
			{/each}
			{#if feather}
				{@const r = feather.rect}
				{@const e = feather.edge}
				<g aria-hidden="true">
					<rect x={r.x} y={r.y} width={e} height={r.h} fill="url(#feather-l)" />
					<rect x={r.x + r.w - e} y={r.y} width={e} height={r.h} fill="url(#feather-r)" />
					<rect x={r.x} y={r.y} width={r.w} height={e} fill="url(#feather-t)" />
					<rect x={r.x} y={r.y + r.h - e} width={r.w} height={e} fill="url(#feather-b)" />
				</g>
			{/if}
		</svg>
	{/if}
	<svg
		class="absolute inset-0 block size-full"
		viewBox="0 0 {W || 1} {H || 1}"
		role="img"
		aria-label={overlay?.aria ?? 'Map of the route'}
		data-route-overlay
		{@attach overlayEvents}
	>
		{#if overlay}
			<g>
				{#each overlay.lines as l (l.id)}
					{#if l.kind === 'long'}
						<defs>
							<linearGradient
								id="lhc-{l.id}"
								gradientUnits="userSpaceOnUse"
								x1={f1(l.near.x)}
								y1={f1(l.near.y)}
								x2={f1(l.far.x)}
								y2={f1(l.far.y)}
							>
								<stop offset="0" class="fade-case" />
								<stop offset="0.4" class="fade-case" stop-opacity="0.85" />
								<stop offset="1" class="fade-case" stop-opacity="0" />
							</linearGradient>
							<linearGradient
								id="lhl-{l.id}"
								gradientUnits="userSpaceOnUse"
								x1={f1(l.near.x)}
								y1={f1(l.near.y)}
								x2={f1(l.far.x)}
								y2={f1(l.far.y)}
							>
								<stop offset="0" class="fade-long" />
								<stop offset="0.4" class="fade-long" stop-opacity="0.85" />
								<stop offset="1" class="fade-long" stop-opacity="0" />
							</linearGradient>
						</defs>
						<path d={l.d} class="case-long" stroke="url(#lhc-{l.id})" />
						<path d={l.d} class="long" stroke="url(#lhl-{l.id})" data-long={l.id} />
						<path d={l.head} class={cn('long-head', l.id === 'out' && 'long-head-out')} />
					{:else if l.kind === 'hop'}
						<path d={l.d} class="case case-hop" />
						<path d={l.d} class="hop" data-hop={l.id} />
						<path d={l.head} class="hop-head" />
					{:else}
						<path d={l.d} class="case" />
						<path d={l.d} class="land" data-land={l.id} />
					{/if}
				{/each}
			</g>
			<g>
				{#each overlay.pins as p (p.key)}
					<g
						class="city"
						data-city={p.key}
						data-pin={p.kind}
						data-sel={p.sel ? '' : undefined}
						tabindex="0"
						role="button"
						aria-label={p.label}
						aria-pressed={p.sel}
					>
						{#if p.sel}<circle cx={f1(p.x)} cy={f1(p.y)} r={p.r + 7} class="halo" />{/if}
						<circle cx={f1(p.x)} cy={f1(p.y)} r={p.r} class="pin-{p.kind}" />
						{#if p.kind === 'stop'}
							<text
								x={f1(p.x)}
								y={f1(p.y)}
								class={cn('pin-n', (p.fontSize ?? 11) < 11 && 'pin-n-sm')}>{p.n}</text
							>
						{/if}
						<circle cx={f1(p.x)} cy={f1(p.y)} r="22" class="hit" />
					</g>
				{/each}
			</g>
			<g>
				{#each overlay.labels as it (it.id)}
					<g
						class={cn('lab', `lab-${it.kind}`, it.sel && 'is-sel')}
						data-zoom={it.zoom ?? undefined}
						data-city={it.city ?? undefined}
						data-label={it.kind}
					>
						{#if it.lead}
							<path d="M{it.lead.x1} {it.lead.y1}L{it.lead.x2} {it.lead.y2}" class="leader" />
						{/if}
						{#if it.kind === 'maybe' || it.kind === 'skip'}
							<text x={it.textX} y={it.textY}>{it.name}</text>
						{:else}
							<rect
								x={f1(it.box.x)}
								y={f1(it.box.y)}
								width={f1(it.box.w)}
								height={it.box.h}
								rx={it.box.h / 2}
							/>
							<text x={it.textX} y={it.textY}
								>{it.name}{#if it.sub}<tspan x={it.subX} class="lab-sub">{it.sub}</tspan>{/if}</text
							>
						{/if}
					</g>
				{/each}
				{#each overlay.fixed as fx (fx.id)}
					<g class="lab lab-long" data-label="long">
						<rect
							x={f1(fx.box.x)}
							y={f1(fx.box.y)}
							width={f1(fx.box.w)}
							height={fx.box.h}
							rx="10"
						/>
						<text x={f1(fx.box.x + 11)} y={f1(fx.box.y + 14)}>{fx.lines[0]}</text>
						<text x={f1(fx.box.x + 11)} y={f1(fx.box.y + 27)} class="lab-sub">{fx.lines[1]}</text>
					</g>
				{/each}
			</g>
		{/if}
	</svg>

	<span
		class={cn(
			'pointer-events-none absolute top-3.5 left-1/2 -translate-x-1/2 rounded-full border border-border bg-card/90 px-3 py-1.5 text-xs font-semibold text-muted-foreground opacity-0 shadow-soft backdrop-blur-md transition-opacity',
			waiting && 'opacity-100',
		)}
		aria-hidden="true"
		data-map-wait>Drawing the map…</span
	>
	{#if view !== WHOLE_TRIP}
		<button
			type="button"
			class="absolute top-3 left-3 z-10 inline-flex min-h-10 items-center gap-1 rounded-full border border-border bg-card/90 py-0 pr-4 pl-2.5 text-sm font-semibold text-foreground shadow-soft backdrop-blur-md transition-transform focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-note active:scale-97 pointer-coarse:min-h-11"
			data-map-back
			onclick={() => {
				onzoom(WHOLE_TRIP);
			}}><ChevronLeftIcon class="size-4" />Whole trip</button
		>
	{/if}
	<span
		class="absolute right-0 bottom-0 z-2 rounded-tl-xl bg-card/80 px-2 py-0.5 text-2xs text-muted-foreground backdrop-blur-sm"
		>© <a
			href="https://www.openstreetmap.org/copyright"
			target="_blank"
			rel="noopener noreferrer"
			class="text-inherit underline">OpenStreetMap</a
		> contributors</span
	>
	{#if card}
		<CityPopup {card} {edit} top={popTop} {onclose} {onadd} {onremove} {onopenarea} />
	{/if}
</div>

<style>
	.map-box {
		--rt-line: var(--cat);
		--rt-case: color-mix(in oklab, var(--surface) 88%, transparent);
		--rt-long: var(--note);
		/* phone: a tall map, most of the screen (the route runs north to south) */
		height: clamp(340px, min(140vw, 64svh), 640px);
		touch-action: manipulation;
	}
	/* Fold inner screen: the head, the chips and the map fill the first screen; the legs follow. */
	@media (min-width: 44rem) {
		.map-box {
			height: clamp(360px, calc(100svh - 18rem), 720px);
		}
	}
	/* laptop and monitor: the map fills the column (RouteView makes the page one window high) */
	@media (min-width: 80rem) {
		.map-box {
			height: clamp(420px, calc(100svh - 300px), 780px);
		}
	}
	@media (min-width: 80rem) and (min-height: 50rem) {
		.map-box {
			flex: 1;
			height: auto;
			min-height: 0;
		}
	}
	.feather {
		stop-color: var(--cool);
	}
	:global(:root[data-theme='dark']) .map-box {
		--rt-case: color-mix(in oklab, black 62%, transparent);
	}
	@media (prefers-color-scheme: dark) {
		:global(:root:not([data-theme='light'])) .map-box {
			--rt-case: color-mix(in oklab, black 62%, transparent);
		}
	}
	.map-img {
		opacity: 0;
		transition: opacity 0.35s;
	}
	.map-img.is-in {
		opacity: 1;
	}
	:global(:root[data-theme='dark']) .map-img {
		filter: invert(0.9) hue-rotate(180deg) saturate(0.5) brightness(0.85) contrast(0.92);
	}
	@media (prefers-color-scheme: dark) {
		:global(:root:not([data-theme='light'])) .map-img {
			filter: invert(0.9) hue-rotate(180deg) saturate(0.5) brightness(0.85) contrast(0.92);
		}
	}

	.case,
	.case-long {
		fill: none;
		stroke-width: 7.5;
		stroke-linecap: round;
		stroke-linejoin: round;
	}
	.case {
		stroke: var(--rt-case);
	}
	.case-hop {
		stroke-width: 6;
	}
	.case-long {
		stroke-width: 5.5;
	}
	.land {
		fill: none;
		stroke: var(--rt-line);
		stroke-width: 3.5;
		stroke-linecap: round;
		stroke-linejoin: round;
	}
	.hop {
		fill: none;
		stroke: var(--rt-line);
		stroke-width: 2.6;
		stroke-dasharray: 8 6;
		stroke-linecap: round;
	}
	.hop-head {
		fill: none;
		stroke: var(--rt-line);
		stroke-width: 2.6;
		stroke-linecap: round;
		stroke-linejoin: round;
	}
	.long {
		fill: none;
		stroke-width: 2.4;
		stroke-dasharray: 1 6;
		stroke-linecap: round;
	}
	.long-head {
		fill: none;
		stroke: var(--rt-long);
		stroke-width: 2.4;
		stroke-linecap: round;
		stroke-linejoin: round;
	}
	.long-head-out {
		stroke-opacity: 0.8;
	}
	.fade-long {
		stop-color: var(--rt-long);
	}
	.fade-case {
		stop-color: var(--rt-case);
	}
	.city {
		cursor: pointer;
		outline: none;
	}
	.hit {
		fill: transparent;
		pointer-events: all;
	}
	.city:focus-visible .hit {
		stroke: var(--note);
		stroke-width: 2;
	}
	.halo {
		fill: color-mix(in oklab, var(--cat) 28%, transparent);
		stroke: var(--cat);
		stroke-width: 1.5;
	}
	.pin-stop {
		fill: var(--cat);
		stroke: var(--surface);
		stroke-width: 2.5;
		filter: drop-shadow(0 2px 3px rgb(0 0 0 / 0.35));
	}
	.pin-n {
		fill: var(--surface);
		font: 700 11px/1 var(--font-sans);
		text-anchor: middle;
		dominant-baseline: central;
		pointer-events: none;
	}
	.pin-n-sm {
		font-size: 9.5px;
	}
	.pin-must {
		fill: var(--surface);
		stroke: var(--cat);
		stroke-width: 2.2;
		stroke-dasharray: 3 2.2;
	}
	.pin-maybe {
		fill: color-mix(in oklab, var(--ink-3) 70%, var(--surface));
		stroke: var(--surface);
		stroke-width: 1.5;
	}
	.pin-skip {
		fill: var(--ink-3);
		opacity: 0.45;
	}
	.leader {
		stroke: var(--ink-3);
		stroke-width: 1.2;
	}
	.lab {
		cursor: pointer;
	}
	.lab text {
		font: 600 12.5px/1 var(--font-sans);
		fill: var(--ink);
	}
	.lab rect {
		fill: color-mix(in oklab, var(--surface) 93%, transparent);
		stroke: var(--line);
		stroke-width: 1;
	}
	.lab .lab-sub {
		font: 500 11px/1 var(--font-sans);
		fill: var(--ink-3);
	}
	.lab-stop rect {
		stroke: color-mix(in oklab, var(--cat) 45%, var(--line));
	}
	.lab.is-sel rect {
		stroke: var(--cat);
		stroke-width: 2;
	}
	.lab-must text {
		font: 600 12px/1 var(--font-sans);
		fill: var(--ink-2);
	}
	.lab-must rect {
		stroke: var(--cat);
		stroke-dasharray: 3 2.5;
	}
	.lab-must .lab-sub {
		font: italic 500 10.5px/1 var(--font-sans);
	}
	.lab-maybe text,
	.lab-skip text {
		font: 500 11.5px/1 var(--font-sans);
		fill: var(--ink-2);
		stroke: color-mix(in oklab, var(--surface) 85%, transparent);
		stroke-width: 3.5px;
		stroke-linejoin: round;
		paint-order: stroke;
	}
	.lab-skip text {
		font-size: 11px;
		fill: var(--ink-3);
	}
	.lab-leg rect {
		fill: var(--ink);
		stroke: none;
	}
	.lab-leg text {
		font: 700 11px/1 var(--font-sans);
		fill: var(--bg);
	}
	.lab-leg .lab-sub {
		font: 500 10.5px/1 var(--font-sans);
		fill: var(--bg);
		opacity: 0.75;
	}
	.lab-hop {
		cursor: default;
	}
	.lab-hop rect {
		fill: color-mix(in oklab, var(--surface) 90%, transparent);
		stroke: none;
	}
	.lab-hop text {
		font: 600 10.5px/1 var(--font-sans);
		fill: var(--cat);
	}
	.lab-long {
		cursor: default;
	}
	.lab-long rect {
		fill: color-mix(in oklab, var(--surface) 94%, transparent);
		stroke: color-mix(in oklab, var(--note) 45%, var(--line));
	}
	.lab-long text {
		font: 600 12px/1 var(--font-sans);
		fill: var(--note);
	}
	.lab-long .lab-sub {
		font: 500 11px/1 var(--font-sans);
		fill: var(--ink-3);
	}
</style>
