<!--
	The board (old game.js viewBoard, changeDays): every country's Must and Maybe picks ranked by the duels, cut at one
	pick per day, with the days stepper per country, the trip total against the plan and Reset, and the side panels
	(balance, holiday locks, book ahead). buildBoard from @atr/shared runs in the browser.
	Days changes show at once and are sent after a 350 ms pause (state.svelte.ts); leaving the page sends them now.
	The guest sees the whole board; the steppers and Reset are disabled.
-->
<script lang="ts">
	import { onDestroy } from 'svelte';
	import PlaceSheet from '#lib/components/shared/PlaceSheet.svelte';
	import type { SheetTarget } from '#lib/components/shared/PlaceSheet.types.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import { cn } from '#lib/utils.js';
	import { DecideData } from '../data.svelte.ts';
	import { boardOf, stepDays } from '../model.ts';
	import { reducedMotion } from '../motion.svelte.ts';
	import { resetDays } from '../ops.ts';
	import { clearDaysDraft, flushDays, queueDays, reportRefusal } from '../state.svelte.ts';
	import CountryBlock from './CountryBlock.svelte';
	import SidePanels from './SidePanels.svelte';

	const d = new DecideData();
	const board = $derived(boardOf(d.places, d.app.content, d.days, d.locks));
	const delta = $derived(board.totalDays - board.configTotal);
	const locked = $derived(d.isGuest || !d.ready);

	let sheet: SheetTarget | null = $state(null);
	const reduced = $derived(reducedMotion.current);

	function step(country: string, by: 1 | -1): void {
		if (locked) return;
		const row = board.countries.find((c) => c.id === country);
		if (row === undefined) return;
		const change = stepDays(row.days, row.configDays, by);
		if (change !== null) queueDays(country, change.override);
	}

	function reset(): void {
		if (locked) return;
		clearDaysDraft();
		void resetDays().then((outcome) => {
			if (!outcome.ok) reportRefusal(outcome, 'Couldn’t reset the days');
		});
	}

	function open(id: string): void {
		sheet = { kind: 'place', id };
	}

	onDestroy(flushDays);
</script>

<svelte:window onpagehide={flushDays} />

<section class="mx-auto flex max-w-6xl flex-col gap-4" data-board>
	<header class="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
		<div>
			<p class="text-xs font-semibold tracking-widest text-muted-foreground uppercase">
				Step 4 · the ranking
			</p>
			<h1 class="font-serif text-3xl font-semibold">Board</h1>
		</div>
		<div
			class={cn(
				'flex flex-wrap items-center gap-x-2 gap-y-1 text-sm',
				delta !== 0 ? 'text-amber' : 'text-muted-foreground',
			)}
			data-daysum={delta !== 0 ? 'off' : 'plan'}
		>
			<span
				><b class="font-serif text-xl text-foreground">{board.totalDays}</b> / {board.configTotal} days</span
			>
			{#if delta !== 0}
				<span class="font-semibold">{delta > 0 ? '+' : ''}{delta} vs trip plan</span>
				<Button variant="link" size="sm" disabled={locked} onclick={reset}>Reset</Button>
			{/if}
		</div>
	</header>
	<p class="max-w-2xl text-sm text-muted-foreground">
		One pick per day: the dashed line in each country sits at its number of days. Change the days to
		see what makes the cut. This is a what-if; the trip config isn’t touched.
	</p>
	{#if d.isGuest}
		<p class="text-sm text-muted-foreground">
			Read only: guests can look at the board but not change the days.
		</p>
	{/if}

	<div class="flex flex-col gap-6 lg:flex-row lg:items-start">
		<div class="flex min-w-0 flex-1 flex-col gap-4">
			{#each board.countries as row (row.id)}
				<CountryBlock
					{row}
					locks={d.locks}
					disabled={locked}
					{reduced}
					category={d.category}
					onstep={step}
					onopen={open}
				/>
			{/each}
		</div>
		<aside
			class="order-first grid gap-4 sm:grid-cols-2 lg:sticky lg:top-24 lg:order-none lg:flex lg:w-80 lg:shrink-0 lg:flex-col"
			aria-label="Board summary"
		>
			<SidePanels
				balance={board.balance}
				bookAhead={board.bookAhead}
				places={d.places}
				byId={d.byId}
				locks={d.locks}
				category={d.category}
				flag={(c: string) => d.country(c).flag}
				onopen={open}
			/>
		</aside>
	</div>
</section>

<PlaceSheet
	target={sheet}
	onclose={() => {
		sheet = null;
	}}
/>
