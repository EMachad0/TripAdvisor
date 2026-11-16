<!--
	The trip sheet (the old <dialog id="tsheet">): a bottom Drawer on a phone, a side sheet from the Fold's inner
	screen up (docs/DESIGN.md: detail views are a side sheet there), so the page stays in view beside it. Escape, the
	backdrop and the close button close it. Background refreshes are held while it is open (old: tripSheetOpen()).
	The head and the action row stay put; only the body scrolls.
-->
<script lang="ts">
	import type { Snippet } from 'svelte';
	import { MediaQuery } from 'svelte/reactivity';
	import { holdRefresh } from '#lib/components/shell/refresh.svelte.js';
	import * as Drawer from '#lib/components/ui/drawer/index.js';
	import * as Sheet from '#lib/components/ui/sheet/index.js';

	interface Props {
		open: boolean;
		title: string;
		/** A line under the title ("Day 12 of 66 · Kyoto"). */
		subtitle?: string;
		/** Small text above the title ("Train · Fri 15 Jan"). */
		eyebrow?: string;
		onclose: () => void;
		children: Snippet;
		/** The action row at the bottom. */
		footer?: Snippet;
	}

	let { open, title, subtitle, eyebrow, onclose, children, footer }: Props = $props();
	const wide = new MediaQuery('min-width: 44rem');

	$effect(() => {
		if (!open) return;
		return holdRefresh();
	});

	let content: HTMLElement | null = $state(null);
	/**
	 * Focus the sheet itself, not its first link: a focus ring on a random button reads as a selection (the old
	 * sheet did the same). A form that focused its first field keeps that focus.
	 */
	function keepFocus(e: Event): void {
		e.preventDefault();
		if (content !== null && !content.contains(document.activeElement)) content.focus();
	}

	const onOpenChange = (next: boolean): void => {
		if (!next) onclose();
	};
</script>

{#snippet eyebrowLine()}
	{#if eyebrow}<p class="eyebrow">{eyebrow}</p>{/if}
{/snippet}

{#snippet titleText()}
	<span class="font-serif text-2xl leading-tight font-semibold tracking-tight md:text-3xl"
		>{title}</span
	>
{/snippet}

{#if wide.current}
	<Sheet.Root {open} {onOpenChange}>
		<Sheet.Content
			bind:ref={content}
			tabindex={-1}
			side="right"
			class="w-full sm:max-w-lg 3xl:max-w-xl"
			data-testid="trip-sheet"
			onOpenAutoFocus={keepFocus}
		>
			<div class="flex h-full min-h-0 flex-col">
				<div
					class="flex flex-col gap-1 border-b border-border/70 px-6 pt-6 pr-14 pb-4 3xl:px-8 3xl:pt-8 3xl:pr-14"
				>
					{@render eyebrowLine()}
					<Sheet.Title>{@render titleText()}</Sheet.Title>
					{#if subtitle}<Sheet.Description><span class="nums">{subtitle}</span></Sheet.Description
						>{/if}
				</div>
				<div
					class="flex min-h-0 min-w-0 flex-1 flex-col gap-4 overflow-y-auto px-6 py-5 3xl:px-8"
				>
					{@render children()}
				</div>
				{#if footer}
					<div
						class="flex flex-wrap items-center justify-end gap-2 border-t border-border/70 bg-muted/40 px-6 py-4 3xl:px-8"
					>
						{@render footer()}
					</div>
				{/if}
			</div>
		</Sheet.Content>
	</Sheet.Root>
{:else}
	<Drawer.Root {open} {onOpenChange}>
		<Drawer.Content data-testid="trip-sheet">
			<div class="flex min-h-0 flex-col overflow-y-auto">
				<div class="flex flex-col gap-1 px-4 pt-3 pb-4">
					{@render eyebrowLine()}
					<Drawer.Title>{@render titleText()}</Drawer.Title>
					{#if subtitle}<Drawer.Description><span class="nums">{subtitle}</span></Drawer.Description
						>{/if}
				</div>
				<div class="flex min-w-0 flex-col gap-4 px-4 pb-4">{@render children()}</div>
				{#if footer}
					<div class="flex flex-wrap items-center justify-end gap-2 px-4 pt-1 pb-6">
						{@render footer()}
					</div>
				{/if}
			</div>
		</Drawer.Content>
	</Drawer.Root>
{/if}
