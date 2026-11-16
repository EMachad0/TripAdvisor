<!--
	Places: find any card (old trip.js viewPlaces). Search by name, city, kind or any word of its text (accents and
	case ignored, 120 ms after typing), City (route cities first, then elsewhere; a /places/<a+b> link picks those
	cities), Kind, and All / Must + Maybe / Not been / Been. Results grouped by city with "N/M been", each card a
	PlaceTile that opens the place sheet and ticks "been there". The first visit starts in the city of today's stay.
	The filters stay as they were while moving between pages. The guest sees everything; the tick is read only.

	Layout (docs/DESIGN.md): on a phone the search and filters float in a dock above the tab bar, where the thumb is,
	and the filters fold out of it; on the Fold's inner screen they are a sticky bar over a two-column grid; from the
	laptop up a sticky side panel (with the cities to jump to) beside a grid of three or four columns.
-->
<script lang="ts">
	import SearchIcon from '@lucide/svelte/icons/search';
	import SlidersHorizontal from '@lucide/svelte/icons/sliders-horizontal';
	import XIcon from '@lucide/svelte/icons/x';
	import { SvelteSet } from 'svelte/reactivity';
	import { hereOn, localKey, type Show } from '@atr/shared/trip';
	import PlaceSheet from '#lib/components/shared/PlaceSheet.svelte';
	import type { SheetTarget } from '#lib/components/shared/PlaceSheet.types.js';
	import PageHeader from '#lib/components/shell/PageHeader.svelte';
	import * as Empty from '#lib/components/ui/empty/index.js';
	import * as ToggleGroup from '#lib/components/ui/toggle-group/index.js';
	import { getAppData } from '#lib/content/app-data.svelte.js';
	import { verdictsOf } from '#lib/features/cards/calls.svelte.js';
	import { setVisited } from '#lib/features/trip/actions.js';
	import { TripData } from '#lib/features/trip/trip-data.svelte.js';
	import { cn } from '#lib/utils.js';
	import FilterSelect from './FilterSelect.svelte';
	import { placesFilter as F } from './filters.svelte.ts';
	import PlaceTile from './PlaceTile.svelte';
	import {
		SHOWS,
		cityIndex,
		cityValue,
		citiesFromArg,
		findPlaces,
		groupByCity,
		isShow,
		noMatchHint,
		placeHits,
		plural,
		startCities,
		usedCategories,
	} from './model.ts';

	interface Props {
		/** The `[cities]` path segment of /places/<a+b>, undefined on /places. */
		arg?: string | undefined;
	}

	let { arg }: Props = $props();
	const app = getAppData();
	const trip = new TripData(app);

	const content = $derived(app.content);
	const cities = $derived(
		cityIndex(
			content.places,
			trip.legs,
			content.countries.map((c) => c.id),
		),
	);
	const routeCities = $derived(cities.filter((c) => c.route));
	const otherCities = $derived(cities.filter((c) => !c.route));
	const cats = $derived(usedCategories(content.places, content.categories));
	const visited = $derived(trip.col('visited'));
	const been = $derived(new Set(visited.map((v) => v.id)));

	// A /places/<cities> link sets the city once (also on the server render); the select can change it after.
	const linked = $derived(arg !== undefined && arg !== F.arg);
	const city = $derived(linked && arg !== undefined ? citiesFromArg(arg, cities) : F.city);
	$effect(() => {
		if (!linked || arg === undefined) return;
		F.arg = arg;
		F.city = citiesFromArg(arg, cities);
		F.touched = true;
	});
	// First visit: start in the city you are in (once the legs have loaded).
	$effect(() => {
		if (F.touched || trip.loading || arg !== undefined) return;
		F.city = startCities(hereOn(trip.legs, localKey()), cities);
		F.touched = true;
	});

	// The search box answers 120 ms after the last key, as before.
	let typed = $state(F.q);
	$effect(() => {
		const q = typed;
		const t = setTimeout(() => {
			F.q = q;
		}, 120);
		return () => {
			clearTimeout(t);
		};
	});

	const filter = $derived({ q: F.q, city, cat: F.cat, show: F.show });
	const hits = $derived(
		placeHits(
			content.places,
			verdictsOf(app.feedback).place,
			app.feedback?.notes.place ?? {},
			app.feedback?.ratings ?? {},
		),
	);
	const results = $derived(findPlaces(hits, filter, visited, content.categories));
	const groups = $derived(groupByCity(results, cities, been));
	const flag = (country: string): string =>
		content.countries.find((c) => c.id === country)?.flag ?? '';
	const multi = $derived(
		city !== null && city.length > 1
			? city.map((c) => cities.find((x) => x.id === c)?.name ?? c).join(' + ')
			: null,
	);
	const beenShown = $derived(groups.reduce((n, g) => n + g.been, 0));
	/** How many filters narrow the list (the phone's Filters button shows it). */
	const active = $derived(
		Number(city !== null) + Number(F.cat !== null) + Number(F.show !== 'all'),
	);
	const anchor = (key: string): string => `places-${key.replace(/[^a-z0-9-]+/gi, '-')}`;

	function setCity(v: string): void {
		F.city = v === '' ? null : v.split('+');
		F.arg = arg;
		F.touched = true;
	}

	/** The phone dock's filters are folded out. */
	let open = $state(false);

	let sheet: SheetTarget | null = $state(null);
	const pending = new SvelteSet<string>();
	async function toggleVisited(id: string, next: boolean): Promise<void> {
		if (pending.has(id)) return;
		pending.add(id);
		try {
			await setVisited(id, next);
		} finally {
			pending.delete(id);
		}
	}
