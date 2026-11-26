<script lang="ts">
	import CityMapView from '#lib/features/citymap/CityMapView.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

{#key `${data.country}/${data.city}`}
	<CityMapView country={data.country} city={data.city} />
{/key}
