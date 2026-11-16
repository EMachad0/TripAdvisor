<!--
	The live ranking beside the duel (old liveRanking + flipList): a country's six best-rated picks; rows slide to
	their new place after a pick (FLIP) and a new row fades in.
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

<aside class="rounded-2xl border border-border bg-card p-4 shadow-soft" data-live-ranking>
	<h2 class="mb-3 font-serif text-lg font-semibold">{flag} Live ranking</h2>
	<ol class="mb-2 flex flex-col gap-1">
		{#each places as p, i (p.id)}
			<li
				data-cat={p.category}
				data-live-id={p.id}
				class="flex items-center gap-2 rounded-xl px-2.5 py-2 text-sm first:bg-cat/10"
				animate:flip={{ duration: reduced ? 0 : 450 }}
				in:fly={{ x: -8, duration: reduced ? 0 : 300 }}
			>
				<span class="w-6 shrink-0 font-serif text-base font-semibold text-cat">{i + 1}</span>
				<span class="min-w-0 flex-1 truncate font-medium">{p.short ?? p.name}</span>
				<span class="font-mono text-xs text-muted-foreground">{Math.round(p.rating ?? 1500)}</span>
			</li>
		{/each}
	</ol>
	<a href={resolve('/(app)/decide/board')} class="text-sm font-medium text-cat hover:underline"
		>Full board →</a
	>
</aside>
