<!-- Today (/): the real today. Old hash links (#/today/<date> and the rest) are mapped in (app)/+layout.svelte. -->
<script lang="ts">
	import TodayView from '#lib/features/today/TodayView.svelte';
</script>

<TodayView day={null} />
