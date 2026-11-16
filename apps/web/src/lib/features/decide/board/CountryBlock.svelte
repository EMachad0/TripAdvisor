<!--
	One country on the board (old countryBlock): name and dates, the days stepper, the budget meter and the category
	mix of above-the-line picks, then the ranked list with the dashed cut line at the number of days. Rows and the
	cut line slide to their new place when the days change (FLIP, old changeDays).
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
	class="flex flex-col gap-4 rounded-2xl border border-border bg-card p-4 shadow-soft sm:p-5"
>
	<header class="flex flex-wrap items-center justify-between gap-3">
		<div class="min-w-0">
			<h2 class="font-serif text-2xl font-semibold">{row.flag} {row.name}</h2>
			<span class="text-sm text-muted-foreground"
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
	</header>

	<div class="grid gap-3 sm:grid-cols-2">
		<div
			class="flex flex-col gap-1.5 rounded-xl bg-muted p-3"
			title={`Attraction costs of above-the-line picks vs ${brl(perDay)}/day × ${plural(row.days, 'day')}. Food is budgeted separately.`}
			data-budget={bud.status}
		>
			<div class="flex items-baseline justify-between gap-2 text-sm">
				<span class="font-semibold">Budget</span>
				<b class="font-serif"
					>{brl(bud.spend)}
					<small class="font-sans text-xs font-normal text-muted-foreground"
						>of {brl(bud.cap)}</small
					></b
				>
			</div>
			<Meter value={share} tone={bud.status} />
			<small
				class={cn(
					'text-xs',
					bud.status === 'over'
						? 'text-destructive'
						: bud.status === 'tight'
							? 'text-amber'
							: 'text-muted-foreground',
				)}>{budgetLine(bud.status, perDay, bud.excluded)}</small
			>
		</div>
		<div
			class="flex flex-col justify-center gap-1.5 rounded-xl bg-muted p-3"
			title="Category mix above the line"
			data-mix
		>
			<MixBar counts={bal.counts} label={(c: string) => category(c).label} />
			{#if bal.dominant !== null}
				<small class="text-xs font-semibold text-amber" data-nudge
					>Heavy on {category(bal.dominant.category).label}</small
				>
			{:else}
				<small class="text-xs text-muted-foreground"
					>{plural(bal.total, 'pick')} above the line</small
				>
			{/if}
		</div>
	</div>

	<ol class="flex flex-col gap-0.5" data-list={row.id}>
		{#each lines as line (line.key)}
			<li animate:flip={{ duration: reduced ? 0 : 380 }}>
				{#if line.kind === 'cut'}
					<div
						class="my-1 flex flex-wrap items-center gap-x-3 gap-y-1 border-t-2 border-dashed border-cat/60 pt-2 text-xs font-semibold tracking-wide text-cat uppercase"
						data-cut
					>
						<span>✂ {plural(line.days, 'day')} · one pick per day</span>
						{#if line.open > 0}
							<em class="font-normal tracking-normal text-muted-foreground normal-case not-italic"
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
