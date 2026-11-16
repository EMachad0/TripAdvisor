<!--
	One country on the board as a column (old countryBlock): name and dates, the days stepper, the budget meter and the
	category mix of above-the-line picks, then the ranked list with the dashed cut line at the number of days, which
	scrolls inside the column. Rows and the cut line slide to their new place when the days change (FLIP, old
	changeDays).
-->
<script lang="ts">
	import type { BoardRow as Row } from '@atr/shared/board';
	import { flip } from 'svelte/animate';
	import { cn } from '#lib/utils.js';
	import {
		brl,
		budgetLine,
		fmtDate,
		plural,
		rankLines,
		type DecidePlace,
		type Locks,
	} from '../model.ts';
	import BoardRow from './BoardRow.svelte';
	import DaysStepper from './DaysStepper.svelte';
	import Meter from './Meter.svelte';
	import MixBar from './MixBar.svelte';

	interface Props {
		row: Row<DecidePlace>;
		locks: Locks;
		disabled: boolean;
		reduced: boolean;
		category: (id: string) => { label: string; icon: string };
		onstep: (country: string, step: 1 | -1) => void;
		onopen: (id: string) => void;
	}

	let { row, locks, disabled, reduced, category, onstep, onopen }: Props = $props();
	const lines = $derived(rankLines(row, locks));
	const bud = $derived(row.budget);
	const share = $derived(
		Math.min(100, Math.round(Number.isFinite(bud.share) ? bud.share * 100 : 100)),
	);
	const bal = $derived(row.balance);
	const perDay = $derived(row.perDay ?? 0);
</script>

<section
	id={`c-${row.id}`}
	data-country={row.id}
	class="flex w-11/12 shrink-0 snap-start flex-col overflow-hidden panel md:board-col-h md:w-80 xl:w-88 3xl:w-84"
>
	<header class="flex flex-col gap-3 border-b border-border/70 p-4 pb-3.5">
		<div class="flex items-start justify-between gap-3">
			<div class="min-w-0">
				<h2 class="truncate font-serif text-xl leading-tight font-semibold">
					{row.flag}
					{row.name}
				</h2>
				<span class="text-xs text-muted-foreground nums"
					>{fmtDate(row.from ?? '')} – {fmtDate(row.to ?? '')}</span
				>
			</div>
			<DaysStepper
				country={row.name ?? row.id}
				days={row.days}
				configDays={row.configDays}
				{disabled}
				{reduced}
				onstep={(step: 1 | -1) => {
					onstep(row.id, step);
				}}
			/>
		</div>

		<div class="grid grid-cols-2 gap-2">
			<div
				class="flex min-w-0 flex-col gap-1.5 rounded-xl bg-muted/60 p-2.5"
				title={`Attraction costs of above-the-line picks vs ${brl(perDay)}/day × ${plural(row.days, 'day')}. Food is budgeted separately.`}
				data-budget={bud.status}
			>
				<div class="flex items-baseline justify-between gap-1 text-xs">
					<span class="font-semibold">Budget</span>
					<span class="truncate text-muted-foreground nums">of {brl(bud.cap)}</span>
				</div>
				<b
					class={cn(
						'font-serif text-base leading-none font-semibold nums',
						bud.status === 'over' && 'text-destructive',
						bud.status === 'tight' && 'text-amber',
					)}>{brl(bud.spend)}</b
				>
				<Meter value={share} tone={bud.status} />
			</div>
			<div
				class="flex min-w-0 flex-col justify-between gap-1.5 rounded-xl bg-muted/60 p-2.5"
				title="Category mix above the line"
				data-mix
			>
				<span class="text-xs font-semibold">Mix</span>
				{#if bal.dominant !== null}
					<small class="truncate text-xs font-semibold text-amber" data-nudge
						>Heavy on {category(bal.dominant.category).label}</small
					>
				{:else}
					<small class="truncate text-xs text-muted-foreground"
						>{plural(bal.total, 'pick')} above the line</small
					>
				{/if}
				<MixBar counts={bal.counts} label={(c: string) => category(c).label} />
			</div>
		</div>
		<p
			class={cn(
				'-mt-1 text-xs leading-snug',
				bud.status === 'over'
					? 'text-destructive'
					: bud.status === 'tight'
						? 'text-amber'
						: 'text-muted-foreground',
			)}
		>
			{budgetLine(bud.status, perDay, bud.excluded)}
		</p>
	</header>

	<ol
		class="flex min-h-0 flex-1 flex-col p-2 md:overflow-y-auto md:overscroll-contain"
		data-list={row.id}
	>
		{#each lines as line (line.key)}
			<li animate:flip={{ duration: reduced ? 0 : 380 }}>
				{#if line.kind === 'cut'}
					<div
						class="mx-2 my-2 flex flex-col gap-0.5 border-t-2 border-dashed border-cat/60 pt-2 text-2xs font-semibold tracking-wide text-cat uppercase"
						data-cut
					>
						<span>✂ {plural(line.days, 'day')} · one pick per day</span>
						{#if line.open > 0}
							<em
								class="text-xs font-normal tracking-normal text-muted-foreground normal-case not-italic"
								>{plural(line.open, 'open day')}: swipe more or ask the curator</em
							>
						{/if}
					</div>
				{:else}
					<BoardRow
						place={line.place}
						i={line.i}
						below={line.below}
						holiday={line.holiday}
						category={category(line.place.category)}
						onopen={() => {
							onopen(line.place.id);
						}}
					/>
				{/if}
			</li>
		{/each}
	</ol>
</section>
