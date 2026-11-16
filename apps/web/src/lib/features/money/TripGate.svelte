<!--
	Renders its children with trip.all once the first result is in: skeleton rows before that, an alert if the query
	fails (old: "The trip site isn't answering").
-->
<script lang="ts">
	import type { Snippet } from 'svelte';
	import * as Alert from '#lib/components/ui/alert/index.js';
	import { Skeleton } from '#lib/components/ui/skeleton/index.js';
	import type { TripQuery } from './trip-query.svelte.ts';
	import type { TripData } from './trip-docs.ts';

	interface Props {
		query: TripQuery;
		children: Snippet<[TripData]>;
	}

	let { query, children }: Props = $props();
</script>

{#if query.data !== undefined}
	{@render children(query.data)}
{:else if query.error !== undefined}
	<Alert.Root variant="destructive">
		<Alert.Title>The trip data isn’t answering</Alert.Title>
		<Alert.Description>{query.error.message}</Alert.Description>
	</Alert.Root>
{:else}
	<div class="flex flex-col gap-3" aria-busy="true" aria-label="Loading">
		<Skeleton class="h-4 w-40" />
		<Skeleton class="h-9 w-56" />
		<Skeleton class="h-24 w-full" />
		<Skeleton class="h-24 w-full" />
	</div>
{/if}
