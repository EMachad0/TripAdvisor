<!--
	Trip › Itinerary (the old viewItinerary): flights, stays, transfers and notes in date order with the date
	column, the red Today line, layovers, country jump chips, the transfer plan sheet and the stop form. During the
	trip it opens at today. The guest sees everything; Add stop and the edit buttons are hidden.

	Layout: one column on a phone (the date sits above its card, the countries scroll sideways); the date in a
	column beside the cards from the Fold's inner screen; from a laptop up the countries become a sticky route
	beside the timeline, coloured like the calendar.
-->
<script lang="ts">
	import PlusIcon from '@lucide/svelte/icons/plus';
	import { tick } from 'svelte';
	import { dayKey, diffDays, localKey } from '@atr/shared/trip';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Empty from '#lib/components/ui/empty/index.js';
	import { Skeleton } from '#lib/components/ui/skeleton/index.js';
	import { getAppData } from '#lib/content/app-data.svelte.js';
	import { cn } from '#lib/utils.js';
	import { calendarBase, type ColorSlot } from './calendar.ts';
	import { countryFlag, countryName, fmtDay, fmtShort, or, plural } from './format.ts';
	import { itineraryModel, layoverLabel } from './itinerary.ts';
	import { TripData } from './trip-data.svelte.ts';
	import LegCard from './components/LegCard.svelte';
	import TransferPlan from './components/TransferPlan.svelte';
	import TripForm from './components/TripForm.svelte';
	import type { FormTarget } from './forms.ts';
	import TripHeader from './components/TripHeader.svelte';
	import TripSheet from './components/TripSheet.svelte';

	const app = getAppData();
	const trip = new TripData(app);
	const countries = $derived(app.content.countries);
	const canEdit = $derived(!app.isGuest);

	const today = localKey();
	const m = $derived(itineraryModel(trip.legs, today, fmtDay));
	const keys = $derived(calendarBase(trip.legs).keys);

	/** The countries in trip order, each with its calendar colour and the days until the next one. */
	const route = $derived(
		m.jumps.map((j, i) => {
			const from = dayKey(j.start);
			const next = m.jumps[i + 1];
			const to = next !== undefined ? dayKey(next.start) : (m.span?.last ?? '');
			const days = from !== '' && to !== '' ? diffDays(from, to) + (next ? 0 : 1) : 0;
			return { ...j, days, slot: ((Math.max(0, keys.indexOf(j.country)) % 7) + 1) as ColorSlot };
		}),
	);
	const DOT: Record<ColorSlot, string> = {
		1: 'bg-k1',
		2: 'bg-k2',
		3: 'bg-k3',
		4: 'bg-k4',
		5: 'bg-k5',
		6: 'bg-k6',
		7: 'bg-k7',
	};

	let form: FormTarget | null = $state(null);
	let detailId: string | null = $state(null);
	const detail = $derived(
		detailId === null ? null : (m.legs.find((l) => l.id === detailId) ?? null),
	);

	const onedit = $derived(
		canEdit
			? (id: string) => {
					detailId = null;
					form = { col: 'legs', id };
				}
			: undefined,
	);
	const ondetail = (id: string): void => {
		detailId = id;
	};

	// During the trip, open at today (the stay you are in, else the Today line), once the legs have loaded.
	let scrolled = false;
	$effect(() => {
		if (scrolled || trip.loading || !m.scrollToToday) return;
		scrolled = true;
		void tick().then(() => {
			const el =
				document.querySelector('[data-now="true"]') ?? document.querySelector('[data-today-line]');
			el?.scrollIntoView({ block: 'start' });
		});
	});

	const jump = (id: string): void => {
		document
			.querySelector(`[data-leg="${CSS.escape(id)}"]`)
			?.scrollIntoView({ behavior: 'smooth', block: 'start' });
	};
</script>

