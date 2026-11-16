<!--
	The small uppercase status label of the trip pages (old t-chip and t-cat): Paid / To pay / Estimate, In progress,
	Suggested, and the Bed / Food / Other category of an expense.
-->
<script lang="ts">
	import type { Snippet } from 'svelte';
	import { cn } from '#lib/utils.js';

	interface Props {
		tone: 'booked' | 'planned' | 'tbd' | 'bed' | 'food' | 'other';
		children: Snippet;
	}

	let { tone, children }: Props = $props();
</script>

<span
	class={cn(
		'inline-flex shrink-0 items-center rounded-md px-1.5 py-1 text-xs leading-none font-bold tracking-wider whitespace-nowrap uppercase',
		tone === 'booked' && 'bg-ok/15 text-ok',
		tone === 'planned' && 'bg-amber/15 text-amber',
		tone === 'tbd' && 'bg-surface-2 text-ink-3',
		tone === 'bed' && 'bg-k3 text-background',
		tone === 'food' && 'bg-k4 text-background',
		tone === 'other' && 'bg-k5 text-background',
	)}
>
	{@render children()}
</span>
