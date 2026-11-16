<!--
	The board's side panels (old balancePanel, holidayLocksPanel, bookPanel): the category mix of every pick above the
	line with its nudges, the holiday locks (what the server holds; locks are not optimistic), and the book-ahead
	list by deadline. A name opens the place sheet.
-->
<script lang="ts">
	import type { Balance, BookAheadItem } from '@atr/shared/board';
	import { holidayOptions, picksMany } from '@atr/shared/board';
	import { resolve } from '$app/paths';
	import { Button } from '#lib/components/ui/button/index.js';
	import { cn } from '#lib/utils.js';
	import {
		fmtDate,
		HOLIDAY_LIST,
		holidayById,
		mixOf,
		plural,
		type DecidePlace,
		type Locks,
	} from '../model.ts';
	import MixBar from './MixBar.svelte';

	interface Props {
		balance: Balance;
		bookAhead: readonly BookAheadItem[];
		places: readonly DecidePlace[];
		byId: ReadonlyMap<string, DecidePlace>;
		locks: Locks;
		category: (id: string) => { label: string; icon: string };
		flag: (country: string) => string;
		onopen: (id: string) => void;
	}

	let { balance, bookAhead, places, byId, locks, category, flag, onopen }: Props = $props();
	const holidaysHref = resolve('/(app)/decide/holidays');
	const cats = $derived(mixOf(balance.counts));
	const lockRows = $derived(
		HOLIDAY_LIST.map((h) => {
			if (picksMany(h.id)) {
				const opts = holidayOptions(places, h.id);
				const must = opts.filter((o) => o.verdict === 'must').length;
				return { h, many: true as const, opts: opts.length, must };
			}
			const id = locks[h.id];
			return { h, many: false as const, place: id === undefined ? undefined : byId.get(id) };
		}),
	);
	const panel = 'flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 shadow-soft';
	const linkClass = 'text-sm font-medium text-cat hover:underline';
</script>

<section class={panel} data-panel="balance">
	<h2 class="font-serif text-lg font-semibold">Balance</h2>
	<MixBar counts={balance.counts} label={(c: string) => category(c).label} size="lg" />
	<ul class="flex flex-col gap-1.5 text-sm">
		{#each cats as [c, n] (c)}
			<li data-cat={c} class="flex items-center gap-2">
				<i class="size-2.5 shrink-0 rounded-full bg-cat" aria-hidden="true"></i>
				<span class="min-w-0 flex-1 truncate">{category(c).icon} {category(c).label}</span>
				<b>{Math.round((n / balance.total) * 100)}%</b>
			</li>
		{:else}
			<li class="text-muted-foreground">Nothing above the line yet.</li>
		{/each}
	</ul>
	{#if balance.nudges.length > 0}
		<ul class="flex flex-col gap-1.5 text-sm" data-nudges>
			{#each balance.nudges.slice(0, 4) as nudge (nudge.kind + nudge.category)}
				<li
					class={cn(
						'rounded-lg px-2.5 py-1.5',
						nudge.kind === 'dominant' ? 'bg-amber/15' : 'bg-muted',
					)}
				>
					{nudge.kind === 'dominant' ? '⚖️' : '🔍'}
					{nudge.text}
				</li>
			{/each}
		</ul>
	{:else if balance.total >= 5}
		<p class="text-sm font-semibold text-ok">✓ Nicely balanced.</p>
	{/if}
</section>

<section class={panel} data-panel="holidays">
	<h2 class="font-serif text-lg font-semibold">Holidays</h2>
	<ul class="flex flex-col gap-2 text-sm">
		{#each lockRows as r (r.h.id)}
			<li class="flex items-center gap-2" data-lock-row={r.h.id}>
				<span aria-hidden="true">{r.h.emoji}</span>
				<span class="min-w-0 flex-1">{r.h.short}</span>
				{#if r.many}
					<a href={holidaysHref} class={linkClass}
						>{r.opts > 0 ? `${String(r.must)} of ${String(r.opts)} Must →` : 'Pick →'}</a
					>
				{:else if r.place !== undefined}
					{@const p = r.place}
					<button
						type="button"
						class="max-w-40 truncate rounded-full bg-must/15 px-2.5 py-1 text-xs font-semibold text-must hover:bg-must/25"
						data-lock-chip={r.h.id}
						onclick={() => {
							onopen(p.id);
						}}>🔒 {p.short ?? p.name}</button
					>
				{:else}
					<a href={holidaysHref} class={linkClass}>Pick →</a>
				{/if}
			</li>
		{/each}
	</ul>
</section>

<section class={panel} data-panel="book">
	<h2 class="font-serif text-lg font-semibold">Book ahead</h2>
	{#if bookAhead.length > 0}
		<p class="text-xs text-muted-foreground">
			Latest safe booking date if you went on your first day there (or on the holiday for holiday
			picks).
		</p>
		<ol class="flex flex-col gap-2">
			{#each bookAhead as x (x.id)}
				{@const link = byId.get(x.id)?.booking.links[0]}
				<li
					class={cn(
						'flex flex-col gap-0.5 border-l-3 pl-2.5',
						x.level === 'required' ? 'border-warn' : 'border-border',
					)}
					data-book={x.id}
				>
					<div class="flex items-baseline justify-between gap-3">
						<button
							type="button"
							class="min-w-0 truncate text-left text-sm font-semibold hover:underline"
							onclick={() => {
								onopen(x.id);
							}}>{flag(x.country ?? '')} {x.name}</button
						>
						<b class="shrink-0 font-serif text-sm"
							>{x.deadline === null ? '–' : fmtDate(x.deadline)}</b
						>
					</div>
					<div class="flex flex-wrap items-center justify-between gap-x-3">
						<small class="text-xs text-muted-foreground"
							>{x.level === 'required' ? 'Must book' : 'Recommended'} · {plural(x.lead_days, 'day')} ahead{#if x.holiday !== null}&#32;·&#32;{holidayById(
									x.holiday,
								)?.emoji ?? ''}{/if}</small
						>
						{#if link !== undefined}
							<Button
								variant="link"
								size="sm"
								href={link.url}
								target="_blank"
								rel="noopener noreferrer">{link.label} ↗</Button
							>
						{/if}
					</div>
				</li>
			{/each}
		</ol>
	{:else}
		<p class="text-sm text-muted-foreground">Nothing above the line needs booking yet.</p>
	{/if}
</section>
