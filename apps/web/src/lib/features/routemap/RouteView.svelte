<!--
	The Route tab (port of game/public/game.js viewRoute and its helpers): the map of the whole trip with one chip per
	country leg, and per leg the ordered stops the traveler builds. The page opens read only; "Edit route" shows the
	reorder, remove, add, nights and Reset controls. Each edit redraws at once and the whole list for that country is
	saved through write.ts after a 600 ms pause (RouteEditor). The guest sees everything with editing disabled.
	Layout: on a phone the map comes first with the zoom chips under it (thumb reach), then the legs; on the Fold's
	inner screen the chips sit above a map sized to the first screen and the legs follow in two columns; from xl the
	page fills the window, the map takes the room left of a plan pane that scrolls on its own (two columns of legs
	on the monitor).
-->
<script lang="ts">
	import CheckIcon from '@lucide/svelte/icons/check';
	import PencilIcon from '@lucide/svelte/icons/pencil';
	import PlaneIcon from '@lucide/svelte/icons/plane';
	import RouteIcon from '@lucide/svelte/icons/route';
	import { onDestroy, tick } from 'svelte';
	import { toast } from 'svelte-sonner';
	import PlaceSheet from '#lib/components/shared/PlaceSheet.svelte';
	import type { SheetTarget } from '#lib/components/shared/PlaceSheet.types.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Empty from '#lib/components/ui/empty/index.js';
	import { getAppData } from '#lib/content/app-data.svelte.js';
	import { GUEST_MESSAGE } from '#lib/sync/write.js';
	import { cn } from '#lib/utils.js';
	import { RouteEditor } from './editor.svelte.ts';
	import LegCard from './LegCard.svelte';
	import RouteMap from './RouteMap.svelte';
	import {
		WHOLE_TRIP,
		added,
		cityCard,
		eyebrow,
		fmtDate,
		fmtWeek,
		moved,
		removed,
		routeLegs,
		routeTotals,
		withNights,
		type MapView,
	} from './model.ts';

	const app = getAppData();
	/** A separator that keeps its spaces at the start of an {#if} block (Svelte trims literal ones there). */
	const SEP = ' · ';
	const editor = new RouteEditor();

	const countries = $derived(editor.apply(app.route.countries));
	const legs = $derived(routeLegs(countries));
	const totals = $derived(routeTotals(legs));

	let chosenView = $state<MapView>(WHOLE_TRIP);
	/** Bumped on every zoom request, so asking for the view already shown refits it (old zoomTo). */
	let zoomSeq = $state(0);
	/** A country view that no longer exists falls back to the whole trip. */
	const view = $derived(
		chosenView !== WHOLE_TRIP && countries.some((c) => c.id === chosenView)
			? chosenView
			: WHOLE_TRIP,
	);
	let sel = $state<string | null>(null);
	let skipped = $state(false);
	let editing = $state(false);
	const edit = $derived(editing && !app.isGuest);
	let sheet = $state<SheetTarget | null>(null);
	const card = $derived(sel === null ? null : cityCard(legs, sel));

	let chipsEl = $state<HTMLElement | null>(null);
	let mapColEl = $state<HTMLElement | null>(null);
	let planEl = $state<HTMLElement | null>(null);

	const reduced = (): boolean => matchMedia('(prefers-reduced-motion: reduce)').matches;
	const behavior = (): ScrollBehavior => (reduced() ? 'auto' : 'smooth');

	// The selected city left the route model (a reset, new content): close its card.
	$effect(() => {
		if (sel !== null && card === null) sel = null;
	});

	function zoomTo(next: MapView): void {
		const v = next !== WHOLE_TRIP && !countries.some((c) => c.id === next) ? WHOLE_TRIP : next;
		chosenView = v;
		zoomSeq++;
		void tick().then(() => {
			const chip = chipsEl?.querySelector<HTMLElement>(`[data-zoom="${v}"]`);
			if (chipsEl && chip)
				chipsEl.scrollTo({
					left: chip.offsetLeft - (chipsEl.clientWidth - chip.offsetWidth) / 2,
					behavior: behavior(),
				});
			// laptop and monitor: the map fills the screen and the plan pane scrolls to that country's card
			if (v !== WHOLE_TRIP && matchMedia('(min-width: 80rem)').matches)
				planEl
					?.querySelector(`[data-leg="${v}"]`)
					?.scrollIntoView({ block: 'nearest', behavior: behavior() });
		});
	}

	function closePop(): void {
		sel = null;
	}

	function selectCity(key: string, opts: { zoom?: boolean; scroll?: boolean } = {}): void {
		sel = key;
		const [cid] = key.split('/');
		if (opts.zoom === true && cid !== undefined && view !== cid) zoomTo(cid);
		if (opts.scroll === true) mapColEl?.scrollIntoView({ block: 'nearest', behavior: behavior() });
	}

	// ---------------------------------------------------------------- edits

	const legOf = (cid: string) => countries.find((c) => c.id === cid);

	/** After an edit, focus `focus` inside the leg card (or `fallback`, else the leg's title), as the old rerenderLeg. */
	async function refocus(cid: string, focus?: string, fallback?: string): Promise<void> {
		if (focus === undefined && fallback === undefined) return;
		await tick();
		const root = planEl?.querySelector<HTMLElement>(`[data-leg="${cid}"]`);
		if (!root) return;
		const pick = (s: string | undefined): HTMLElement | null =>
			s === undefined ? null : root.querySelector<HTMLElement>(s);
		const el = pick(focus) ?? pick(fallback);
		if (el && !(el instanceof HTMLButtonElement && el.disabled)) el.focus({ preventScroll: true });
		else root.querySelector<HTMLElement>('[data-leg-title]')?.focus({ preventScroll: true });
	}

	function setNights(cid: string, i: number, n: number | null): boolean {
		const c = legOf(cid);
		if (!c) return false;
		const next = withNights(c.stops, i, n);
		if (next === null) return false;
		editor.edits.edit(c, next);
		return true;
	}

	function moveStop(cid: string, i: number, d: number): void {
		const c = legOf(cid);
		if (!c) return;
		const next = moved(c.stops, i, d);
		if (next === null) return;
		editor.edits.edit(c, next);
		const j = i + d;
		void refocus(
			cid,
			`[data-stop-i="${String(j)}"] [data-move="${String(d)}"]`,
			`[data-stop-i="${String(j)}"] [data-move="${String(-d)}"]`,
		);
	}

	function removeStop(cid: string, i: number): void {
		const c = legOf(cid);
		const gone = c?.stops[i];
		if (!c || gone === undefined) return;
		const next = removed(c.stops, i);
		if (next === null) return;
		editor.edits.edit(c, next);
		void refocus(
			cid,
			`[data-stop-i="${String(Math.min(i, next.length - 1))}"] [data-remove]`,
			'[data-add]',
		);
		toast(`${gone.name} is off the route`);
	}

	function addStop(cid: string, area: string): void {
		const c = legOf(cid);
		if (!c) return;
		const next = added(c, c.stops, area);
		if (next === null) return;
		editor.edits.edit(c, next);
		void refocus(cid, `[data-stop-i="${String(next.length - 1)}"] [data-nights-input]`);
	}

	function resetLeg(cid: string): void {
		const c = legOf(cid);
		if (c) void editor.edits.reset(c);
	}

	function toggleEdit(): void {
		if (app.isGuest) {
			toast.error(GUEST_MESSAGE);
			return;
		}
		editing = !editing;
		editor.edits.flush();
	}

	function popAdd(key: string): void {
		const [cid, area] = key.split('/');
		if (cid !== undefined && area !== undefined) addStop(cid, area);
	}
	function popRemove(key: string): void {
		const [cid, area] = key.split('/');
		const c = cid === undefined ? undefined : legOf(cid);
		if (c && cid !== undefined)
			removeStop(
				cid,
				c.stops.findIndex((s) => s.area === area),
			);
	}

	// Leaving the page or the tab: save what is waiting now (old flushRouteSaves on pagehide and route change).
	$effect(() => {
		const flush = (): void => {
			editor.edits.flush();
		};
		window.addEventListener('pagehide', flush);
		return () => {
			window.removeEventListener('pagehide', flush);
		};
	});
	onDestroy(() => {
		editor.edits.flush();
	});

	function onKeydown(e: KeyboardEvent): void {
		if (e.key !== 'Escape' || sel === null || sheet !== null) return;
		const t = e.target;
		if (t instanceof Element && t.closest('input, textarea, select, [contenteditable]')) return;
		if (e.metaKey || e.ctrlKey || e.altKey) return;
		e.preventDefault();
		closePop();
	}

	const all = $derived(app.route.countries);
	const lh = $derived(app.route.longHaul);
	const warnings = $derived(app.route.warnings);
