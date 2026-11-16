<!--
	One country leg of the plan (old legCard and stopRow): the title zooms the map to it, the nights meter and bar,
	the ordered stops, and the cities not placed yet. In edit mode each stop gets move / remove buttons and a nights
	stepper, the unplaced Must and Maybe cities become add chips, and a leg the game changed gets Reset.
-->
<script lang="ts">
	import ArrowDownIcon from '@lucide/svelte/icons/arrow-down';
	import ArrowUpIcon from '@lucide/svelte/icons/arrow-up';
	import PlusIcon from '@lucide/svelte/icons/plus';
	import XIcon from '@lucide/svelte/icons/x';
	import { resolve } from '$app/paths';
	import { Button } from '#lib/components/ui/button/index.js';
	import { cn } from '#lib/utils.js';
	import {
		MAX_NIGHTS,
		MIN_NIGHTS,
		VERDICT_LABEL,
		canReset,
		fmtWeek,
		meter,
		nightSegments,
		normalizeNights,
		plural,
		stopWhen,
		type Leg,
	} from './model.ts';

	interface Props {
		leg: Leg;
		/** The map shows this leg. */
		on: boolean;
		edit: boolean;
		onzoom: (cid: string) => void;
		oncity: (key: string) => void;
		/** false when nothing changed (the input then shows the stored value again). */
		onnights: (cid: string, i: number, n: number | null) => boolean;
		onmove: (cid: string, i: number, d: number) => void;
		onremove: (cid: string, i: number) => void;
		onadd: (cid: string, area: string) => void;
		onreset: (cid: string) => void;
	}

	let { leg, on, edit, onzoom, oncity, onnights, onmove, onremove, onadd, onreset }: Props =
		$props();

	const c = $derived(leg.c);
	const m = $derived(meter(leg));
	const segs = $derived.by(() => {
		let x = 0;
		return nightSegments(leg).map((s) => {
			const out = { ...s, x };
			x += s.pct;
			return out;
		});
	});
	const musts = $derived(leg.others.filter((x) => x.verdict === 'must'));
	const maybes = $derived(leg.others.filter((x) => x.verdict === 'maybe'));
	const areasHref = resolve('/(app)/decide/areas');
	/** A separator that keeps its spaces at the start of an {#if} block (Svelte trims literal ones there). */
	const SEP = ' · ';

	/** While typing: a whole number from 1 to 90 saves at once; anything else waits for the change event. */
	function onInput(i: number, e: Event & { currentTarget: HTMLInputElement }): void {
		const raw = e.currentTarget.value;
		if (raw === '') return;
		const n = Number(raw);
		if (Number.isInteger(n) && n >= MIN_NIGHTS && n <= MAX_NIGHTS) onnights(c.id, i, n);
	}

	/** Leaving the field: empty or below 1 clears, above 90 caps, decimals round; the field shows the result. */
	function onChange(i: number, e: Event & { currentTarget: HTMLInputElement }): void {
		const el = e.currentTarget;
		const v = el.value === '' ? null : normalizeNights(Number(el.value));
		onnights(c.id, i, v);
		el.value = v === null ? '' : String(v);
	}
</script>

<section
	class={cn(
		'scroll-mt-18 rounded-2xl border border-border bg-card p-3.5 shadow-soft transition-shadow',
		on && 'border-cat ring-3 ring-cat/20',
	)}
	data-leg={c.id}
	aria-label="{c.name} leg"
