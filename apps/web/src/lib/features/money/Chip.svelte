<!--
	The small status pill of the trip pages (old t-chip and t-cat): Paid / To pay / Estimate, In progress,
	Suggested, and the Bed / Food / Other category of an expense. A tint of its own colour, never a solid block.
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
		'inline-flex h-5 shrink-0 items-center rounded-full px-2 text-2xs font-semibold tracking-wide whitespace-nowrap uppercase',
		tone === 'booked' && 'bg-ok/12 text-ok',
		tone === 'planned' && 'bg-amber/14 text-amber',
		tone === 'tbd' && 'bg-muted text-muted-foreground',
		tone === 'bed' && 'bg-k3/12 text-k3',
		tone === 'food' && 'bg-k4/14 text-k4',
		tone === 'other' && 'bg-k5/12 text-k5',
	)}
>
	{@render children()}
</span>
