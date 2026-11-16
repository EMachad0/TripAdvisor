<!--
	A horizontal bar of coloured segments (old t-stackbar, t-split and t-mini). Widths are SVG attributes, so no
	inline style is needed; the track shows through where the segments end. `marker` draws a thin tick at a share of
	the bar (the cap, when the plan runs past it). Decorative: the numbers are in text beside it.
-->
<script lang="ts">
	import { cn } from '#lib/utils.js';

	interface Segment {
		/** Share of the bar, 0..100. */
		pct: number;
		/** A fill-* class. */
		fill: string;
		key: string;
	}

	interface Props {
		segments: readonly Segment[];
		size?: 'sm' | 'md' | 'lg';
		/** A tick at this share of the bar, 0..100. */
		marker?: number | null;
	}

	let { segments, size = 'md', marker = null }: Props = $props();
	const clamp = (n: number): number => (Number.isFinite(n) ? Math.min(100, Math.max(0, n)) : 0);
	const placed = $derived.by(() => {
		let x = 0;
		return segments.map((s) => {
			const w = clamp(Math.min(s.pct, 100 - x));
			const out = { ...s, x, w };
			x += w;
			return out;
		});
	});
</script>

<svg
	aria-hidden="true"
	class={cn(
		'block w-full overflow-hidden rounded-full bg-muted shadow-inset',
		size === 'sm' && 'h-1.5',
		size === 'md' && 'h-2',
		size === 'lg' && 'h-3',
	)}
>
	{#each placed as s, i (s.key)}
		<rect
			x="{s.x}%"
			y="0"
			width="{s.w}%"
			height="100%"
			class={cn(s.fill, 'motion-safe:transition-all motion-safe:duration-500')}
		/>
		{#if i < placed.length - 1 && s.w > 0}
			<rect x="{s.x + s.w}%" y="0" width="2" height="100%" class="fill-card" />
		{/if}
	{/each}
	{#if marker !== null && marker > 0 && marker < 100}
		<rect x="{clamp(marker)}%" y="0" width="3" height="100%" class="fill-card" />
	{/if}
</svg>
