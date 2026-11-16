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
		'inline-flex h-6 items-center gap-1 rounded-full px-2.5 text-2xs leading-none font-semibold tracking-wider whitespace-nowrap uppercase',
		tone === 'ok' && 'bg-ok/12 text-ok',
		tone === 'amber' && 'bg-amber/12 text-amber',
		tone === 'accent' && 'bg-cat/12 text-cat',
		tone === 'strong' && 'bg-foreground/8 text-foreground',
		tone === 'quiet' && 'bg-foreground/6 text-muted-foreground',
	)}
>
	{@render children()}
</span>
