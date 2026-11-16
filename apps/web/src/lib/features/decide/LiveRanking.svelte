<!--
	The live ranking beside the duel (old liveRanking + flipList): a country's six best-rated picks with their photo
	and rating; rows slide to their new place after a pick (FLIP) and a new row fades in. Two columns on the Fold's
	inner screen, where it sits under the arena; one in the side column from xl.
-->
<script lang="ts">
	import { flip } from 'svelte/animate';
	import { fly } from 'svelte/transition';
	import { resolve } from '$app/paths';
	import type { DecidePlace } from './model.ts';

	interface Props {
		flag: string;
		places: readonly DecidePlace[];
		reduced: boolean;
	}

	let { flag, places, reduced }: Props = $props();
</script>

<aside class="flex flex-col gap-3 panel p-4 md:p-5" data-live-ranking>
	<div class="flex items-baseline justify-between gap-3">
		<h2 class="font-serif text-lg font-semibold">{flag} Live ranking</h2>
		<a
			href={resolve('/(app)/decide/board')}
			class="-my-2 inline-flex h-11 shrink-0 items-center rounded-full px-2 text-sm font-medium text-cat hover:underline xl:h-8"
			>Full board →</a
		>
	</div>
	<ol class="grid gap-1 md:grid-cols-2 md:gap-x-4 xl:grid-cols-1">
		{#each places as p, i (p.id)}
			<li
				data-cat={p.category}
				data-live-id={p.id}
				class="flex items-center gap-3 rounded-xl px-2 py-1.5 text-sm first:bg-cat/10"
				animate:flip={{ duration: reduced ? 0 : 450 }}
				in:fly={{ x: -8, duration: reduced ? 0 : 300 }}
			>
				<span class="w-5 shrink-0 text-center font-serif text-base font-semibold text-cat nums"
					>{i + 1}</span
				>
				<span
					class="grid size-9 shrink-0 place-items-center overflow-hidden rounded-lg bg-cat/15 text-base"
				>
					{#if p.thumb !== null}
						<img src={p.thumb} alt="" loading="lazy" class="size-full object-cover" />
					{:else}
						<span aria-hidden="true">{p.card.categoryIcon}</span>
					{/if}
				</span>
				<span class="flex min-w-0 flex-1 flex-col">
					<span class="truncate font-medium">{p.short ?? p.name}</span>
					<span class="truncate text-xs text-muted-foreground">{p.cityName}</span>
				</span>
				<span class="text-xs text-muted-foreground nums">{Math.round(p.rating ?? 1500)}</span>
			</li>
		{/each}
	</ol>
</aside>
