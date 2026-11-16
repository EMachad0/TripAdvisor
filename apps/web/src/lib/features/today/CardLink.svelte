<!--
	The "All 12 cards in Kyoto →" link at the foot of a Today block (the old .t-cardlink): a quiet full-width row
	that sits inside the block's panel, under a hairline.
-->
<script lang="ts">
	import ArrowRightIcon from '@lucide/svelte/icons/arrow-right';
	import type { Snippet } from 'svelte';

	interface Props {
		/** An app path built from resolve(). */
		href: string;
		children: Snippet;
	}

	let { href, children }: Props = $props();
</script>

<!-- eslint-disable svelte/no-navigation-without-resolve -- every caller builds href from resolve() -->
<a
	{href}
	class="group flex min-h-11 items-center justify-between gap-2.5 rounded-xl px-3 text-sm text-ink-2 transition-colors duration-200 ease-soft hover:bg-muted/60 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
>
	<span class="min-w-0">{@render children()}</span>
	<ArrowRightIcon
		class="size-4 shrink-0 text-cat transition-transform duration-200 ease-soft motion-safe:group-hover:translate-x-0.5"
		aria-hidden="true"
	/>
</a>
<!-- eslint-enable svelte/no-navigation-without-resolve -->
