<!-- One block of the Today page (the old .t-block): an h2 with an optional small count, then its content. -->
<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		title: string;
		/** "2 open of 3", "4 answers". */
		small?: string;
		testid: string;
		children: Snippet;
	}

	let { title, small, testid, children }: Props = $props();
</script>

<section class="flex min-w-0 flex-col gap-3" data-testid={testid}>
	<h2 class="flex items-baseline gap-2 text-xs font-bold tracking-widest text-ink-3 uppercase">
		{title}
		{#if small}<small class="font-medium tracking-normal normal-case">{small}</small>{/if}
	</h2>
	{@render children()}
</section>
