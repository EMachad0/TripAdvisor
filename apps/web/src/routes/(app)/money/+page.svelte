<script lang="ts">
	import { getAppData } from '#lib/content/app-data.svelte.js';
	import MoneyView from '#lib/features/money/MoneyView.svelte';
	import TripGate from '#lib/features/money/TripGate.svelte';
	import { useTrip } from '#lib/features/money/trip-query.svelte.js';

	const app = getAppData();
	const trip = useTrip();
</script>

<TripGate query={trip}>
	{#snippet children(data)}
		<MoneyView trip={data} countries={app.content.countries} canEdit={!app.isGuest} />
	{/snippet}
</TripGate>
