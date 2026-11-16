<!--
	The mini duel inside a pick-one holiday (old holidayDuel): two options side by side as photos, tap the one you'd rather do.
	The winner shows "+N", the loser fades with "−N"; the next pair comes 550 ms later. "Done duelling" closes it.
-->
<script lang="ts">
	import { Button } from '#lib/components/ui/button/index.js';
	import CardImage from '#lib/features/cards/CardImage.svelte';
	import { cn } from '#lib/utils.js';
	import { brl, type DecidePlace } from '../model.ts';

	interface Props {
		emoji: string;
		short: string;
		sides: readonly [DecidePlace, DecidePlace];
		result: { side: 'left' | 'right'; delta: number } | null;
		flag: (country: string) => string;
		disabled: boolean;
		onpick: (side: 'left' | 'right') => void;
		ondone: () => void;
	}

	let { emoji, short, sides, result, flag, disabled, onpick, ondone }: Props = $props();
</script>

<div class="flex flex-col items-center gap-4 panel p-4 md:p-6" data-holiday-duel>
	<p class="font-serif text-lg font-semibold md:text-xl">{emoji} Which one for {short}?</p>
	<div class="relative grid w-full max-w-4xl grid-cols-2 gap-2 md:gap-4">
		{#each sides as p, i (p.id)}
			{@const side = i === 0 ? 'left' : 'right'}
			{@const won = result !== null && result.side === side}
			{@const lost = result !== null && result.side !== side}
			{@const delta = result === null ? 0 : result.delta}
			<button
				type="button"
				data-cat={p.category}
				data-hpick={side}
				data-result={won ? 'win' : lost ? 'lose' : undefined}
				aria-label={`Pick ${p.name} for ${short}`}
				disabled={disabled || result !== null}
				onclick={() => {
					onpick(side);
				}}
				class={cn(
					'group relative aspect-3/4 min-w-0 overflow-hidden rounded-xl bg-cat/20 text-left shadow-flat ring-1 ring-border/60 transition duration-300 ease-spring outline-none focus-visible:ring-3 focus-visible:ring-ring/60 enabled:hover:shadow-soft disabled:cursor-default md:aspect-4/3',
					won && 'z-10 scale-102 shadow-big ring-4 ring-must/60',
					lost && 'scale-96 opacity-45 grayscale-60',
				)}
			>
				<CardImage image={p.card.cover} sizes="(min-width: 704px) 40vw, 50vw">
					{#snippet fallback()}
						<span
							class="absolute inset-0 flex items-start justify-center p-3 pt-8 text-center font-cjk text-xl font-bold text-cat/70 md:text-3xl"
							lang={p.card.lang}>{p.name_local ?? p.name}</span
						>
					{/snippet}
				</CardImage>
				<span
					class="absolute inset-0 bg-linear-to-t from-scrim/90 via-scrim/40 via-40% to-scrim/0 to-75%"
					aria-hidden="true"
				></span>
				<span class="absolute inset-x-0 bottom-0 flex flex-col gap-0.5 p-3 text-on-scrim md:p-4">
					<b class="line-clamp-2 font-serif text-base leading-tight font-semibold md:text-xl"
						>{p.name}</b
					>
					<small class="truncate text-xs opacity-85"
						>{flag(p.country)} {p.cityName} · {brl(p.brl)}{p.drone ? ' · 🛸' : ''}</small
					>
				</span>
				{#if won || lost}
					<span
						class={cn(
							'absolute top-1/2 left-1/2 -translate-1/2 rounded-full px-4 py-1.5 font-serif text-xl font-semibold nums shadow-big',
							won ? 'bg-must text-primary-foreground' : 'bg-card text-muted-foreground',
						)}
						data-delta>{won ? '+' : '−'}{Math.round(delta)}</span
					>
				{/if}
			</button>
		{/each}
		<span
			class="pointer-events-none absolute top-1/2 left-1/2 z-20 grid size-10 -translate-1/2 place-items-center rounded-full border-4 border-card bg-card font-serif text-sm font-bold text-muted-foreground italic shadow-soft md:size-12"
			aria-hidden="true">vs</span
		>
	</div>
	<Button variant="ghost" onclick={ondone}>Done duelling</Button>
</div>
