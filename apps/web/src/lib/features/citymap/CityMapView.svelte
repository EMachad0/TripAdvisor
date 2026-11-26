<!--
	Trip → Map → one city: every place card of the city as a pin on a map that drags and zooms, the airports and
	stations (with the days the trip arrives or leaves there), and the booked stay drawn apart from the candidate
	stays, so the traveler can judge whether a stay sits well. A tap on a place (pin or list row) opens its card
	(PlaceSheet) with the Skip / Maybe / Must call; pins restyle live after a call.
	Filters: category chips, Hide skipped (on), Airports & stations (on), Only booked stays (on once every night in
	the city is booked; shown when the city has stay cards). A flipped toggle sticks for the city
	(filters.svelte.ts); a flipped Only booked stays lapses when that default changes (model.ts withChoices).
	Layout (docs/DESIGN.md): phone: the map first and tall, the chip row under it, then the list; Fold inner: the map
	fills the first screen and the list follows in two columns; xl and up: one window high, the map on the left and a
	list pane that scrolls on its own on the right.
-->
<script lang="ts">
	import ArrowLeftIcon from '@lucide/svelte/icons/arrow-left';
	import ChevronLeftIcon from '@lucide/svelte/icons/chevron-left';
	import ChevronRightIcon from '@lucide/svelte/icons/chevron-right';
	import { resolve } from '$app/paths';
	import PlaceRow from '#lib/components/shared/PlaceRow.svelte';
	import PlaceSheet from '#lib/components/shared/PlaceSheet.svelte';
	import type { SheetTarget } from '#lib/components/shared/PlaceSheet.types.js';
	import { getAppData } from '#lib/content/app-data.svelte.js';
	import type { ContentPlace, Hub } from '#lib/content/types.js';
	import { verdictsOf } from '#lib/features/cards/calls.svelte.js';
	import { routeLegs } from '#lib/features/routemap/model.js';
	import { TripData } from '#lib/features/trip/trip-data.svelte.js';
	import { cn } from '#lib/utils.js';
	import CityMap from './CityMap.svelte';
	import { choose, cityChoices } from './filters.svelte.ts';
	import {
		PIN_Z,
		VERDICT_WORD,
		bookedStays,
		categoryCounts,
		cityHubs,
		cityKey,
		cityName,
		cityPlaces,
		chooseOnlyBooked,
		cityStays,
		dateSpan,
		defaultFilter,
		distanceKm,
		fmtKm,
		focusPoints,
		hubTags,
		hubUses,
		isBooked,
		isUsed,
		mapCities,
		medianPoint,
		nightsBooked,
		noBed,
		pinLabel,
		pinTone,
		placeVisible,
		routeCityLinks,
		shortHubName,
		withChoices,
		type CityChoices,
		type CityFilter,
		type HubUse,
		type LatLng,
	} from './model.ts';
	import type { EdgeTarget, MapPin, MapPopup } from './pins.ts';

	interface Props {
		country: string;
		city: string;
	}

	let { country, city }: Props = $props();

	const app = getAppData();
	const trip = new TripData(app);
	/** A separator that keeps its spaces at the start of an {#if} block (Svelte trims literal ones there). */
	const SEP = ' · ';

	const content = $derived(app.content);
	const key = $derived(cityKey(country, city));
	const name = $derived(cityName(content, country, city));
	const countryInfo = $derived(content.countries.find((c) => c.id === country));
	const verdicts = $derived(verdictsOf(app.feedback).place);
	const byId: ReadonlyMap<string, ContentPlace> = $derived(
		new Map(content.places.map((p) => [p.id, p])),
	);
	const places = $derived(cityPlaces(content.places, country, city));
	const hubs = $derived(cityHubs(content.hubs, country, city));
	const stays = $derived(cityStays(trip.legs, city));
	const booked = $derived(bookedStays(stays, byId));
	const bookedIds = $derived(
		new Set(booked.flatMap((b) => (b.placeId === null ? [] : [b.placeId]))),
	);
	const unbooked = $derived(stays.filter((s) => !isBooked(s) && !noBed(s)));
	/** Stays with no bed to book (an airport layover): listed apart, not as "Not booked yet". */
	const layovers = $derived(stays.filter((s) => !isBooked(s) && noBed(s)));
	const hasStayCards = $derived(places.some((p) => p.category === 'stay'));
	const nights = $derived(nightsBooked(stays));
	const uses = $derived(
		hubUses(hubs, trip.legs, stays).sort(
			(a, b) => Number(isUsed(b)) - Number(isUsed(a)) || a.hub.name.localeCompare(b.hub.name),
		),
	);
	const defaults: CityFilter = $derived(defaultFilter(stays));
	const filter: CityFilter = $derived(withChoices(defaults, cityChoices[key]));
	const catOrder = $derived(Object.keys(content.categories));
	const catLabel = (c: string): string => content.categories[c]?.label ?? c;
	const catIcon = (c: string): string => content.categories[c]?.icon ?? '📍';

	function set(patch: CityChoices): void {
		choose(key, patch);
	}

	function toggleCat(c: string): void {
		const on = filter.cats.includes(c);
		set({ cats: on ? filter.cats.filter((x) => x !== c) : [...filter.cats, c] });
	}

	// ---------------------------------------------------------------- what is shown

	const shownPlaces = $derived(
		places.filter((p) => placeVisible(p, verdicts[p.id], bookedIds, filter)),
	);
	const chips = $derived(categoryCounts(places, verdicts, bookedIds, filter, catOrder));
	const counts = $derived({
		must: places.filter((p) => verdicts[p.id] === 'must').length,
		maybe: places.filter((p) => verdicts[p.id] === 'maybe').length,
		skip: places.filter((p) => verdicts[p.id] === 'skip').length,
	});

	/** Where distances are measured from: the booked stay, else the city's area card, else the places' middle. */
	const ref = $derived.by((): { at: LatLng; what: string } | null => {
		const b = booked.find((x) => x.at !== null);
		if (b?.at) return { at: b.at, what: b.name };
		const area = content.areas.find((a) => a.country === country && a.id === city);
		const lat = area?.lat;
		const lng = area?.lng;
		if (typeof lat === 'number' && typeof lng === 'number')
			return { at: { lat, lng }, what: 'the centre' };
		const m = medianPoint(places.flatMap((p) => (p.loc === null ? [] : [p.loc])));
		return m === null ? null : { at: m, what: 'the centre' };
	});
	const km = (at: LatLng): string | null => (ref === null ? null : fmtKm(distanceKm(ref.at, at)));

	const HUB_WORD = { airport: 'airport', station: 'station', bus: 'bus station', ferry: 'pier' };
	const HUB_GLYPH = { airport: '✈', station: '🚆', bus: '🚌', ferry: '⛴' };

	const tipOf = (p: ContentPlace): string =>
		[p.name, catLabel(p.category), p.costLabel].filter((s) => s !== '').join(' · ');

	const pins = $derived.by((): MapPin[] => {
		const out: MapPin[] = [];
		for (const p of places) {
			if (p.loc === null || bookedIds.has(p.id)) continue;
			const v = verdicts[p.id];
			const tone = pinTone(v, false);
			out.push({
				key: `place:${p.id}`,
				kind: 'place',
				at: p.loc,
				name: p.name,
				label: pinLabel(p.name, catLabel(p.category), v, false),
				emoji: catIcon(p.category),
				cat: p.category,
				tone,
				hubKind: null,
				tags: [],
				tip: tipOf(p),
				z: PIN_Z[tone],
				visible: placeVisible(p, v, bookedIds, filter),
			});
		}
		// Booked stays: one pin per card (or per leg without one); two bookings of the same bed share it.
		const seen: Record<string, MapPin> = {};
		for (const b of booked) {
			if (b.at === null) continue;
			const k = b.placeId === null ? `stay:${b.leg.id}` : `place:${b.placeId}`;
			const prev = seen[k];
			if (prev !== undefined) {
				prev.tags.push(b.label);
				continue;
			}
			const card = b.placeId === null ? undefined : byId.get(b.placeId);
			const pin: MapPin = {
				key: k,
				kind: 'booked',
				at: b.at,
				name: b.name,
				label: pinLabel(b.name, catLabel('stay'), card ? verdicts[card.id] : undefined, true),
				emoji: catIcon('stay'),
				cat: 'stay',
				tone: 'booked',
				hubKind: null,
				tags: [b.label],
				tip: card ? tipOf(card) : b.name,
				z: PIN_Z.booked,
				visible: true,
			};
			seen[k] = pin;
			out.push(pin);
		}
		for (const u of uses) {
			const used = isUsed(u);
			const tags = hubTags(u);
			const h = u.hub;
			out.push({
				key: `hub:${h.id}`,
				kind: 'hub',
				at: { lat: h.lat, lng: h.lng },
				name: h.name,
				label: [h.name, HUB_WORD[h.kind], ...tags].join(', '),
				emoji: '',
				cat: '',
				tone: used ? 'hub-used' : 'hub',
				hubKind: h.kind,
				tags: used ? [shortHubName(h, name), ...tags].slice(0, 4) : [],
				tip: h.code === null ? h.name : `${h.code} · ${h.name}`,
				z: used ? 2500 : 200,
				visible: filter.hubs,
			});
		}
		return out;
	});

	/**
	 * The first view: the neighbourhood of the booked stay (else of the places' middle), so it opens on what the
	 * traveler judges, not the whole metro area; the hubs come in through the edge chips. No places: the hubs.
	 */
	const focus = $derived.by((): LatLng[] => {
		const near = pins.filter((p) => p.visible && p.kind !== 'hub').map((p) => p.at);
		const bed = pins.find((p) => p.kind === 'booked')?.at ?? null;
		if (near.length > 0) return focusPoints(near, 4, bed);
		return pins.filter((p) => p.visible).map((p) => p.at);
	});

	const edges = $derived.by((): EdgeTarget[] =>
		filter.hubs
			? uses.filter(isUsed).map((u) => {
					const at = { lat: u.hub.lat, lng: u.hub.lng };
					const d = km(at);
					const short = `${shortHubName(u.hub, name)}${d === null ? '' : ` ${d}`}`;
					return {
						key: `hub:${u.hub.id}`,
						at,
						text: `${HUB_GLYPH[u.hub.kind]} ${short}`,
						name: short,
					};
				})
			: [],
	);

	// ---------------------------------------------------------------- selection

	let sheet = $state<SheetTarget | null>(null);
	let popupKey = $state<string | null>(null);
	let hot = $state<string | null>(null);
	let panSeq = $state(0);
	let panTo = $state<LatLng | null>(null);

	const hubLines = (u: HubUse): string[] => {
		const d = km({ lat: u.hub.lat, lng: u.hub.lng });
		return [
			...hubTags(u),
			...(u.hub.note === null ? [] : [u.hub.note]),
			...(d === null || ref === null ? [] : [`${d} in a straight line from ${ref.what}`]),
		];
	};

	const popup = $derived.by((): MapPopup | null => {
		const k = popupKey;
		if (k === null) return null;
		if (k.startsWith('hub:')) {
			const u = uses.find((x) => `hub:${x.hub.id}` === k);
			if (u === undefined) return null;
			const lines = hubLines(u);
			return {
				key: k,
				title: u.hub.name,
				local: u.hub.name_local,
				lines: lines.length > 0 ? lines : ['Not on the plan yet'],
			};
		}
		const b = booked.find((x) => `stay:${x.leg.id}` === k);
		if (b === undefined) return null;
		return {
			key: k,
			title: b.name,
			local: null,
			lines: [
				`Booked · ${dateSpan(b.leg.start, b.leg.end)}`,
				...(b.leg.address ? [b.leg.address] : []),
				...(b.leg.title && b.leg.title !== b.name ? [b.leg.title] : []),
			],
		};
	});

	function pan(at: LatLng): void {
		panTo = at;
		panSeq++;
	}

	function activate(k: string): void {
		if (k.startsWith('place:')) {
			popupKey = null;
			sheet = { kind: 'place', id: k.slice('place:'.length) };
			return;
		}
		const pin = pins.find((p) => p.key === k);
		popupKey = k;
		if (pin) pan(pin.at);
	}

	// A list row points at its pin; a pin points at its row.
	let listEl = $state<HTMLElement | null>(null);
	$effect(() => {
		const k = hot;
		const el = listEl;
		if (el === null) return;
		for (const row of el.querySelectorAll('[data-hot]')) row.removeAttribute('data-hot');
		if (k === null) return;
		const id = k.slice(k.indexOf(':') + 1);
		const sel = k.startsWith('place:')
			? `[data-place="${CSS.escape(id)}"]`
			: `[data-row="${CSS.escape(k)}"]`;
		el.querySelector(sel)?.setAttribute('data-hot', '');
	});

	function rowHover(e: PointerEvent): void {
		const t = e.target instanceof Element ? e.target : null;
		const place = t?.closest<HTMLElement>('[data-place]')?.dataset['place'];
		const row = t?.closest<HTMLElement>('[data-row]')?.dataset['row'];
		hot = place !== undefined ? `place:${place}` : (row ?? null);
	}

	// ---------------------------------------------------------------- the list

	interface Group {
		cat: string;
		places: ContentPlace[];
	}
	const groups = $derived.by((): Group[] => {
		const by: Record<string, ContentPlace[]> = {};
		for (const p of shownPlaces) {
			if (bookedIds.has(p.id)) continue;
			(by[p.category] ??= []).push(p);
		}
		const rank = (c: string): number => {
			const i = catOrder.indexOf(c);
			return i < 0 ? catOrder.length : i;
		};
		return Object.entries(by)
			.sort((a, b) => rank(a[0]) - rank(b[0]))
			.map(([cat, list]) => ({ cat, places: list }));
	});
	const unlocated = $derived(shownPlaces.filter((p) => p.loc === null).length);
	const shownHubs = $derived(filter.hubs ? uses : []);

	// ---------------------------------------------------------------- header and the city switcher

	const mapped = $derived(mapCities(content.places, content.hubs));
	const links = $derived.by(() => {
		const stops = routeLegs(app.route.countries).flatMap((l) =>
			l.stops.map((s) => ({ country: l.c.id, area: s.area, start: s.start, end: s.end })),
		);
		return routeCityLinks(stops, { areas: content.areas, mapped, legs: trip.legs });
	});
	const at = $derived(links.findIndex((l) => l.country === country && l.city === city));
	const prev = $derived(at > 0 ? links[at - 1] : undefined);
	const next = $derived(at >= 0 ? links[at + 1] : undefined);
	const nameOf = (l: { country: string; city: string }): string =>
		cityName(content, l.country, l.city);

	const routeStop = $derived(
		routeLegs(app.route.countries)
			.flatMap((l) => l.stops)
			.filter((s) => s.key.startsWith(`${country}/`))
			.find((s) => s.area === city),
	);
	const eyebrow = $derived.by((): string => {
		const spans = stays.map((s) => dateSpan(s.start, s.end)).filter((s) => s !== '');
		const when =
			spans.length > 0
				? spans.join(' · ')
				: routeStop?.start !== null && routeStop?.start !== undefined
					? dateSpan(routeStop.start, routeStop.end ?? undefined)
					: '';
		return [`${countryInfo?.flag ?? ''} ${countryInfo?.name ?? country}`.trim(), when]
			.filter((s) => s !== '')
			.join(' · ');
	});

	const hubIcon = (h: Hub): string => HUB_GLYPH[h.kind];
