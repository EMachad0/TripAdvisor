<!--
	One holiday option (old holidayCard): a big photo (or the local name in large type) with badges and the title on
	it, the key facts (when, cost, booking, cold, crowds, winter), a heads-up when the traveler is in another country
	that night, and the actions: Details plus Lock it / ✓ Locked (pick-one holidays) or the card's own Must / Maybe /
	Skip (pick-many holidays). Free text gets its UTC offset label through TzText.
-->
<script lang="ts">
	import type { Snippet } from 'svelte';
	import TzText from '#lib/components/shell/TzText.svelte';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Spinner } from '#lib/components/ui/spinner/index.js';
	import CardImage from '#lib/features/cards/CardImage.svelte';
	import VerdictSeg from '#lib/features/cards/VerdictSeg.svelte';
	import type { Verdict } from '#lib/features/cards/model.js';
	import { cn } from '#lib/utils.js';
	import { bookingFact, brl, fmtDate, WDM, type DecidePlace } from '../model.ts';

	interface Props {
		place: DecidePlace;
		holidayShort: string;
		/** Country flag and name lookup. */
		country: (id: string) => { flag: string; name: string };
		/** Where the traveler is that night (or on the option's own day). */
		where: string | null;
		/** Pick-many: the option's own day; pick-one: undefined. */
		day?: string | null;
		many: boolean;
		locked: boolean;
		topPick: boolean;
		/** A lock or unlock of this holiday is on its way (non-optimistic): this card's id, or null to unlock. */
		pending: string | null | undefined;
		disabled: boolean;
		onopen: () => void;
		onlock?: (el: HTMLElement) => void;
		onunlock?: () => void;
		oncall?: (verdict: Verdict) => void;
	}

	let {
		place,
		holidayShort,
		country,
		where,
		day = null,
		many,
		locked,
		topPick,
		pending,
		disabled,
		onopen,
		onlock,
		onunlock,
		oncall,
	}: Props = $props();

	const f = $derived(place.facts);
	const book = $derived(bookingFact(place.booking));
	const when = $derived(many ? place.whenLabel : null);
	const facts = $derived(
		[
			f.cold !== null
				? { icon: f.coldLevel === 'brutal' ? '🥶' : '🌡️', label: 'Cold', value: f.cold }
				: null,
			f.crowd !== null ? { icon: '👥', label: 'Crowds', value: f.crowd } : null,
			f.winter !== null && f.winter !== f.crowd
				? { icon: '❄️', label: 'Winter', value: f.winter }
				: null,
		].filter((x) => x !== null),
	);
	const elsewhere = $derived(where !== null && place.country !== where);
	const busy = $derived(pending !== undefined);
</script>

<article
	class={cn(
		'flex flex-col overflow-hidden rounded-3xl border border-border bg-card shadow-soft transition duration-200 ease-soft hover:-translate-y-0.5 hover:shadow-big',
		(locked || (many && place.verdict === 'must')) && 'border-must ring-3 ring-must/30',
	)}
	data-cat={place.category}
	data-holiday-card={place.id}
	data-locked={locked ? 'true' : undefined}
	data-v={many ? (place.verdict ?? 'none') : undefined}
