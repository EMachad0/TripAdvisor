<!--
	The flag chips on a card (platform flagChips as data): when it happens, "you asked for this", iconic or hidden gem.
-->
<script lang="ts">
	import Calendar from '@lucide/svelte/icons/calendar';
	import Gem from '@lucide/svelte/icons/gem';
	import Landmark from '@lucide/svelte/icons/landmark';
	import Star from '@lucide/svelte/icons/star';
	import type { CardFlag } from '#lib/content/types.js';
	import { cn } from '#lib/utils.js';

	interface Props {
		flags: readonly CardFlag[];
	}

	let { flags }: Props = $props();
</script>

{#each flags as f (f.kind)}
	<span
		title={f.title}
		class={cn(
			'inline-flex items-center gap-1 rounded-full bg-background/90 px-2 py-1 text-xs font-semibold text-foreground shadow-sm',
			f.kind === 'when' && f.whenKind === 'only' && 'text-warn',
			f.kind === 'must' && 'text-cat',
		)}
	>
		{#if f.kind === 'when'}
			<Calendar class="size-3.5" aria-hidden="true" />
		{:else if f.kind === 'must'}
			<Star class="size-3.5" aria-hidden="true" />
		{:else if f.fame === 'hidden'}
			<Gem class="size-3.5" aria-hidden="true" />
		{:else}
			<Landmark class="size-3.5" aria-hidden="true" />
		{/if}
		{f.label}
		{#if f.unconfirmed === true}
			<span aria-label="not confirmed">?</span>
		{/if}
	</span>
{/each}
