<!--
	Today (old game/public/trip.js viewToday): the trip day and where you sleep, the clocks of where you are and São
	Paulo, the day's status, today's moves and the next flight, dated cards on today or ending soon, the next events
	you could go to, the Musts still to do here, open tasks and the latest answers. "Look at another day" opens
	/today/<date> (a link you can keep); "Back to today" returns to /.
	"Today" is the date where the current leg is (tripClock), so a phone still on São Paulo time shows the right day.
	The guest sees everything; the ticks are disabled and the edit buttons hidden.
-->
<script lang="ts">
	import CalendarClockIcon from '@lucide/svelte/icons/calendar-clock';
	import CalendarDaysIcon from '@lucide/svelte/icons/calendar-days';
	import CircleDashedIcon from '@lucide/svelte/icons/circle-dashed';
	import HourglassIcon from '@lucide/svelte/icons/hourglass';
	import ListChecksIcon from '@lucide/svelte/icons/list-checks';
	import MapPinnedIcon from '@lucide/svelte/icons/map-pinned';
	import MessageCircleQuestionIcon from '@lucide/svelte/icons/message-circle-question-mark';
	import PlaneIcon from '@lucide/svelte/icons/plane';
	import RouteIcon from '@lucide/svelte/icons/route';
	import StarIcon from '@lucide/svelte/icons/star';
	import { offsetOn, stayName, stepsOf, taskDates } from '@atr/shared/trip';
	import { toast } from 'svelte-sonner';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import PlaceRow from '#lib/components/shared/PlaceRow.svelte';
	import PlaceSheet from '#lib/components/shared/PlaceSheet.svelte';
	import type { SheetTarget } from '#lib/components/shared/PlaceSheet.types.js';
	import * as Alert from '#lib/components/ui/alert/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Empty from '#lib/components/ui/empty/index.js';
	import { Skeleton } from '#lib/components/ui/skeleton/index.js';
	import { getAppData } from '#lib/content/app-data.svelte.js';
	import { verdictsOf } from '#lib/features/cards/index.js';
	import Chip from '#lib/features/money/Chip.svelte';
	import CheckRow from '#lib/features/prep/CheckRow.svelte';
	import { toggleTaskFields, whenOf } from '#lib/features/prep/model.js';
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
	import { cn } from '#lib/utils.js';
	import AnswerRow from './AnswerRow.svelte';
	import BookAhead from './BookAhead.svelte';
	import { BOOKED_DOC, bookedPlaces, bookingList } from './booking.ts';
	import Block from './Block.svelte';
	import CardLink from './CardLink.svelte';
	import TodayHero from './TodayHero.svelte';
	import {
		cityCards,
		clocks,
		countdown,
		elsewhere,
		firstLine,
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
	const booked = $derived(bookedPlaces(trip.col('settings')));
	// What is left to book, from the real today (a picked day does not move the deadlines).
	const toBook = $derived(
		m.phase === 'before' || m.phase === 'during'
			? bookingList({ legs, places, today: real.today, visited, booked })
			: [],
	);
	const dueBooks = $derived(toBook.filter((x) => x.tone !== 'later').length);
	const zones = $derived(clocks(m, ms, countries));
	const k = $derived(m.today);
	const moves = $derived(m.moves.filter((l) => l !== m.flight));
	const happening = $derived([...m.onlyToday, ...m.endingSoon]);
	const here = $derived(cityCards(places, m.cities));
	const stayLabel = $derived(stayName(m.stay));
	const answers = $derived(app.content.answers);
	// The places group (dated cards, Musts) shows during the trip, or before it when something dated is ahead.
	const hasPlaces = $derived(m.phase === 'during' || m.upcoming.length > 0);

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

	async function markBooked(id: string): Promise<void> {
		const next = [...booked, id];
		const outcome = await write('trip.write', {
			col: 'settings',
			op: trip.col('settings').some((d) => d.id === BOOKED_DOC) ? 'update' : 'set',
			id: BOOKED_DOC,
			data: { places: next },
		});
		if (outcome.ok) {
			toast('Marked booked', {
				action: {
					label: 'Undo',
					onClick: () => {
						void write('trip.write', {
							col: 'settings',
							op: 'update',
							id: BOOKED_DOC,
							data: { places: next.filter((x) => x !== id) },
						});
					},
				},
			});
		}
	}

	function pickDay(value: string): void {
		if (value === '' || value === real.today) void goto(resolve('/(app)'), { reset: false });
		else void goto(resolve('/(app)/today/[[date]]', { date: value }), { reset: false });
	}
</script>

<svelte:head><title>Today · Asia Trip Ranker</title></svelte:head>

{#snippet emptyNote(text: string)}
	<p
		class="flex items-center gap-2.5 rounded-2xl border border-dashed border-border px-4 py-3.5 text-sm text-ink-3"
	>
		<CircleDashedIcon class="size-4 shrink-0" aria-hidden="true" />
		{text}
	</p>
{/snippet}

<section class="page-wide flex flex-col gap-8 md:gap-10" data-testid="today" data-day={k}>
	{#if trip.loading}
		<div class="flex flex-col gap-8" aria-busy="true" aria-label="Loading today">
			<div class="flex flex-col gap-3">
				<Skeleton class="h-4 w-40" />
				<Skeleton class="h-10 w-72 max-w-full" />
				<Skeleton class="h-4 w-96 max-w-full" />
			</div>
			<div class="grid gap-8 md:grid-cols-2 3xl:grid-cols-3">
				<Skeleton class="h-64" />
				<Skeleton class="h-64" />
				<Skeleton class="hidden h-64 3xl:block" />
			</div>
		</div>
	{:else if trip.error}
		<h1 class="font-serif text-3xl font-semibold tracking-tight md:text-4xl">Today</h1>
		<Alert.Root variant="destructive">
			<Alert.Title>The trip data isn’t answering</Alert.Title>
			<Alert.Description>{trip.error.message}</Alert.Description>
		</Alert.Root>
	{:else}
		<TodayHero
			head={h}
			{pinned}
			day={k}
			srPrefix={pinned ? `${fmtDay(k)}: ` : 'Today: '}
			{zones}
			progress={m.phase === 'during' && m.span && m.dayNumber !== null
				? { n: m.dayNumber, days: m.span.days, first: m.span.first, last: m.span.last }
				: null}
			todayHref={resolve('/(app)')}
			onpick={pickDay}
		/>

		{#if m.phase === 'none' && m.tasksTotal === 0}
			<div class="rounded-2xl border border-dashed border-border">
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

		<!--
			Three groups: now (where you are, moves, next flight), places (dated cards and the Musts here) and the
			rest (tasks, answers). Phone: one column. Fold: now and places full width (the leg cards need the room), tasks and answers side by side.
			MacBook: two columns, places on the right beside now and the rest. Monitor: the three side by side.
		-->
		<div
			class="grid gap-x-8 gap-y-10 md:grid-cols-2 xl:items-start xl:gap-x-10 3xl:grid-cols-3 3xl:gap-x-12"
		>
			<div
				class="flex min-w-0 flex-col gap-10 md:col-span-2 xl:col-span-1 xl:col-start-1 xl:row-start-1"
			>
				{#if m.phase === 'before' || m.phase === 'during'}
					<Block
						title="Book ahead"
						small={dueBooks > 0 ? `${String(dueBooks)} to book now` : undefined}
						testid="book-ahead"
						icon={CalendarClockIcon}
					>
						<BookAhead
							items={toBook}
							{canEdit}
							onopenleg={(id: string) => {
								if (canEdit) form = { col: 'legs', id };
								else void goto(resolve('/(app)/trip/itinerary'));
							}}
							onopenplace={openPlace}
							onbooked={canEdit ? (id: string) => void markBooked(id) : undefined}
						/>
					</Block>
				{/if}

				{#if m.stay}
					<Block title="Where you are" testid="where" icon={MapPinnedIcon}>
						<DayStatus
							day={m.day}
							country={m.country ?? undefined}
							fallbackOffset={offsetOn(legs, k)}
						/>
						<LegCard leg={m.stay} {legs} {countries} {places} now {onedit} {ondetail} />
					</Block>
				{:else if m.day}
					<Block title={pinned ? fmtDay(k) : 'Today'} testid="where" icon={MapPinnedIcon}>
						<div class="panel px-4 py-4">
							<DayStatus
								day={m.day}
								country={m.country ?? undefined}
								fallbackOffset={offsetOn(legs, k)}
							/>
						</div>
					</Block>
				{/if}

				{#if moves.length > 0}
					<Block title={`${pinned ? 'That day' : 'Today'}: moves`} testid="moves" icon={RouteIcon}>
						<div class="flex flex-col gap-3">
							{#each moves as l (l.id)}
								<LegCard leg={l} {legs} {countries} {places} {onedit} {ondetail} />
							{/each}
						</div>
					</Block>
				{/if}

				<Block title="Next flight" testid="next-flight" icon={PlaneIcon}>
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
						<div class="rounded-2xl border border-dashed border-border px-4 py-4 text-sm">
							<b class="block font-semibold">No flight ahead</b>
							<span class="text-ink-3">Every flight in the itinerary has left.</span>
						</div>
					{/if}
				</Block>
			</div>

			{#if hasPlaces}
				<div
					class="flex min-w-0 flex-col gap-10 md:col-span-2 xl:col-span-1 xl:col-start-2 xl:row-span-2 xl:row-start-1 3xl:row-span-1"
				>
					{#if m.phase === 'during'}
						<Block title="Only today, or ending soon" testid="only-today" icon={HourglassIcon}>
							{#if happening.length > 0}
								<ul class="flex flex-col gap-0.5 panel p-1.5">
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
								{@render emptyNote(
									`Nothing with a date falls on ${pinned ? fmtDay(k) : 'today'} in ${or(
										countryName(m.country, countries),
										'this stop',
									)}.`,
								)}
							{/if}
						</Block>
					{/if}

					{#if m.upcoming.length > 0}
						<Block title="Next events you could go to" testid="upcoming" icon={CalendarDaysIcon}>
							<ul class="flex flex-col gap-0.5 panel p-1.5">
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
							<p class="max-w-prose px-1 text-xs leading-relaxed text-ink-3">
								Dated cards in a city you sleep in, or a day trip from it, on the days you are
								there. Skipped cards and whole-season dates are left out.
								<a
									class="rounded-sm font-medium text-cat underline underline-offset-2 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
									href={resolve('/(app)/trip/calendar/[[date]]', {})}>Calendar →</a
								>
							</p>
						</Block>
					{/if}

					{#if m.phase === 'during' && m.cities.length > 0}
						<Block title={`Still to do in ${stayLabel}`} testid="musts" icon={StarIcon}>
							<div class="flex flex-col panel p-1.5">
								{#if m.musts.length > 0}
									<ul class="flex flex-col gap-0.5">
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
									<p class="px-3 py-3 text-sm text-ink-3">
										{here.must > 0 ? 'Every Must here is ticked.' : 'No Must cards in this city.'}
									</p>
								{/if}
								<div class="mt-1 border-t border-border/70 pt-1">
									<CardLink href={placesHref}
										><b class="font-semibold text-foreground">All {plural(here.n, 'card')}</b> in {stayLabel}{m
											.musts.length > 6
											? ` · ${String(m.musts.length - 6)} more Must`
											: ''}</CardLink
									>
								</div>
							</div>
						</Block>
					{/if}
				</div>
			{/if}

			{#if m.tasksTotal > 0 || answers.length > 0}
				<div
					class={cn(
						'grid min-w-0 gap-10 md:col-span-2 md:grid-cols-2 md:items-start md:gap-8 xl:col-span-1 xl:grid-cols-1 xl:gap-10 3xl:row-start-1',
						hasPlaces
							? 'xl:col-start-1 xl:row-start-2 3xl:col-start-3'
							: 'xl:col-start-2 xl:row-start-1',
					)}
				>
					{#if m.tasksTotal > 0}
						<Block
							title="To do"
							small={`${String(m.tasks.length)} open of ${String(m.tasksTotal)}`}
							testid="tasks"
							icon={ListChecksIcon}
						>
							{#if m.tasks.length > 0}
								<div class="flex flex-col panel p-1.5">
									<ul class="flex flex-col divide-y divide-border/70" aria-label="Open tasks">
										{#each m.tasks.slice(0, 5) as x (x.id)}
											{@const steps = stepsOf(tasks, x.id)}
											{@const when = whenOf(taskDates(x, steps), m.today)}
											<CheckRow
												titleTicks={false}
												locked={steps.length > 0}
												id={x.id}
												title={x.title}
												note={firstLine(x.note)}
												checked={x.status === 'done'}
												indeterminate={x.status === 'doing'}
												checkLabel={`Mark done: ${x.title}`}
												{canEdit}
												busy={busyTask === x.id}
												ontoggle={() => void toggleTask(x)}
												onedit={() => (form = { col: 'tasks', id: x.id })}
											>
												{#snippet extra()}
													{#if when !== null}
														<span
															class={cn(
																'text-xs font-medium nums',
																when.tone === 'late' && 'text-destructive',
																when.tone === 'soon' && 'text-amber',
																when.tone === 'open' && 'text-ink-2',
																when.tone === 'wait' && 'text-muted-foreground',
															)}
															data-testid="when">{when.label}</span
														>
													{/if}
													{#if steps.length > 0}
														<span class="text-xs text-muted-foreground nums"
															>{steps.filter((s) => s.status === 'done').length} of {steps.length} steps</span
														>
													{/if}
													{#if x.status === 'doing' && steps.length === 0}<Chip tone="planned"
															>In progress</Chip
														>{/if}
												{/snippet}
											</CheckRow>
										{/each}
									</ul>
									<div class="mt-1 border-t border-border/70 pt-1">
										<CardLink href={resolve('/(app)/prep/todo')}
											>{#if m.tasks.length > 5}<b class="font-semibold text-foreground"
													>{m.tasks.length - 5} more</b
												> to do{:else}The whole list{/if}</CardLink
										>
									</div>
								</div>
							{:else}
								{@render emptyNote('Everything is ticked.')}
							{/if}
						</Block>
					{/if}

					{#if answers.length > 0}
						<Block
							title="Latest answers"
							small={plural(answers.length, 'answer')}
							testid="answers"
							icon={MessageCircleQuestionIcon}
						>
							<div class="flex flex-col panel p-1.5">
								<ul class="flex flex-col divide-y divide-border/70">
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
								<div class="mt-1 border-t border-border/70 pt-1">
									<CardLink href={answersHref}
										><b class="font-semibold text-foreground">All answers</b>, by country</CardLink
									>
								</div>
							</div>
						</Block>
					{/if}
				</div>
			{/if}
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
