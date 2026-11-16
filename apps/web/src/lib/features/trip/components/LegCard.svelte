<!--
	One itinerary card (the old legCard), shared by the Itinerary, the calendar day sheet and Today: a boarding pass
	for a flight, a transfer with its "Leave by" time and plan, a stay voucher with the address and the cards in that
	city, or a note. Every clock time carries its UTC offset (legOffsets: airports, the stay's country, the flight
	or stay of that day). The edit button shows only when `onedit` is given (owner, not in the day sheet).
-->
<script lang="ts">
	import ArrowRightIcon from '@lucide/svelte/icons/arrow-right';
	import EllipsisIcon from '@lucide/svelte/icons/ellipsis';
	import PlaneIcon from '@lucide/svelte/icons/plane';
	import { dayKey, diffDays, legOffsets, stayCities, timeOf } from '@atr/shared/trip';
	import { resolve } from '$app/paths';
	import TimeTz from '#lib/components/shell/TimeTz.svelte';
	import TzText from './TzLine.svelte';
	import { Button } from '#lib/components/ui/button/index.js';
	import type { ContentCountry } from '#lib/content/types.js';
	import { cn } from '#lib/utils.js';
	import { copyText } from '../actions.ts';
	import {
		countryFlag,
		countryName,
		fmtDay,
		or,
		legStatus,
		parsePlan,
		plural,
		safeUrl,
		statusLabel,
	} from '../format.ts';
	import type { TripPlace } from '../trip-data.svelte.ts';
	import type { TripLeg } from '../types.ts';
	import AddressBlock from './AddressBlock.svelte';
	import Chip from './Chip.svelte';
	import Label from './Label.svelte';
	import LinkedText from './LinkedText.svelte';

	interface Props {
		leg: TripLeg;
		/** Every leg (a transfer takes its zone from the flight or stay of its day). */
		legs: readonly TripLeg[];
		countries: readonly ContentCountry[];
		/** Places with verdicts, for "N cards here · M Must" on a stay. */
		places: readonly TripPlace[];
		/** The stay you are in today. */
		now?: boolean;
		/** "in 15 days" on a flight (Today). */
		countdown?: string | undefined;
		onedit?: ((id: string) => void) | undefined;
		/** Opens the transfer plan. */
		ondetail?: ((id: string) => void) | undefined;
	}

	let {
		leg: l,
		legs,
		countries,
		places,
		now = false,
		countdown,
		onedit,
		ondetail,
	}: Props = $props();

	const off = $derived(legOffsets(l, legs));
	const status = $derived(legStatus(l));
	const start = $derived(dayKey(l.start));
	const end = $derived(dayKey(l.end));
	const plusDays = $derived(start !== '' && end !== '' ? diffDays(start, end) : 0);
	const steps = $derived(parsePlan(l.plan));
	const nights = $derived(start !== '' && end !== '' ? diffDays(start, end) : 0);
	const cities = $derived(stayCities(l));
	const here = $derived.by(() => {
		if (l.type !== 'stay' || !l.country || l.country === 'brazil' || cities.length === 0)
			return null;
		const xs = places.filter((p) => cities.includes(p.city));
		return { n: xs.length, must: xs.filter((p) => p.verdict === 'must').length };
	});
	// The Places page filtered to this stay's cities (old #/places/<a+b>).
	const placesHref = $derived(
		resolve('/(app)/places/[cities]', { cities: cities.join('+') }),
	);
	const flag = $derived(countryFlag(l.country, countries));
	const meta = $derived.by(() => {
		if (l.type === 'flight')
			return or(
				[l.carrier, l.flight, l.cabin].filter((x) => x !== undefined && x !== '').join(' · '),
				'Flight',
			);
		if (l.type === 'transport')
			return `${l.mode !== undefined && l.mode !== '' ? l.mode : 'Transfer'}${start !== '' ? ` · ${fmtDay(l.start)}` : ''}`;
		if (l.type === 'stay')
			return `${l.country ? `${flag !== '' ? `${flag} ` : ''}${countryName(l.country, countries)} · ` : ''}Stay${l.host ? ` · hosted by ${l.host}` : ''}`;
		return `Note${start !== '' ? ` · ${fmtDay(l.start)}` : ''}`;
	});
	const tone = (s: string): 'ok' | 'amber' | 'quiet' =>
		s === 'booked' ? 'ok' : s === 'planned' ? 'amber' : 'quiet';
