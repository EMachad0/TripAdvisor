<!-- The small uppercase label above a value (the old .t-lbl): "Check-in", "Leave by", "Address". -->
<script lang="ts">
	import type { Snippet } from 'svelte';
	import { cn } from '#lib/utils.js';

	interface Props {
		tone?: 'quiet' | 'seal';
		children: Snippet;
	}

	let { tone = 'quiet', children }: Props = $props();
</script>

<span
	class={cn(
		'mb-0.5 block text-2xs leading-4 font-semibold tracking-wider uppercase',
		tone === 'seal' ? 'text-seal' : 'text-ink-3',
	)}>{@render children()}</span
>