<section class="page-wide" data-testid="itinerary">
	<TripHeader eyebrow={m.eyebrow} title="Itinerary" lede={trip.loading ? undefined : m.lede}>
		{#snippet action()}
			{#if canEdit}
				<Button
					size="lg"
					onclick={() => {
						form = { col: 'legs', id: null };
					}}><PlusIcon data-icon="inline-start" />Add stop</Button
				>
			{/if}
		{/snippet}
	</TripHeader>

	{#if trip.loading}
		<div
			class="flex flex-col gap-4 xl:flex-row xl:gap-10"
			aria-busy="true"
			aria-label="Loading the itinerary"
		>
			<Skeleton class="h-12 w-full xl:h-96 xl:w-72 xl:shrink-0 3xl:w-80" />
			<div class="flex min-w-0 flex-1 flex-col gap-4">
				<Skeleton class="h-44 w-full" />
				<Skeleton class="h-56 w-full" />
				<Skeleton class="h-44 w-full" />
			</div>
		</div>
	{:else if trip.error}
		<div class="panel">
			<Empty.Root>
				<Empty.Header>
					<Empty.Title>Could not load the trip</Empty.Title>
					<Empty.Description>{trip.error.message}</Empty.Description>
				</Empty.Header>
			</Empty.Root>
		</div>
	{:else if m.legs.length === 0}
		<div class="panel">
			<Empty.Root>
				<Empty.Header>
					<Empty.Title>No stops yet</Empty.Title>
					<Empty.Description>Add a flight or a stay to start the timeline.</Empty.Description>
				</Empty.Header>
			</Empty.Root>
		</div>
	{:else}
		<div class="flex flex-col gap-5 xl:flex-row xl:items-start xl:gap-10 3xl:gap-14">
			<aside
				class="-mx-4 md:-mx-6 xl:sticky xl:top-9 xl:mx-0 xl:w-72 xl:shrink-0 xl:panel xl:p-5 3xl:top-11 3xl:w-80 3xl:p-6"
			>
				<p class="mb-3 hidden eyebrow xl:block">The route</p>
				<div
					class="flex no-scrollbar gap-2 overflow-x-auto px-4 md:px-6 xl:flex-col xl:gap-0 xl:overflow-visible xl:px-0"
					aria-label="Jump to a country"
				>
					{#each route as j, i (j.id)}
						{@const flag = countryFlag(j.country, countries)}
						<button
							type="button"
							class="group relative inline-flex h-11 shrink-0 items-center gap-2 rounded-full border border-border/80 bg-card pr-4 pl-3 text-sm font-semibold whitespace-nowrap text-foreground shadow-flat transition-colors duration-200 ease-soft hover:border-cat/50 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none xl:h-auto xl:gap-3 xl:rounded-xl xl:border-0 xl:bg-transparent xl:min-h-14 xl:py-0 xl:pr-2 xl:pl-1 xl:shadow-none xl:hover:bg-muted/70"
							onclick={() => {
								jump(j.id);
							}}
						>
							<span
								class="relative hidden w-4 shrink-0 flex-col items-center justify-center self-stretch xl:flex"
								aria-hidden="true"
							>
								{#if i > 0}<i class="absolute top-0 h-1/2 w-px bg-ink-3/30"></i>{/if}
								{#if i < route.length - 1}<i class="absolute bottom-0 h-1/2 w-px bg-ink-3/30"
									></i>{/if}
								<i
									class={cn(
										'relative size-3 rounded-full ring-4 ring-card',
										DOT[j.slot],
									)}
								></i>
							</span>
							<i class={cn('size-2 rounded-full xl:hidden', DOT[j.slot])} aria-hidden="true"></i>
							{#if flag !== ''}<span class="text-base leading-none" aria-hidden="true">{flag}</span
								>{/if}
							<span class="min-w-0 xl:flex xl:flex-1 xl:flex-col xl:items-start xl:py-2.5">
								<span class="truncate">{countryName(j.country, countries)}</span>
								<span class="hidden text-xs font-normal text-muted-foreground nums xl:block"
									>{j.days > 0 ? plural(j.days, 'day') : 'Dates to fix'}</span
								>
							</span>
							<span class="ml-auto font-medium text-muted-foreground nums xl:text-xs"
								>{fmtShort(j.start)}</span
							>
						</button>
					{/each}
				</div>
			</aside>

			<ol class="relative flex min-w-0 flex-1 flex-col gap-4 md:gap-5">
				<!-- The spine: a hairline that ties the dates together from the Fold's inner screen up. -->
				<span
					class="absolute top-2 bottom-2 left-18 hidden w-px bg-border md:block 3xl:left-22"
					aria-hidden="true"
				></span>
				{#each m.items as item, i (item.kind === 'leg' ? item.leg.id : item.kind === 'layover' ? item.key : `today-${String(i)}`)}
					{#if item.kind === 'today'}
						<li
							data-today-line
							class="relative flex scroll-mt-20 items-center gap-3 md:scroll-mt-8 md:gap-5"
						>
							<span
								class="shrink-0 text-xs font-bold tracking-widest text-seal uppercase md:w-16 md:text-right 3xl:w-20"
								>Today</span
							>
							<i class="relative h-0.5 flex-1 rounded-full bg-seal" aria-hidden="true">
								<i
									class="absolute top-1/2 -left-1 size-2.5 -translate-y-1/2 rounded-full bg-seal ring-4 ring-background"
								></i>
							</i>
						</li>
					{:else if item.kind === 'layover'}
						<li class="relative flex items-center gap-5">
							<span class="hidden shrink-0 md:block md:w-16 3xl:w-20"></span>
							<span
								class="inline-flex items-center gap-2 rounded-full bg-muted/70 px-3 py-1.5 text-sm text-muted-foreground"
							>
								<i class="w-3.5 border-t-2 border-dotted border-ink-3" aria-hidden="true"></i>
								Layover {layoverLabel(item.minutes)} in {item.where}
							</span>
						</li>
					{:else}
						<li
							data-now={item.isNow ? 'true' : undefined}
							class={cn(
								'relative flex scroll-mt-20 flex-col gap-2 md:scroll-mt-8 md:flex-row md:gap-5',
								item.when !== null && i > 0 && 'mt-3 md:mt-2',
							)}
						>
							<div class="shrink-0 md:w-16 md:pt-4 md:text-right 3xl:w-20">
								{#if item.when === 'nodate'}
									<span class="eyebrow">No date</span>
								{:else if item.when}
									<div
										class="flex items-baseline gap-2 md:sticky md:top-8 md:flex-col md:items-end md:gap-0.5"
									>
										<b
											class="font-serif text-2xl leading-none font-semibold nums md:text-3xl 3xl:text-4xl"
											>{item.when.day}</b
										>
										<span class="eyebrow md:hidden">{item.when.label}</span>
										{#each item.when.label.split(' · ') as part (part)}
											<span class="hidden eyebrow whitespace-nowrap md:block">{part}</span>
										{/each}
									</div>
								{/if}
							</div>
							<div class="min-w-0 flex-1">
								<LegCard
									leg={item.leg}
									legs={m.legs}
									{countries}
									places={trip.places}
									now={item.isNow}
									{onedit}
									{ondetail}
								/>
							</div>
						</li>
					{/if}
				{/each}
			</ol>
		</div>
	{/if}
</section>

{#if detail}
	<TripSheet
		open
		eyebrow={`${or(detail.mode, 'Transfer')}${detail.start ? ` · ${fmtDay(detail.start)}` : ''}`}
		title={or(detail.title, 'Transfer')}
		onclose={() => {
			detailId = null;
		}}
	>
		<TransferPlan leg={detail} legs={m.legs} />
		{#snippet footer()}
			{#if onedit}
				<Button
					variant="outline"
					onclick={() => {
						onedit(detail.id);
					}}>Edit</Button
				>
			{/if}
			<Button
				onclick={() => {
					detailId = null;
				}}>Close</Button
			>
		{/snippet}
	</TripSheet>
{/if}

{#if form}
	<TripForm
		target={form}
		docs={trip.col(form.col)}
		{countries}
		onclose={() => {
			form = null;
		}}
	/>
{/if}