>
	<header class="flex items-center gap-2">
		<button
			type="button"
			class="group flex min-h-11 min-w-0 flex-1 items-center gap-2.5 rounded-xl text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-note"
			aria-label="Show {c.name} on the map"
			data-leg-title
			onclick={() => {
				onzoom(c.id);
			}}
		>
			<span
				class="grid size-7.5 flex-none place-items-center rounded-lg bg-cat/15 font-serif text-lg font-semibold text-cat"
				>{c.n}</span
			>
			<span class="grid min-w-0 gap-0.5">
				<b class="truncate font-serif text-xl leading-tight font-semibold group-hover:text-cat"
					>{c.flag} {c.name}</b
				>
				<small class="text-xs text-ink-3"
					>{fmtWeek(c.from)} – {fmtWeek(c.to)} · {c.nights} nights</small
				>
			</span>
		</button>
		{#if edit && canReset(c)}
			<Button
				variant="link"
				size="sm"
				title="Go back to the route in config/trip.yaml"
				data-reset={c.id}
				onclick={() => {
					onreset(c.id);
				}}>Reset</Button
			>
		{/if}
	</header>

	<div class="mt-2.5 mb-2" data-nights-meter={m.status}>
		<svg
			class={cn(
				'block h-2 w-full overflow-hidden rounded-full bg-surface-2',
				m.status === 'over' && 'ring-2 ring-skip',
			)}
			aria-hidden="true"
		>
			<defs>
				<pattern
					id="hatch-{c.id}"
					width="6"
					height="6"
					patternUnits="userSpaceOnUse"
					patternTransform="rotate(45)"
				>
					<line x1="0" y1="0" x2="0" y2="6" class="hatch-line" />
				</pattern>
			</defs>
			{#each segs as s (s.key)}
				{#if s.tone === 'left'}
					<rect x="{s.x}%" y="0" width="{s.pct}%" height="100%" fill="url(#hatch-{c.id})" />
				{:else}
					<rect
						x="{s.x}%"
						y="0"
						width="{s.pct}%"
						height="100%"
						class={s.tone === 0 ? 'seg-0' : 'seg-1'}
					/>
				{/if}
			{/each}
		</svg>
		<p class={cn('mt-1.5 text-sm text-ink-3', m.status === 'ok' && 'font-semibold text-must')}>
			{#if m.status === 'over'}
				<b class="text-ink">{m.planned}</b> nights planned:
				<b class="text-skip">{m.more} more</b> than the {m.nights} in {c.name}
			{:else if m.status === 'ok'}
				✓ All <b>{m.nights}</b> nights placed
			{:else if m.status === 'empty'}
				No nights set yet · <b class="text-ink">{m.nights}</b> to place
			{:else}
				<b class="text-ink">{m.planned}</b> of {m.nights} nights placed ·
				<b class="text-ink">{m.left}</b> left
			{/if}
		</p>
	</div>

	{#if leg.stops.length > 0}
		<ol class="grid gap-1.5">
			{#each leg.stops as s (s.area)}
				<li
					class="flex flex-wrap items-center gap-x-2 gap-y-0.5 rounded-xl bg-surface-2 py-2 pr-1.5 pl-2"
					data-stop={s.key}
					data-stop-i={s.i}
				>
					<span
						class="mt-1.5 grid size-6.5 flex-none place-items-center self-start rounded-full bg-cat text-xs font-bold text-background"
						>{s.n}</span
					>
					<button
						type="button"
						class="group grid min-h-10 min-w-0 flex-1 gap-0.5 rounded-lg py-0.5 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-note"
						onclick={() => {
							oncity(s.key);
						}}
					>
						<b class="truncate text-base leading-tight font-semibold group-hover:text-cat"
							>{s.name}</b
						>
						<small class="text-xs/snug text-ink-3"
							>{stopWhen(s)}{#if s.verdict && s.verdict !== 'must'}{SEP}<em
									class={cn(
										'font-semibold not-italic',
										s.verdict === 'maybe' ? 'text-maybe' : 'text-skip',
									)}>{VERDICT_LABEL[s.verdict]}</em
								>{/if}{#if !s.located}{SEP}<em class="text-warn">no coordinates, not on the map</em
								>{/if}</small
						>
					</button>
					{#if !edit}
						<span class="text-sm whitespace-nowrap text-ink-2" data-stop-nights
							>{s.nights ? plural(s.nights, 'night') : 'nights open'}</span
						>
					{:else}
						<div class="flex gap-0.5 self-start">
							<Button
								variant="ghost"
								size="icon"
								class="pointer-coarse:size-11"
								aria-label="Move {s.name} earlier"
								disabled={s.i === 0}
								data-move="-1"
								onclick={() => {
									onmove(c.id, s.i, -1);
								}}><ArrowUpIcon /></Button
							>
							<Button
								variant="ghost"
								size="icon"
								class="pointer-coarse:size-11"
								aria-label="Move {s.name} later"
								disabled={s.i === leg.stops.length - 1}
								data-move="1"
								onclick={() => {
									onmove(c.id, s.i, 1);
								}}><ArrowDownIcon /></Button
							>
							<Button
								variant="ghost"
								size="icon"
								class="pointer-coarse:size-11"
								aria-label="Remove {s.name} from the route"
								data-remove
								onclick={() => {
									onremove(c.id, s.i);
								}}><XIcon /></Button
							>
						</div>
						<div
							class="flex basis-full items-center gap-1 pl-8.5"
							role="group"
							aria-label="Nights in {s.name}"
						>
							<Button
								variant="outline"
								size="icon"
								class="pointer-coarse:size-11"
								aria-label="One night less in {s.name}"
								disabled={!s.nights}
								onclick={() => {
									onnights(c.id, s.i, (s.nights ?? 0) - 1);
								}}>−</Button
							>
							<input
								type="number"
								inputmode="numeric"
								min={MIN_NIGHTS}
								max={MAX_NIGHTS}
								value={s.nights ?? ''}
								placeholder="–"
								aria-label="Nights in {s.name}"
								class="nights-input h-9 w-13 rounded-md border border-input bg-card p-0 text-center font-serif text-lg font-semibold focus:border-cat focus:ring-3 focus:ring-cat/20 focus:outline-none pointer-coarse:h-11"
								data-nights-input
								oninput={(e) => {
									onInput(s.i, e);
								}}
								onchange={(e) => {
									onChange(s.i, e);
								}}
							/>
							<Button
								variant="outline"
								size="icon"
								class="pointer-coarse:size-11"
								aria-label="One night more in {s.name}"
								onclick={() => {
									onnights(c.id, s.i, (s.nights ?? 0) + 1);
								}}>+</Button
							>
							<span class="ml-1 text-sm text-ink-3">{s.nights === 1 ? 'night' : 'nights'}</span>
						</div>
					{/if}
				</li>
			{/each}
		</ol>
	{:else}
		<p class="mt-1 text-sm text-ink-3" data-no-stops>No stops yet. Add the first city below.</p>
	{/if}

	{#if !edit}
		{#if musts.length > 0}
			<p class="mt-1 text-sm text-ink-3" data-unplaced>
				{plural(musts.length, 'Must city', 'Must cities')} not placed: {musts
					.map((x) => x.name)
					.join(', ')}.
			</p>
		{/if}
	{:else if musts.length > 0 || maybes.length > 0}
		<div class="mt-3 grid gap-1.5">
			{#each [{ h: 'Must, not placed yet', xs: musts }, { h: 'Maybe', xs: maybes }] as group (group.h)}
				{#if group.xs.length > 0}
					<p class="mt-0.5 text-xs font-bold tracking-widest text-ink-3 uppercase">{group.h}</p>
					<div class="flex flex-wrap gap-1.5">
						{#each group.xs as x (x.area)}
							<button
								type="button"
								class={cn(
									'inline-flex min-h-9.5 items-center gap-1 rounded-full border border-border bg-card py-0 pr-3 pl-2 text-sm font-semibold hover:border-cat hover:bg-cat/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-note pointer-coarse:min-h-11',
									x.verdict === 'must' ? 'border-dashed border-cat/60' : 'text-ink-2',
								)}
								aria-label="Add {x.name} to the {c.name} route"
								data-add={x.area}
								onclick={() => {
									onadd(c.id, x.area);
								}}><PlusIcon class="size-3.5 text-cat" />{x.name}</button
							>
						{/each}
					</div>
				{/if}
			{/each}
		</div>
	{:else}
		<p class="mt-1 text-sm text-ink-3" data-add-none>
			{#if c.cities.length > leg.stops.length}
				Every Must and Maybe city here is placed. Others are in the <a
					href={areasHref}
					class="text-cat underline underline-offset-2">Areas round</a
				>.
			{:else}
				No other cities for this country yet.
			{/if}
		</p>
	{/if}
</section>

<style>
	.seg-0 {
		fill: var(--cat);
	}
	.seg-1 {
		fill: color-mix(in oklab, var(--cat) 62%, var(--surface));
	}
	.hatch-line {
		stroke: color-mix(in oklab, var(--ink-3) 30%, transparent);
		stroke-width: 2;
	}
	.nights-input {
		appearance: textfield;
	}
	.nights-input::-webkit-inner-spin-button,
	.nights-input::-webkit-outer-spin-button {
		appearance: none;
		margin: 0;
	}
</style>
