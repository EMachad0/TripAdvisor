<!--
	The category mix of above-the-line picks (old mixBar): one segment per category, sized by its count, in that
	category's colour. Widths are SVG attributes, so no inline style. A dashed empty bar when nothing is above the
	line. The numbers are in text beside it (tooltips per segment).
-->
<script lang="ts">
	import { cn } from '#lib/utils.js';
	import { mixOf } from '../model.ts';

	interface Props {
		counts: Readonly<Record<string, number>>;
		label: (category: string) => string;
		size?: 'md' | 'lg';
	}

	let { counts, label, size = 'md' }: Props = $props();
	const GAP = 0.6;
	const segments = $derived.by(() => {
		const cats = mixOf(counts);
		const total = cats.reduce((s, [, n]) => s + n, 0);
		const gaps = Math.max(0, cats.length - 1) * GAP;
		let x = 0;
		return cats.map(([c, n]) => {
			const w = total ? ((100 - gaps) * n) / total : 0;
			const seg = { c, n, x, w };
			x += w + GAP;
			return seg;
		});
	});
</script>

{#if segments.length === 0}
	<span
		class={cn(
			'block w-full rounded-full border border-dashed border-border',
			size === 'lg' ? 'h-4' : 'h-3',
		)}
		aria-hidden="true"
		data-mixbar="empty"
	></span>
{:else}
	<svg
		class={cn(
			'block w-full overflow-hidden rounded-full bg-background',
			size === 'lg' ? 'h-4' : 'h-3',
		)}
		role="img"
		aria-label={segments.map((s) => `${label(s.c)}: ${String(s.n)}`).join(', ')}
		data-mixbar
	>
		{#each segments as s (s.c)}
			<rect data-cat={s.c} x="{s.x}%" y="0" width="{s.w}%" height="100%" class="fill-cat">
				<title>{label(s.c)}: {s.n}</title>
			</rect>
		{/each}
	</svg>
{/if}
