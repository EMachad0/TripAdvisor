<!-- A small uppercase chip (the old .t-chip): status of a leg, "You are here", a countdown, work / vacation. -->
<script lang="ts">
	import type { Snippet } from 'svelte';
	import { cn } from '#lib/utils.js';

	interface Props {
		/** ok: booked, here, vacation; amber: to book; accent: a countdown; strong: work; quiet: the rest. */
		tone?: 'ok' | 'amber' | 'accent' | 'strong' | 'quiet';
		testid?: string;
		children: Snippet;
	}

	let { tone = 'quiet', testid, children }: Props = $props();
</script>

<span
	data-testid={testid}
	class={cn(
		'inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-xs leading-none font-bold tracking-wide whitespace-nowrap uppercase',
		tone === 'ok' && 'bg-ok/15 text-ok',
		tone === 'amber' && 'bg-amber/15 text-amber',
		tone === 'accent' && 'bg-cat/15 text-cat',
		tone === 'strong' && 'bg-surface-2 text-ink',
		tone === 'quiet' && 'bg-surface-2 text-ink-3',
	)}
>
	{@render children()}
</span>
