<!--
	The mini duel inside a pick-one holiday (old holidayDuel): two options side by side, tap the one you'd rather do.
	The winner shows "+N", the loser fades with "−N"; the next pair comes 550 ms later. "Done duelling" closes it.
-->
<script lang="ts">
	import { Button } from '#lib/components/ui/button/index.js';
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

<div
	class="mb-5 flex flex-col items-center gap-3 rounded-2xl border border-border bg-muted p-4"
	data-holiday-duel
>
	<p class="font-serif text-lg font-semibold">{emoji} Which one for {short}?</p>
	<div class="flex w-full max-w-3xl items-stretch gap-2 sm:gap-4">
		{#each sides as p, i (p.id)}
			{@const side = i === 0 ? 'left' : 'right'}
			{@const won = result !== null && result.side === side}
			{@const lost = result !== null && result.side !== side}
			{@const delta = result === null ? 0 : result.delta}
			{#if i === 1}
				<span
					class="grid size-10 shrink-0 place-items-center self-center rounded-full border border-border bg-background font-serif text-sm font-bold text-muted-foreground"
					aria-hidden="true">VS</span
				>
			{/if}
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
					'relative flex min-w-0 flex-1 flex-col gap-1 overflow-hidden rounded-xl border border-border bg-card p-2 text-left shadow-soft transition duration-300 ease-spring enabled:hover:-translate-y-0.5 enabled:hover:border-cat disabled:cursor-default',
					won && 'scale-103 border-must ring-3 ring-must/40',
					lost && 'scale-95 opacity-45 grayscale-60',
				)}
			>
				<span
					class="relative grid aspect-4/3 place-items-center overflow-hidden rounded-lg bg-cat/20"
				>
					{#if p.thumb !== null}
						<img src={p.thumb} alt="" class="absolute inset-0 size-full object-cover" />
					{:else}
						<span class="p-2 text-center font-cjk text-lg font-bold text-cat"
							>{p.name_local ?? p.name}</span
						>
					{/if}
				</span>
				<b class="text-sm leading-tight">{p.name}</b>
				<small class="text-xs text-muted-foreground"
					>{flag(p.country)} {p.cityName} · {brl(p.brl)}{p.drone ? ' · 🛸' : ''}</small
				>
				{#if won || lost}
					<span
						class={cn(
							'absolute top-2 right-2 rounded-full px-2 py-0.5 font-serif text-sm font-semibold',
							won ? 'bg-must text-primary-foreground' : 'bg-muted text-muted-foreground',
						)}
						data-delta>{won ? '+' : '−'}{Math.round(delta)}</span
					>
				{/if}
			</button>
		{/each}
	</div>
	<Button variant="link" size="sm" onclick={ondone}>Done duelling</Button>
</div>
