<!--
	The board (old game.js viewBoard, changeDays): every country's Must and Maybe picks ranked by the duels, cut at one
	pick per day, as a row of columns that scrolls sideways (snapping on a phone; most of it visible on a wide screen), with the days stepper per country, the trip total against the plan and Reset, and the side panels
	(balance, holiday locks, book ahead). buildBoard from @atr/shared runs in the browser.
	Days changes show at once and are sent after a 350 ms pause (state.svelte.ts); leaving the page sends them now.
	The guest sees the whole board; the steppers and Reset are disabled.
-->
<script lang="ts">
	import { onDestroy } from 'svelte';
	import PlaceSheet from '#lib/components/shared/PlaceSheet.svelte';
	import type { SheetTarget } from '#lib/components/shared/PlaceSheet.types.js';
	import PageHeader from '#lib/components/shell/PageHeader.svelte';
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

	/** The country chips bring that column into view. */
	function jump(id: string): void {
		document.getElementById(`c-${id}`)?.scrollIntoView({
			behavior: reduced ? 'auto' : 'smooth',
			block: 'nearest',
			inline: 'start',
		});
	}

	function open(id: string): void {
		sheet = { kind: 'place', id };
	}

	onDestroy(flushDays);
</script>

<svelte:window onpagehide={flushDays} />

<section class="flex flex-col" data-board>
	<PageHeader
		eyebrow="Step 4 · the ranking"
		title="Board"
		class="mb-4 flex-row items-end justify-between md:mb-5"
	>
		<span class="hidden xl:inline"
			>One pick per day: the dashed line in each country sits at its number of days. Change the days
			to see what makes the cut. This is a what-if; the trip config isn’t touched.</span
		>
		{#snippet actions()}
			<div
				class={cn(
					'flex flex-wrap items-baseline gap-x-2 gap-y-1 text-sm nums',
					delta !== 0 ? 'text-amber' : 'text-muted-foreground',
				)}
				data-daysum={delta !== 0 ? 'off' : 'plan'}
			>
				<span>
					<b class="font-serif text-2xl font-semibold text-foreground">{board.totalDays}</b>
					<span>{`/ ${String(board.configTotal)} days`}</span>
				</span>
				{#if delta !== 0}
					<span class="rounded-full bg-amber/12 px-2.5 py-0.5 font-semibold"
						>{delta > 0 ? '+' : ''}{delta} vs trip plan</span
					>
					<Button variant="link" size="sm" disabled={locked} onclick={reset}>Reset</Button>
				{/if}
			</div>
		{/snippet}
	</PageHeader>

	{#if d.isGuest}
		<p class="mb-3 text-sm text-muted-foreground">
			Read only: guests can look at the board but not change the days.
		</p>
	{/if}

	<nav
		aria-label="Countries on the board"
		class="-mx-4 mb-3 no-scrollbar flex gap-1.5 overflow-x-auto px-4 md:-mx-6 md:px-6 xl:mx-0 xl:px-0"
	>
		{#each board.countries as row (row.id)}
			<button
				type="button"
				onclick={() => {
					jump(row.id);
				}}
				class="inline-flex h-11 shrink-0 items-center gap-1.5 rounded-full border border-border bg-card/70 px-3.5 text-sm font-medium whitespace-nowrap text-muted-foreground transition-colors outline-none hover:border-foreground/30 hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 md:h-9"
				>{row.flag}
				{row.name}
				<span class="count count-quiet">{row.days}</span></button
			>
		{/each}
	</nav>

	<div
		class="-mx-4 flex snap-x snap-mandatory scroll-px-4 items-start gap-3 overflow-x-auto px-4 pb-3 md:-mx-6 md:scroll-px-6 md:gap-4 md:px-6 xl:-mx-10 xl:snap-proximity xl:scroll-px-10 xl:px-10 3xl:-mx-14 3xl:scroll-px-14 3xl:gap-5 3xl:px-14"
		data-board-columns
	>
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
		<aside
			class="flex w-11/12 shrink-0 snap-start flex-col gap-3 md:board-col-h md:w-80 md:gap-4 md:overflow-y-auto md:overscroll-contain xl:w-88 3xl:w-84"
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
