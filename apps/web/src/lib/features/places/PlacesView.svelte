<!--
	Places: find any card (old trip.js viewPlaces). Search by name, city, kind or any word of its text (accents and
	case ignored, 120 ms after typing), City (route cities first, then elsewhere; a /places/<a+b> link picks those
	cities), Kind, and All / Must + Maybe / Not been / Been. Results grouped by city with "N/M been", each row a
	PlaceRow that opens the place sheet and ticks "been there". The first visit starts in the city of today's stay.
	The filters stay as they were while moving between pages. The guest sees everything; the tick is read only.
-->
<script lang="ts">
	import SearchIcon from '@lucide/svelte/icons/search';
	import { SvelteSet } from 'svelte/reactivity';
	import { hereOn, localKey, type Show } from '@atr/shared/trip';
	import PlaceRow from '#lib/components/shared/PlaceRow.svelte';
	import PlaceSheet from '#lib/components/shared/PlaceSheet.svelte';
	import type { SheetTarget } from '#lib/components/shared/PlaceSheet.types.js';
	import * as Empty from '#lib/components/ui/empty/index.js';
	import * as InputGroup from '#lib/components/ui/input-group/index.js';
	import * as NativeSelect from '#lib/components/ui/native-select/index.js';
	import * as ToggleGroup from '#lib/components/ui/toggle-group/index.js';
	import { getAppData } from '#lib/content/app-data.svelte.js';
	import { verdictsOf } from '#lib/features/cards/calls.svelte.js';
	import PageHead from '#lib/features/money/PageHead.svelte';
	import { setVisited } from '#lib/features/trip/actions.js';
	import { TripData } from '#lib/features/trip/trip-data.svelte.js';
	import { placesFilter as F } from './filters.svelte.ts';
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

<section class="mx-auto flex max-w-3xl flex-col" data-places>
	<PageHead
		eyebrow={`${plural(content.places.length, 'card')} · ${String(routeCities.length)} cities on the route`}
		title="Places"
		lede="Find any card: by name, city, kind of place or a word from its text. Tick the box once you have been."
	/>

	<InputGroup.Root class="mb-3 h-12">
		<InputGroup.Addon><SearchIcon /></InputGroup.Addon>
		<InputGroup.Input
			type="search"
			placeholder="ramen, Osaka, drone show, onsen…"
			autocomplete="off"
			aria-label="Search the cards"
			bind:value={typed}
		/>
	</InputGroup.Root>

	<div class="mb-4 flex flex-wrap items-end gap-2">
		<label class="flex min-w-0 flex-1 flex-col gap-1 sm:flex-none">
			<span class="text-xs font-bold tracking-widest text-ink-3 uppercase">City</span>
			<NativeSelect.Root
				class="w-full sm:w-52"
				aria-label="City"
				bind:value={
					() => cityValue(city),
					(v) => {
						const s = String(v ?? '');
						F.city = s === '' ? null : s.split('+');
						F.arg = arg;
						F.touched = true;
					}
				}
			>
				<NativeSelect.Option value="">Everywhere</NativeSelect.Option>
				{#if routeCities.length > 0}
					<NativeSelect.OptGroup label="On the route">
						{#each routeCities as c (c.id)}
							<NativeSelect.Option value={c.id}>{c.name} ({c.n})</NativeSelect.Option>
						{/each}
					</NativeSelect.OptGroup>
				{/if}
				{#if otherCities.length > 0}
					<NativeSelect.OptGroup label="Elsewhere">
						{#each otherCities as c (c.id)}
							<NativeSelect.Option value={c.id}>{c.name} ({c.n})</NativeSelect.Option>
						{/each}
					</NativeSelect.OptGroup>
				{/if}
				{#if multi !== null}
					<NativeSelect.Option value={cityValue(city)}>{multi}</NativeSelect.Option>
				{/if}
			</NativeSelect.Root>
		</label>
		<label class="flex min-w-0 flex-1 flex-col gap-1 sm:flex-none">
			<span class="text-xs font-bold tracking-widest text-ink-3 uppercase">Kind</span>
			<NativeSelect.Root
				class="w-full sm:w-44"
				aria-label="Kind"
				bind:value={
					() => F.cat ?? '',
					(v) => {
						const s = String(v ?? '');
						F.cat = s === '' ? null : s;
					}
				}
			>
				<NativeSelect.Option value="">Any kind</NativeSelect.Option>
				{#each cats as c (c.id)}
					<NativeSelect.Option value={c.id}>{c.label}</NativeSelect.Option>
				{/each}
			</NativeSelect.Root>
		</label>
		<ToggleGroup.Root
			type="single"
			variant="outline"
			class="w-full sm:ml-auto sm:w-auto"
			value={F.show}
			onValueChange={(v: string) => {
				if (isShow(v)) F.show = v satisfies Show;
			}}
			aria-label="Which cards"
		>
			{#each SHOWS as s (s.id)}
				<ToggleGroup.Item value={s.id} class="flex-auto sm:flex-none">{s.label}</ToggleGroup.Item>
			{/each}
		</ToggleGroup.Root>
	</div>

	{#if results.length > 0}
		<p class="mb-1 text-sm text-ink-3" data-places-count>
			{plural(results.length, 'card')}{#if F.q.trim() !== ''}{` for “${F.q}”`}{/if}
		</p>
		{#each groups as g (g.key)}
			<div
				class="mt-5 mb-2 flex justify-between gap-2.5 text-xs font-bold tracking-widest text-ink-3 uppercase"
				data-places-group={g.key}
			>
				<h2>{flag(g.country)} {g.cityName}</h2>
				<span>{g.been}/{g.places.length} been</span>
			</div>
			<ul
				class="flex flex-col gap-0.5 rounded-2xl border border-border bg-card p-1.5"
				aria-label={`Cards in ${g.cityName}`}
			>
				{#each g.places as p (p.id)}
					<PlaceRow
						place={p}
						visited={been.has(p.id)}
						verdict={p.verdict}
						note={p.note}
						showCity={false}
						onopen={(id: string) => {
							sheet = { kind: 'place', id };
						}}
						ontogglevisited={(id: string, next: boolean) => {
							void toggleVisited(id, next);
						}}
					/>
				{/each}
			</ul>
		{/each}
	{:else}
		<Empty.Root data-places-empty>
			<Empty.Header>
				<Empty.Title>No card matches</Empty.Title>
				<Empty.Description>{noMatchHint(filter)}</Empty.Description>
			</Empty.Header>
		</Empty.Root>
	{/if}
</section>

<PlaceSheet
	target={sheet}
	onclose={() => {
		sheet = null;
	}}
/>
