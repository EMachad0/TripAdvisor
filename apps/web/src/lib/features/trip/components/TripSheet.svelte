<!--
	The trip sheet (the old <dialog id="tsheet">): a bottom Drawer on a phone, a Dialog from 768 px. Escape, the
	backdrop and the close button close it. Background refreshes are held while it is open (old: tripSheetOpen()).
-->
<script lang="ts">
	import type { Snippet } from 'svelte';
	import { MediaQuery } from 'svelte/reactivity';
	import { holdRefresh } from '#lib/components/shell/refresh.svelte.js';
	import * as Dialog from '#lib/components/ui/dialog/index.js';
	import * as Drawer from '#lib/components/ui/drawer/index.js';

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
	const desktop = new MediaQuery('min-width: 768px');

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

{#snippet heading()}
	{#if eyebrow}<p class="text-xs font-bold tracking-widest text-ink-3 uppercase">{eyebrow}</p>{/if}
{/snippet}

{#if desktop.current}
	<Dialog.Root {open} {onOpenChange}>
		<Dialog.Content
			bind:ref={content}
			tabindex={-1}
			class="max-h-5/6 overflow-y-auto sm:max-w-xl"
			data-testid="trip-sheet"
			onOpenAutoFocus={keepFocus}
		>
			<Dialog.Header>
				{@render heading()}
				<Dialog.Title>{title}</Dialog.Title>
				{#if subtitle}<Dialog.Description>{subtitle}</Dialog.Description>{/if}
			</Dialog.Header>
			<div class="flex min-w-0 flex-col gap-3">{@render children()}</div>
			{#if footer}<Dialog.Footer>{@render footer()}</Dialog.Footer>{/if}
		</Dialog.Content>
	</Dialog.Root>
{:else}
	<Drawer.Root {open} {onOpenChange}>
		<Drawer.Content data-testid="trip-sheet">
			<div class="flex min-h-0 flex-col overflow-y-auto">
				<Drawer.Header>
					{@render heading()}
					<Drawer.Title>{title}</Drawer.Title>
					{#if subtitle}<Drawer.Description>{subtitle}</Drawer.Description>{/if}
				</Drawer.Header>
				<div class="flex min-w-0 flex-col gap-3 px-4">{@render children()}</div>
				{#if footer}<Drawer.Footer>{@render footer()}</Drawer.Footer>{/if}
			</div>
		</Drawer.Content>
	</Drawer.Root>
{/if}
