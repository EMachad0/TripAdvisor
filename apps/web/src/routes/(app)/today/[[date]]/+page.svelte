<script lang="ts">
	import { dayArg } from '#lib/features/today/model.js';
	import TodayView from '#lib/features/today/TodayView.svelte';
	import type { PageProps } from './$types';

	let { params }: PageProps = $props();
	// /today/2027-01-30 opens that day (a link you can keep); /today or anything else shows the real today.
	const day = $derived(dayArg(params.date));
</script>

<TodayView {day} />
