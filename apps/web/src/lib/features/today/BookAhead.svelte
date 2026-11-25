<!--
	Book ahead (Today): every stay with no bed, flight not bought and picked card that needs a ticket, with the day to
	book it by. Due rows (book-by within a week, or past) show; the rest fold under "Later". A bed row opens the stay's
	form (set Status to Booked); a card row opens the card, and "Booked" hides it from this list.
-->
<script lang="ts">
	import BedDoubleIcon from '@lucide/svelte/icons/bed-double';
	import CheckIcon from '@lucide/svelte/icons/check';
	import ChevronDownIcon from '@lucide/svelte/icons/chevron-down';
	import PlaneIcon from '@lucide/svelte/icons/plane';
	import TicketIcon from '@lucide/svelte/icons/ticket';
	import { cn } from '#lib/utils.js';
	import { fmtDay, plural } from '../trip/format.ts';
	import type { BookItem } from './booking.ts';

	interface Props {
		items: readonly BookItem[];
		canEdit: boolean;
		/** Open the stay or flight (its form for the owner). */
		onopenleg: (id: string) => void;
		onopenplace: (id: string) => void;
		/** Mark a card booked (owner only). */
		onbooked?: ((id: string) => void) | undefined;
	}

	let { items, canEdit, onopenleg, onopenplace, onbooked }: Props = $props();

	const due = $derived(items.filter((x) => x.tone !== 'later'));
	const later = $derived(items.filter((x) => x.tone === 'later'));
	const beds = $derived(due.filter((x) => x.kind === 'bed').length);
	let showLater = $state(false);
</script>

{#snippet row(x: BookItem)}
	{@const Icon = x.kind === 'bed' ? BedDoubleIcon : x.kind === 'flight' ? PlaneIcon : TicketIcon}
	<li class="flex items-center gap-1" data-testid="book-row" data-kind={x.kind}>
		<button
			type="button"
			class="flex min-h-11 min-w-0 flex-1 items-start gap-3 rounded-xl px-2.5 py-2.5 text-left transition-colors duration-150 ease-soft hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
			onclick={() => {
				if (x.kind === 'place') onopenplace(x.id);
				else onopenleg(x.id);
			}}
		>
			<span
				class={cn(
					'mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg',
					x.tone === 'late' && 'bg-destructive/12 text-destructive',
					x.tone === 'soon' && 'bg-amber/14 text-amber',
					x.tone === 'later' && 'bg-muted text-muted-foreground',
				)}
				aria-hidden="true"
			>
				<Icon class="size-4" />
			</span>
			<span class="flex min-w-0 flex-col gap-0.5">
				<b class="text-sm leading-snug font-semibold">{x.title}</b>
				<span
					class={cn(
						'text-xs font-medium nums',
						x.tone === 'late' && 'text-destructive',
						x.tone === 'soon' && 'text-amber',
						x.tone === 'later' && 'text-ink-2',
					)}
					data-testid="book-by">{x.label}{x.optional ? ' · recommended' : ''}</span
				>
				<span class="text-xs leading-relaxed text-ink-3">{x.detail}</span>
			</span>
		</button>
		{#if canEdit && x.kind === 'place' && onbooked}
			<button
				type="button"
				class="grid size-11 shrink-0 place-items-center rounded-xl text-ink-3 transition-colors duration-150 ease-soft hover:bg-muted/60 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
				aria-label={`Mark booked: ${x.title}`}
				title="Booked"
				onclick={() => {
					onbooked(x.id);
				}}
			>
				<CheckIcon class="size-4" />
			</button>
		{/if}
	</li>
{/snippet}

<div class="flex flex-col panel p-1.5">
	{#if due.length > 0}
		{#if beds > 0}
			<p class="mx-1 mt-1 mb-1.5 rounded-xl bg-destructive/10 px-3 py-2.5 text-sm text-destructive">
				<b class="font-semibold">{plural(beds, 'stay')} with no bed booked.</b> If you don’t book {beds ===
				1
					? 'it'
					: 'them'}, you have nowhere to sleep.
			</p>
		{/if}
		<ul class="flex flex-col gap-0.5" aria-label="Book now">
			{#each due as x (x.kind + x.id)}{@render row(x)}{/each}
		</ul>
	{:else}
		<p class="px-3 py-3 text-sm text-ink-3">
			{items.length === 0
				? 'Nothing left to book: every bed, flight and ticket ahead is booked.'
				: `Nothing to book this week. Next: ${later[0]?.title ?? ''}, by ${fmtDay(later[0]?.by ?? '')}.`}
		</p>
	{/if}

	{#if later.length > 0}
		<div class="mt-1 border-t border-border/70 pt-1">
			<button
				type="button"
				class="flex min-h-11 w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm text-ink-2 transition-colors duration-150 ease-soft hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
				aria-expanded={showLater}
				onclick={() => (showLater = !showLater)}
			>
				<span class="flex-1"
					><b class="font-semibold text-foreground">Later: {plural(later.length, 'booking')}</b> ·
					next by
					{fmtDay(later[0]?.by ?? '')}</span
				>
				<ChevronDownIcon
					class={cn(
						'size-4 transition-transform duration-200 ease-soft',
						showLater && 'rotate-180',
					)}
					aria-hidden="true"
				/>
			</button>
			{#if showLater}
				<ul class="flex flex-col gap-0.5" aria-label="Book later">
					{#each later as x (x.kind + x.id)}{@render row(x)}{/each}
				</ul>
			{/if}
		</div>
	{/if}
	<p class="mt-1 border-t border-border/70 px-3 pt-2.5 pb-2 text-xs leading-relaxed text-ink-3">
		Book-by days: a bed a week before check-in (a month when a night falls on New Year’s Eve or
		Lunar New Year), a flight three weeks before, a card by its own lead time or deadline.
	</p>
</div>
