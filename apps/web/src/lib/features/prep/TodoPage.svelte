<!-- The To do page with its data (shared by /prep and /prep/todo). -->
<script lang="ts">
	import { getAppData } from '#lib/content/app-data.svelte.js';
	import TripGate from '../money/TripGate.svelte';
	import { useTrip } from '../money/trip-query.svelte.ts';
	import TodoView from './TodoView.svelte';

	const app = getAppData();
	const trip = useTrip();
</script>

<TripGate query={trip}>
	{#snippet children(data)}
		<TodoView trip={data} countries={app.content.countries} canEdit={!app.isGuest} />
	{/snippet}
</TripGate>
