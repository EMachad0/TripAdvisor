<!--
	The head of every page (docs/DESIGN.md): a small-caps eyebrow, the serif title (the page's one h1), an optional
	lede, and actions on the right (below the text on a phone). `accent` sets part of the title in the italic accent.
-->
<script lang="ts">
	import type { Snippet } from 'svelte';
	import { cn } from '#lib/utils.js';

	interface Props {
		eyebrow?: string;
		title: string;
		/** A second part of the title, set in the italic accent colour. */
		accent?: string;
		lede?: string;
		/** Rich lede, instead of `lede`. */
		children?: Snippet;
		actions?: Snippet;
		class?: string;
	}

	let { eyebrow, title, accent, lede, children, actions, class: className }: Props = $props();
</script>

<header
	class={cn(
		'mb-5 flex flex-col gap-3 md:mb-7 md:flex-row md:items-end md:justify-between md:gap-6',
		className,
	)}
>
	<div class="min-w-0">
		{#if eyebrow}<p class="mb-1 eyebrow">{eyebrow}</p>{/if}
		<h1
			class="font-serif text-3xl leading-none font-semibold tracking-tight md:text-4xl 3xl:text-5xl"
		>
			{title}{#if accent}&#32;<em class="font-normal text-cat">{accent}</em>{/if}
		</h1>
		{#if children}
			<div class="mt-2 max-w-prose text-sm text-muted-foreground md:text-base">
				{@render children()}
			</div>
		{:else if lede}
			<p class="mt-2 max-w-prose text-sm text-muted-foreground md:text-base">{lede}</p>
		{/if}
	</div>
	{#if actions}
		<div class="flex shrink-0 flex-wrap items-center gap-2">{@render actions()}</div>
	{/if}
</header>
