<!--
	The Decide section's sub-tabs (old #subtabs row) above every Decide page, with the old badges: areas and places
	left to swipe, holidays still open.
-->
<script lang="ts">
	import type { Snippet } from 'svelte';
	import { DecideData } from '#lib/features/decide/data.svelte.js';
	import DecideNav from '#lib/features/decide/DecideNav.svelte';

	let { children }: { children: Snippet } = $props();
	const d = new DecideData();
</script>

<DecideNav
	areasLeft={d.counts.areasLeft}
	placesLeft={d.counts.placesLeft}
	holidayOpen={d.counts.holidayOpen}
/>
{@render children()}