</script>

<svelte:window onkeydown={onKeydown} />

<section class="route flex flex-col" data-route-view data-edit={edit ? '' : undefined}>
	<header class="mb-4 md:mb-5 3xl:mb-6">
		<p class="mb-1 eyebrow nums" data-route-eyebrow>{eyebrow(all)}</p>
		<div class="flex flex-wrap items-center gap-x-5 gap-y-2">
			<h1
				class="mr-auto font-serif text-3xl leading-none font-semibold tracking-tight md:text-4xl 3xl:text-5xl"
			>
				Route
			</h1>
			<p
				class="order-3 basis-full text-sm text-muted-foreground md:text-base xl:order-2 xl:basis-auto"
				data-route-sum
				aria-live="polite"
			>
				<b class="font-serif text-lg font-semibold text-foreground nums md:text-xl"
					>{totals.placed}</b
				>
				{totals.placed === 1 ? 'stop' : 'stops'} in order{#if totals.unplaced}{SEP}<b
						class="font-serif text-lg font-semibold text-cat nums md:text-xl">{totals.unplaced}</b
					>
					must {totals.unplaced === 1 ? 'city' : 'cities'} not placed{/if}
			</p>
			<Button
				variant={edit ? 'default' : 'outline'}
				size="lg"
				class="order-2 shrink-0 xl:order-3 pointer-coarse:h-11"
				aria-pressed={edit}
				disabled={app.isGuest}
				title={app.isGuest ? GUEST_MESSAGE : undefined}
				onclick={toggleEdit}
				data-edit-route
			>
				{#if edit}<CheckIcon />Done editing{:else}<PencilIcon />Edit route{/if}
			</Button>
		</div>
	</header>

	{#if all.length === 0}
		<Empty.Root>
			<Empty.Header>
				<Empty.Title>No legs yet</Empty.Title>
				<Empty.Description>
					The trip has no country legs in config/trip.yaml, so there is no route to draw.
				</Empty.Description>
			</Empty.Header>
		</Empty.Root>
	{:else}
		<div class="route-body flex flex-col gap-6 xl:flex-row xl:gap-6 3xl:gap-8">
			<div class="flex min-w-0 scroll-mt-4 flex-col gap-3 xl:flex-1" bind:this={mapColEl}>
				<nav
					aria-label="Zoom the map"
					class="chips order-2 -mx-4 no-scrollbar flex snap-x scroll-px-4 gap-2 overflow-x-auto px-4 py-0.5 md:order-1 md:mx-0 md:scroll-px-0 md:px-0"
					bind:this={chipsEl}
					data-route-chips
				>
					<button
						type="button"
						data-zoom={WHOLE_TRIP}
						aria-pressed={view === WHOLE_TRIP}
						class={cn(
							'chip shrink-0 snap-start px-4 text-sm font-semibold',
							view === WHOLE_TRIP && 'is-on',
						)}
						onclick={() => {
							closePop();
							zoomTo(WHOLE_TRIP);
						}}><RouteIcon class="size-4" />Whole trip</button
					>
					{#each all as c (c.id)}
						{@const on = view === c.id}
						<button
							type="button"
							data-zoom={c.id}
							aria-pressed={on}
							class={cn('chip shrink-0 snap-start gap-2.5 pr-4 pl-1.5', on && 'is-on')}
							onclick={() => {
								closePop();
								zoomTo(c.id);
							}}
						>
							<span
								class={cn(
									'grid size-8 place-items-center rounded-full bg-cat/12 font-serif text-sm font-semibold text-cat nums',
									on && 'bg-background/15 text-background',
								)}>{c.n}</span
							>
							<span class="grid text-left">
								<b class="text-sm leading-tight font-semibold whitespace-nowrap"
									>{c.flag}
									{c.name}</b
								>
								<small
									class={cn(
										'text-xs leading-tight whitespace-nowrap text-muted-foreground nums',
										on && 'text-background/70',
									)}>{fmtDate(c.from)} – {fmtDate(c.to)} · {c.nights}n</small
								>
							</span>
						</button>
					{/each}
				</nav>

				<div class="route-map-wrap order-1 flex flex-col md:order-2">
					<RouteMap
						{legs}
						longHaul={lh}
						frames={app.route.frames}
						{view}
						{zoomSeq}
						{skipped}
						{sel}
						{card}
						{edit}
						onselect={(key: string) => {
							selectCity(key);
						}}
						onzoom={(v: MapView) => {
							closePop();
							zoomTo(v);
						}}
						onclose={closePop}
						onadd={popAdd}
						onremove={popRemove}
						onopenarea={(area: string) => {
							sheet = { kind: 'area', id: area };
						}}
					/>
				</div>

				<ul
					class="order-3 flex flex-wrap items-center gap-x-4 gap-y-1 px-1 text-xs text-muted-foreground md:text-sm"
					data-route-legend
				>
					<li class="inline-flex items-center gap-1.5">
						<svg viewBox="0 0 28 10" class="h-2.5 w-7 overflow-visible" aria-hidden="true"
							><path d="M2 5h24" class="legend-land" /></svg
						>Overland
					</li>
					<li class="inline-flex items-center gap-1.5">
						<svg viewBox="0 0 28 10" class="h-2.5 w-7 overflow-visible" aria-hidden="true"
							><path d="M2 5h24" class="legend-hop" /></svg
						>Flight between countries
					</li>
					<li class="inline-flex items-center gap-1.5">
						<svg viewBox="0 0 16 16" class="size-4 overflow-visible" aria-hidden="true"
							><circle cx="8" cy="8" r="5.5" class="legend-must" /></svg
						>Must, not placed yet
					</li>
					<li class="inline-flex items-center gap-1.5">
						<svg viewBox="0 0 16 16" class="size-4 overflow-visible" aria-hidden="true"
							><circle cx="8" cy="8" r="4" class="legend-maybe" /></svg
						>Maybe
					</li>
					<li class="ml-auto">
						<label
							class="inline-flex min-h-8 cursor-pointer items-center gap-2 rounded-full px-1 font-medium text-foreground pointer-coarse:min-h-11"
						>
							<input
								type="checkbox"
								class="size-4 accent-cat"
								bind:checked={skipped}
								data-show-skipped
							/>
							Show skipped
						</label>
					</li>
				</ul>
			</div>

			<div class="route-plan min-w-0 xl:w-100 3xl:w-208" bind:this={planEl} data-route-plan>
				{#if edit}
					<p
						class="mb-3 flex items-start gap-2 rounded-xl bg-cat/10 px-3.5 py-2.5 text-sm text-foreground"
						data-edit-hint
					>
						<PencilIcon class="mt-0.5 size-4 shrink-0 text-cat" />
						<span
							>Editing: changes save as you make them. Reset puts a country back to the agreed plan.</span
						>
					</p>
				{/if}
				<div class={cn('gap-4 xl:columns-1 3xl:columns-2', !edit && 'md:columns-2')}>
					{#each legs as l (l.c.id)}
						<div class="mb-4 break-inside-avoid">
							<LegCard
								leg={l}
								on={view === l.c.id}
								{edit}
								onzoom={(cid: string) => {
									closePop();
									zoomTo(cid);
								}}
								oncity={(key: string) => {
									const [cid] = key.split('/');
									selectCity(key, { zoom: view !== cid, scroll: true });
								}}
								onnights={setNights}
								onmove={moveStop}
								onremove={removeStop}
								onadd={addStop}
								onreset={resetLeg}
							/>
						</div>
					{/each}
				</div>
				{#if lh !== null || warnings.length > 0}
					<div
						class="grid gap-2 px-1 pb-1 text-xs/relaxed text-muted-foreground md:text-sm/relaxed"
					>
						{#if lh}
							<p class="flex items-start gap-2" data-route-fine>
								<PlaneIcon class="mt-0.5 size-3.5 shrink-0 text-note md:mt-1" />
								<span
									>Flights: in from {lh.in.from} (lands {fmtWeek(lh.in.date)}) and home to {lh.out
										.to} around
									{fmtWeek(lh.out.date)}{lh.out.booked ? '' : ' (not booked)'}. Flights between
									countries fall on the leg boundary dates. Lines join stops in the order you set;
									nothing else is assumed.</span
								>
							</p>
						{/if}
						{#if warnings.length > 0}
							<p class="text-warn" data-route-warnings>
								{#each warnings as w, i (i)}{#if i > 0}<br />{/if}{w}{/each}
							</p>
						{/if}
					</div>
				{/if}
			</div>
		</div>
	{/if}
</section>

<PlaceSheet
	target={sheet}
	onclose={() => {
		sheet = null;
	}}
/>

<style>
	/* Zoom chips: pills with the leg number in a disc; the one on the map is filled with ink. */
	.chip {
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		min-height: 2.75rem;
		border-radius: 999px;
		border: 1px solid color-mix(in oklch, var(--line) 80%, transparent);
		background: var(--card);
		box-shadow: var(--elev-0);
		transition:
			background-color 0.2s var(--ease-soft),
			border-color 0.2s var(--ease-soft),
			color 0.2s var(--ease-soft);
	}
	@media (hover: hover) {
		.chip:hover {
			border-color: color-mix(in oklch, var(--cat) 40%, var(--line));
		}
	}
	/* the chip row fades out at the right edge where it scrolls (Fold inner screen and laptop) */
	@media (min-width: 44rem) {
		.chips {
			mask-image: linear-gradient(to right, black calc(100% - 2.5rem), transparent);
			padding-right: 2.5rem;
		}
	}
	.chip:focus-visible {
		outline: 2px solid var(--note);
		outline-offset: 2px;
	}
	.chip.is-on {
		background: var(--foreground);
		border-color: var(--foreground);
		color: var(--background);
	}

	/*
	 * Laptop and monitor (and a window tall enough for it): the page is exactly one window high. The map takes what
	 * the head leaves; the plan pane scrolls by itself. 9.5rem / 10rem is the shell's padding and the Trip sub-tabs.
	 */
	@media (min-width: 80rem) and (min-height: 37.5rem) {
		.route {
			height: calc(100svh - 9.5rem);
		}
		.route-body {
			flex: 1;
			min-height: 0;
		}
		.route-map-wrap {
			flex: 1;
			min-height: 0;
		}
		.route-plan {
			overflow-y: auto;
			overscroll-behavior: contain;
			scrollbar-width: thin;
			scrollbar-color: color-mix(in oklch, var(--ink-3) 35%, transparent) transparent;
			margin-right: -0.5rem;
			padding-right: 0.5rem;
			padding-bottom: 1.5rem;
			mask-image: linear-gradient(to bottom, black calc(100% - 1.5rem), transparent);
		}
	}
	@media (min-width: 120rem) and (min-height: 37.5rem) {
		.route {
			height: calc(100svh - 10rem);
		}
	}

	.legend-land {
		fill: none;
		stroke: var(--cat);
		stroke-width: 3.5;
		stroke-linecap: round;
	}
	.legend-hop {
		fill: none;
		stroke: var(--cat);
		stroke-width: 2.6;
		stroke-dasharray: 8 6;
		stroke-linecap: round;
	}
	.legend-must {
		fill: var(--surface);
		stroke: var(--cat);
		stroke-width: 2.2;
		stroke-dasharray: 3 2.2;
	}
	.legend-maybe {
		fill: color-mix(in oklab, var(--ink-3) 70%, var(--surface));
		stroke: var(--surface);
		stroke-width: 1.5;
	}
</style>
