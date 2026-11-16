<!--
	A small horizontal meter (old .g-meter) in a status colour: the budget check. The width is an SVG attribute, so
	no inline style. Decorative: the numbers are in the text beside it.
-->
<script lang="ts">
	import { cn } from '#lib/utils.js';

	interface Props {
		/** 0..100 */
		value: number;
		tone: 'ok' | 'tight' | 'over';
	}

	let { value, tone }: Props = $props();
	const w = $derived(Number.isFinite(value) ? Math.min(100, Math.max(0, value)) : 0);
</script>

<svg
	class="block h-2 w-full overflow-hidden rounded-full bg-background"
	aria-hidden="true"
	data-meter={tone}
>
	<rect
		x="0"
		y="0"
		width="{w}%"
		height="100%"
		class={cn(
			tone === 'ok' && 'fill-ok',
			tone === 'tight' && 'fill-amber',
			tone === 'over' && 'fill-destructive',
		)}
	/>
</svg>
