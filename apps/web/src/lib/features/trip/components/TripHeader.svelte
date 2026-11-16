<!--
	The Trip pages' header (the old g-head / t-head): an eyebrow, the h1, a lede and an action on the right (Add
	stop). The Itinerary / Calendar / Map sub-tabs are in routes/(app)/trip/+layout.svelte.
-->
<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		eyebrow: string;
		title: string;
		lede?: string | undefined;
		action?: Snippet;
	}

	let { eyebrow, title, lede, action }: Props = $props();
</script>

<header class="mb-5 flex flex-wrap items-end justify-between gap-3">
	<div class="min-w-0">
		<p class="text-xs font-bold tracking-widest text-ink-3 uppercase" data-testid="eyebrow">
			{eyebrow}
		</p>
		<h1 class="mt-1 font-serif text-3xl font-semibold tracking-tight">{title}</h1>
		{#if lede}<p class="mt-1.5 max-w-prose text-sm text-ink-2">{lede}</p>{/if}
	</div>
	{#if action}<div class="flex gap-2">{@render action()}</div>{/if}
</header>
