<!--
	One itinerary card (the old legCard), shared by the Itinerary, the calendar day sheet and Today: a boarding pass
	for a flight, a transfer with its "Leave by" time and plan, a stay voucher with the address and the cards in that
	city, or a note. Every clock time carries its UTC offset (legOffsets: airports, the stay's country, the flight
	or stay of that day). The edit button shows only when `onedit` is given (owner, not in the day sheet).

	The card is a container: once it is wide (a laptop or the monitor) its body splits in two, the essentials on the
	left (pass, voucher, Leave by) and the notes, address and links on the right, so lines stay short.
-->
<script lang="ts">
	import ArrowRightIcon from '@lucide/svelte/icons/arrow-right';
	import ArrowUpRightIcon from '@lucide/svelte/icons/arrow-up-right';
	import BedDoubleIcon from '@lucide/svelte/icons/bed-double';
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
	const placesHref = $derived(resolve('/(app)/places/[cities]', { cities: cities.join('+') }));
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
	const transferSide = $derived(
		((steps.length > 0 || (l.note ?? '') !== '') && ondetail !== undefined) || (l.link ?? '') !== '',
	);
	/** Right-hand column content on a wide card (notes, links, address). */
	const hasSide = $derived(
		(l.note ?? '') !== '' ||
			(l.link ?? '') !== '' ||
			(l.type === 'stay' && ((l.address ?? '') !== '' || (here?.n ?? 0) > 0)),
	);
</script>

