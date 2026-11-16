<!--
	Free text with the UTC offset after every clock time in it. The shared TzText now writes the space before the
	label ("14:00 UTC+8"), so this only forwards to it; the trip screens keep importing TzLine.
-->
<script lang="ts">
	import TzText from '#lib/components/shell/TzText.svelte';
	import type { TzOffset } from '#lib/components/shell/tz.js';

	interface Props {
		text: string;
		offset: TzOffset;
	}

	let { text, offset }: Props = $props();
</script>

<TzText {text} {offset} />
