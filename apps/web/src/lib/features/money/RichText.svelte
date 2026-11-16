<!--
	A note as the old pages showed it: line breaks kept, web links clickable (old linkify), and the UTC offset after
	every clock time when the text's zone is known (`offset`; null leaves times as they are, like the old page).
-->
<script lang="ts">
	import TzText from '#lib/components/shell/TzText.svelte';
	import type { TzOffset } from '#lib/components/shell/tz.js';
	import { cn } from '#lib/utils.js';
	import { linkParts } from './links.ts';

	interface Props {
		text: string;
		offset?: TzOffset;
		class?: string;
	}

	let { text, offset = null, class: className }: Props = $props();
	const parts = $derived(linkParts(text));
</script>

<!-- eslint-disable svelte/no-navigation-without-resolve -- external links from the traveler's notes, not app routes -->
<div class={cn('break-words whitespace-pre-line', className)}>
	{#each parts as part, i (i)}{#if part.kind === 'text'}<TzText
				text={part.text}
				{offset}
			/>{:else}<a
				class="text-cat underline underline-offset-2"
				href={part.href}
				target="_blank"
				rel="noopener noreferrer">{part.label}</a
			>{/if}{/each}
</div>
<!-- eslint-enable svelte/no-navigation-without-resolve -->