{#snippet top()}
	<div class="flex items-start gap-3">
		<div class="min-w-0 flex-1 pt-1 text-sm text-muted-foreground">
			{meta}{#if l.type === 'note' && timeOf(l.start) !== ''}
				· <TimeTz time={l.start ?? ''} offset={off.start} />{/if}
		</div>
		<div class="-my-0.5 flex shrink-0 flex-wrap items-center justify-end gap-1.5">
			{#if countdown}<Chip tone="accent">{countdown}</Chip>{/if}
			{#if now}<Chip tone="ok" testid="here-chip">You are here</Chip>{/if}
			<Chip tone={tone(status)}>{statusLabel(status)}</Chip>
			{#if onedit}
				<Button
					variant="ghost"
					size="icon-sm"
					class="-mr-1.5"
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
			Booking ref <b class="font-mono font-semibold tracking-wide">{l.ref}</b>
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

{#snippet note(offset: number | null)}
	{#if l.note}
		<p class="max-w-prose text-sm leading-relaxed wrap-anywhere whitespace-pre-line text-ink-2">
			<LinkedText text={l.note} {offset} />
		</p>
	{/if}
{/snippet}

{#snippet bookingLink()}
	{#if l.link}
		<div class="flex flex-wrap gap-1.5">
			<Button
				variant="outline"
				size="sm"
				href={safeUrl(l.link)}
				target="_blank"
				rel="noopener noreferrer"
				>Open booking<ArrowUpRightIcon data-icon="inline-end" aria-hidden="true" /></Button
			>
		</div>
	{/if}
{/snippet}

<article
	data-leg={l.id}
	data-type={l.type ?? 'note'}
	class={cn(
		'@container min-w-0 scroll-mt-20 rounded-2xl border border-border/80 bg-card p-4 shadow-flat md:scroll-mt-8 md:p-5 3xl:p-6',
		l.status === 'tbd' && 'border-dashed border-ink-3/40 bg-card/45 shadow-none',
		now && 'border-ok/70 shadow-soft ring-2 ring-ok/25',
	)}
>
	{@render top()}
	{#if l.type === 'flight'}
		<div
			class={cn(
				'mt-3 grid gap-x-8 gap-y-3',
				hasSide && '@2xl:grid-cols-5 @2xl:items-start',
			)}
		>
			<div class="flex min-w-0 flex-col gap-3 @2xl:col-span-3">
				<div class="flex items-center gap-3 rounded-xl bg-muted/60 px-3.5 py-3.5 @md:px-5">
					<div class="flex min-w-0 shrink-0 flex-col gap-1">
						<b class="font-serif text-3xl leading-none font-semibold tracking-tight @md:text-4xl"
							>{or(l.from, '???')}</b
						>
						<span class="text-sm font-semibold nums">
							{#if timeOf(l.start) !== ''}<TimeTz
									time={l.start ?? ''}
									offset={off.start}
								/>{:else}<span class="text-muted-foreground">--:--</span>{/if}
						</span>
						<small class="max-w-28 truncate text-xs text-muted-foreground @md:max-w-40"
							>{l.fromName ?? ''}</small
						>
					</div>
					<div
						class="flex min-w-0 flex-1 flex-col items-center gap-1.5 text-center text-xs text-muted-foreground"
					>
						<span class="nums">{l.duration ?? ''}</span>
						<span class="flex w-full items-center gap-1.5" aria-hidden="true">
							<i class="size-1.5 rounded-full border border-ink-3"></i>
							<span class="h-0 flex-1 border-t border-dashed border-ink-3/50"></span>
							<PlaneIcon class="size-4 rotate-45 text-cat" />
							<span class="h-0 flex-1 border-t border-dashed border-ink-3/50"></span>
							<i class="size-1.5 rounded-full bg-ink-3"></i>
						</span>
						<span class="nums">{fmtDay(l.start)}</span>
					</div>
					<div class="flex min-w-0 shrink-0 flex-col items-end gap-1 text-right">
						<b class="font-serif text-3xl leading-none font-semibold tracking-tight @md:text-4xl"
							>{or(l.to, '???')}</b
						>
						<span class="text-sm font-semibold nums">
							{#if timeOf(l.end) !== ''}
								<TimeTz time={l.end ?? ''} offset={off.end} />{#if plusDays > 0}<sup
										class="ml-0.5 text-xs text-cat">+{plusDays}</sup
									>{/if}
							{:else}<span class="text-muted-foreground">--:--</span>{/if}
						</span>
						<small class="max-w-28 truncate text-xs text-muted-foreground @md:max-w-40"
							>{l.toName ?? ''}</small
						>
					</div>
				</div>
				{#if (l.ref ?? '') !== '' || plusDays > 0}
					<div
						class="flex flex-wrap items-center justify-between gap-2 px-1 text-sm text-ink-2"
					>
						{@render refStub()}
						{#if plusDays > 0}<span class="nums">Arrives {fmtDay(l.end)}</span>{/if}
					</div>
				{/if}
			</div>
			{#if hasSide}
				<div class="flex min-w-0 flex-col gap-3 @2xl:col-span-2 @2xl:pt-1">
					{@render note(null)}
					{@render bookingLink()}
				</div>
			{/if}
		</div>
	{:else if l.type === 'transport'}
		<div class={cn('mt-1.5 grid gap-x-8 gap-y-3', transferSide && '@2xl:grid-cols-2')}>
			<div class="flex min-w-0 flex-col gap-3">
				<h3 class="font-serif text-xl leading-tight font-semibold md:text-2xl">
					{or(l.title, 'Transfer')}
				</h3>
				<div class="flex items-center gap-3.5">
					{#if timeOf(l.start) !== ''}
						<div class="shrink-0 rounded-xl bg-seal/10 px-3.5 py-2.5 text-center">
							<Label tone="seal">Leave by</Label>
							<b class="font-serif text-2xl leading-none font-semibold text-seal nums"
								><TimeTz time={l.start ?? ''} offset={off.start} /></b
							>
						</div>
					{/if}
					<div class="min-w-0 flex-1 text-sm font-medium wrap-anywhere">
						{[l.fromName, l.toName].filter((x) => x !== undefined && x !== '').join(' → ')}
						{#if or(l.mode, '') !== '' || or(l.duration, '') !== ''}
							<small class="mt-0.5 block text-sm font-normal text-muted-foreground"
								>{[l.mode, l.duration]
									.filter((x) => x !== undefined && x !== '')
									.join(' · ')}</small
							>
						{/if}
					</div>
				</div>
			</div>
			{#if transferSide}
				<div class="flex min-w-0 flex-col justify-end gap-3">
					{#if (steps.length > 0 || l.note) && ondetail}
						<button
							type="button"
							class="group flex min-h-11 w-full items-center justify-between gap-2 rounded-xl bg-muted/60 px-4 py-3 text-left text-sm font-semibold transition-colors duration-200 ease-soft hover:bg-cat/10 hover:text-cat focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
							onclick={() => {
								ondetail(l.id);
							}}
						>
							<span>See the plan{steps.length > 0 ? ` · ${plural(steps.length, 'step')}` : ''}</span>
							<ArrowRightIcon
								class="size-4.5 text-muted-foreground transition-transform duration-200 ease-soft group-hover:text-cat motion-safe:group-hover:translate-x-0.5"
								aria-hidden="true"
							/>
						</button>
					{/if}
					{@render bookingLink()}
				</div>
			{/if}
		</div>
	{:else if l.type === 'stay'}
		<div class={cn('mt-1.5 grid gap-x-8 gap-y-3', hasSide && '@2xl:grid-cols-2')}>
			<div class="flex min-w-0 flex-col gap-3">
				<h3 class="font-serif text-xl leading-tight font-semibold md:text-2xl">
					{or(l.title, 'Untitled')}
				</h3>
				{#if start !== ''}
					<div
						class="flex items-center gap-3 rounded-xl bg-muted/60 px-4 py-3.5"
						data-testid="voucher"
					>
						<div class="min-w-0 flex-1">
							<Label>{l.checkIn ? 'Check-in' : 'Arrive'}</Label>
							<b class="block font-serif text-lg leading-tight font-semibold nums"
								>{fmtDay(l.start)}</b
							>
							{#if l.checkIn}<small class="text-sm text-ink-2 nums"
									><TzText text={`after ${l.checkIn}`} offset={off.start} /></small
								>{/if}
						</div>
						<div
							class="flex shrink-0 flex-col items-center gap-1 text-xs font-medium whitespace-nowrap text-muted-foreground nums"
						>
							<BedDoubleIcon class="size-4" aria-hidden="true" />
							{nights > 0 ? plural(nights, 'night') : 'no bed'}
						</div>
						<div class="min-w-0 flex-1 text-right">
							<Label>{l.checkOut ? 'Checkout' : 'Leave'}</Label>
							<b class="block font-serif text-lg leading-tight font-semibold nums"
								>{fmtDay(or(l.end, l.start ?? ''))}</b
							>
							{#if l.checkOut}<small class="text-sm text-ink-2 nums"
									><TzText text={`by ${l.checkOut}`} offset={off.start} /></small
								>{/if}
						</div>
					</div>
				{/if}
				{#if l.ref}
					<div class="px-1 text-sm text-ink-2">
						{@render refStub()}
					</div>
				{/if}
			</div>
			{#if hasSide}
				<div class="flex min-w-0 flex-col gap-3 @2xl:pt-9">
					{#if l.address}<AddressBlock address={l.address} />{/if}
					{@render note(off.start)}
					{@render bookingLink()}
					{#if here && here.n > 0}
						<a
							href={placesHref}
							class="group flex min-h-11 items-center justify-between gap-2.5 rounded-xl bg-cat/8 px-4 py-3 text-sm text-foreground transition-colors duration-200 ease-soft hover:bg-cat/14 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
						>
							<span
								><b class="font-semibold">{plural(here.n, 'card')}</b> here{#if here.must > 0}&#32;·&#32;<span class="font-semibold text-must">{here.must} Must</span>{/if}</span
							>
							<ArrowRightIcon
								class="size-4.5 text-cat transition-transform duration-200 ease-soft motion-safe:group-hover:translate-x-0.5"
								aria-hidden="true"
							/>
						</a>
					{/if}
				</div>
			{/if}
		</div>
	{:else}
		<div class="mt-1.5 flex flex-col gap-3">
			<h3 class="font-serif text-xl leading-tight font-semibold md:text-2xl">
				{or(l.title, 'Untitled')}
			</h3>
			{#if l.address}<AddressBlock address={l.address} />{/if}
			{@render note(off.start)}
			{@render bookingLink()}
		</div>
	{/if}
</article>
