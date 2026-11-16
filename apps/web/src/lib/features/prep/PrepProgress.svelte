<!--
	The progress panel at the top of the To do and Bag pages: the share done in big serif figures, the count line
	("2 open · 1 done", "1 of 2 packed") and the bar. `children` adds a row under it (the Bag's category counts).
-->
<script lang="ts">
	import type { Snippet } from 'svelte';
	import { Progress } from '#lib/components/ui/progress/index.js';

	interface Props {
		/** The count line. */
		label: string;
		value: number;
		max: number;
		/** The bar's accessible name. */
		barLabel: string;
		/** What the share counts ("done", "packed"). */
		word: string;
		children?: Snippet;
	}

	let { label, value, max, barLabel, word, children }: Props = $props();
	const pct = $derived(max > 0 ? Math.round((value / max) * 100) : 0);
</script>

<section class="relative overflow-hidden panel p-5 md:p-6" aria-label="Progress">
	<div
		class="pointer-events-none absolute -top-24 -right-16 size-52 rounded-full bg-cat/8 blur-3xl"
		aria-hidden="true"
	></div>
	<div class="relative flex items-end justify-between gap-4">
		<div class="min-w-0">
			<p class="eyebrow" data-testid="eyebrow">{label}</p>
			<p class="mt-1.5 font-serif text-4xl leading-none font-semibold tracking-tight nums">
				{pct}<span class="text-2xl text-muted-foreground">%</span>
				<span class="ml-1 font-sans text-sm font-normal tracking-normal text-muted-foreground"
					>{word}</span
				>
			</p>
		</div>
		<p class="pb-0.5 text-sm text-muted-foreground nums">
			<b class="font-semibold text-foreground">{value}</b> / {max}
		</p>
	</div>
	<Progress class="relative mt-4 h-2" {value} {max} aria-label={barLabel} />
	{#if children}
		<div class="relative mt-4">{@render children()}</div>
	{/if}
</section>
