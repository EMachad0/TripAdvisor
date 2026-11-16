<!--
	Trip › Itinerary (the old viewItinerary): flights, stays, transfers and notes in date order with the date
	column, the red Today line, layovers, country jump chips, the transfer plan sheet and the stop form. During the
	trip it opens at today. The guest sees everything; Add stop and the edit buttons are hidden.
-->
<script lang="ts">
	import PlusIcon from '@lucide/svelte/icons/plus';
	import { tick } from 'svelte';
	import { localKey } from '@atr/shared/trip';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Empty from '#lib/components/ui/empty/index.js';
	import { Skeleton } from '#lib/components/ui/skeleton/index.js';
	import { getAppData } from '#lib/content/app-data.svelte.js';
	import { countryFlag, countryName, fmtDay, fmtShort, or } from './format.ts';
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

	let form: FormTarget | null = $state(null);
	let detailId: string | null = $state(null);
	const detail = $derived(detailId === null ? null : (m.legs.find((l) => l.id === detailId) ?? null));

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

<section class="mx-auto max-w-3xl" data-testid="itinerary">
	<TripHeader eyebrow={m.eyebrow} title="Itinerary" lede={trip.loading ? undefined : m.lede}>
		{#snippet action()}
			{#if canEdit}
				<Button
					onclick={() => {
						form = { col: 'legs', id: null };
					}}><PlusIcon data-icon="inline-start" />Add stop</Button
				>
			{/if}
		{/snippet}
	</TripHeader>

	{#if trip.loading}
		<div class="flex flex-col gap-3" aria-busy="true" aria-label="Loading the itinerary">
			<Skeleton class="h-36 w-full" />
			<Skeleton class="h-48 w-full" />
			<Skeleton class="h-36 w-full" />
		</div>
	{:else if trip.error}
		<div class="rounded-lg border border-dashed border-border">
			<Empty.Root>
			<Empty.Header>
				<Empty.Title>Could not load the trip</Empty.Title>
				<Empty.Description>{trip.error.message}</Empty.Description>
			</Empty.Header>
		</Empty.Root>
		</div>
	{:else if m.legs.length === 0}
		<div class="rounded-lg border border-dashed border-border">
			<Empty.Root>
			<Empty.Header>
				<Empty.Title>No stops yet</Empty.Title>
				<Empty.Description>Add a flight or a stay to start the timeline.</Empty.Description>
			</Empty.Header>
		</Empty.Root>
		</div>
	{:else}
		<div class="mb-5 flex flex-wrap gap-2" aria-label="Jump to a country">
			{#each m.jumps as j (j.id)}
				{@const flag = countryFlag(j.country, countries)}
				<button
					type="button"
					class="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3.5 py-2 text-sm font-semibold text-ink-2 hover:border-ink-3 hover:text-ink"
					onclick={() => {
						jump(j.id);
					}}
				>
					{flag !== '' ? `${flag} ` : ''}{countryName(j.country, countries)}
					<span class="font-medium text-ink-3">{fmtShort(j.start)}</span>
				</button>
			{/each}
		</div>
		<ol class="flex flex-col gap-3">
			{#each m.items as item, i (item.kind === 'leg' ? item.leg.id : item.kind === 'layover' ? item.key : `today-${String(i)}`)}
				{#if item.kind === 'today'}
					<li data-today-line class="flex scroll-mt-32 items-center gap-2.5 sm:gap-3.5">
						<span class="w-11 shrink-0 text-right text-xs font-bold tracking-widest text-seal uppercase sm:w-16"
							>Today</span
						>
						<i class="h-0 flex-1 border-t-2 border-seal" aria-hidden="true"></i>
					</li>
				{:else if item.kind === 'layover'}
					<li class="flex gap-2.5 sm:gap-3.5">
						<span class="w-11 shrink-0 sm:w-16"></span>
						<span class="flex items-center gap-2 text-sm text-ink-3">
							<i class="w-3.5 border-t-2 border-dotted border-ink-3" aria-hidden="true"></i>
							Layover {layoverLabel(item.minutes)} in {item.where}
						</span>
					</li>
				{:else}
					<li
						data-now={item.isNow ? 'true' : undefined}
						class="flex scroll-mt-32 gap-2.5 sm:gap-3.5"
					>
						<div class="w-11 shrink-0 pt-3.5 text-right sm:w-16">
							{#if item.when === 'nodate'}
								<span class="text-xs font-bold tracking-wider text-ink-3 uppercase">No date</span>
							{:else if item.when}
								<b class="block font-serif text-xl leading-none font-semibold sm:text-2xl">{item.when.day}</b>
								<span class="text-xs font-bold tracking-wider text-ink-3 uppercase">{item.when.label}</span>
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
		<div class="flex flex-wrap gap-2 pt-1 pb-2">
			<span class="flex-1"></span>
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
		</div>
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
