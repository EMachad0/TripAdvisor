<!--
	The Route tab (port of game/public/game.js viewRoute and its helpers): the map of the whole trip with one chip per
	country leg, and per leg the ordered stops the traveler builds. The page opens read only; "Edit route" shows the
	reorder, remove, add, nights and Reset controls. Each edit redraws at once and the whole list for that country is
	saved through write.ts after a 600 ms pause (RouteEditor). The guest sees everything with editing disabled.
-->
<script lang="ts">
	import PencilIcon from '@lucide/svelte/icons/pencil';
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
			// desktop: the map stays put (sticky) and the plan scrolls to that country's card
			if (v !== WHOLE_TRIP && matchMedia('(min-width: 1024px)').matches)
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

<section class="flex flex-col" data-route-view data-edit={edit ? '' : undefined}>
	<header class="mb-3 flex flex-wrap items-end justify-between gap-3">
		<div class="min-w-0">
			<p class="text-xs font-bold tracking-widest text-ink-3 uppercase" data-route-eyebrow>
				{eyebrow(all)}
			</p>
			<h1 class="mt-1 font-serif text-3xl font-semibold tracking-tight sm:text-4xl">Route</h1>
		</div>
		<div class="flex flex-wrap items-center gap-3">
			<p class="text-sm text-ink-3" data-route-sum aria-live="polite">
				<b class="font-serif text-xl text-ink">{totals.placed}</b>
				{totals.placed === 1 ? 'stop' : 'stops'} in order{#if totals.unplaced}{SEP}<b
						class="font-serif text-xl text-ink">{totals.unplaced}</b
					>
					must {totals.unplaced === 1 ? 'city' : 'cities'} not placed{/if}
			</p>
			<Button
				variant={edit ? 'default' : 'outline'}
				aria-pressed={edit}
				disabled={app.isGuest}
				title={app.isGuest ? GUEST_MESSAGE : undefined}
				onclick={toggleEdit}
				data-edit-route
			>
				{#if edit}Done editing{:else}<PencilIcon />Edit route{/if}
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
		<nav
			aria-label="Zoom the map"
			class="-mx-4 mb-3 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0"
			bind:this={chipsEl}
			data-route-chips
		>
			<button
				type="button"
				data-zoom={WHOLE_TRIP}
				aria-pressed={view === WHOLE_TRIP}
				class={cn(
					'shrink-0 rounded-full border border-border bg-card px-4 py-2 text-left text-sm font-semibold',
					view === WHOLE_TRIP && 'border-ink bg-ink text-background',
				)}
				onclick={() => {
					closePop();
					zoomTo(WHOLE_TRIP);
				}}>Whole trip</button
			>
			{#each all as c (c.id)}
				{@const on = view === c.id}
				<button
					type="button"
					data-zoom={c.id}
					aria-pressed={on}
					class={cn(
						'grid shrink-0 gap-0.5 rounded-full border border-border bg-card px-4 py-1.5 text-left',
						on && 'border-ink bg-ink text-background',
					)}
					onclick={() => {
						closePop();
						zoomTo(c.id);
					}}
				>
					<b class="text-sm leading-tight font-semibold"
						>{c.n}
						{c.flag}
						{c.name}</b
					>
					<small class={cn('text-xs leading-tight text-ink-3', on && 'text-background/75')}
						>{fmtDate(c.from)} – {fmtDate(c.to)} · {c.nights}n</small
					>
				</button>
			{/each}
		</nav>

		<div class="flex flex-col gap-5 lg:flex-row lg:items-start lg:gap-6">
			<div class="min-w-0 scroll-mt-18 lg:sticky lg:top-18 lg:flex-1" bind:this={mapColEl}>
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
				<ul
					class="mx-0.5 mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-ink-3 sm:text-sm"
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
					<li>
						<label
							class="inline-flex min-h-8 cursor-pointer items-center gap-1.5 pointer-coarse:min-h-11"
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
				{#if lh}
					<p class="mx-0.5 mt-2 text-xs/relaxed text-ink-3 sm:text-sm/relaxed" data-route-fine>
						Flights: in from {lh.in.from} (lands {fmtWeek(lh.in.date)}) and home to {lh.out.to} around
						{fmtWeek(lh.out.date)}{lh.out.booked ? '' : ' (not booked)'}. Flights between countries
						fall on the leg boundary dates. Lines join stops in the order you set; nothing else is
						assumed.
					</p>
				{/if}
				{#if warnings.length > 0}
					<p class="mx-0.5 mt-2 text-xs/relaxed text-warn sm:text-sm/relaxed" data-route-warnings>
						{#each warnings as w, i (i)}{#if i > 0}<br />{/if}{w}{/each}
					</p>
				{/if}
			</div>

			<div class="grid min-w-0 gap-3.5 lg:w-100 lg:shrink-0" bind:this={planEl} data-route-plan>
				{#if edit}
					<p class="text-sm text-ink-3" data-edit-hint>
						Editing: changes save as you make them. Reset puts a country back to the agreed plan.
					</p>
				{/if}
				{#each legs as l (l.c.id)}
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
				{/each}
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