</script>

{#snippet top()}
	<div class="flex flex-wrap items-center justify-between gap-x-2.5 gap-y-2">
		<div class="min-w-0 text-sm text-ink-3">
			{meta}{#if l.type === 'note' && timeOf(l.start) !== ''}
				· <TimeTz time={l.start ?? ''} offset={off.start} />{/if}
		</div>
		<div class="ml-auto flex items-center gap-1.5">
			{#if countdown}<Chip tone="accent">{countdown}</Chip>{/if}
			{#if now}<Chip tone="ok" testid="here-chip">You are here</Chip>{/if}
			<Chip tone={tone(status)}>{statusLabel(status)}</Chip>
			{#if onedit}
				<Button
					variant="ghost"
					size="icon-sm"
					aria-label="Edit"
					onclick={() => {
						onedit(l.id);
					}}><EllipsisIcon /></Button
				>
			{/if}
		</div>
	</div>
{/snippet}

{#snippet refStub()}
	{#if l.ref}
		<span class="flex items-center gap-2">
			Booking ref <b class="font-mono">{l.ref}</b>
			<Button
				variant="outline"
				size="xs"
				onclick={() => {
					void copyText(l.ref ?? '');
				}}>Copy</Button
			>
		</span>
	{/if}
{/snippet}

{#snippet noteAndLink(offset: number | null)}
	{#if l.note}
		<p class="mt-2.5 text-sm wrap-anywhere whitespace-pre-line text-ink-2">
			<LinkedText text={l.note} {offset} />
		</p>
	{/if}
	{@render bookingLink()}
{/snippet}

{#snippet bookingLink()}
	{#if l.link}
		<div class="mt-2.5 flex flex-wrap gap-1.5">
			<Button
				variant="outline"
				size="sm"
				href={safeUrl(l.link)}
				target="_blank"
				rel="noopener noreferrer">Open booking ↗</Button
			>
		</div>
	{/if}
{/snippet}

<article
	data-leg={l.id}
	data-type={l.type ?? 'note'}
	class={cn(
		'min-w-0 scroll-mt-32 rounded-2xl border border-border bg-card px-4 py-4',
		l.status === 'tbd' && 'border-dashed bg-transparent',
		now && 'border-ok ring-1 ring-ok',
	)}
>
	{@render top()}
	{#if l.type === 'flight'}
		<div class="mt-3 flex items-center gap-3">
			<div class="flex min-w-0 shrink-0 flex-col gap-1">
				<b class="font-serif text-3xl leading-none font-semibold">{or(l.from, '???')}</b>
				<span class="text-sm font-semibold tabular-nums">
					{#if timeOf(l.start) !== ''}<TimeTz
							time={l.start ?? ''}
							offset={off.start}
						/>{:else}--:--{/if}
				</span>
				<small class="text-xs text-ink-3">{l.fromName ?? ''}</small>
			</div>
			<div class="flex min-w-0 flex-1 flex-col items-center gap-2 text-center text-xs text-ink-3">
				<span>{l.duration ?? ''}</span>
				<span class="flex w-full items-center gap-1" aria-hidden="true">
					<span class="h-0 flex-1 border-t border-dashed border-border"></span>
					<PlaneIcon class="size-4 rotate-45 text-cat" />
					<span class="h-0 flex-1 border-t border-dashed border-border"></span>
				</span>
				<span>{fmtDay(l.start)}</span>
			</div>
			<div class="flex min-w-0 shrink-0 flex-col gap-1 text-right">
				<b class="font-serif text-3xl leading-none font-semibold">{or(l.to, '???')}</b>
				<span class="text-sm font-semibold tabular-nums">
					{#if timeOf(l.end) !== ''}
						<TimeTz time={l.end ?? ''} offset={off.end} />{#if plusDays > 0}<sup
								class="ml-0.5 text-xs text-ink-3">+{plusDays}</sup
							>{/if}
					{:else}--:--{/if}
				</span>
				<small class="text-xs text-ink-3">{l.toName ?? ''}</small>
			</div>
		</div>
		{#if (l.ref ?? '') !== '' || plusDays > 0}
			<div
				class="mt-3 flex flex-wrap justify-between gap-2 border-t border-dashed border-border pt-3 text-sm text-ink-2"
			>
				{@render refStub()}
				{#if plusDays > 0}<span>Arrives {fmtDay(l.end)}</span>{/if}
			</div>
		{/if}
		{@render noteAndLink(null)}
	{:else if l.type === 'transport'}
		<h3 class="mt-1.5 font-serif text-xl leading-tight font-semibold">{or(l.title, 'Transfer')}</h3>
		<div class="mt-3 flex items-center gap-3.5">
			{#if timeOf(l.start) !== ''}
				<div class="shrink-0 rounded-xl bg-seal/10 px-3 py-2 text-center">
					<Label tone="seal">Leave by</Label>
					<b class="font-serif text-2xl leading-none font-semibold text-seal tabular-nums"
						><TimeTz time={l.start ?? ''} offset={off.start} /></b
					>
				</div>
			{/if}
			<div class="min-w-0 flex-1 text-sm font-medium wrap-anywhere">
				{[l.fromName, l.toName].filter((x) => x !== undefined && x !== '').join(' → ')}
				{#if or(l.mode, '') !== '' || or(l.duration, '') !== ''}
					<small class="mt-0.5 block text-sm font-normal text-ink-3"
						>{[l.mode, l.duration].filter((x) => x !== undefined && x !== '').join(' · ')}</small
					>
				{/if}
			</div>
		</div>
		{#if (steps.length > 0 || l.note) && ondetail}
			<button
				type="button"
				class="mt-3 flex w-full items-center justify-between gap-2 rounded-xl border border-border bg-surface-2 px-3.5 py-3 text-left text-sm font-semibold hover:border-cat"
				onclick={() => {
					ondetail(l.id);
				}}
			>
				<span>See the plan{steps.length > 0 ? ` · ${plural(steps.length, 'step')}` : ''}</span>
				<ArrowRightIcon class="size-4.5 text-ink-3" aria-hidden="true" />
			</button>
		{/if}
		{@render bookingLink()}
	{:else if l.type === 'stay'}
		<h3 class="mt-1.5 font-serif text-xl leading-tight font-semibold">{or(l.title, 'Untitled')}</h3>
		{#if start !== ''}
			<div
				class="mt-3 flex items-center gap-2.5 rounded-xl bg-surface-2 px-3.5 py-3"
				data-testid="voucher"
			>
				<div class="min-w-0 flex-1">
					<Label>{l.checkIn ? 'Check-in' : 'Arrive'}</Label>
					<b class="block font-serif leading-tight font-semibold">{fmtDay(l.start)}</b>
					{#if l.checkIn}<small class="text-sm text-ink-2 tabular-nums"
							><TzText text={`after ${l.checkIn}`} offset={off.start} /></small
						>{/if}
				</div>
				<div class="shrink-0 text-sm whitespace-nowrap text-ink-3">
					{nights > 0 ? plural(nights, 'night') : 'no bed'}
				</div>
				<div class="min-w-0 flex-1 text-right">
					<Label>{l.checkOut ? 'Checkout' : 'Leave'}</Label>
					<b class="block font-serif leading-tight font-semibold"
						>{fmtDay(or(l.end, l.start ?? ''))}</b
					>
					{#if l.checkOut}<small class="text-sm text-ink-2 tabular-nums"
							><TzText text={`by ${l.checkOut}`} offset={off.start} /></small
						>{/if}
				</div>
			</div>
		{/if}
		{#if l.address}<AddressBlock address={l.address} />{/if}
		{#if l.ref}
			<div class="mt-3 border-t border-dashed border-border pt-3 text-sm text-ink-2">
				{@render refStub()}
			</div>
		{/if}
		{@render noteAndLink(off.start)}
		{#if here && here.n > 0}
			<a
				href={placesHref}
				class="mt-3 flex items-center justify-between gap-2.5 rounded-xl bg-surface-2 px-3.5 py-3 text-sm hover:ring-1 hover:ring-cat"
			>
				<span
					><b>{plural(here.n, 'card')}</b> here{here.must > 0
						? ` · ${String(here.must)} Must`
						: ''}</span
				>
				<ArrowRightIcon class="size-4.5 text-ink-3" aria-hidden="true" />
			</a>
			<!-- eslint-enable svelte/no-navigation-without-resolve -->
		{/if}
	{:else}
		<h3 class="mt-1.5 font-serif text-xl leading-tight font-semibold">{or(l.title, 'Untitled')}</h3>
		{#if l.address}<AddressBlock address={l.address} />{/if}
		{@render noteAndLink(off.start)}
	{/if}
</article>
