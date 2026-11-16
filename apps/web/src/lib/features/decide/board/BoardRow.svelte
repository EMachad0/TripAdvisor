<!--
	One ranked pick on the board (old boardRow): rank, thumbnail (or the category icon), name, city · category ·
	New, the note snippet, the lock / drone / booking tags, the call, and the price ("meal" for food, which the
	attraction budget leaves out). Below the cut line it is faded. A tap opens the place sheet.
-->
<script lang="ts">
	import NoteSnip from '#lib/features/cards/NoteSnip.svelte';
	import { VERDICT_LABEL } from '#lib/features/cards/model.js';
	import { cn } from '#lib/utils.js';
	import { brl, holidayById, type DecidePlace } from '../model.ts';

	interface Props {
		place: DecidePlace;
		i: number;
		below: boolean;
		/** The holiday this place is locked for. */
		holiday: string | null;
		category: { label: string; icon: string };
		onopen: () => void;
	}

	let { place, i, below, holiday, category, onopen }: Props = $props();
	const h = $derived(holiday === null ? undefined : holidayById(holiday));
	const booking = $derived(place.booking);
</script>

<button
	type="button"
	data-cat={place.category}
	data-board-row={place.id}
	data-below={below ? 'true' : undefined}
	onclick={onopen}
	class={cn(
		'flex w-full items-start gap-2.5 rounded-xl px-2 py-2 text-left transition duration-200 outline-none hover:bg-muted/70 focus-visible:ring-3 focus-visible:ring-ring/50',
		below && 'opacity-50 hover:opacity-90',
	)}
>
	<span class="mt-2.5 w-5 shrink-0 text-center font-serif text-sm font-semibold text-cat nums"
		>{i + 1}</span
	>
	<span
		class="grid size-10 shrink-0 place-items-center overflow-hidden rounded-lg bg-cat/15 text-lg"
	>
		{#if place.thumb !== null}
			<img src={place.thumb} alt="" loading="lazy" class="size-full object-cover" />
		{:else}
			<span aria-hidden="true">{category.icon}</span>
		{/if}
	</span>
	<span class="flex min-w-0 flex-1 flex-col gap-0.5">
		<span class="flex items-baseline gap-2">
			<b class="min-w-0 flex-1 truncate text-sm font-semibold">{place.name}</b>
			<span class="shrink-0 text-xs font-semibold text-ink-2 nums"
				>{brl(place.brl)}{#if !place.budgeted}<small
						class="ml-1 text-3xs font-semibold tracking-widest text-muted-foreground uppercase"
						>meal</small
					>{/if}</span
			>
		</span>
		<small class="truncate text-xs text-muted-foreground"
			>{place.cityName} · {category.label}{#if place.isNew}&#32;·&#32;<em
					class="font-semibold text-cat not-italic">New</em
				>{/if}</small
		>
		{#if place.note !== ''}<NoteSnip text={place.note} offset={place.tz} />{/if}
		<span class="mt-0.5 flex flex-wrap items-center gap-1">
			<span
				class={cn(
					'rounded-full px-2 py-0.5 text-2xs font-bold',
					place.verdict === 'must' && 'bg-must/15 text-must',
					place.verdict === 'maybe' && 'bg-maybe/20 text-maybe',
					place.verdict === 'skip' && 'bg-skip/15 text-skip',
					place.verdict === null && 'bg-muted text-muted-foreground',
				)}>{place.verdict === null ? 'Locked' : VERDICT_LABEL[place.verdict]}</span
			>
			{#if h !== undefined}
				<span
					class="rounded-full bg-must/15 px-1.5 py-0.5 text-2xs"
					title={`Locked for ${h.short}`}
					data-lock-tag={h.id}>{h.emoji} 🔒</span
				>
			{/if}
			{#if place.drone}<span class="rounded-full bg-muted px-1.5 py-0.5 text-2xs" title="Drone show"
					>🛸</span
				>{/if}
			{#if booking.level !== 'none'}
				<span
					class={cn(
						'rounded-full px-1.5 py-0.5 text-2xs',
						booking.level === 'recommended' ? 'bg-muted' : 'bg-warn/20',
					)}
					title={booking.badge ?? ''}>📅</span
				>
			{/if}
		</span>
	</span>
</button>
