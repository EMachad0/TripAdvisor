<!--
	The head of a trip page (old trip.js head()): an eyebrow line, the title, a lede and the page's buttons.
	`section` is read before the title by screen readers only ("Prep: To do"), so a sub-page names its section.
-->
<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		eyebrow: string;
		title: string;
		section?: string;
		lede?: string;
		actions?: Snippet;
	}

	let { eyebrow, title, section, lede, actions }: Props = $props();
</script>

<svelte:head>
	<title>{title} · Asia Trip Ranker</title>
</svelte:head>

<header class="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
	<div class="flex min-w-0 flex-col gap-1">
		<p
			class="text-xs font-bold tracking-widest text-muted-foreground uppercase"
			data-testid="eyebrow"
		>
			{eyebrow}
		</p>
		<h1 class="font-serif text-3xl font-semibold">
			<!-- The space sits inside the expression: Svelte trims it at the end of the span. -->
			{#if section}<span class="sr-only">{`${section}: `}</span>{/if}{title}
		</h1>
		{#if lede}
			<p class="max-w-prose text-sm text-muted-foreground">{lede}</p>
		{/if}
	</div>
	{#if actions}
		<div class="flex flex-wrap items-center gap-2">{@render actions()}</div>
	{/if}
</header>
