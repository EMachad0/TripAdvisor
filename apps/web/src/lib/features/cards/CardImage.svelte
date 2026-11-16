<!--
	A card photo from an ImageSet (responsive srcset). When there is none, or it fails to load, the fallback snippet
	shows instead (the old card printed the local name in large type).
-->
<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { ImageSet } from '#lib/content/types.js';

	interface Props {
		image: ImageSet | null;
		sizes: string;
		alt?: string;
		fallback: Snippet;
	}

	let { image, sizes, alt = '', fallback }: Props = $props();
	let failed = $state(false);
	const srcset = $derived(
		image === null ? '' : image.srcset.map((s) => `${s.url} ${String(s.width)}w`).join(', '),
	);
</script>

{#if image !== null && !failed}
	<img
		src={image.src}
		{srcset}
		{sizes}
		{alt}
		width={image.width ?? undefined}
		height={image.height ?? undefined}
		loading="lazy"
		decoding="async"
		draggable="false"
		class="absolute inset-0 size-full object-cover select-none"
		onerror={() => {
			failed = true;
		}}
		{@attach (el: HTMLImageElement) => {
			// A load error before hydration fires no handler: check once on mount.
			if (el.complete && el.naturalWidth === 0) failed = true;
		}}
	/>
{:else}
	{@render fallback()}
{/if}
