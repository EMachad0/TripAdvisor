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
		'flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition hover:bg-muted',
		below && 'opacity-50 hover:opacity-85',
	)}
>
	<span class="w-6 shrink-0 text-center font-serif text-base font-semibold text-cat">{i + 1}</span>
	<span
		class="grid size-11 shrink-0 place-items-center overflow-hidden rounded-xl bg-cat/15 text-xl"
	>
		{#if place.thumb !== null}
			<img src={place.thumb} alt="" loading="lazy" class="size-full object-cover" />
		{:else}
			<span aria-hidden="true">{category.icon}</span>
		{/if}
	</span>
	<span class="flex min-w-0 flex-1 flex-col gap-0.5">
		<b class="truncate text-sm font-semibold sm:text-base">{place.name}</b>
		<small class="truncate text-xs text-muted-foreground"
			>{place.cityName} · {category.label}{#if place.isNew}&#32;·&#32;<em
					class="font-semibold text-cat not-italic">New</em
				>{/if}</small
		>
		{#if place.note !== ''}<NoteSnip text={place.note} offset={place.tz} />{/if}
		<span class="mt-0.5 flex flex-wrap items-center gap-1">
			{#if h !== undefined}
				<span
					class="rounded-full bg-must/15 px-1.5 py-0.5 text-xs"
					title={`Locked for ${h.short}`}
					data-lock-tag={h.id}>{h.emoji} 🔒</span
				>
			{/if}
			{#if place.drone}<span class="rounded-full bg-muted px-1.5 py-0.5 text-xs" title="Drone show"
					>🛸</span
				>{/if}
			{#if booking.level !== 'none'}
				<span
					class={cn(
						'rounded-full px-1.5 py-0.5 text-xs',
						booking.level === 'recommended' ? 'bg-muted' : 'bg-warn/20',
					)}
					title={booking.badge ?? ''}>📅</span
				>
			{/if}
			<span
				class={cn(
					'rounded-full px-2 py-0.5 text-xs font-bold',
					place.verdict === 'must' && 'bg-must/15 text-must',
					place.verdict === 'maybe' && 'bg-maybe/20 text-maybe',
					place.verdict === 'skip' && 'bg-skip/15 text-skip',
					place.verdict === null && 'bg-muted text-muted-foreground',
				)}>{place.verdict === null ? 'Locked' : VERDICT_LABEL[place.verdict]}</span
			>
		</span>
	</span>
	<span
		class="flex min-w-14 shrink-0 flex-col items-end gap-0.5 text-right font-serif text-sm font-semibold text-ink-2"
		>{brl(place.brl)}{#if !place.budgeted}<small
				class="font-sans text-xs font-semibold tracking-widest text-muted-foreground uppercase"
				>meal</small
			>{/if}</span
	>
</button>
