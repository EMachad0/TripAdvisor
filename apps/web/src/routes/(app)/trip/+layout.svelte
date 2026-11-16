<!--
	The Trip section's sub-tabs (old #subtabs row): Itinerary, Calendar and Map.
-->
<script lang="ts">
	import type { Snippet } from 'svelte';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import SubNav from '#lib/components/shell/SubNav.svelte';

	let { children }: { children: Snippet } = $props();
	const path = $derived(page.url.pathname);
	const links = $derived([
		{
			href: resolve('/(app)/trip/itinerary'),
			label: 'Itinerary',
			on: path.startsWith('/trip/itinerary'),
		},
		{
			href: resolve('/(app)/trip/calendar/[[date]]', {}),
			label: 'Calendar',
			on: path.startsWith('/trip/calendar'),
		},
		{ href: resolve('/(app)/trip/map'), label: 'Map', on: path.startsWith('/trip/map') },
	]);
</script>

<SubNav label="Trip" {links} full={path.startsWith('/trip/map')} />
{@render children()}