</script>

<section class="page-wide" data-places>
	<PageHeader
		eyebrow={`${plural(content.places.length, 'card')} · ${String(routeCities.length)} cities on the route`}
		title="Places"
		lede="Find any card by name, city, kind of place or a word from its text. Tick it once you have been."
	/>

	<div class="flex flex-col gap-5 md:gap-6 xl:flex-row xl:items-start xl:gap-10 3xl:gap-14">
		<!-- The search and filters: a dock above the tab bar on a phone, a sticky bar on the Fold, a side panel on
			the laptop and the monitor. One set of controls for all three. -->
		<aside
			aria-label="Search and filters"
			class="z-20 flex flex-col gap-2 rounded-3xl p-2 max-xl:glass max-md:fixed max-md:inset-x-2.5 max-md:bottom-dock max-md:shadow-big md:sticky md:top-4 md:z-10 md:flex-row md:flex-wrap md:items-end md:gap-3 md:rounded-2xl md:p-3 md:shadow-soft xl:top-9 xl:w-72 xl:shrink-0 xl:flex-col xl:flex-nowrap xl:items-stretch xl:gap-5 xl:panel xl:p-5 3xl:w-80"
		>
			<div class="flex min-w-0 items-center gap-2 md:min-w-64 md:flex-1 xl:flex-none">
				<label class="relative block min-w-0 flex-1">
					<span class="sr-only">Search the cards</span>
					<SearchIcon
						class="pointer-events-none absolute top-1/2 left-3.5 size-4.5 -translate-y-1/2 text-muted-foreground"
						aria-hidden="true"
					/>
					<input
						type="search"
						placeholder="ramen, Osaka, drone show, onsen…"
						autocomplete="off"
						enterkeyhint="search"
						aria-label="Search the cards"
						class="h-11 w-full min-w-0 rounded-full border border-border bg-card pr-4 pl-10 text-base text-foreground shadow-flat transition duration-200 outline-none placeholder:text-muted-foreground hover:border-cat/40 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30 md:text-sm xl:rounded-xl"
						bind:value={typed}
					/>
				</label>
				<button
					type="button"
					class={cn(
						'relative grid size-11 shrink-0 place-items-center rounded-full border border-border bg-card text-foreground shadow-flat transition-colors md:hidden',
						open && 'border-transparent bg-foreground text-background',
					)}
					aria-expanded={open}
					aria-controls="places-filters"
					aria-label={open ? 'Hide the filters' : 'Show the filters'}
					onclick={() => {
						open = !open;
					}}
				>
					{#if open}
						<XIcon class="size-5" aria-hidden="true" />
					{:else}
						<SlidersHorizontal class="size-5" aria-hidden="true" />
						{#if active > 0}
							<span class="absolute -top-1 -right-1 count ring-2 ring-card">{active}</span>
						{/if}
					{/if}
				</button>
			</div>

			<div
				id="places-filters"
				class={cn(
					'flex-col gap-3 p-2 pb-1 max-md:order-first max-md:motion-safe:animate-in max-md:motion-safe:fade-in max-md:motion-safe:slide-in-from-bottom-2 md:contents',
					open ? 'flex' : 'hidden',
				)}
			>
				<div class="grid grid-cols-2 gap-2.5 md:contents">
					<div class="md:w-44 xl:w-auto">
						<FilterSelect label="City" value={cityValue(city)} onchange={setCity}>
							<option value="">Everywhere</option>
							{#if routeCities.length > 0}
								<optgroup label="On the route">
									{#each routeCities as c (c.id)}
										<option value={c.id}>{c.name} ({c.n})</option>
									{/each}
								</optgroup>
							{/if}
							{#if otherCities.length > 0}
								<optgroup label="Elsewhere">
									{#each otherCities as c (c.id)}
										<option value={c.id}>{c.name} ({c.n})</option>
									{/each}
								</optgroup>
							{/if}
							{#if multi !== null}
								<option value={cityValue(city)}>{multi}</option>
							{/if}
						</FilterSelect>
					</div>
					<div class="md:w-40 xl:w-auto">
						<FilterSelect
							label="Kind"
							value={F.cat ?? ''}
							onchange={(v: string) => {
								F.cat = v === '' ? null : v;
							}}
						>
							<option value="">Any kind</option>
							{#each cats as c (c.id)}
								<option value={c.id}>{c.label}</option>
							{/each}
						</FilterSelect>
					</div>
				</div>
				<div class="flex flex-col gap-1.5 md:w-full xl:w-auto">
					<span class="px-1 eyebrow md:sr-only xl:not-sr-only" aria-hidden="true">Show</span>
					<div class="rounded-full bg-muted/80 p-1 shadow-inset xl:rounded-2xl">
						<ToggleGroup.Root
							type="single"
							variant="segment"
							spacing={1}
							class="w-full xl:grid xl:grid-cols-2"
							value={F.show}
							onValueChange={(v: string) => {
								if (isShow(v)) F.show = v satisfies Show;
							}}
							aria-label="Which cards"
						>
							{#each SHOWS as s (s.id)}
								<ToggleGroup.Item value={s.id} class="h-10 flex-auto xl:h-9"
									>{s.label}</ToggleGroup.Item
								>
							{/each}
						</ToggleGroup.Root>
					</div>
				</div>
			</div>

			{#if groups.length > 1}
				<nav
					aria-label="Cities in the list"
					class="-mx-2 hidden max-h-100 flex-col gap-0.5 overflow-y-auto px-2 xl:flex 3xl:max-h-200"
				>
					<span class="mb-1 px-1 eyebrow">Jump to</span>
					{#each groups as g (g.key)}
						<a
							href={`#${anchor(g.key)}`}
							class="group/jump flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm text-ink-2 transition-colors hover:bg-muted hover:text-foreground"
						>
							<span aria-hidden="true">{flag(g.country)}</span>
							<span class="min-w-0 flex-1 truncate">{g.cityName}</span>
							<span class="text-xs text-muted-foreground nums">{g.places.length}</span>
						</a>
					{/each}
				</nav>
			{/if}
		</aside>

		<div class="min-w-0 flex-1">
			{#if results.length > 0}
				<p
					class="mb-4 flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm text-muted-foreground md:mb-5"
				>
					<span class="font-medium text-foreground nums" data-places-count
						>{plural(results.length, 'card')}{#if F.q.trim() !== ''}{` for “${F.q}”`}{/if}</span
					>
					{#if beenShown > 0}
						<span class="nums">{beenShown} been</span>
					{/if}
				</p>
				<div class="flex flex-col gap-8 md:gap-10">
					{#each groups as g (g.key)}
						{@const pct = g.places.length === 0 ? 0 : g.been / g.places.length}
						<section class="flex scroll-mt-40 flex-col gap-3 xl:scroll-mt-9" id={anchor(g.key)}>
							<div class="flex items-end justify-between gap-3" data-places-group={g.key}>
								<h2
									class="flex min-w-0 items-baseline gap-2 font-serif text-xl leading-tight font-semibold md:text-2xl"
								>
									<span class="text-base md:text-lg" aria-hidden="true">{flag(g.country)}</span>
									<span class="truncate">{g.cityName}</span>
								</h2>
								<span class="flex shrink-0 items-center gap-2 text-xs text-muted-foreground nums">
									<span
										class="relative hidden h-1.5 w-16 overflow-hidden rounded-full bg-muted shadow-inset md:block"
										aria-hidden="true"
									>
										<span
											class={cn(
												'absolute inset-y-0 left-0 rounded-full bg-ok',
												pct === 0 && 'w-0',
												pct > 0 && pct < 0.25 && 'w-1/6',
												pct >= 0.25 && pct < 0.5 && 'w-1/3',
												pct >= 0.5 && pct < 0.75 && 'w-1/2',
												pct >= 0.75 && pct < 1 && 'w-3/4',
												pct >= 1 && 'w-full',
											)}
										></span>
									</span>
									{g.been}/{g.places.length} been
								</span>
							</div>
							<ul
								class="grid grid-cols-1 gap-2.5 md:grid-cols-2 md:gap-4 xl:grid-cols-3 xl:gap-5 3xl:grid-cols-4"
								aria-label={`Cards in ${g.cityName}`}
							>
								{#each g.places as p (p.id)}
									<PlaceTile
										place={p}
										visited={been.has(p.id)}
										verdict={p.verdict}
										note={p.note}
										onopen={(id: string) => {
											sheet = { kind: 'place', id };
										}}
										ontogglevisited={(id: string, next: boolean) => {
											void toggleVisited(id, next);
										}}
									/>
								{/each}
							</ul>
						</section>
					{/each}
				</div>
			{:else}
				<Empty.Root data-places-empty>
					<Empty.Header>
						<Empty.Media><span class="text-5xl" aria-hidden="true">🧭</span></Empty.Media>
						<Empty.Title>No card matches</Empty.Title>
						<Empty.Description>{noMatchHint(filter)}</Empty.Description>
					</Empty.Header>
				</Empty.Root>
			{/if}
			<!-- Room under the last card for the phone's dock. -->
			<div class="h-20 md:hidden" aria-hidden="true"></div>
		</div>
	</div>
</section>

<PlaceSheet
	target={sheet}
	onclose={() => {
		sheet = null;
	}}
/>
