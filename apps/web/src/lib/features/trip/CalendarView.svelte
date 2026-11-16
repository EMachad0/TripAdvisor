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
		1: 'bg-k1/16 border-b-k1',
		2: 'bg-k2/16 border-b-k2',
		3: 'bg-k3/16 border-b-k3',
		4: 'bg-k4/16 border-b-k4',
		5: 'bg-k5/16 border-b-k5',
		6: 'bg-k6/16 border-b-k6',
		7: 'bg-k7/16 border-b-k7',
	};
	const SWATCH: Record<ColorSlot, string> = {
		1: 'bg-k1',
		2: 'bg-k2',
		3: 'bg-k3',
		4: 'bg-k4',
		5: 'bg-k5',
		6: 'bg-k6',
		7: 'bg-k7',
	};
	const slot = (i: number): ColorSlot => ((i % 7) + 1) as ColorSlot;
</script>

<section class="page-wide" data-testid="calendar">
	<TripHeader
		eyebrow="Where you sleep each night"
		title="Calendar"
		lede="Flights, work and vacation days, Brazilian holidays and dated cards. Tap a day to see its plans and notes."
	/>

	{#if trip.loading}
		<div
			class="flex flex-col gap-6 xl:flex-row xl:gap-10"
			aria-busy="true"
			aria-label="Loading the calendar"
		>
			<Skeleton class="h-16 w-full xl:h-96 xl:w-64 xl:shrink-0 3xl:w-72" />
			<div class="grid min-w-0 flex-1 gap-6 md:grid-cols-2">
				<Skeleton class="aspect-square w-full" />
				<Skeleton class="aspect-square w-full" />
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
	{:else if m.span === null}
		<div class="panel">
			<Empty.Root>
				<Empty.Header>
					<Empty.Title>Nothing dated yet</Empty.Title>
					<Empty.Description
						>Add stops with dates in the Itinerary to fill the calendar.</Empty.Description
					>
				</Empty.Header>
			</Empty.Root>
		</div>
	{:else}
		<div class="flex flex-col gap-5 xl:flex-row xl:items-start xl:gap-10 3xl:gap-14">
			<aside
				class="flex flex-col gap-4 xl:sticky xl:top-9 xl:w-64 xl:shrink-0 xl:gap-6 xl:panel xl:p-5 3xl:top-11 3xl:w-72 3xl:p-6"
			>
				<div>
					<p class="mb-2.5 hidden eyebrow xl:block">Key</p>
					<div
						class="flex flex-wrap gap-x-3.5 gap-y-1.5 text-xs text-muted-foreground md:text-sm xl:grid xl:grid-cols-2 xl:gap-x-3 xl:gap-y-2"
						data-testid="legend"
					>
						{#each m.keys as k, i (k)}
							<span class="inline-flex min-w-0 items-center gap-1.5 text-foreground"
								><i class={cn('size-3 shrink-0 rounded-sm', SWATCH[slot(i)])} aria-hidden="true"
								></i><span class="truncate">{countryName(k, countries) || k}</span></span
							>
						{/each}
						<span class="inline-flex items-center gap-1.5 xl:col-span-2"
							><i class="hatch size-3 shrink-0 rounded-sm ring-1 ring-ink-3/40" aria-hidden="true"
							></i>Stop not fixed</span
						>
						<span class="inline-flex items-center gap-1.5"
							><PlaneIcon class="size-3.5 rotate-45 text-cat" aria-hidden="true" /> Flight</span
						>
						<span class="inline-flex items-center gap-1.5"
							><LaptopIcon class="size-3.5" aria-hidden="true" /> Work</span
						>
						<span class="inline-flex items-center gap-1.5"
							><SunIcon class="size-3.5" aria-hidden="true" /> Vacation</span
						>
						<span class="inline-flex items-center gap-1.5 text-seal xl:col-span-2"
							><StarIcon class="size-3.5 fill-current" aria-hidden="true" /> Holiday in Brazil</span
						>
						<span class="inline-flex items-center gap-1.5 xl:col-span-2"
							><i class="size-2 shrink-0 rounded-full border-2 border-ink" aria-hidden="true"
							></i>Note or dated card</span
						>
					</div>
				</div>

				{#if m.periods.length > 0}
					<div class="-mx-4 md:-mx-6 xl:mx-0 xl:border-t xl:border-border/70 xl:pt-5">
						<p class="mb-2.5 hidden eyebrow xl:block">Work and vacation</p>
						<div
							class="flex no-scrollbar gap-2 overflow-x-auto px-4 md:px-6 xl:flex-col xl:overflow-visible xl:px-0"
							data-testid="periods"
						>
							{#each m.periods as r (r.from)}
								<div
									class={cn(
										'flex shrink-0 items-center gap-2.5 rounded-full py-2 pr-4 pl-2 text-sm whitespace-nowrap xl:rounded-xl xl:py-2 xl:pr-3',
										r.kind === 'work' ? 'bg-foreground/6' : 'bg-ok/10',
									)}
								>
									<span
										class={cn(
											'grid size-7 shrink-0 place-items-center rounded-full',
											r.kind === 'work' ? 'bg-card text-foreground' : 'bg-card text-ok',
										)}
									>
										{#if r.kind === 'work'}<LaptopIcon
												class="size-3.5"
												aria-hidden="true"
											/>{:else}<SunIcon class="size-3.5" aria-hidden="true" />{/if}
									</span>
									<span class="flex min-w-0 items-baseline gap-1.5 xl:flex-col xl:gap-0">
										<b class="font-semibold">{r.kind === 'work' ? 'Work' : 'Vacation'}</b>
										<span class="text-muted-foreground nums xl:text-xs"
											>{fmtShort(r.from)}{r.from !== r.to ? ` – ${fmtShort(r.to)}` : ''} · {plural(
												r.n,
												'weekday',
											)}</span
										>
									</span>
								</div>
							{/each}
						</div>
					</div>
				{/if}
			</aside>

			<div class="grid min-w-0 flex-1 gap-x-6 gap-y-8 md:grid-cols-2 xl:gap-x-8 3xl:gap-x-12">
				{#each m.months as month (month.key)}
					<div data-month={month.key} class="@container min-w-0">
						<h3
							class="mb-3 flex items-baseline gap-2 font-serif text-xl font-semibold tracking-tight md:text-2xl"
						>
							{month.name} <span class="font-normal text-muted-foreground">{month.year}</span>
						</h3>
						<div class="grid grid-cols-7 gap-1 @md:gap-1.5">
							{#each ['S', 'M', 'T', 'W', 'T', 'F', 'S'] as w, i (i)}
								<div
									class="pb-1 text-center text-2xs font-semibold text-muted-foreground"
									aria-hidden="true"
								>
									{w}
								</div>
							{/each}
							{#each { length: month.lead }, i (i)}<div></div>{/each}
							{#each month.days as c (c.key)}
								<button
									type="button"
									data-date={c.key}
									aria-label={c.aria}
									aria-current={c.today ? 'date' : undefined}
									onclick={() => {
										openDay(c.key);
									}}
									class={cn(
										'relative flex aspect-square min-w-0 flex-col justify-between overflow-hidden rounded-lg bg-card p-1 text-left ring-1 ring-border/70 transition duration-200 ease-soft ring-inset hover:z-10 hover:shadow-soft hover:ring-2 hover:ring-cat/50 focus-visible:z-10 focus-visible:ring-3 focus-visible:ring-ring focus-visible:outline-none @md:p-1.5 @lg:rounded-xl @lg:p-2',
										c.out && 'bg-transparent text-muted-foreground ring-0',
										c.color !== null && !c.tbd && ['border-b-3 ring-0', BG[c.color]],
										c.color !== null && c.tbd && 'hatch ring-ink-3/25',
										c.today && 'outline-2 -outline-offset-1 outline-seal',
										c.key === day && 'z-10 ring-3 ring-cat',
									)}
								>
									<span class="flex min-w-0 items-center gap-0.5">
										<b
											class={cn(
												'text-xs leading-none font-semibold nums @lg:text-sm',
												c.holiday !== '' && 'text-seal',
												c.today &&
													'-m-0.5 grid size-5 place-items-center rounded-full bg-seal text-primary-foreground @lg:size-6',
											)}>{c.day}</b
										>
										{#if c.status === 'work'}<LaptopIcon
												class="size-2.5 shrink-0 opacity-70 @lg:size-3"
												aria-hidden="true"
											/>{/if}
										{#if c.status === 'vacation'}<SunIcon
												class="size-2.5 shrink-0 opacity-70 @lg:size-3"
												aria-hidden="true"
											/>{/if}
										{#if c.holiday !== ''}<StarIcon
												class="size-2.5 shrink-0 fill-current text-seal @lg:size-3"
												aria-hidden="true"
											/>{/if}
									</span>
									<span
										class="absolute top-1 right-1 flex items-center gap-0.5 @md:top-1.5 @md:right-1.5 @lg:top-2 @lg:right-2"
									>
										{#if c.flight}<PlaneIcon
												class="size-2.5 rotate-45 text-cat @lg:size-3.5"
												aria-hidden="true"
											/>{/if}
										{#if c.transfer}<i class="size-1.5 rounded-full bg-ink" aria-hidden="true"
											></i>{/if}
										{#if c.dot}<i class="size-1.75 rounded-full border border-ink" aria-hidden="true"
											></i>{/if}
									</span>
									{#if c.label !== ''}
										<span
											class="truncate text-3xs leading-tight font-semibold @md:text-2xs @lg:text-xs"
											>{c.label}</span
										>
									{/if}
								</button>
							{/each}
						</div>
					</div>
				{/each}
			</div>
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
		{#snippet footer()}
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
