<!--
	Free text the traveler typed (notes, plans, tips): http(s) links become short links (the old linkify) and every
	clock time gets its UTC offset (TzText). `offset` null leaves the times as they are ("do not guess").
-->
<script lang="ts">
	import TzText from './TzLine.svelte';
	import type { TzOffset } from '#lib/components/shell/tz.js';
	import { linkParts } from '../format.ts';

	interface Props {
		text: string;
		offset: TzOffset;
	}

	let { text, offset }: Props = $props();
	const parts = $derived(linkParts(text));
</script>

<!-- eslint-disable svelte/no-navigation-without-resolve -- links typed by the traveler, never app routes -->
{#each parts as part, i (i)}{#if part.kind === 'link'}<a
			class="text-cat underline underline-offset-2"
			href={part.href}
			target="_blank"
			rel="noopener noreferrer">{part.text}</a
		>{:else}<TzText text={part.text} {offset} />{/if}{/each}
<!-- eslint-enable svelte/no-navigation-without-resolve -->
