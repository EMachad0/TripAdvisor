<!--
	A note as the trip pages show it: its lines and lists, web links clickable, codes in backticks as chips that
	copy on a tap, **strong** phrases, and dates, amounts and clock times set apart from the words around them
	(links.ts richBlocks). With a known zone (`offset`) every clock time gets its UTC offset instead; null leaves
	times as they are.
-->
<script lang="ts">
	import { toast } from 'svelte-sonner';
	import TzText from '#lib/components/shell/TzText.svelte';
	import { tzLabel, type TzOffset } from '#lib/components/shell/tz.js';
	import { cn } from '#lib/utils.js';
	import { richBlocks, type RichPart } from './links.ts';

	interface Props {
		text: string;
		offset?: TzOffset;
		class?: string;
	}

	let { text, offset = null, class: className }: Props = $props();
	const labelled = $derived(tzLabel(offset) !== '');
	const blocks = $derived(richBlocks(text, !labelled));

	async function copy(code: string): Promise<void> {
		try {
			await navigator.clipboard.writeText(code);
			toast.success(`Copied ${code}`);
		} catch {
			toast.error('Could not copy. Press and hold to select it.');
		}
	}
</script>

<!-- eslint-disable svelte/no-navigation-without-resolve -- external links from the traveler's notes, not app routes -->
{#snippet inline(parts: RichPart[])}
	{#each parts as part, i (i)}{#if part.kind === 'text'}<TzText
				text={part.text}
				{offset}
			/>{:else if part.kind === 'link'}<a
				class="text-cat underline underline-offset-2"
				href={part.href}
				target="_blank"
				rel="noopener noreferrer">{part.label}</a
			>{:else if part.kind === 'code'}<button
				type="button"
				class="rounded-md border border-border/80 bg-muted/70 px-1.5 py-px font-mono text-xs font-medium whitespace-nowrap text-foreground transition-colors select-all hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
				title="Copy"
				aria-label={`Copy ${part.text}`}
				data-testid="code"
				onclick={() => void copy(part.text)}>{part.text}</button
			>{:else if part.kind === 'strong'}<strong class="font-semibold text-foreground"
				><TzText text={part.text} {offset} /></strong
			>{:else}<span class="font-medium whitespace-nowrap text-foreground nums" data-fact
				>{part.text}</span
			>{/if}{/each}
{/snippet}

<div class={cn('flex flex-col gap-1 break-words', className)}>
	{#each blocks as block, i (i)}
		{#if block.kind === 'gap'}
			<div class="h-1.5" aria-hidden="true"></div>
		{:else if block.kind === 'list'}
			<ul class="flex flex-col gap-1">
				{#each block.items as item, j (j)}
					<li class="flex gap-2">
						<span class="mt-2.5 size-1 shrink-0 rounded-full bg-ink-3/70" aria-hidden="true"></span>
						<span class="min-w-0">{@render inline(item)}</span>
					</li>
				{/each}
			</ul>
		{:else}
			<p>{@render inline(block.parts)}</p>
		{/if}
	{/each}
</div>
<!-- eslint-enable svelte/no-navigation-without-resolve -->
