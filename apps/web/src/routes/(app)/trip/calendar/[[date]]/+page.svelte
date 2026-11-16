<script lang="ts">
	import { dayArg } from '#lib/features/trip/calendar.js';
	import CalendarView from '#lib/features/trip/CalendarView.svelte';
	import type { PageProps } from './$types';

	let { params }: PageProps = $props();
	// /trip/calendar/2027-01-30 opens that day (a link you can keep); anything else shows the plain calendar.
	const day = $derived(dayArg(params.date));
</script>

<svelte:head><title>Calendar · Asia Trip</title></svelte:head>

<CalendarView {day} />
