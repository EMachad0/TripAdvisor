<!--
	The card of the selected city on the map (old #rpop, refreshPop): where it sits in the plan, its dates, how many
	of its places are Must or Maybe, the area page, and in edit mode Add to / Remove from the route. Escape closes it
	(RouteView); so do the close button and a tap on the empty map.
-->
<script lang="ts">
	import XIcon from '@lucide/svelte/icons/x';
	import { Button } from '#lib/components/ui/button/index.js';
	import { cn } from '#lib/utils.js';
	import { VERDICT_LABEL, plural, type CityCard } from './model.ts';

	interface Props {
		card: CityCard;
		edit: boolean;
		/** Sit at the top of the map (the pin is in the lower half). */
		top: boolean;
		onclose: () => void;
		onadd: (key: string) => void;
		onremove: (key: string) => void;
		onopenarea: (area: string) => void;
	}

	let { card, edit, top, onclose, onadd, onremove, onopenarea }: Props = $props();
	const v = $derived(card.verdict);
</script>

<div
	class={cn(
		'absolute inset-x-2 z-20 rounded-2xl border border-border bg-card px-4 py-3.5 shadow-big md:right-auto md:w-90',
		top ? 'top-2' : 'bottom-2',
	)}
	role="dialog"
	aria-label={card.name}
	data-city-card={card.key}
	data-top={top ? '' : undefined}
>
	<Button
		variant="ghost"
		size="icon-lg"
		class="absolute top-1.5 right-1.5"
		aria-label="Close"
		onclick={onclose}><XIcon /></Button
	>
	<p class="mr-10 mb-1 text-xs font-bold tracking-widest text-ink-3 uppercase" data-card-status>
		{card.country.flag}
		{card.status}
	</p>
	<h3
		class="mr-10 mb-1.5 flex flex-wrap items-center gap-2 font-serif text-2xl leading-tight font-semibold"
	>
		{card.name}
		{#if v}
			<span
				class={cn(
					'rounded-full px-2 py-1 font-sans text-xs leading-none font-bold tracking-wider uppercase',
					v === 'must' && 'bg-must/15 text-must',
					v === 'maybe' && 'bg-maybe/15 text-maybe',
					v === 'skip' && 'bg-surface-2 text-ink-3',
				)}>{VERDICT_LABEL[v]}</span
			>
		{/if}
	</h3>
	<p class="mb-1 text-sm text-ink-2" data-card-when>{card.when}</p>
	<p class="mb-3 text-sm text-ink-2" data-card-places>
		{#if card.places.total}
			<b class="text-ink">{card.places.must}</b> must · <b class="text-ink">{card.places.maybe}</b>
			maybe
			<span class="text-ink-3">of {plural(card.places.total, 'place')} here</span>
		{:else}
			<span class="text-ink-3">No places researched here yet</span>
		{/if}
	</p>
	<div class="flex flex-wrap items-center gap-2">
		{#if card.hasPage}
			<Button
				variant="outline"
				size="lg"
				onclick={() => {
					onopenarea(card.area);
				}}>Area page →</Button
			>
		{:else}
			<span class="text-sm text-ink-3">No area page yet</span>
		{/if}
		{#if edit}
			{#if card.stop}
				<Button
					variant="destructive"
					size="lg"
					data-pop-remove
					onclick={() => {
						onremove(card.key);
					}}>Remove from route</Button
				>
			{:else}
				<Button
					size="lg"
					data-pop-add
					onclick={() => {
						onadd(card.key);
					}}>Add to {card.country.name} route</Button
				>
			{/if}
		{/if}
	</div>
</div>
