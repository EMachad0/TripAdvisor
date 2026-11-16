<!--
	One side of a duel (old duelSide): the place as a full-bleed photo with its name, why and price on a scrim, the
	note as a chip, a Details button that opens the sheet, and the whole card as the pick button. After a pick the
	winner grows with "+N" and the loser fades with "−N". Two of these stack on a phone and sit side by side from md.
-->
<script lang="ts">
	import Info from '@lucide/svelte/icons/info';
	import TzText from '#lib/components/shell/TzText.svelte';
	import CardImage from '#lib/features/cards/CardImage.svelte';
	import NoteSnip from '#lib/features/cards/NoteSnip.svelte';
	import { cn } from '#lib/utils.js';
	import type { DecidePlace } from './model.ts';

	interface Props {
		place: DecidePlace;
		side: 'left' | 'right';
		/** After a pick: this side won or lost, with the rating change. */
		result: { won: boolean; delta: number } | null;
		disabled: boolean;
		onpick: () => void;
		onopen: () => void;
	}

	let { place, side, result, disabled, onpick, onopen }: Props = $props();
	const card = $derived(place.card);
	const meta = $derived(
		[card.costLocal === place.costLabel ? '' : card.costLocal, card.timeNeeded ?? '']
			.filter((s) => s !== '')
			.join(' · '),
	);
</script>

<div
	data-cat={place.category}
	class={cn(
		'group relative duel-stack-h min-w-0 rounded-2xl transition duration-300 ease-spring md:duel-pair-h',
		result?.won === true && 'z-10 scale-102',
		result?.won === false && 'scale-96 opacity-45 grayscale-60',
	)}
	data-duel-side={side}
	data-id={place.id}
	data-result={result === null ? undefined : result.won ? 'win' : 'lose'}
>
	<div
		class={cn(
			'relative size-full overflow-hidden rounded-2xl bg-cat/20 shadow-soft ring-1 ring-border/60 transition-shadow duration-300 group-has-[[data-pick]:focus-visible]:ring-3 group-has-[[data-pick]:focus-visible]:ring-ring/60',
			result?.won === true && 'shadow-big ring-4 ring-must/60',
		)}
	>
		<div
			class="absolute inset-0 transition-transform duration-700 ease-soft motion-safe:group-hover:scale-103"
		>
			<CardImage
				image={card.cover}
				sizes="(min-width: 1920px) 40vw, (min-width: 704px) 45vw, 100vw"
			>
				{#snippet fallback()}
					<span
						aria-hidden="true"
						lang={place.name_local === null ? undefined : card.lang}
						class="absolute inset-0 flex items-start justify-center bg-linear-150 from-cat/30 to-cat/5 px-6 pt-14 text-center font-serif text-3xl font-semibold text-cat/70 md:pt-20 md:text-4xl 3xl:text-5xl"
						>{place.name_local ?? place.name}</span
					>
				{/snippet}
			</CardImage>
		</div>
		<div
			class="absolute inset-0 bg-linear-to-t from-scrim/90 via-scrim/60 via-45% to-scrim/0 to-85%"
			aria-hidden="true"
		></div>

		<div class="absolute inset-x-3 top-3 flex items-center gap-1.5 md:inset-x-4 md:top-4">
			<span
				class="inline-flex items-center gap-1 rounded-full bg-background/90 px-2.5 py-1 text-xs font-semibold text-foreground shadow-flat"
				>{card.categoryIcon} {card.categoryLabel}</span
			>
			{#if place.isNew}
				<span
					class="rounded-full bg-cat px-2.5 py-1 text-xs font-bold text-primary-foreground shadow-flat"
					>New</span
				>
			{/if}
		</div>

		<div
			class="absolute inset-x-0 bottom-0 flex flex-col gap-1 p-4 text-on-scrim md:gap-1.5 md:p-5 3xl:p-7"
		>
			<p class="truncate text-xs font-medium opacity-85 md:text-sm">
				{place.cityName}{place.area === undefined ? '' : ` · ${place.area}`}
			</p>
			<h3
				class="line-clamp-2 font-serif text-xl leading-tight font-semibold md:text-2xl xl:text-3xl 3xl:text-4xl"
			>
				{place.name}
			</h3>
			{#if place.name_local !== null}
				<p lang={card.lang} class="hidden truncate text-sm opacity-80 md:block">
					{place.name_local}
				</p>
			{/if}
			{#if place.why !== undefined}
				<p
					class="hidden max-w-prose text-sm leading-relaxed opacity-90 md:line-clamp-2 xl:line-clamp-3 3xl:text-base"
				>
					<TzText text={place.why} offset={place.tz} />
				</p>
			{/if}
			<p class="flex flex-wrap items-baseline gap-x-2 text-sm nums md:mt-1">
				<b class="font-semibold"
					>{place.costLabel}{#if card.stay && place.brl > 0}<small class="font-normal opacity-80">
							/ night</small
						>{/if}</b
				>
				{#if meta !== ''}<span class="opacity-80">{meta}</span>{/if}
			</p>
			{#if place.note !== ''}
				<span
					class="mt-1 inline-flex max-w-full self-start rounded-full bg-background/90 px-2.5 py-1 shadow-flat"
					><NoteSnip text={place.note} offset={place.tz} /></span
				>
			{/if}
		</div>
	</div>

	<button
		type="button"
		data-pick
		aria-label={`Pick ${place.name}`}
		{disabled}
		onclick={onpick}
		class="absolute inset-0 z-10 cursor-pointer rounded-2xl outline-none disabled:cursor-default"
	></button>
	<button
		type="button"
		onclick={onopen}
		aria-label={`Details for ${place.name}`}
		class="absolute top-1.5 right-1.5 z-20 inline-flex size-11 items-center justify-center gap-1.5 rounded-full bg-background/90 text-xs font-semibold text-foreground shadow-flat transition-colors outline-none hover:bg-background focus-visible:ring-3 focus-visible:ring-ring/60 md:top-3 md:right-3 xl:h-9 xl:w-auto xl:px-3.5"
	>
		<Info class="size-4" aria-hidden="true" /><span class="hidden xl:inline">Details</span>
	</button>
	{#if result !== null}
		<span
			class={cn(
				'absolute top-1/2 left-1/2 z-20 -translate-1/2 rounded-full px-5 py-2 font-serif text-3xl font-semibold nums shadow-big motion-safe:animate-in motion-safe:zoom-in-75 motion-safe:fade-in',
				result.won ? 'bg-must text-primary-foreground' : 'bg-card text-muted-foreground',
			)}
			data-delta>{result.won ? '+' : '−'}{Math.round(result.delta)}</span
		>
	{:else if !disabled}
		<span
			aria-hidden="true"
			class="pointer-events-none absolute top-1/2 left-1/2 z-20 hidden -translate-1/2 rounded-full bg-background/90 px-5 py-2.5 text-xs font-bold tracking-widest whitespace-nowrap text-foreground uppercase opacity-0 shadow-big transition duration-200 group-hover:opacity-100 group-has-[[data-pick]:focus-visible]:opacity-100 xl:block"
			>{side === 'left' ? '← ' : ''}Pick{side === 'right' ? ' →' : ''}</span
		>
	{/if}
</div>
