<!--
	One place in a list (Today, Places, a calendar day) (FROZEN props), as the old trip.js placeRow: the "been there"
	tick, the thumb (photo, else the category icon on its colour), the name (struck through once been), city ·
	category · area and a "New" tag for a card the curator added since the last look, the when line, the note, the
	verdict pill (on the meta line) and the Maps link. A Skip card is dimmed.
	The tick shows when the parent passes `ontogglevisited`; the guest sees it read only (the old site let the guest
	press it and refused the write). The parent writes through #lib/sync/write.ts.
-->
<script lang="ts">
	import Check from '@lucide/svelte/icons/check';
	import MapPin from '@lucide/svelte/icons/map-pin';
	import type { Snippet } from 'svelte';
	import { tzSegments } from '#lib/components/shell/tz.js';
	import { getAppData } from '#lib/content/app-data.svelte.js';
	import type { ContentPlace } from '#lib/content/types.js';
	import { mapUrl } from '#lib/features/places/model.js';
	import { cn } from '#lib/utils.js';

	interface Props {
		place: ContentPlace;
		/** Has a `visited` row. */
		visited?: boolean;
		/** The traveler's call (feedback.state verdicts.place[id]). */
		verdict?: 'must' | 'maybe' | 'skip' | null;
		/** The traveler's note on the card. */
		note?: string | null;
		showCity?: boolean;
		/** Replaces the soft when line (Today's "This day only", a date range...). */
		when?: Snippet;
		/** Opens the place sheet. */
		onopen: (id: string) => void;
		/** Toggles "been there"; leave it out to hide the tick. */
		ontogglevisited?: (id: string, next: boolean) => void;
	}

	let {
		place,
		visited = false,
		verdict = null,
		note = null,
		showCity = true,
		when,
		onopen,
		ontogglevisited,
	}: Props = $props();
	const app = getAppData();
	let thumbFailed = $state(false);
	const category = $derived(app.content.categories[place.category]);
	const meta = $derived(
		[showCity ? place.cityName : '', category?.label ?? place.category, place.area ?? '']
			.filter((s) => s !== '')
			.join(' · '),
	);
	const noteParts = $derived(note === null ? [] : tzSegments(note, place.tz));
	const readonly = $derived(app.isGuest);
	const VERDICT_CLASS = {
		must: 'bg-must/12 text-must',
		maybe: 'bg-maybe/12 text-maybe',
		skip: 'bg-muted text-ink-3',
	} as const;
</script>

<li
	class={cn(
		'flex items-center gap-1 rounded-xl py-1 pr-1 pl-1 transition-colors duration-200 has-[[data-place-open]:hover]:bg-muted/60',
		verdict === 'skip' && 'opacity-55',
	)}
	data-place={place.id}
	data-cat={place.category}
	data-been={visited ? '' : undefined}
	data-v={verdict ?? 'none'}
>
	{#if ontogglevisited !== undefined}
		<button
			type="button"
			class="group/check grid size-11 shrink-0 place-items-center rounded-full outline-none disabled:cursor-not-allowed"
			role="checkbox"
			aria-checked={visited}
			aria-label={`${visited ? 'Not been yet' : 'Been there'}: ${place.name}`}
			disabled={readonly}
			title={readonly ? 'Signed in as a guest: you can look, not change' : undefined}
			onclick={() => {
				ontogglevisited(place.id, !visited);
			}}
		>
			<span
				class={cn(
					'grid size-6 place-items-center rounded-full border-2 border-ink-3/70 text-transparent transition-colors duration-200 ease-soft group-focus-visible/check:ring-3 group-focus-visible/check:ring-ring/50',
					visited && 'border-ok bg-ok text-surface',
				)}
				aria-hidden="true"
			>
				<Check class="size-4" strokeWidth={3} />
			</span>
		</button>
	{/if}
	<button
		type="button"
		data-place-open
		class={cn(
			'flex min-w-0 flex-1 items-center gap-3 rounded-lg py-0.5 text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/40',
			ontogglevisited === undefined && 'pl-1',
		)}
		onclick={() => {
			onopen(place.id);
		}}
	>
		<span
			class="relative grid size-14 shrink-0 place-items-center overflow-hidden rounded-xl bg-linear-150 from-cat/80 to-cat/30 text-2xl shadow-flat"
		>
			{#if place.thumb !== null && !thumbFailed}
				<img
					src={place.thumb}
					alt=""
					loading="lazy"
					class="absolute inset-0 size-full object-cover"
					onerror={() => {
						thumbFailed = true;
					}}
				/>
			{:else}
				<span aria-hidden="true">{category?.icon ?? ''}</span>
			{/if}
		</span>
		<span class="flex min-w-0 flex-col gap-0.5">
			<b
				class={cn(
					'text-base leading-tight font-semibold wrap-anywhere',
					visited && 'text-ink-3 line-through decoration-ink-3',
				)}>{place.name}</b
			>
			<small class="flex min-w-0 items-center gap-1 text-xs text-ink-3">
				{#if verdict !== null}
					<span
						class={cn(
							'inline-flex shrink-0 items-center gap-1 rounded-full px-1.5 py-0.5 text-2xs leading-none font-bold tracking-wider uppercase before:size-1.5 before:rounded-full before:bg-current',
							VERDICT_CLASS[verdict],
						)}
						data-verdict-pill>{verdict}</span
					>
				{/if}
				<span class="truncate">{meta}</span>
				{#if place.isNew}
					<span aria-hidden="true">·</span>
					<em class="shrink-0 font-bold text-amber not-italic" data-new>New</em>
				{/if}
			</small>
			{#if when}
				<span class="text-xs text-ink-2">{@render when()}</span>
			{:else if place.whenLabel !== null && place.whenLabel !== ''}
				<span class="text-xs text-ink-3">{place.whenLabel}</span>
			{/if}
			{#if note !== null && note !== ''}
				<span class="line-clamp-2 text-xs text-note italic" data-note
					>{#each noteParts as seg, i (i)}{#if seg.kind === 'text'}{seg.text}{:else}<span
								class="text-xs font-medium whitespace-pre text-muted-foreground not-italic"
								>{` ${seg.label}`}</span
							>{/if}{/each}</span
				>
			{/if}
		</span>
	</button>
	<span class="flex shrink-0 items-center">
		<!-- eslint-disable svelte/no-navigation-without-resolve -- external Google Maps URL, not an app route -->
		<a
			class="grid size-11 place-items-center rounded-full text-ink-3 transition-colors hover:bg-muted hover:text-cat md:size-10"
			href={mapUrl(place)}
			target="_blank"
			rel="noopener noreferrer"
			aria-label={`Open ${place.name} in Maps`}><MapPin class="size-4.5" /></a
		>
		<!-- eslint-enable svelte/no-navigation-without-resolve -->
	</span>
</li>