</script>

<svelte:head><title>{name} map · Asia Trip</title></svelte:head>

<section class="citymap flex flex-col" data-city-map-view={key}>
	<header class="mb-3 md:mb-4 3xl:mb-5">
		<div class="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1.5">
			<a
				href={resolve('/(app)/trip/map')}
				class="inline-flex min-h-9 items-center gap-1 rounded-full pr-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground pointer-coarse:min-h-11"
				data-back-route><ArrowLeftIcon class="size-4" />Route map</a
			>
			{#if links.length > 1 && at >= 0}
				<nav class="ml-auto flex items-center gap-1" aria-label="Other cities on the route">
					<!-- the cover screen shows the arrows only; the names are read out -->
					{#if prev}
						<a
							href={resolve('/(app)/trip/map/[country]/[city]', {
								country: prev.country,
								city: prev.city,
							})}
							class="step inline-flex min-h-9 min-w-9 items-center justify-center gap-1 rounded-full text-sm font-medium md:pr-3 md:pl-1.5 pointer-coarse:min-h-11 pointer-coarse:min-w-11"
							aria-label={`Previous city: ${nameOf(prev)}`}
							data-city-prev
							><ChevronLeftIcon class="size-4" /><span class="max-md:sr-only">{nameOf(prev)}</span
							></a
						>
					{/if}
					<span class="px-1 text-xs text-muted-foreground nums">{at + 1} / {links.length}</span>
					{#if next}
						<a
							href={resolve('/(app)/trip/map/[country]/[city]', {
								country: next.country,
								city: next.city,
							})}
							class="step inline-flex min-h-9 min-w-9 items-center justify-center gap-1 rounded-full text-sm font-medium md:pr-1.5 md:pl-3 pointer-coarse:min-h-11 pointer-coarse:min-w-11"
							aria-label={`Next city: ${nameOf(next)}`}
							data-city-next
							><span class="max-md:sr-only">{nameOf(next)}</span><ChevronRightIcon
								class="size-4"
							/></a
						>
					{/if}
				</nav>
			{/if}
		</div>
		<p class="mb-1 eyebrow nums" data-city-eyebrow>{eyebrow}</p>
		<div class="flex flex-wrap items-baseline gap-x-5 gap-y-1">
			<h1
				class="font-serif text-3xl leading-none font-semibold tracking-tight md:text-4xl 3xl:text-5xl"
			>
				{name}
			</h1>
			<p class="text-sm text-muted-foreground md:text-base" data-city-sum aria-live="polite">
				<b class="font-serif text-lg font-semibold text-foreground nums md:text-xl"
					>{places.length}</b
				>
				{places.length === 1 ? 'place' : 'places'}{SEP}<b class="font-semibold text-must nums"
					>{counts.must}</b
				>
				must{SEP}<b class="font-semibold text-maybe nums">{counts.maybe}</b>
				maybe{#if nights.total > 0}{SEP}<span class="nums" data-nights-booked
						><b class="font-semibold text-foreground">{nights.booked} of {nights.total}</b> nights booked</span
					>{/if}
			</p>
		</div>
	</header>

	<div class="cm-body flex flex-col gap-4 xl:flex-row xl:gap-6 3xl:gap-8">
		<div class="cm-mapcol flex min-w-0 flex-col gap-3 xl:flex-1">
			<div class="cm-slot flex flex-col">
				<CityMap
					{pins}
					{focus}
					ready={!trip.loading}
					{edges}
					{hot}
					{popup}
					{panSeq}
					{panTo}
					onactivate={activate}
					onhover={(k: string | null) => {
						hot = k;
						if (k !== null) {
							const id = k.slice(k.indexOf(':') + 1);
							const sel = k.startsWith('place:')
								? `[data-place="${CSS.escape(id)}"]`
								: `[data-row="${CSS.escape(k)}"]`;
							if (matchMedia('(min-width: 80rem)').matches)
								listEl?.querySelector(sel)?.scrollIntoView({ block: 'nearest' });
						}
					}}
					onclosepopup={() => {
						popupKey = null;
					}}
				/>
			</div>

			<div
				class="-mx-4 no-scrollbar flex snap-x scroll-px-4 gap-2 overflow-x-auto px-4 py-0.5 md:mx-0 md:flex-wrap md:overflow-visible md:px-0"
				role="toolbar"
				aria-label="Filter the map"
				data-city-filters
			>
				<button
					type="button"
					class={cn('chip', filter.hideSkipped && 'is-on')}
					aria-pressed={filter.hideSkipped}
					onclick={() => {
						set({ hideSkipped: !filter.hideSkipped });
					}}
					>Hide skipped{#if counts.skip > 0}<span class="count">{counts.skip}</span>{/if}</button
				>
				{#if hasStayCards}
					<button
						type="button"
						class={cn('chip', filter.onlyBooked && 'is-on')}
						aria-pressed={filter.onlyBooked}
						onclick={() => {
							set(chooseOnlyBooked(!filter.onlyBooked, defaults));
						}}>Only booked stays</button
					>
				{/if}
				{#if hubs.length > 0}
					<button
						type="button"
						class={cn('chip', filter.hubs && 'is-on')}
						aria-pressed={filter.hubs}
						onclick={() => {
							set({ hubs: !filter.hubs });
						}}>Airports &amp; stations</button
					>
				{/if}
				<span class="mx-1 w-px shrink-0 self-stretch bg-border" aria-hidden="true"></span>
				{#each chips as c (c.id)}
					{@const on = filter.cats.includes(c.id)}
					<button
						type="button"
						class={cn('chip', on && 'is-on')}
						data-cat={c.id}
						aria-pressed={on}
						data-cat-chip={c.id}
						onclick={() => {
							toggleCat(c.id);
						}}
						><span aria-hidden="true">{catIcon(c.id)}</span>{catLabel(c.id)}<span class="count"
							>{c.n}</span
						></button
					>
				{/each}
				{#if filter.cats.length > 0}
					<button
						type="button"
						class="chip"
						onclick={() => {
							set({ cats: [] });
						}}>All kinds</button
					>
				{/if}
			</div>

			<ul
				class="flex flex-wrap items-center gap-x-4 gap-y-1.5 px-1 text-xs text-muted-foreground"
				aria-label="Legend"
				data-city-legend
			>
				<li class="inline-flex items-center gap-1.5">
					<span class="lg-dot lg-must" aria-hidden="true"></span>Must
				</li>
				<li class="inline-flex items-center gap-1.5">
					<span class="lg-dot lg-maybe" aria-hidden="true"></span>Maybe
				</li>
				<li class="inline-flex items-center gap-1.5">
					<span class="lg-dot lg-none" aria-hidden="true"></span>Not rated
				</li>
				<li class="inline-flex items-center gap-1.5">
					<span class="lg-dot lg-skip" aria-hidden="true"></span>Skipped
				</li>
				<li class="inline-flex items-center gap-1.5">
					<span class="lg-dot lg-booked" data-cat="stay" aria-hidden="true"></span>Booked stay
				</li>
				<li class="inline-flex items-center gap-1.5">
					<span class="lg-dot lg-hub-used" aria-hidden="true"></span>Arrive / leave here
				</li>
				<li class="inline-flex items-center gap-1.5">
					<span class="lg-dot lg-hub" aria-hidden="true"></span>Other airport / station
				</li>
			</ul>
		</div>

		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div
			class="cm-list min-w-0 xl:w-100 3xl:w-120"
			bind:this={listEl}
			onpointerover={rowHover}
			onpointerleave={() => {
				hot = null;
			}}
			data-city-list
		>
			<div class="grid gap-6 md:grid-cols-2 md:gap-x-6 xl:grid-cols-1">
				{#if booked.length > 0 || unbooked.length > 0 || layovers.length > 0}
					<section aria-labelledby="cm-stay" class="grid content-start gap-2">
						<h2 id="cm-stay" class="eyebrow">{booked.length > 0 ? 'Booked stay' : 'Stay'}</h2>
						<ul class="grid gap-1">
							{#each booked as b (b.leg.id)}
								{@const rowKey = b.placeId === null ? `stay:${b.leg.id}` : `place:${b.placeId}`}
								<li data-row={rowKey}>
									{#if b.at === null}
										<p class="rounded-xl bg-muted/60 px-3 py-2.5 text-sm" data-no-location>
											Booked: <b class="font-semibold">{b.leg.title ?? b.name}</b> — no location on file
											yet
										</p>
									{:else}
										<button
											type="button"
											class="row flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left"
											onclick={() => {
												if (b.placeId !== null) sheet = { kind: 'place', id: b.placeId };
												else activate(rowKey);
											}}
										>
											<span
												class="grid size-11 shrink-0 place-items-center rounded-full bg-cat text-xl text-primary-foreground"
												data-cat="stay"
												aria-hidden="true">{catIcon('stay')}</span
											>
											<span class="grid min-w-0">
												<b class="truncate font-semibold">{b.name}</b>
												<small class="text-xs text-muted-foreground nums"
													>Booked · {dateSpan(b.leg.start, b.leg.end)}</small
												>
											</span>
										</button>
									{/if}
								</li>
							{/each}
							{#each unbooked as s (s.id)}
								<li class="px-2 py-1 text-sm text-muted-foreground nums" data-unbooked>
									Not booked yet: <span class="text-foreground">{s.title ?? 'stay'}</span
									>{#if dateSpan(s.start, s.end)}{SEP}{dateSpan(s.start, s.end)}{/if}
								</li>
							{/each}
							{#each layovers as s (s.id)}
								<li class="px-2 py-1 text-sm text-muted-foreground nums" data-layover>
									No bed (layover): <span class="text-foreground">{s.title ?? 'stop'}</span
									>{#if dateSpan(s.start, s.end)}{SEP}{dateSpan(s.start, s.end)}{/if}
								</li>
							{/each}
						</ul>
					</section>
				{/if}

				{#if shownHubs.length > 0}
					<section aria-labelledby="cm-hubs" class="grid content-start gap-2">
						<h2 id="cm-hubs" class="eyebrow">Getting in and out</h2>
						<ul class="grid gap-1">
							{#each shownHubs as u, i (u.hub.id)}
								{@const used = isUsed(u)}
								{@const d = km({ lat: u.hub.lat, lng: u.hub.lng })}
								{#if !used && (i === 0 || isUsed(shownHubs[i - 1] ?? u))}
									<li class="mt-1 px-2 text-xs text-muted-foreground">
										Other airports and stations
									</li>
								{/if}
								<li data-row={`hub:${u.hub.id}`}>
									<button
										type="button"
										class="row flex w-full items-start gap-3 rounded-xl px-2 py-2 text-left"
										onclick={() => {
											activate(`hub:${u.hub.id}`);
										}}
										data-hub={u.hub.id}
									>
										<span
											class={cn(
												'grid size-9 shrink-0 place-items-center rounded-lg text-base',
												used ? 'bg-foreground text-background' : 'border-2 border-ink-3 bg-card',
											)}
											aria-hidden="true">{hubIcon(u.hub)}</span
										>
										<span class="grid min-w-0 gap-0.5">
											<b class="leading-tight font-semibold"
												>{u.hub.name}{#if u.hub.code}<span
														class="ml-1.5 font-mono text-xs text-muted-foreground"
														>{u.hub.code}</span
													>{/if}</b
											>
											{#if used}
												<span class="flex flex-wrap gap-1">
													{#each hubTags(u) as t (t)}
														<span
															class="rounded-full bg-foreground/8 px-2 py-0.5 text-xs font-semibold nums"
															data-hub-tag>{t}</span
														>
													{/each}
												</span>
											{/if}
											{#if d !== null && ref !== null}
												<small class="text-xs text-muted-foreground nums"
													>{d} from {ref.what}{#if u.hub.note}{SEP}{u.hub.note}{/if}</small
												>
											{:else if u.hub.note}
												<small class="text-xs text-muted-foreground">{u.hub.note}</small>
											{/if}
										</span>
									</button>
								</li>
							{/each}
						</ul>
					</section>
				{/if}

				{#each groups as g (g.cat)}
					<section aria-labelledby={`cm-cat-${g.cat}`} class="grid content-start gap-2">
						<h2 id={`cm-cat-${g.cat}`} class="eyebrow" data-cat={g.cat}>
							<span aria-hidden="true">{catIcon(g.cat)}</span>
							{catLabel(g.cat)}
							<span class="text-muted-foreground nums">{g.places.length}</span>
						</h2>
						<ul class="grid gap-0.5" aria-label={`${catLabel(g.cat)} in ${name}`}>
							{#each g.places as p (p.id)}
								<PlaceRow
									place={p}
									verdict={verdicts[p.id] ?? null}
									note={app.feedback?.notes.place[p.id] ?? null}
									showCity={false}
									onopen={(id: string) => {
										sheet = { kind: 'place', id };
									}}
								/>
							{/each}
						</ul>
					</section>
				{:else}
					<p class="text-sm text-muted-foreground" data-city-empty>
						{places.length === 0
							? 'No place cards here yet.'
							: 'Nothing matches the filters. Try All kinds or show skipped.'}
					</p>
				{/each}
				{#if unlocated > 0}
					<p class="text-xs text-muted-foreground">
						{unlocated}
						{unlocated === 1 ? 'card has' : 'cards have'} no location, so {unlocated === 1
							? 'it is'
							: 'they are'} only in the list.
					</p>
				{/if}
			</div>
			<p class="sr-only" aria-live="polite">
				{shownPlaces.length} of {places.length} places shown{filter.hideSkipped && counts.skip > 0
					? `, ${String(counts.skip)} ${VERDICT_WORD.skip.toLowerCase()} hidden`
					: ''}
			</p>
		</div>
	</div>
</section>

<PlaceSheet
	target={sheet}
	onclose={() => {
		sheet = null;
	}}
/>

<style>
	.chip {
		display: inline-flex;
		flex-shrink: 0;
		align-items: center;
		gap: 0.375rem;
		min-height: 2.75rem;
		padding: 0 0.875rem;
		border-radius: 999px;
		border: 1px solid color-mix(in oklch, var(--line) 80%, transparent);
		background: var(--card);
		box-shadow: var(--elev-0);
		font-size: 0.875rem;
		font-weight: 600;
		white-space: nowrap;
		scroll-snap-align: start;
		transition:
			background-color 0.2s var(--ease-soft),
			border-color 0.2s var(--ease-soft),
			color 0.2s var(--ease-soft);
	}
	@media (min-width: 80rem) {
		.chip {
			min-height: 2.25rem;
		}
	}
	@media (hover: hover) {
		.chip:hover {
			border-color: color-mix(in oklch, var(--cat) 40%, var(--line));
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
	.chip[data-cat].is-on {
		background: var(--cat);
		border-color: var(--cat);
		color: var(--surface);
	}
	.chip .count {
		font-size: 0.75rem;
		font-weight: 600;
		opacity: 0.7;
		font-variant-numeric: tabular-nums;
	}
	.step {
		border: 1px solid color-mix(in oklch, var(--line) 80%, transparent);
		background: var(--card);
	}
	@media (hover: hover) {
		.step:hover {
			border-color: var(--cat);
		}
	}
	.row {
		transition: background-color 0.2s var(--ease-soft);
	}
	@media (hover: hover) {
		.row:hover {
			background: color-mix(in oklab, var(--surface-2) 60%, transparent);
		}
	}
	.row:focus-visible {
		outline: 2px solid var(--note);
		outline-offset: 2px;
	}
	.cm-list :global([data-hot]) {
		background: color-mix(in oklab, var(--cat) 10%, transparent);
		border-radius: 0.875rem;
	}

	/* Legend swatches: the same shapes as the pins (CityMap.svelte). */
	.lg-dot {
		display: inline-block;
		width: 0.875rem;
		height: 0.875rem;
		border-radius: 999px;
		border: 1.5px solid var(--surface);
	}
	.lg-must {
		background: var(--must);
		box-shadow: 0 0 0 1.5px var(--ink-3);
	}
	.lg-maybe {
		width: 0.75rem;
		height: 0.75rem;
		background: color-mix(in oklab, var(--maybe) 70%, var(--surface));
	}
	.lg-none {
		background: var(--surface);
		border: 2px solid var(--ink-3);
	}
	.lg-skip {
		position: relative;
		width: 0.75rem;
		height: 0.75rem;
		background: var(--surface);
		border: 1.5px solid var(--ink-2);
	}
	.lg-skip::after {
		content: '';
		position: absolute;
		left: 50%;
		top: 50%;
		width: 125%;
		height: 1.5px;
		background: var(--ink-2);
		translate: -50% -50%;
		rotate: -45deg;
	}
	.lg-booked {
		width: 1rem;
		height: 1rem;
		background: var(--cat);
	}
	.lg-hub-used {
		border-radius: 0.25rem;
		background: var(--ink);
	}
	.lg-hub {
		border-radius: 0.25rem;
		background: var(--surface);
		border: 2px solid var(--ink-3);
	}

	/*
	 * Laptop and monitor (and a window tall enough for it): the page is one window high, the map takes what the head
	 * leaves and the list pane scrolls by itself. 9.5rem / 10rem: the shell's padding and the Trip sub-tabs.
	 */
	@media (min-width: 80rem) and (min-height: 50rem) {
		.citymap {
			height: calc(100svh - 9.5rem);
		}
		.cm-body {
			flex: 1;
			min-height: 0;
		}
		.cm-mapcol {
			min-height: 0;
		}
		.cm-slot {
			flex: 1;
			min-height: 0;
		}
		.cm-list {
			overflow-y: auto;
			overscroll-behavior: contain;
			scrollbar-width: thin;
			scrollbar-color: color-mix(in oklch, var(--ink-3) 35%, transparent) transparent;
			margin-right: -0.5rem;
			padding-right: 0.5rem;
			padding-bottom: 1.5rem;
		}
	}
	@media (min-width: 120rem) and (min-height: 50rem) {
		.citymap {
			height: calc(100svh - 10rem);
		}
	}
</style>
