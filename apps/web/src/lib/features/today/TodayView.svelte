<!--
	Today (old game/public/trip.js viewToday): the trip day and where you sleep, the clocks of where you are and São
	Paulo, the day's status, today's moves and the next flight, dated cards on today or ending soon, the next events
	you could go to, the Musts still to do here, open tasks and the latest answers. "Look at another day" opens
	/today/<date> (a link you can keep); "Back to today" returns to /.
	"Today" is the date where the current leg is (tripClock), so a phone still on São Paulo time shows the right day.
	The guest sees everything; the ticks are disabled and the edit buttons hidden.
-->
<script lang="ts">
	import { offsetOn, stayName } from '@atr/shared/trip';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import PlaceRow from '#lib/components/shared/PlaceRow.svelte';
	import PlaceSheet from '#lib/components/shared/PlaceSheet.svelte';
	import type { SheetTarget } from '#lib/components/shared/PlaceSheet.types.js';
	import TimeTz from '#lib/components/shell/TimeTz.svelte';
	import * as Alert from '#lib/components/ui/alert/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Empty from '#lib/components/ui/empty/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { Skeleton } from '#lib/components/ui/skeleton/index.js';
	import { getAppData } from '#lib/content/app-data.svelte.js';
	import { verdictsOf } from '#lib/features/cards/index.js';
	import Chip from '#lib/features/money/Chip.svelte';
	import CheckRow from '#lib/features/prep/CheckRow.svelte';
	import { toggleTaskFields } from '#lib/features/prep/model.js';
	import { setVisited } from '#lib/features/trip/actions.js';
	import DayStatus from '#lib/features/trip/components/DayStatus.svelte';
	import LegCard from '#lib/features/trip/components/LegCard.svelte';
	import TransferPlan from '#lib/features/trip/components/TransferPlan.svelte';
	import TripForm from '#lib/features/trip/components/TripForm.svelte';
	import TripSheet from '#lib/features/trip/components/TripSheet.svelte';
	import type { FormTarget } from '#lib/features/trip/forms.js';
	import { countryName, fmtDay, or, plural } from '#lib/features/trip/format.js';
	import { TripData } from '#lib/features/trip/trip-data.svelte.js';
	import { write } from '#lib/sync/write.js';
	import AnswerRow from './AnswerRow.svelte';
	import Block from './Block.svelte';
	import CardLink from './CardLink.svelte';
	import {
		cityCards,
		clocks,
		countdown,
		elsewhere,
		head,
		kindLabel,
		modelFor,
		pinnedClock,
		todayPlaces,
		todayTasks,
		tripClock,
		upcomingWhen,
		type TodayTask,
	} from './model.ts';

	interface Props {
		/** The day in the URL (/today/<date>), already checked; null: the real today. */
		day: string | null;
	}

	let { day }: Props = $props();

	const app = getAppData();
	const trip = new TripData(app);
	const countries = $derived(app.content.countries);
	const canEdit = $derived(!app.isGuest);

	// The clock ticks every 30 s, so the clocks row, the countdown and the day roll over on their own.
	let ms = $state(Date.now());
	$effect(() => {
		const timer = setInterval(() => {
			ms = Date.now();
		}, 30_000);
		return () => {
			clearInterval(timer);
		};
	});

	const legs = $derived(trip.legs);
	const real = $derived(tripClock(legs, ms));
	const pinned = $derived(day !== null && day !== real.today);
	const clock = $derived(day !== null && pinned ? pinnedClock(legs, day) : real);
	const places = $derived(
		todayPlaces(
			app.content.places,
			verdictsOf(app.feedback).place,
			app.feedback?.notes.place ?? {},
			app.feedback?.ratings ?? {},
		),
	);
	const tasks = $derived(todayTasks(trip.col('tasks')));
	const visited = $derived(new Set(trip.col('visited').map((v) => v.id)));
	const m = $derived(
		modelFor({ legs, places, tasks, days: trip.days, visited: trip.col('visited') }, clock),
	);
	const h = $derived(head(m, !pinned, countries));
	const zones = $derived(clocks(m, ms, countries));
	const k = $derived(m.today);
	const moves = $derived(m.moves.filter((l) => l !== m.flight));
	const happening = $derived([...m.onlyToday, ...m.endingSoon]);
	const here = $derived(cityCards(places, m.cities));
	const stayLabel = $derived(stayName(m.stay));
	const answers = $derived(app.content.answers);

	const placesHref = $derived(resolve('/(app)/places/[cities]', { cities: m.cities.join('+') }));
	const answersHref = resolve('/(app)/places/answers');
	const answerHref = (id: string): string => resolve('/(app)/places/answers/[id]', { id });

	let form: FormTarget | null = $state(null);
	let detailId: string | null = $state(null);
	let sheet: SheetTarget | null = $state(null);
	const detail = $derived(detailId === null ? null : (legs.find((l) => l.id === detailId) ?? null));
	let busyTask: string | null = $state(null);

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
	const openPlace = (id: string): void => {
		sheet = { kind: 'place', id };
	};
	const toggleVisited = (id: string, next: boolean): void => {
		void setVisited(id, next);
	};

	async function toggleTask(x: TodayTask): Promise<void> {
		if (busyTask !== null) return;
		busyTask = x.id;
		await write('trip.write', {
			col: 'tasks',
			op: 'update',
			id: x.id,
			data: toggleTaskFields(x.status),
		});
		busyTask = null;
	}

	function pickDay(value: string): void {
		if (value === '' || value === real.today) void goto(resolve('/(app)'), { reset: false });
		else void goto(resolve('/(app)/today/[[date]]', { date: value }), { reset: false });
	}