>
	<div
		class={cn(
			'relative aspect-16/10 overflow-hidden bg-cat/30',
			many && place.verdict === 'skip' && 'opacity-55',
		)}
	>
		<CardImage image={place.card.cover} sizes="(max-width: 640px) 100vw, 420px">
			{#snippet fallback()}
				<span
					class="absolute inset-0 grid place-items-center p-6 text-center font-cjk text-4xl font-bold text-cat"
					lang={place.card.lang}>{place.name_local ?? place.name}</span
				>
			{/snippet}
		</CardImage>
		<div
			class="absolute inset-0 bg-linear-to-t from-scrim/85 to-scrim/0 to-60%"
			aria-hidden="true"
		></div>
		<div class="absolute inset-x-3 top-3 z-10 flex flex-wrap gap-1.5 text-xs font-bold">
			{#if many && day !== null}
				<span class="rounded-full bg-seal px-2.5 py-1.5 text-primary-foreground" data-badge="day"
					>{fmtDate(day, WDM)}</span
				>
			{/if}
			{#if topPick}
				<span class="rounded-full bg-amber px-2.5 py-1.5 text-primary-foreground" data-badge="top"
					>👑 Top pick</span
				>
			{/if}
			{#if place.drone}
				<span class="rounded-full bg-note px-2.5 py-1.5 text-primary-foreground" data-badge="drone"
					>🛸 Drone show</span
				>
			{/if}
			{#if locked}
				<span class="rounded-full bg-must px-2.5 py-1.5 text-primary-foreground" data-badge="lock"
					>🔒 Locked</span
				>
			{/if}
		</div>
		<div class="absolute inset-x-4 bottom-3 z-10 text-on-scrim">
			<h3 class="font-serif text-2xl leading-tight font-semibold">{place.name}</h3>
			<p class="text-sm opacity-90">
				{country(place.country).flag}
				{place.cityName}{place.area === undefined ? '' : ` · ${place.area}`}
			</p>
		</div>
	</div>

	<ul
		class={cn('flex flex-col gap-2 p-4 text-sm', many && place.verdict === 'skip' && 'opacity-55')}
	>
		{#if when !== null}{@render row('🗓️', 'When', when)}{/if}
		{@render line('💰', 'Cost', costValue)}
		{@render line('📅', 'Booking', bookValue)}
		{#each facts as fact (fact.label)}
			{@render row(fact.icon, fact.label, fact.value)}
		{/each}
	</ul>

	{#if elsewhere && where !== null}
		<p class="mx-4 mb-3 rounded-xl bg-amber/15 px-3 py-2 text-sm text-amber" data-heads-up>
			Heads up: you’re in {country(where).flag}
			{country(where).name}
			{many && day !== null ? 'that day' : `on ${holidayShort}`}, not {country(place.country).name}.
		</p>
	{/if}

	<div class="mt-auto flex flex-wrap items-center justify-between gap-2 border-t border-border p-3">
		<Button variant="ghost" size="sm" onclick={onopen} aria-label={`Details for ${place.name}`}
			>Details</Button
		>
		{#if many}
			<VerdictSeg
				value={place.verdict ?? undefined}
				label={`Your call on ${place.name}`}
				{disabled}
				onpick={(v: Verdict) => {
					oncall?.(v);
				}}
			/>
		{:else if locked}
			<Button
				variant="secondary"
				size="sm"
				disabled={disabled || busy}
				onclick={() => {
					onunlock?.();
				}}
				aria-label={`Unlock ${place.name}`}
				data-unlock
				>{#if pending === null}<Spinner />{/if}✓ Locked</Button
			>
		{:else}
			<Button
				size="sm"
				disabled={disabled || busy}
				onclick={(e: MouseEvent) => {
					if (e.currentTarget instanceof HTMLElement) onlock?.(e.currentTarget);
				}}
				aria-label={`Lock ${place.name} for ${holidayShort}`}
				data-lock
				>{#if pending === place.id}<Spinner />{/if}🔒 Lock it</Button
			>
		{/if}
	</div>
</article>

{#snippet line(icon: string, label: string, value: Snippet)}
	<li class="flex items-baseline gap-2">
		<span class="w-5 shrink-0" aria-hidden="true">{icon}</span>
		<span class="w-18 shrink-0 text-muted-foreground">{label}</span>
		<span class="min-w-0 flex-1">{@render value()}</span>
	</li>
{/snippet}

{#snippet row(icon: string, label: string, value: string)}
	{#snippet text()}<TzText text={value} offset={place.tz} />{/snippet}
	{@render line(icon, label, text)}
{/snippet}

{#snippet costValue()}<b>{brl(place.brl)}</b>{/snippet}

{#snippet bookValue()}<span class={cn(book.warn && 'font-semibold text-warn')}>{book.text}</span
	>{/snippet}
