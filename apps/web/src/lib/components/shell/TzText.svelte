<!--
	Free text with the UTC offset written after every clock time in it (FROZEN props): notes, leg plans, tips,
	place card text, day notes, check-in hours, answer text. `offset` is the zone the text's times are in (a
	country's TZ_OFFSET, a leg's legOffsets); null leaves the text as it is ("do not guess").
-->
<script lang="ts">
	import { tzSegments, type TzOffset } from './tz';

	interface Props {
		text: string;
		offset: TzOffset;
	}

	let { text, offset }: Props = $props();
	const segments = $derived(tzSegments(text, offset));
</script>

<!-- A space before the label, as the old watchTimes wrote it ("14:00 UTC+8"). It sits in the expression because
	Svelte trims the whitespace at the start of the {:else} block. -->
{#each segments as seg, i (i)}{#if seg.kind === 'text'}{seg.text}{:else}<span
			class="text-xs font-medium text-muted-foreground">{` ${seg.label}`}</span
		>{/if}{/each}
