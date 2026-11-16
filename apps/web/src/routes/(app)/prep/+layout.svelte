<script lang="ts">
	import type { Snippet } from 'svelte';
	import PrepNav from '#lib/features/prep/PrepNav.svelte';
	import { openTasks } from '#lib/features/prep/model.js';
	import { useTrip } from '#lib/features/money/trip-query.svelte.js';

	let { children }: { children: Snippet } = $props();
	const trip = useTrip();
</script>

<PrepNav openTasks={openTasks(trip.data)} />
{@render children()}
