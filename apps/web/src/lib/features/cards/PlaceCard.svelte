<!--
	The compact place card (platform renderPlaceCard, built from structured data): photo or the local name in large
	type, category, "New", the booking badge, the drone chip, flag chips, city · area; then name, local name, why,
	price (per night for a bed), local price, time needed, kind and the "Note" chip.
	`fill`: take the parent's height (the swipe deck), photo beside the text from md up.
-->
<script lang="ts">
	import PenLine from '@lucide/svelte/icons/pen-line';
	import TzText from '#lib/components/shell/TzText.svelte';
	import type { ContentPlace } from '#lib/content/types.js';
	import { cn } from '#lib/utils.js';
	import CardFlags from './CardFlags.svelte';
	import CardImage from './CardImage.svelte';

	interface Props {
		place: ContentPlace;
		/** The traveler wrote a note on it. */
		noted?: boolean;
		fill?: boolean;
	}

	let { place, noted = false, fill = false }: Props = $props();
	const card = $derived(place.card);
	const booking = $derived(place.booking);
</script>

<article
	data-cat={place.category}
	data-place-card={place.id}
	class={cn(
		'flex flex-col overflow-hidden panel text-card-foreground',
		fill && 'h-full md:flex-row',
	)}
>
	<div
		class={cn(
			'@container relative shrink-0 overflow-hidden bg-muted',
			fill ? 'h-1/2 md:h-auto md:w-1/2' : 'aspect-4/3',
		)}
	>
		<CardImage image={card.cover} sizes="(max-width: 420px) 100vw, 380px">
			{#snippet fallback()}
				<span
					aria-hidden="true"
					lang={place.name_local === null ? undefined : card.lang}
					class="absolute inset-0 flex items-center justify-center px-6 pt-16 pb-10 text-center font-serif text-3xl font-semibold text-cat"
					>{place.name_local ?? place.name}</span
				>
			{/snippet}
		</CardImage>
		<!-- One column over the photo (top chips, then the flags and the city at the bottom), so the groups never
			overlap when they wrap; a narrow card (the duel pair on a phone) drops the flag chips. -->
		<div class="absolute inset-3 flex flex-col justify-between gap-1.5 overflow-hidden">
			<div class="flex flex-wrap items-center gap-1.5">
				<span
					class="inline-flex items-center gap-1 rounded-full bg-card/90 px-2.5 py-1 text-xs font-semibold text-foreground shadow-flat backdrop-blur-sm"
					>{card.categoryIcon} {card.categoryLabel}</span
				>
				{#if place.isNew}
					<span class="rounded-full px-2.5 py-1 text-xs font-bold bg-accent-fill shadow-flat"
						>New</span
					>
				{/if}
				{#if booking.badge !== null}
					<span
						title={booking.level === 'recommended' ? 'Booking recommended' : 'Must book ahead'}
						class={cn(
							'rounded-full px-2.5 py-1 text-xs font-semibold shadow-flat',
							booking.level === 'recommended'
								? 'bg-card/90 text-foreground backdrop-blur-sm'
								: 'bg-warn text-primary-foreground',
						)}>📅<span class="hidden @3xs:inline">{` ${booking.badge}`}</span></span
					>
				{/if}
				{#if place.drone}
					<span
						title="Drone show"
						class="rounded-full bg-card/90 px-2.5 py-1 text-xs font-semibold text-foreground shadow-flat backdrop-blur-sm"
						>🛸 Drone show</span
					>
				{/if}
			</div>
			<div class="flex flex-col items-start gap-1.5">
				{#if card.flags.length > 0}
					<div class="hidden flex-wrap gap-1.5 @3xs:flex">
						<CardFlags flags={card.flags} />
					</div>
				{/if}
				<span
					class="rounded-full bg-card/90 px-2.5 py-1 text-xs font-medium text-foreground shadow-flat backdrop-blur-sm"
					>{place.cityName}{place.area === undefined ? '' : ` · ${place.area}`}</span
				>
			</div>
		</div>
	</div>
	<div class={cn('flex min-h-0 flex-1 flex-col gap-2 p-4', fill && 'md:p-6')}>
		<h3 class={cn('font-serif text-xl leading-tight font-semibold', fill && 'md:text-3xl')}>
			{place.name}
		</h3>
		{#if place.name_local !== null}
			<p lang={card.lang} class="-mt-1 text-sm text-muted-foreground">{place.name_local}</p>
		{/if}
		{#if place.why !== undefined}
			<p
				class={cn(
					'min-h-0 text-sm leading-relaxed text-ink-2',
					fill ? 'line-clamp-4 md:line-clamp-6 md:text-base' : 'line-clamp-3',
				)}
			>
				<TzText text={place.why} offset={place.tz} />
			</p>
		{/if}
		<div
			class="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground"
			data-card-meta
		>
			<span class="font-serif text-base font-semibold text-foreground nums"
				>{place.costLabel}{#if card.stay && place.brl > 0}
					<small class="font-normal text-muted-foreground"> / night</small>{/if}</span
			>
			{#if card.costLocal !== ''}<span>{card.costLocal}</span>{/if}
			{#if card.timeNeeded !== null}<span>{card.timeNeeded}</span>{/if}
			{#if place.kind !== undefined}<span>{place.kind}</span>{/if}
			{#if noted}
				<span
					class="inline-flex items-center gap-1 rounded-full bg-note/10 px-2 py-0.5 text-xs font-semibold text-note"
					title="You wrote a note"><PenLine class="size-3" aria-hidden="true" />Note</span
				>
			{/if}
		</div>
	</div>
</article>