</script>

<svelte:head><title>Today · Asia Trip Ranker</title></svelte:head>

<section class="mx-auto flex max-w-5xl flex-col gap-6" data-testid="today" data-day={k}>
	{#if trip.loading}
		<div class="flex flex-col gap-3" aria-busy="true" aria-label="Loading today">
			<Skeleton class="h-4 w-40" />
			<Skeleton class="h-9 w-64" />
			<Skeleton class="h-40 w-full" />
			<Skeleton class="h-40 w-full" />
		</div>
	{:else if trip.error}
		<h1 class="font-serif text-3xl font-semibold">Today</h1>
		<Alert.Root variant="destructive">
			<Alert.Title>The trip data isn’t answering</Alert.Title>
			<Alert.Description>{trip.error.message}</Alert.Description>
		</Alert.Root>
	{:else}
		<header class="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
			<div class="flex min-w-0 flex-col gap-1">
				<p class="text-xs font-bold tracking-widest text-ink-3 uppercase" data-testid="eyebrow">
					{h.eyebrow}
				</p>
				<h1 class="font-serif text-3xl leading-tight font-semibold text-balance">
					<span class="sr-only">{pinned ? `${fmtDay(k)}: ` : 'Today: '}</span
					>{#if h.titleStay}{`${h.title} · `}<em class="text-cat">{h.titleStay}</em
						>{:else}{h.title}{/if}
				</h1>
				{#if h.lede}<p class="max-w-prose text-sm text-ink-2" data-testid="lede">{h.lede}</p>{/if}
			</div>
			<div class="flex flex-wrap items-end gap-2">
				<label class="flex flex-col gap-1 text-xs font-semibold text-ink-3">
					<span>{pinned ? 'Looking at' : 'Look at another day'}</span>
					<Input
						type="date"
						class="w-auto"
						value={k}
						onchange={(e: Event & { currentTarget: HTMLInputElement }) => {
							pickDay(e.currentTarget.value);
						}}
					/>
				</label>
				{#if pinned}
					<Button variant="outline" href={resolve('/(app)')}>Back to today</Button>
				{/if}
			</div>
		</header>

		<p
			class="-mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm text-ink-2"
			data-testid="clocks"
			aria-label="Local times"
		>
			{#each zones as c (c.country)}
				<span data-clock={c.country}>
					{c.name}
					<b class="font-semibold text-ink"
						>{c.weekday}
						<TimeTz time={c.time} offset={c.offset} /></b
					>
				</span>
			{/each}
		</p>

		{#if m.phase === 'none' && m.tasksTotal === 0}
			<div class="rounded-lg border border-dashed border-border">
				<Empty.Root>
					<Empty.Header>
						<Empty.Title>No trip dates yet</Empty.Title>
						<Empty.Description
							>Add a flight or a stay in the Itinerary to fill this page.</Empty.Description
						>
					</Empty.Header>
				</Empty.Root>
			</div>
		{/if}

		<div class="grid gap-6 lg:grid-cols-2 lg:items-start lg:gap-8">
			<div class="flex min-w-0 flex-col gap-6">
				{#if m.stay}
					<Block title="Where you are" testid="where">
						<DayStatus
							day={m.day}
							country={m.country ?? undefined}
							fallbackOffset={offsetOn(legs, k)}
						/>
						<LegCard leg={m.stay} {legs} {countries} {places} now {onedit} {ondetail} />
					</Block>
				{:else if m.day}
					<Block title={pinned ? fmtDay(k) : 'Today'} testid="where">
						<DayStatus
							day={m.day}
							country={m.country ?? undefined}
							fallbackOffset={offsetOn(legs, k)}
						/>
					</Block>
				{/if}

				{#if moves.length > 0}
					<Block title={`${pinned ? 'That day' : 'Today'}: moves`} testid="moves">
						<div class="flex flex-col gap-3">
							{#each moves as l (l.id)}
								<LegCard leg={l} {legs} {countries} {places} {onedit} {ondetail} />
							{/each}
						</div>
					</Block>
				{/if}

				<Block title="Next flight" testid="next-flight">
					{#if m.flight}
						<LegCard
							leg={m.flight}
							{legs}
							{countries}
							{places}
							countdown={countdown(m.flight, legs, clock, pinned, ms)}
							{onedit}
							{ondetail}
						/>
					{:else}
						<div class="rounded-2xl border border-dashed border-border px-4 py-5 text-sm">
							<b class="block font-semibold">No flight ahead</b>
							<span class="text-ink-3">Every flight in the itinerary has left.</span>
						</div>
					{/if}
				</Block>

				{#if m.tasksTotal > 0}
					<Block
						title="To do"
						small={`${String(m.tasks.length)} open of ${String(m.tasksTotal)}`}
						testid="tasks"
					>
						{#if m.tasks.length > 0}
							<ul
								class="flex flex-col divide-y divide-border rounded-xl border border-border bg-card"
								aria-label="Open tasks"
							>
								{#each m.tasks.slice(0, 5) as x (x.id)}
									<CheckRow
										id={x.id}
										title={x.title}
										note={x.note}
										checked={x.status === 'done'}
										indeterminate={x.status === 'doing'}
										checkLabel={`Mark done: ${x.title}`}
										{canEdit}
										busy={busyTask === x.id}
										ontoggle={() => void toggleTask(x)}
										onedit={() => (form = { col: 'tasks', id: x.id })}
									>
										{#snippet extra()}
											{#if x.status === 'doing'}<Chip tone="planned">In progress</Chip>{/if}
											{#if x.suggested}<Chip tone="booked">Suggested</Chip>{/if}
										{/snippet}
									</CheckRow>
								{/each}
							</ul>
							{#if m.tasks.length > 5}
								<CardLink href={resolve('/(app)/prep/todo')}
									><b>{m.tasks.length - 5} more</b> to do</CardLink
								>
							{/if}
						{:else}
							<p class="text-sm text-ink-3">Everything is ticked.</p>
						{/if}
					</Block>
				{/if}
			</div>

			<div class="flex min-w-0 flex-col gap-6">
				{#if m.phase === 'during'}
					<Block title="Only today, or ending soon" testid="only-today">
						{#if happening.length > 0}
							<ul class="flex flex-col gap-1">
								{#each happening as x (x.place.id)}
									<PlaceRow
										place={x.place}
										visited={visited.has(x.place.id)}
										verdict={x.place.verdict}
										note={x.place.note}
										onopen={openPlace}
										ontogglevisited={toggleVisited}
									>
										{#snippet when()}
											<b class="font-semibold text-seal">{kindLabel(x)}</b>{elsewhere(x)}
										{/snippet}
									</PlaceRow>
								{/each}
							</ul>
						{:else}
							<p class="text-sm text-ink-3">
								Nothing with a date falls on {pinned ? fmtDay(k) : 'today'} in {or(
									countryName(m.country, countries),
									'this stop',
								)}.
							</p>
						{/if}
					</Block>
				{/if}

				{#if m.upcoming.length > 0}
					<Block title="Next events you could go to" testid="upcoming">
						<ul class="flex flex-col gap-1">
							{#each m.upcoming as u (u.place.id)}
								{@const w = upcomingWhen(u, k)}
								<PlaceRow
									place={u.place}
									visited={visited.has(u.place.id)}
									verdict={u.place.verdict}
									note={u.place.note}
									onopen={openPlace}
								>
									{#snippet when()}
										<b class="font-semibold text-seal">{w.date}</b>{w.rest}
									{/snippet}
								</PlaceRow>
							{/each}
						</ul>
						<p class="text-xs text-ink-3">
							Dated cards in a city you sleep in, or a day trip from it, on the days you are there.
							Skipped cards and whole-season dates are left out.
							<a
								class="font-medium text-cat underline underline-offset-2"
								href={resolve('/(app)/trip/calendar/[[date]]', {})}>Calendar →</a
							>
						</p>
					</Block>
				{/if}

				{#if m.phase === 'during' && m.cities.length > 0}
					<Block title={`Still to do in ${stayLabel}`} testid="musts">
						{#if m.musts.length > 0}
							<ul class="flex flex-col gap-1">
								{#each m.musts.slice(0, 6) as p (p.id)}
									<PlaceRow
										place={p}
										visited={visited.has(p.id)}
										verdict={p.verdict}
										note={p.note}
										showCity={m.cities.length > 1}
										onopen={openPlace}
										ontogglevisited={toggleVisited}
									/>
								{/each}
							</ul>
						{:else}
							<p class="text-sm text-ink-3">
								{here.must > 0 ? 'Every Must here is ticked.' : 'No Must cards in this city.'}
							</p>
						{/if}
						<CardLink href={placesHref}
							><b>All {plural(here.n, 'card')}</b> in {stayLabel}{m.musts.length > 6
								? ` · ${String(m.musts.length - 6)} more Must`
								: ''}</CardLink
						>
					</Block>
				{/if}

				{#if answers.length > 0}
					<Block title="Latest answers" small={plural(answers.length, 'answer')} testid="answers">
						<ul
							class="flex flex-col divide-y divide-border rounded-xl border border-border bg-card px-4 py-3"
						>
							{#each answers.slice(0, 3) as a (a.id)}
								<AnswerRow
									answer={a}
									href={answerHref(a.id)}
									onopenabout={(kind: SheetTarget['kind'], id: string) => {
										sheet = { kind, id };
									}}
								/>
							{/each}
						</ul>
						<CardLink href={answersHref}><b>All answers</b>, by country</CardLink>
					</Block>
				{/if}
			</div>
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
		<TransferPlan leg={detail} {legs} />
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

<PlaceSheet
	target={sheet}
	onclose={() => {
		sheet = null;
	}}
/>
