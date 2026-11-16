<!--
	A one-line snippet of a card's note (old noteSnip): board rows and duel sides. The full text is the tooltip.
-->
<script lang="ts">
	import PenLine from '@lucide/svelte/icons/pen-line';
	import TzText from '#lib/components/shell/TzText.svelte';
	import type { TzOffset } from '#lib/components/shell/tz.js';

	interface Props {
		text: string;
		/** The card's UTC offset, so clock times in the note get their label. */
		offset?: TzOffset;
	}

	let { text, offset = null }: Props = $props();
	const one = $derived(text.replace(/\s+/g, ' ').trim());
</script>

<span class="flex min-w-0 items-center gap-1 text-sm text-note" title={one} data-note-snip>
	<PenLine class="size-3.5 shrink-0" aria-hidden="true" />
	<span class="truncate"><TzText text={one} {offset} /></span>
</span>
