<script lang="ts">
	import type { Snippet } from 'svelte';
	import PlacesNav from '#lib/features/places/PlacesNav.svelte';

	let { children }: { children: Snippet } = $props();
</script>

<PlacesNav />
{@render children()}
