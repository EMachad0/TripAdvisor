<!-- The "All 12 cards in Kyoto →" link under a Today block (the old .t-cardlink). -->
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
	class="flex items-center justify-between gap-2.5 rounded-xl bg-surface-2 px-3.5 py-3 text-sm hover:ring-1 hover:ring-cat focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
>
	<span>{@render children()}</span>
	<ArrowRightIcon class="size-4.5 shrink-0 text-ink-3" aria-hidden="true" />
</a>
<!-- eslint-enable svelte/no-navigation-without-resolve -->
