<!--
	Trip › Calendar (the old viewCalendar and openDay): where you sleep each night, coloured by country, with
	flights, transfers, work and vacation days, Brazilian holidays and dated cards; the work / vacation strip; a
	day sheet per day at /trip/calendar/<date> (a link you can keep; Back closes it). The guest sees everything;
	"Edit day" / "Add a note" are hidden.
-->
<script lang="ts">
	import LaptopIcon from '@lucide/svelte/icons/laptop';
	import PlaneIcon from '@lucide/svelte/icons/plane';
	import StarIcon from '@lucide/svelte/icons/star';
	import SunIcon from '@lucide/svelte/icons/sun';
	import { localKey } from '@atr/shared/trip';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import PlaceSheet from '#lib/components/shared/PlaceSheet.svelte';
	import * as Empty from '#lib/components/ui/empty/index.js';
	import { Skeleton } from '#lib/components/ui/skeleton/index.js';
	import { getAppData } from '#lib/content/app-data.svelte.js';
	import { cn } from '#lib/utils.js';
	import { calendarModel, type ColorSlot } from './calendar.ts';
	import { countryName, fmtDay, fmtShort, or, plural } from './format.ts';
	import { TripData } from './trip-data.svelte.ts';
	import DaySheet from './components/DaySheet.svelte';
	import TransferPlan from './components/TransferPlan.svelte';
	import TripForm from './components/TripForm.svelte';
	import type { FormTarget } from './forms.ts';
	import TripHeader from './components/TripHeader.svelte';
	import TripSheet from './components/TripSheet.svelte';
	import { Button } from '#lib/components/ui/button/index.js';

	interface Props {
		/** The day in the URL (/trip/calendar/<date>), already checked; null: no day sheet. */
		day: string | null;
	}

	let { day }: Props = $props();

	const app = getAppData();
	const trip = new TripData(app);
	const countries = $derived(app.content.countries);
	const canEdit = $derived(!app.isGuest);
	const today = localKey();
	const m = $derived(calendarModel(trip.legs, trip.days, trip.places, today));

	let form: FormTarget | null = $state(null);
	let detailId: string | null = $state(null);
	let place: { kind: 'place'; id: string } | null = $state(null);
	const detail = $derived(detailId === null ? null : (m.legs.find((l) => l.id === detailId) ?? null));

	/** True when this page opened the day sheet itself, so Back (history) closes it. */
	let pushed = false;
	function openDay(k: string): void {
		pushed = true;
		void goto(resolve('/(app)/trip/calendar/[[date]]', { date: k }), { reset: false });
	}
	function closeDay(): void {
		if (pushed) {
			pushed = false;
			history.back();
		} else {
			void goto(resolve('/(app)/trip/calendar/[[date]]', {}), { reset: false, replace: true });
		}
	}

	const BG: Record<ColorSlot, string> = {
		1: 'bg-k1/20 border-b-k1',
		2: 'bg-k2/20 border-b-k2',
		3: 'bg-k3/20 border-b-k3',
		4: 'bg-k4/20 border-b-k4',
		5: 'bg-k5/20 border-b-k5',
		6: 'bg-k6/20 border-b-k6',
		7: 'bg-k7/20 border-b-k7',
	};
	const SWATCH: Record<ColorSlot, string> = {
		1: 'bg-k1/25 border-k1',
		2: 'bg-k2/25 border-k2',
		3: 'bg-k3/25 border-k3',
		4: 'bg-k4/25 border-k4',
		5: 'bg-k5/25 border-k5',
		6: 'bg-k6/25 border-k6',
		7: 'bg-k7/25 border-k7',
	};
	const slot = (i: number): ColorSlot => ((i % 7) + 1) as ColorSlot;
</script>

