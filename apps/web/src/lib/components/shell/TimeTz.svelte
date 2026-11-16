<!--
	A structured clock time with its UTC offset (FROZEN props): flight times, check-in fields, "last synced".
	`time` is "HH:MM", "YYYY-MM-DDTHH:MM" or an ISO stamp; `offset` is hours from UTC (8, -3, "5.5"). An unknown
	offset shows the time alone, as the old site did. `datetime` carries the instant when the date is known.
-->
<script lang="ts">
	import { clockOf, tzLabel, type TzOffset } from './tz';

	interface Props {
		time: string;
		offset: TzOffset;
		class?: string;
	}

	let { time, offset, class: className = '' }: Props = $props();
	const clock = $derived(clockOf(time));
	const label = $derived(tzLabel(offset));
	const datetime = $derived(/^\d{4}-\d{2}-\d{2}T/.test(time) ? time : undefined);
</script>

{#if clock !== ''}
	<time class={className} {datetime} data-tz-label={label}>
		{clock}
		{#if label !== ''}
			<span class="text-xs font-medium text-muted-foreground">{label}</span>
		{/if}
	</time>
{/if}
