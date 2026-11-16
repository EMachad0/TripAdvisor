<!--
	One side of a duel (old duelSide): the place card with the note snippet, a Details button that opens the sheet,
	and the whole card as the pick button. After a pick the winner grows with "+N" and the loser fades with "−N".
-->
<script lang="ts">
	import Info from '@lucide/svelte/icons/info';
	import NoteSnip from '#lib/features/cards/NoteSnip.svelte';
	import PlaceCard from '#lib/features/cards/PlaceCard.svelte';
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
</script>

<div
	class={cn(
		'group relative mx-auto w-full max-w-95 min-w-0 flex-1 rounded-2xl transition duration-300 ease-spring',
		result?.won === true && 'z-10 scale-103',
		result?.won === false && 'scale-95 opacity-45 grayscale-60',
	)}
	data-duel-side={side}
	data-id={place.id}
	data-result={result === null ? undefined : result.won ? 'win' : 'lose'}
>
	<div
		class={cn(
			'rounded-2xl transition-shadow group-has-[[data-pick]:focus-visible]:ring-3 group-has-[[data-pick]:focus-visible]:ring-ring/50',
			result?.won === true && 'shadow-big ring-4 ring-must/40',
		)}
	>
		<PlaceCard {place} noted={place.note !== ''} />
	</div>
	{#if place.note !== ''}
		<div class="px-4 pt-2"><NoteSnip text={place.note} offset={place.tz} /></div>
	{/if}
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
		class="absolute top-2 right-2 z-20 inline-flex size-9 items-center justify-center gap-1.5 rounded-full bg-background/90 text-xs font-semibold text-foreground shadow-sm hover:bg-background sm:size-auto sm:px-3 sm:py-1.5"
	>
		<Info class="size-4" aria-hidden="true" /><span class="hidden sm:inline">Details</span>
	</button>
	{#if result !== null}
		<span
			class={cn(
				'absolute top-1/4 left-1/2 z-20 -translate-x-1/2 rounded-full px-4 py-1.5 font-serif text-2xl font-semibold shadow-big',
				result.won ? 'bg-must text-primary-foreground' : 'bg-muted text-muted-foreground',
			)}
			data-delta>{result.won ? '+' : '−'}{Math.round(result.delta)}</span
		>
	{:else if !disabled}
		<span
			aria-hidden="true"
			class="pointer-events-none absolute -bottom-4 left-1/2 z-20 -translate-x-1/2 rounded-full bg-foreground px-4 py-2 text-xs font-bold tracking-widest whitespace-nowrap text-background uppercase opacity-0 shadow-soft transition group-hover:opacity-100 group-has-[[data-pick]:focus-visible]:opacity-100"
			>{side === 'left' ? '← ' : ''}Pick{side === 'right' ? ' →' : ''}</span
		>
	{/if}
</div>
