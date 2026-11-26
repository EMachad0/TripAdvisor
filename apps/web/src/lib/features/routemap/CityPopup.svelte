<!--
	The card of the selected city on the map (old #rpop, refreshPop): where it sits in the plan, its dates, how many
	of its places are Must or Maybe, its city map (pins, stays, airports), the area page, and in edit mode Add to / Remove from the route. Escape closes it
	(RouteView); so do the close button and a tap on the empty map.
-->
<script lang="ts">
	import MapIcon from '@lucide/svelte/icons/map';
	import XIcon from '@lucide/svelte/icons/x';
	import { Button } from '#lib/components/ui/button/index.js';
	import { cn } from '#lib/utils.js';
	import { VERDICT_LABEL, plural, type CityCard } from './model.ts';

	interface Props {
		card: CityCard;
		edit: boolean;
		/** Sit at the top of the map (the pin is in the lower half). */
		top: boolean;
		/** The city map of this city (a primary button), or null when it has none. */
		maphref?: string | null;
		onclose: () => void;
		onadd: (key: string) => void;
		onremove: (key: string) => void;
		onopenarea: (area: string) => void;
	}

	let { card, edit, top, maphref = null, onclose, onadd, onremove, onopenarea }: Props = $props();
	const v = $derived(card.verdict);
</script>

<div
	class={cn(
		'pop absolute inset-x-2 z-20 panel px-4 pt-3.5 pb-4 md:inset-x-3 md:right-auto md:w-96',
		top ? 'top-2 md:top-3' : 'bottom-2 md:bottom-3',
	)}
	role="dialog"
	aria-label={card.name}
	data-city-card={card.key}
	data-top={top ? '' : undefined}
>
	<Button
		variant="ghost"
		size="icon-lg"
		class="absolute top-2 right-2 pointer-coarse:size-11"
		aria-label="Close"
		onclick={onclose}><XIcon /></Button
	>
	<p class="mr-12 mb-1 eyebrow" data-card-status>
		{card.country.flag}
		{card.status}
	</p>
	<h3
		class="mr-12 mb-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 font-serif text-2xl leading-tight font-semibold tracking-tight"
	>
		{card.name}
		{#if v}
			<span
				class={cn(
					'rounded-full px-2 py-1 font-sans text-2xs leading-none font-semibold tracking-wider uppercase',
					v === 'must' && 'bg-must/12 text-must',
					v === 'maybe' && 'bg-maybe/12 text-maybe',
					v === 'skip' && 'bg-muted text-muted-foreground',
				)}>{VERDICT_LABEL[v]}</span
			>
		{/if}
	</h3>
	<p class="text-sm text-foreground nums" data-card-when>{card.when}</p>
	<p class="mt-0.5 text-sm text-muted-foreground nums" data-card-places>
		{#if card.places.total}
			<b class="font-semibold text-must">{card.places.must}</b> must ·
			<b class="font-semibold text-maybe">{card.places.maybe}</b>
			maybe
			<span>of {plural(card.places.total, 'place')} here</span>
		{:else}
			No places researched here yet
		{/if}
	</p>
	<div class="mt-3.5 flex flex-wrap items-center gap-2">
		{#if maphref !== null}
			<Button href={maphref} size="lg" class="pointer-coarse:h-11" data-pop-citymap
				><MapIcon />City map</Button
			>
		{/if}
		{#if card.hasPage}
			<Button
				variant="outline"
				size="lg"
				class="pointer-coarse:h-11"
				onclick={() => {
					onopenarea(card.area);
				}}>Area page →</Button
			>
		{:else}
			<span class="text-sm text-muted-foreground">No area page yet</span>
		{/if}
		{#if edit}
			{#if card.stop}
				<Button
					variant="destructive"
					size="lg"
					class="pointer-coarse:h-11"
					data-pop-remove
					onclick={() => {
						onremove(card.key);
					}}>Remove from route</Button
				>
			{:else}
				<Button
					size="lg"
					class="pointer-coarse:h-11"
					data-pop-add
					onclick={() => {
						onadd(card.key);
					}}>Add to {card.country.name} route</Button
				>
			{/if}
		{/if}
	</div>
</div>

<style>
	.pop {
		box-shadow: var(--elev-2);
	}
	@media (prefers-reduced-motion: no-preference) {
		.pop {
			animation: pop-in 0.2s var(--ease-soft);
		}
	}
	@keyframes pop-in {
		from {
			opacity: 0;
			transform: translateY(6px) scale(0.98);
		}
	}
</style>
