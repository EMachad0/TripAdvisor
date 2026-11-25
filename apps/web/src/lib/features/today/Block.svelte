<!--
	One block of the Today page (the old .t-block): a small accent icon, the serif h2 with an optional small count,
	then its content.
-->
<script lang="ts">
	import type { Component, Snippet } from 'svelte';

	interface Props {
		title: string;
		/** "2 open of 3", "4 answers". */
		small?: string | undefined;
		testid: string;
		/** A lucide icon shown in a small accent tile before the title. */
		icon?: Component<{ class?: string }>;
		children: Snippet;
	}

	let { title, small, testid, icon: Icon, children }: Props = $props();
</script>

<section class="flex min-w-0 flex-col gap-3" data-testid={testid}>
	<div class="flex min-h-8 items-center gap-2.5">
		{#if Icon}
			<span
				class="grid size-8 shrink-0 place-items-center rounded-xl bg-cat/12 text-cat"
				aria-hidden="true"
			>
				<Icon class="size-4" />
			</span>
		{/if}
		<h2 class="min-w-0 font-serif text-lg leading-tight font-semibold tracking-tight md:text-xl">
			{title}
			{#if small}<small class="ml-1 font-sans text-xs font-medium tracking-normal text-ink-3 nums"
					>{small}</small
				>{/if}
		</h2>
	</div>
	{@render children()}
</section>
