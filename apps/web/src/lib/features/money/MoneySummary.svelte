<!--
	The Money screen's headline panel: the plan against the cap, how it splits into flights and days on the ground,
	what has been logged, and the daily budget of where you are (or go next). Sticky beside the lists on wide screens.
-->
<script lang="ts">
	import Bar from './Bar.svelte';
	import Chip from './Chip.svelte';
	import EditButton from './EditButton.svelte';
	import { fmtR, type CountryCard, type Summary } from './model.ts';

	interface Props {
		m: Summary;
		/** The card of where you are today, else of the next stay. */
		now: CountryCard | null;
		canEdit: boolean;
		onedit: () => void;
	}

	let { m, now, canEdit, onedit }: Props = $props();
	const usedPct = $derived(m.cap ? Math.round((m.planT / m.cap) * 100) : 0);
	const capMark = $derived(m.cap && m.planT > m.cap ? (m.cap / m.planT) * 100 : null);
</script>

<section
	class="@container relative overflow-hidden panel p-5 md:p-6"
	data-testid="money-summary"
	aria-label="Budget summary"
>
	<div
		class="pointer-events-none absolute -top-24 -right-20 size-56 rounded-full bg-cat/8 blur-3xl"
		aria-hidden="true"
	></div>
	<div class="relative flex items-start justify-between gap-3">
		<p class="eyebrow" data-testid="eyebrow">
			{fmtR(m.planT)} planned · cap {fmtR(m.cap)}
		</p>
		{#if canEdit}<EditButton label="trip budget" onclick={onedit} />{/if}
	</div>

	<div class="relative mt-2 flex flex-wrap items-end gap-x-3 gap-y-2">
		<p
			class="font-serif text-4xl leading-none font-semibold tracking-tight nums md:text-5xl"
			data-testid="plan-total"
		>
			{fmtR(m.planT)}
		</p>
		{#if m.cap}
			<span class="mb-1">
				<Chip tone={m.spare >= 0 ? 'booked' : 'planned'}>
					{m.spare >= 0 ? `${fmtR(m.spare)} to spare` : `${fmtR(-m.spare)} over`}
				</Chip>
			</span>
		{/if}
	</div>
	<p class="relative mt-2 text-sm text-muted-foreground">
		planned of your {fmtR(m.cap)} cap{#if m.cap}<span class="nums">{` · ${String(usedPct)}%`}</span
			>{/if}
	</p>

	<div class="relative mt-5">
		<Bar
			size="lg"
			marker={capMark}
			segments={[
				{ key: 'fixed', pct: m.fixedPct, fill: 'fill-ink-3' },
				{ key: 'ground', pct: m.groundPct, fill: 'fill-ok' },
			]}
		/>
	</div>

	<div class="relative mt-4 grid grid-cols-2 gap-2 text-xs text-muted-foreground @xl:grid-cols-4">
		<p class="flex flex-col-reverse gap-1 rounded-xl bg-muted/60 px-3 py-2.5">
			<span class="inline-flex items-center gap-1.5">
				<i class="size-2 rounded-full bg-ink-3"></i>Flights and fixed
			</span>
			<b class="text-base font-semibold text-foreground nums">{fmtR(m.fixedT)}</b>
		</p>
		<p class="flex flex-col-reverse gap-1 rounded-xl bg-muted/60 px-3 py-2.5">
			<span class="inline-flex items-center gap-1.5">
				<i class="size-2 rounded-full bg-ok"></i>Days on the ground
			</span>
			<b class="text-base font-semibold text-foreground nums">{fmtR(m.groundT)}</b>
		</p>
		<p class="flex flex-col-reverse gap-1 rounded-xl bg-muted/60 px-3 py-2.5">
			<span class="inline-flex items-center gap-1.5">
				<i class="size-2 rounded-full bg-line ring-1 ring-ink-3/30"></i>Spare
			</span>
			<b class="text-base font-semibold text-foreground nums">{fmtR(Math.max(0, m.spare))}</b>
		</p>
		<p class="flex flex-col-reverse gap-1 rounded-xl bg-muted/60 px-3 py-2.5">
			Logged so far
			<b class="text-base font-semibold text-foreground nums">{fmtR(m.spentT)}</b>
		</p>
	</div>

	{#if now}
		<div class="relative mt-4 flex items-center gap-3 border-t border-border/70 pt-4">
			<span class="text-3xl leading-none" aria-hidden="true">{now.row.flag}</span>
			<div class="min-w-0 flex-1">
				<p class="text-xs text-muted-foreground">Daily budget in {now.row.name}</p>
				<p class="flex flex-wrap items-baseline gap-x-2 text-sm">
					<span
						><b class="font-serif text-xl font-semibold nums">{fmtR(now.daily)}</b>
						<span class="text-muted-foreground">a day</span></span
					>
					<span class="text-xs text-muted-foreground nums"
						>Bed {fmtR(now.row.bed)} · Food {fmtR(now.row.food)} · Other {fmtR(now.row.other)}</span
					>
				</p>
			</div>
		</div>
	{/if}
</section>