<section data-testid="calendar">
	<TripHeader
		eyebrow="Where you sleep each night"
		title="Calendar"
		lede="Flights, work and vacation days, Brazilian holidays and dated cards. Tap a day to see its plans and notes."
	/>

	{#if trip.loading}
		<div class="grid gap-7 sm:grid-cols-2" aria-busy="true" aria-label="Loading the calendar">
			<Skeleton class="aspect-square w-full" />
			<Skeleton class="aspect-square w-full" />
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
	{:else if m.span === null}
		<div class="rounded-lg border border-dashed border-border">
			<Empty.Root>
			<Empty.Header>
				<Empty.Title>Nothing dated yet</Empty.Title>
				<Empty.Description>Add stops with dates in the Itinerary to fill the calendar.</Empty.Description>
			</Empty.Header>
		</Empty.Root>
		</div>
	{:else}
		<div class="mb-3.5 flex flex-wrap gap-x-3.5 gap-y-1.5 text-sm text-ink-3" data-testid="legend">
			{#each m.keys as k, i (k)}
				<span class="inline-flex items-center gap-1.5"
					><i class={cn('size-3 rounded border-2', SWATCH[slot(i)])} aria-hidden="true"></i>{countryName(
						k,
						countries,
					) || k}</span
				>
			{/each}
			<span class="inline-flex items-center gap-1.5"
				><i class="hatch size-3 rounded border-2 border-dashed border-ink-3" aria-hidden="true"></i>Stop not
				fixed</span
			>
			<span class="inline-flex items-center gap-1.5"
				><PlaneIcon class="size-3.5 rotate-45 text-cat" aria-hidden="true" /> Flight</span
			>
			<span class="inline-flex items-center gap-1.5"><LaptopIcon class="size-3.5" aria-hidden="true" /> Work</span>
			<span class="inline-flex items-center gap-1.5"><SunIcon class="size-3.5" aria-hidden="true" /> Vacation</span>
			<span class="inline-flex items-center gap-1.5 font-semibold text-seal"
				><StarIcon class="size-3.5 fill-current" aria-hidden="true" /> Holiday in Brazil</span
			>
			<span class="inline-flex items-center gap-1.5"
				><i class="size-2 rounded-full border-2 border-ink" aria-hidden="true"></i>Note or dated card</span
			>
		</div>

		{#if m.periods.length > 0}
			<div class="mb-5 flex flex-wrap gap-2" data-testid="periods">
				{#each m.periods as r (r.from)}
					<div class="flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-sm">
						{#if r.kind === 'work'}<LaptopIcon class="size-4" aria-hidden="true" />{:else}<SunIcon
								class="size-4"
								aria-hidden="true"
							/>{/if}
						<b>{r.kind === 'work' ? 'Work' : 'Vacation'}</b>
						<span class="whitespace-nowrap text-ink-3 tabular-nums"
							>{fmtShort(r.from)}{r.from !== r.to ? ` – ${fmtShort(r.to)}` : ''} · {plural(r.n, 'weekday')}</span
						>
					</div>
				{/each}
			</div>
		{/if}

		<div class="grid gap-x-8 gap-y-7 md:grid-cols-2">
			{#each m.months as month (month.key)}
				<div data-month={month.key}>
					<h3 class="mb-2 font-serif text-xl font-semibold">
						{month.name} <span class="font-normal text-ink-3">{month.year}</span>
					</h3>
					<div class="grid grid-cols-7 gap-0.75">
						{#each ['S', 'M', 'T', 'W', 'T', 'F', 'S'] as w, i (i)}
							<div class="pb-1 text-center text-xs font-bold text-ink-3" aria-hidden="true">{w}</div>
						{/each}
						{#each { length: month.lead }, i (i)}<div></div>{/each}
						{#each month.days as c (c.key)}
							<button
								type="button"
								data-date={c.key}
								aria-label={c.aria}
								onclick={() => {
									openDay(c.key);
								}}
								class={cn(
									'relative flex aspect-square min-w-0 flex-col justify-between overflow-hidden rounded-lg bg-card px-1 py-1.5 text-left ring-1 ring-border ring-inset hover:brightness-95',
									c.out && 'bg-transparent text-ink-3 ring-0',
									c.color !== null && !c.tbd && ['border-b-3', BG[c.color]],
									c.color !== null && c.tbd && 'hatch',
									c.today && 'outline-2 -outline-offset-1 outline-seal',
								)}
							>
								<span class="flex min-w-0 items-center gap-0.5">
									<b class={cn('text-xs font-bold tabular-nums', (c.today || c.holiday !== '') && 'text-seal')}
										>{c.day}</b
									>
									{#if c.status === 'work'}<LaptopIcon class="size-2.5" aria-hidden="true" />{/if}
									{#if c.status === 'vacation'}<SunIcon class="size-2.5" aria-hidden="true" />{/if}
									{#if c.holiday !== ''}<StarIcon class="size-2.5 fill-current text-seal" aria-hidden="true" />{/if}
								</span>
								<span class="absolute top-1.5 right-1 flex items-center gap-0.5">
									{#if c.flight}<PlaneIcon class="size-2.5 rotate-45 text-ink" aria-hidden="true" />{/if}
									{#if c.transfer}<i class="size-1.5 rounded-full bg-ink" aria-hidden="true"></i>{/if}
									{#if c.dot}<i class="size-1.75 rounded-full border border-ink" aria-hidden="true"></i>{/if}
								</span>
								{#if c.label !== ''}
									<span class="truncate text-xs leading-tight font-semibold">{c.label}</span>
								{/if}
							</button>
						{/each}
					</div>
				</div>
			{/each}
		</div>
	{/if}
</section>

{#if day !== null && !trip.loading && detail === null && form === null}
	<DaySheet
		{day}
		legs={m.legs}
		days={trip.days}
		places={trip.places}
		{countries}
		{canEdit}
		onclose={closeDay}
		onedit={(k: string) => {
			form = { col: 'days', id: k };
		}}
		ondetail={(id: string) => {
			detailId = id;
		}}
		onopenplace={(id: string) => {
			place = { kind: 'place', id };
		}}
	/>
{/if}

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
			{#if canEdit}
				<Button
					variant="outline"
					onclick={() => {
						form = { col: 'legs', id: detail.id };
						detailId = null;
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

<PlaceSheet
	target={place}
	onclose={() => {
		place = null;
	}}
/>

<style>
	/* A stop that is not fixed yet: hatched (the old .is-tbd / .is-hatch). */
	.hatch {
		background: repeating-linear-gradient(
			135deg,
			transparent 0 3px,
			var(--line) 3px 5px
		);
	}
</style>
