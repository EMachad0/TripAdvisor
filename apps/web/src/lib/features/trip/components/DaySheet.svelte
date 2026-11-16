<!--
	One calendar day (the old openDay): where you sleep and the day number, work / vacation / holiday and the note,
	the legs of that day, the dated cards you could go to, and Edit day / Add a note, Open as Today, Close.
-->
<script lang="ts">
	import { offsetOn, stayName } from '@atr/shared/trip';
	import { resolve } from '$app/paths';
	import PlaceRow from '#lib/components/shared/PlaceRow.svelte';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Empty from '#lib/components/ui/empty/index.js';
	import type { ContentCountry } from '#lib/content/types.js';
	import { daySheetModel } from '../calendar.ts';
	import { fmtDay, fmtShort } from '../format.ts';
	import type { TripPlace } from '../trip-data.svelte.ts';
	import type { TripDay, TripLeg } from '../types.ts';
	import DayStatus from './DayStatus.svelte';
	import LegCard from './LegCard.svelte';
	import TripSheet from './TripSheet.svelte';

	interface Props {
		day: string;
		legs: readonly TripLeg[];
		days: readonly TripDay[];
		places: readonly TripPlace[];
		countries: readonly ContentCountry[];
		canEdit: boolean;
		onclose: () => void;
		onedit: (day: string) => void;
		ondetail: (legId: string) => void;
		onopenplace: (id: string) => void;
	}

	let {
		day,
		legs,
		days,
		places,
		countries,
		canEdit,
		onclose,
		onedit,
		ondetail,
		onopenplace,
	}: Props = $props();

	const m = $derived(daySheetModel(legs, days, places, day));
	const todayHref = $derived(resolve('/(app)/today/[[date]]', { date: day }));
</script>

<TripSheet
	open
	title={`${fmtDay(day)} ${day.slice(0, 4)}`}
	subtitle={`${m.position}${m.stay ? ` · ${stayName(m.stay)}` : ''}`}
	{onclose}
>
	<div data-testid="day-sheet" data-day={day} class="flex flex-col gap-4">
		<DayStatus day={m.day} country={m.stay?.country} fallbackOffset={offsetOn(legs, day)} />
		{#if m.events.length > 0}
			<div class="grid gap-3">
				{#each m.events as l (l.id)}
					<LegCard leg={l} {legs} {countries} {places} {ondetail} />
				{/each}
			</div>
		{:else if m.day === null}
			<div class="rounded-2xl border border-dashed border-border">
				<Empty.Root>
					<Empty.Header>
						<Empty.Title>Nothing planned</Empty.Title>
						<Empty.Description>Add a stop for this day in the Itinerary.</Empty.Description>
					</Empty.Header>
				</Empty.Root>
			</div>
		{/if}
		{#if m.dated.length > 0}
			<h3 class="mt-2 eyebrow">
				Dated cards on this day
			</h3>
			<ul class="-mx-2 flex flex-col">
				{#each m.dated as h (h.place.id)}
					<PlaceRow place={h.place} verdict={h.place.verdict} onopen={onopenplace}>
						{#snippet when()}
							<b class="font-semibold text-seal"
								>{h.kind === 'only'
									? 'This day only'
									: h.kind === 'last'
										? 'Last day'
										: `Until ${fmtShort(h.to)}`}</b
							>{h.reach === 'here'
								? ''
								: ` · in ${h.place.cityName}${h.reach === 'near' ? ', a day trip' : ', far from here'}`}
						{/snippet}
					</PlaceRow>
				{/each}
			</ul>
		{/if}
		<div
			class="sticky bottom-0 z-10 -mx-4 -mb-4 flex flex-wrap items-center gap-2 border-t border-border/70 bg-popover px-4 py-4 md:-mx-6 md:-mb-5 md:px-6 3xl:-mx-8 3xl:px-8"
		>
			{#if canEdit}
				<Button
					variant="outline"
					onclick={() => {
						onedit(day);
					}}>{m.day ? 'Edit day' : 'Add a note'}</Button
				>
			{/if}
			<Button variant="outline" href={todayHref}>Open as Today</Button>
			<span class="flex-1"></span>
			<Button onclick={onclose}>Close</Button>
		</div>
	</div>
</TripSheet>
