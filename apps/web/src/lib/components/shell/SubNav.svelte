<!--
	A section's pages under the bar (old #subtabs row): one link per page, the current one marked, an optional count
	badge. Scrolls sideways on a phone and keeps the current page in view.
-->
<script lang="ts">
	import { Badge } from '#lib/components/ui/badge/index.js';
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
	}

	let { label, links }: Props = $props();

	function keepInView(el: HTMLElement): void {
		el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
	}
</script>

<!-- eslint-disable svelte/no-navigation-without-resolve -- the callers pass hrefs built with resolve() -->
<nav aria-label={label} class="-mx-4 -mt-2 mb-6 overflow-x-auto px-4">
	<div class="flex w-max min-w-full gap-1 border-b border-border">
		{#each links as l (l.href)}
			<a
				href={l.href}
				aria-current={l.on ? 'page' : undefined}
				class={cn(
					'-mb-px inline-flex shrink-0 items-center gap-1.5 border-b-2 border-transparent px-3 py-2 text-sm font-medium whitespace-nowrap text-muted-foreground hover:text-foreground',
					l.on && 'border-cat text-foreground',
				)}
				{@attach l.on ? keepInView : undefined}
			>
				{l.label}
				{#if (l.badge ?? 0) > 0}
					<Badge variant="secondary">{(l.badge ?? 0) > 99 ? '99+' : l.badge}</Badge>
				{/if}
			</a>
		{/each}
	</div>
</nav>
