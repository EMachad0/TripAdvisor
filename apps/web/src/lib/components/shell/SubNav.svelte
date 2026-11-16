<!--
	A section's pages under the bar (old #subtabs row): one link per page, the current one marked, an optional count
	badge. Scrolls sideways on a phone and keeps the current page in view.
-->
<script lang="ts">
	import { cn } from '#lib/utils.js';

	interface SubNavLink {
		href: string;
		label: string;
		on: boolean;
		badge?: number;
	}

	interface Props {
		label: string;
		links: readonly SubNavLink[];
		/** The page under it spans the whole content area (board, map), so the bar starts at its left edge. */
		full?: boolean;
	}

	let { label, links, full = false }: Props = $props();

	function keepInView(el: HTMLElement): void {
		el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
	}
</script>

<!-- eslint-disable svelte/no-navigation-without-resolve -- the callers pass hrefs built with resolve() -->
<div class={cn(!full && 'page-wide')}>
	<nav aria-label={label} class="-mx-4 mb-5 no-scrollbar overflow-x-auto px-4 md:mb-7">
		<div
			class="inline-flex w-max gap-0.5 rounded-full border border-border/60 bg-muted/70 p-1 shadow-inset"
		>
			{#each links as l (l.href)}
				<a
					href={l.href}
					aria-current={l.on ? 'page' : undefined}
					class={cn(
						'inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-sm font-medium whitespace-nowrap text-muted-foreground transition-colors duration-200 hover:text-foreground',
						l.on && 'bg-card text-foreground shadow-flat ring-1 ring-border/70',
					)}
					{@attach l.on ? keepInView : undefined}
				>
					{l.label}
					{#if (l.badge ?? 0) > 0}
						<span class={cn('count', !l.on && 'count-quiet')}
							>{(l.badge ?? 0) > 99 ? '99+' : l.badge}</span
						>
					{/if}
				</a>
			{/each}
		</div>
	</nav>
</div>
