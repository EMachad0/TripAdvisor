<!--
	One card in the Places grid: the same facts, roles and hooks as PlaceRow (the "been there" tick, the name that
	opens the place sheet, city · kind · area, "New", the when line, the note, the verdict pill, the Maps link), laid
	out around the card's photo. On a phone it is a row with the photo on the left; from md up a tile with the photo
	on top. The whole tile opens the sheet (the name's button is stretched over it); the tick and Maps sit above.
-->
<script lang="ts">
	import Check from '@lucide/svelte/icons/check';
	import MapPin from '@lucide/svelte/icons/map-pin';
	import { tzSegments } from '#lib/components/shell/tz.js';
	import { getAppData } from '#lib/content/app-data.svelte.js';
	import type { ContentPlace } from '#lib/content/types.js';
	import CardImage from '#lib/features/cards/CardImage.svelte';
	import { cn } from '#lib/utils.js';
	import { mapUrl } from './model.ts';

	interface Props {
		place: ContentPlace;
		visited?: boolean;
		verdict?: 'must' | 'maybe' | 'skip' | null;
		note?: string | null;
		onopen: (id: string) => void;
		/** Leave out to hide the tick. */
		ontogglevisited?: (id: string, next: boolean) => void;
	}

	let {
		place,
		visited = false,
		verdict = null,
		note = null,
		onopen,
		ontogglevisited,
	}: Props = $props();
	const app = getAppData();
	const category = $derived(app.content.categories[place.category]);
	const meta = $derived(
		[category?.label ?? place.category, place.area ?? ''].filter((s) => s !== '').join(' · '),
	);
	const noteParts = $derived(note === null ? [] : tzSegments(note, place.tz));
	const readonly = $derived(app.isGuest);
</script>

<li
	class={cn(
		'group/tile relative flex min-w-0 panel-lift overflow-hidden panel md:flex-col',
		verdict === 'skip' && 'opacity-60',
	)}
	data-place={place.id}
	data-cat={place.category}
	data-been={visited ? '' : undefined}
	data-v={verdict ?? 'none'}
>
	<div
		class="relative w-28 shrink-0 self-stretch overflow-hidden bg-muted max-md:min-h-28 md:aspect-3/2 md:w-auto"
	>
		<div
			class={cn(
				'absolute inset-0 transition duration-500 ease-soft motion-safe:group-hover/tile:scale-105',
				visited && 'grayscale',
			)}
		>
			<CardImage image={place.card.cover} sizes="(max-width: 703px) 112px, 360px">
				{#snippet fallback()}
					<span
						aria-hidden="true"
						class="absolute inset-0 grid place-items-center bg-linear-150 from-cat/80 to-cat/30 text-3xl md:text-5xl"
						>{category?.icon ?? ''}</span
					>
				{/snippet}
			</CardImage>
		</div>
		<div
			class="pointer-events-none absolute inset-x-0 bottom-0 h-2/3 bg-linear-to-t from-scrim/65 to-transparent"
			aria-hidden="true"
		></div>
		{#if verdict !== null}
			<span
				class={cn(
					'absolute bottom-2 left-2 inline-flex items-center gap-1.5 rounded-full bg-card/90 px-2 py-1 text-2xs leading-none font-bold tracking-wider uppercase shadow-flat before:size-1.5 before:rounded-full before:bg-current md:top-3 md:right-3 md:bottom-auto md:left-auto',
					verdict === 'must' && 'text-must',
					verdict === 'maybe' && 'text-maybe',
					verdict === 'skip' && 'text-skip',
				)}
				data-verdict-pill>{verdict}</span
			>
		{/if}
		<span
			class="pointer-events-none absolute bottom-3 left-3 hidden items-center gap-1.5 text-xs font-semibold text-on-scrim md:inline-flex"
			aria-hidden="true">{category?.icon ?? ''} {category?.label ?? place.category}</span
		>
	</div>

	<div class="flex min-w-0 flex-1 flex-col gap-1 py-2.5 pr-2 pl-3 md:gap-1.5 md:p-4">
		<button
			type="button"
			data-place-open
			class="flex min-w-0 flex-col gap-0.5 text-left outline-none after:absolute after:inset-0 after:rounded-2xl after:transition-shadow focus-visible:after:ring-3 focus-visible:after:ring-ring/50"
			onclick={() => {
				onopen(place.id);
			}}
		>
			<b
				class={cn(
					'line-clamp-2 pr-8 text-base leading-snug font-semibold wrap-anywhere md:pr-0 md:font-serif md:text-lg md:leading-tight',
					visited && 'text-ink-3 line-through decoration-ink-3',
				)}>{place.name}</b
			>
			<small class="flex min-w-0 gap-1 text-xs text-ink-3">
				<span class="truncate md:hidden">{meta}</span>
				<span class="hidden truncate md:inline">{place.area ?? place.cityName}</span>
				{#if place.isNew}
					<span aria-hidden="true">·</span>
					<em class="shrink-0 font-bold text-amber not-italic" data-new>New</em>
				{/if}
			</small>
		</button>
		{#if note !== null && note !== ''}
			<span class="line-clamp-2 text-xs leading-relaxed text-note italic" data-note
				>{#each noteParts as seg, i (i)}{#if seg.kind === 'text'}{seg.text}{:else}<span
							class="text-xs font-medium whitespace-pre text-muted-foreground not-italic"
							>{` ${seg.label}`}</span
						>{/if}{/each}</span
			>
		{/if}
		<div class="mt-auto flex items-end justify-between gap-2 md:pt-1">
			{#if place.whenLabel !== null && place.whenLabel !== ''}
				<span class="min-w-0 text-xs text-ink-2">{place.whenLabel}</span>
			{:else}
				<span></span>
			{/if}
			<!-- eslint-disable svelte/no-navigation-without-resolve -- external Google Maps URL, not an app route -->
			<a
				class="z-10 -my-1 -mr-2 grid size-11 shrink-0 place-items-center rounded-xl text-ink-3 transition-colors hover:bg-muted hover:text-cat max-md:absolute max-md:top-1 max-md:right-1 md:relative md:size-10"
				href={mapUrl(place)}
				target="_blank"
				rel="noopener noreferrer"
				aria-label={`Open ${place.name} in Maps`}
				title="Open in Maps"><MapPin class="size-4.5" /></a
			>
			<!-- eslint-enable svelte/no-navigation-without-resolve -->
		</div>
	</div>

	{#if ontogglevisited !== undefined}
		<button
			type="button"
			class="group/check absolute top-0 left-0 z-10 grid size-11 place-items-center rounded-2xl outline-none disabled:cursor-not-allowed md:top-1 md:left-1"
			role="checkbox"
			aria-checked={visited}
			aria-label={`${visited ? 'Not been yet' : 'Been there'}: ${place.name}`}
			disabled={readonly}
			title={readonly ? 'Signed in as a guest: you can look, not change' : 'Been there'}
			onclick={() => {
				ontogglevisited(place.id, !visited);
			}}
		>
			<span
				class={cn(
					'grid size-7 place-items-center rounded-full border-2 border-on-scrim/90 bg-scrim/25 text-transparent shadow-flat backdrop-blur-sm transition-colors duration-200 ease-soft',
					visited && 'border-ok bg-ok text-on-scrim',
					'group-focus-visible/check:ring-3 group-focus-visible/check:ring-ring/60',
				)}
				aria-hidden="true"
			>
				<Check class="size-4" strokeWidth={3} />
			</span>
		</button>
	{/if}
</li>
