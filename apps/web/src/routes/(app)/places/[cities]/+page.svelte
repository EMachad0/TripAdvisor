<script lang="ts">
	import { page } from '$app/state';
	import PlacesView from '#lib/features/places/PlacesView.svelte';
</script>

<PlacesView arg={page.params.cities} />
