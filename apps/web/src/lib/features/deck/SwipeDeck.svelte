<!--
	The Areas and Swipe rounds (old game.js viewDeck, bindTopCard, swipeTop, undo, the deck note panel and the deck
	keys). Three cards stacked; drag the top one (110 px or a 0.6 px/ms flick sideways, 110 px up) or use the
	buttons or keys: ← Skip, ↑ Maybe, → Must; Z or Backspace undo (local only); Space or Enter open; N note;
	Escape closes the note panel. Later (↓, the clock button, or a drag down) sends the top card to the back of the
	deck without a call; Find (F or /) lists every card left and brings the picked one to the top. Both only reorder
	the deck in this browser. Haptics: 8 ms on Skip, 14 on Must and Maybe. A tap opens the place or area sheet.
	The guest sees the deck and opens cards; the calls and the note are disabled.
	Layout: the deck is one screen tall (deck-h), so the card and the buttons (Undo, Skip, Maybe, Must, Note) fit
	without scrolling; on a phone the buttons sit just above the floating tab bar. From xl up a side panel shows this
	round's calls, the cards up next and the keys.
-->
<script lang="ts">
	import Clock from '@lucide/svelte/icons/clock';
	import Info from '@lucide/svelte/icons/info';
	import PenLine from '@lucide/svelte/icons/pen-line';
	import Search from '@lucide/svelte/icons/search';
	import Undo2 from '@lucide/svelte/icons/undo-2';
	import { onDestroy, onMount, untrack } from 'svelte';
	import { toast } from 'svelte-sonner';
	import { resolve } from '$app/paths';
	import PlaceSheet from '#lib/components/shared/PlaceSheet.svelte';
	import type { SheetTarget } from '#lib/components/shared/PlaceSheet.types.js';
	import PageHeader from '#lib/components/shell/PageHeader.svelte';
	import { holdRefresh } from '#lib/components/shell/refresh.svelte.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Command from '#lib/components/ui/command/index.js';
	import * as Empty from '#lib/components/ui/empty/index.js';
	import { Kbd } from '#lib/components/ui/kbd/index.js';
	import { Progress } from '#lib/components/ui/progress/index.js';
	import * as ToggleGroup from '#lib/components/ui/toggle-group/index.js';
	import { getAppData } from '#lib/content/app-data.svelte.js';
	import type { ContentArea, ContentPlace } from '#lib/content/types.js';
	import AreaCard from '#lib/features/cards/AreaCard.svelte';
	import { canUndo, setCall, undoLast, verdictsOf } from '#lib/features/cards/calls.svelte.js';
	import { haptic } from '#lib/features/cards/haptic.js';
	import type { Round, Verdict } from '#lib/features/cards/model.js';
	import PlaceCard from '#lib/features/cards/PlaceCard.svelte';
	import { VERDICTS } from '#lib/features/cards/verdicts.js';
	import { cn } from '#lib/utils.js';
	import DeckNotePanel from './DeckNotePanel.svelte';
	import {
		areaDeck,
		arrangeDeck,
		deckFilters,
		hapticMs,
		isLaterDrag,
		KEY_VERDICT,
		leanAmount,
		leanOf,
		leftByCountry,
		pickFirst,
		placeDeck,
		putOff,
		releaseVerdict,
		SWIPE_DISTANCE,
		TAP_SLOP,
	} from './deck.ts';
	import { deckFilter, deckOrder, loadDeckOrder, setDeckOrder } from './local.svelte.ts';

	interface Props {
		round: Round;
	}

	let { round }: Props = $props();
	const app = getAppData();

	type Card = { round: 'place'; item: ContentPlace } | { round: 'area'; item: ContentArea };

	const verdicts = $derived(verdictsOf(app.feedback));
	const notes = $derived(app.feedback?.notes ?? { area: {}, place: {} });
	const all: readonly (ContentPlace | ContentArea)[] = $derived(
		round === 'area' ? app.content.areas : app.content.places,
	);
	const filter = $derived(deckFilter[round]);
	const order = $derived(deckOrder[round]);
	/** The cards left for a country filter, in deck order with the traveler's Later and Find choices applied. */
	const deckFor = (f: string): Card[] =>
		round === 'area'
			? arrangeDeck(areaDeck(app.content.areas, app.content.countries, verdicts, f), order).map(
					(item) => ({ round: 'area' as const, item }),
				)
			: arrangeDeck(
					placeDeck(app.content.places, app.content.areas, app.content.countries, verdicts, f),
					order,
				).map((item) => ({ round: 'place' as const, item }));
	const items: Card[] = $derived(deckFor(filter));
	/** Every card left, whatever the country filter: the Find list. */
	const allLeft: Card[] = $derived(filter === 'all' ? items : deckFor('all'));
	const stack = $derived(items.slice(0, 3));
	const top = $derived(stack[0]);
	const done = $derived(all.filter((x) => verdicts[round][x.id] !== undefined).length);
	const left = $derived(leftByCountry(all, round, verdicts));
	const filters = $derived(deckFilters(app.content.countries, left));
	const counts = $derived.by(() => {
		const v = Object.values(verdicts.place);
		return {
			must: v.filter((x) => x === 'must').length,
			maybe: v.filter((x) => x === 'maybe').length,
			mustAreas: Object.values(verdicts.area).filter((x) => x === 'must').length,
		};
	});
	const countryName = (id: string): string =>
		app.content.countries.find((c) => c.id === id)?.name ?? id;
	const noteOn = (c: Card): string => notes[c.round][c.item.id] ?? '';

	// ---- the sheet
	let sheet: SheetTarget | null = $state(null);
	const openCard = (c: Card): void => {
		noteOpen = false;
		sheet = { kind: c.round, id: c.item.id };
	};

	// ---- a new top card: the note panel closes and the time on screen (ms) starts again
	let noteOpen = $state(false);
	let shownAt = 0;
	let lastTop: string | undefined;
	const topId = $derived(top === undefined ? undefined : `${top.round}:${top.item.id}`);
	$effect(() => {
		const id = topId;
		if (id === lastTop) return;
		lastTop = id;
		shownAt = performance.now();
		untrack(() => {
			noteOpen = false;
		});
	});

	// ---- swiping
	interface Flying {
		key: number;
		card: Card;
		verdict: Verdict;
		from: { dx: number; dy: number };
	}
	let flying: Flying[] = $state([]);
	let flyKey = 0;
	let swiping = false;
	let pressed: Verdict | null = $state(null);
	let pressTimer: ReturnType<typeof setTimeout> | undefined;
	const reduced = (): boolean => matchMedia('(prefers-reduced-motion: reduce)').matches;

	function press(v: Verdict): void {
		clearTimeout(pressTimer);
		pressed = v;
		pressTimer = setTimeout(() => {
			pressed = null;
		}, 160);
	}

	function swipe(verdict: Verdict, from: { dx: number; dy: number } = { dx: 0, dy: 0 }): boolean {
		const card = top;
		if (card === undefined || swiping || app.isGuest) return false;
		swiping = true;
		noteOpen = false;
		const ms = Math.round(performance.now() - shownAt);
		haptic(hapticMs(verdict));
		flying.push({ key: ++flyKey, card, verdict, from });
		const prev = verdicts[card.round][card.item.id];
		void setCall(card.round, card.item.id, verdict, prev, { ms, undo: true });
		setTimeout(
			() => {
				swiping = false;
			},
			reduced() ? 0 : 300,
		);
		return true;
	}

	/** The flown card's exit (old swipeTop transforms), then it is dropped. */
	function flyOut(f: Flying) {
		return (el: HTMLElement): (() => void) => {
			const release = holdRefresh();
			const W = window.innerWidth;
			const { dx, dy } = f.from;
			const start = `translate(${String(dx)}px, ${String(dy)}px) rotate(${String(dx * 0.05)}deg)`;
			const end =
				f.verdict === 'must'
					? `translate(${String(W)}px, ${String(dy + 40)}px) rotate(28deg)`
					: f.verdict === 'skip'
						? `translate(${String(-W)}px, ${String(dy + 40)}px) rotate(-28deg)`
						: `translate(${String(dx)}px, ${String(-window.innerHeight)}px) rotate(${String(dx * 0.05)}deg)`;
			const anim = el.animate(
				[
					{ transform: start, opacity: 1 },
					{ transform: end, opacity: 0 },
				],
				{ duration: reduced() ? 0 : 420, easing: 'cubic-bezier(.3,.6,.4,1)', fill: 'forwards' },
			);
			anim.onfinish = () => {
				flying = flying.filter((x) => x.key !== f.key);
			};
			return () => {
				anim.cancel();
				release();
			};
		};
	}

	/** Drag on the top card (old bindTopCard). */
	function drag(c: Card) {
		return (el: HTMLElement): (() => void) => {
			let sx = 0;
			let sy = 0;
			let dx = 0;
			let dy = 0;
			let dragging = false;
			let moved = false;
			let t0 = 0;
			let pid = -1;
			const stamps = (): NodeListOf<HTMLElement> => el.querySelectorAll('[data-stamp]');
			const setLean = (lean: Verdict | 'later' | null, amount: number): void => {
				for (const s of stamps())
					s.style.opacity = s.dataset['stamp'] === lean ? String(amount) : '';
			};
			const down = (e: PointerEvent): void => {
				if (e.button !== 0 && e.pointerType === 'mouse') return;
				// The note panel sits on the card: a press in it is typing or tapping, never a drag.
				if (e.target instanceof Element && e.target.closest('[data-deck-note]') !== null) return;
				dragging = true;
				moved = false;
				sx = e.clientX;
				sy = e.clientY;
				dx = 0;
				dy = 0;
				t0 = performance.now();
				pid = e.pointerId;
				el.setPointerCapture(pid);
				el.style.transition = 'none';
			};
			const move = (e: PointerEvent): void => {
				if (!dragging) return;
				dx = e.clientX - sx;
				dy = e.clientY - sy;
				if (Math.abs(dx) + Math.abs(dy) > TAP_SLOP) moved = true;
				if (app.isGuest) return;
				el.style.transform = `translate(${String(dx)}px, ${String(dy)}px) rotate(${String(dx * 0.05)}deg)`;
				if (isLaterDrag(dx, dy, 30)) setLean('later', Math.min(1, dy / SWIPE_DISTANCE));
				else setLean(leanOf(dx, dy), leanAmount(dx, dy));
			};
			const end = (): void => {
				if (!dragging) return;
				dragging = false;
				try {
					el.releasePointerCapture(pid);
				} catch {
					// already released
				}
				const dt = performance.now() - t0;
				if (!moved) {
					el.style.transition = '';
					el.style.transform = '';
					openCard(c);
					return;
				}
				const verdict = app.isGuest ? null : releaseVerdict(dx, dy, dt);
				if (verdict !== null && swipe(verdict, { dx, dy })) {
					// The flying copy takes over; if the card is still here later (the write failed), it comes back.
					el.style.visibility = 'hidden';
					setTimeout(() => {
						el.style.visibility = '';
						el.style.transition = '';
						el.style.transform = '';
						setLean(null, 0);
					}, 450);
					return;
				}
				if (verdict === null && !app.isGuest && isLaterDrag(dx, dy) && later()) {
					// The card drops to the back of the stack: no spring back to the top.
					el.style.transition = '';
					el.style.transform = '';
					setLean(null, 0);
					return;
				}
				el.style.transition = 'transform .35s cubic-bezier(.2,1.4,.4,1)';
				el.style.transform = '';
				setLean(null, 0);
				setTimeout(() => {
					el.style.transition = '';
				}, 360);
			};
			const click = (e: MouseEvent): void => {
				e.preventDefault();
			};
			el.addEventListener('pointerdown', down);
			el.addEventListener('pointermove', move);
			el.addEventListener('pointerup', end);
			el.addEventListener('pointercancel', end);
			el.addEventListener('click', click);
			return () => {
				el.removeEventListener('pointerdown', down);
				el.removeEventListener('pointermove', move);
				el.removeEventListener('pointerup', end);
				el.removeEventListener('pointercancel', end);
				el.removeEventListener('click', click);
			};
		};
	}

	// ---- Later and Find: reorder the deck without making a call
	let findOpen = $state(false);
	const putOffIds = $derived(new Set(order.later));

	function later(): boolean {
		const card = top;
		if (card === undefined || swiping || items.length < 2) return false;
		noteOpen = false;
		haptic(8);
		setDeckOrder(round, putOff(order, card.item.id));
		return true;
	}

	function pick(c: Card): void {
		findOpen = false;
		noteOpen = false;
		setDeckOrder(round, pickFirst(order, c.item.id));
		if (filter !== 'all' && c.item.country !== filter) deckFilter[round] = 'all';
	}

	onMount(loadDeckOrder);

	function undo(): void {
		if (undoLast(round) === null) return;
		noteOpen = false;
		toast('Card is back. Swipe it again to change your call.');
	}

	function onkeydown(e: KeyboardEvent): void {
		const t = e.target;
		if (t instanceof Element && t.closest('input, textarea, select, [contenteditable]')) return;
		if (e.metaKey || e.ctrlKey || e.altKey) return;
		if (sheet !== null || findOpen) return; // the sheet and the Find list handle their own keys
		const k = KEY_VERDICT[e.key];
		if (k !== undefined && top !== undefined) {
			e.preventDefault();
			if (app.isGuest) return;
			press(k);
			swipe(k);
		} else if (e.key === 'ArrowDown' && top !== undefined) {
			e.preventDefault();
			later();
		} else if ((e.key === 'f' || e.key === 'F' || e.key === '/') && allLeft.length > 0) {
			e.preventDefault();
			findOpen = true;
		} else if (e.key === 'z' || e.key === 'Z' || e.key === 'Backspace') {
			if (!canUndo(round)) return;
			e.preventDefault();
			undo();
		} else if (
			(e.key === ' ' || e.key === 'Enter') &&
			top !== undefined &&
			!(t instanceof Element && t.closest('button, a'))
		) {
			e.preventDefault();
			openCard(top);
		} else if ((e.key === 'n' || e.key === 'N') && top !== undefined) {
			e.preventDefault();
			if (!app.isGuest) noteOpen = true;
		} else if (e.key === 'Escape' && noteOpen) {
			e.preventDefault();
			noteOpen = false;
		}
	}

	function setFilter(value: string): void {
		if (value !== '') deckFilter[round] = value;
	}

	onDestroy(() => {
		clearTimeout(pressTimer);
	});

	// The stack: the cards behind peek out a little below the top one.
	const DEPTH = [
		'z-30 cursor-grab active:cursor-grabbing',
		'z-20 translate-y-2 scale-95 brightness-97',
		'z-10 translate-y-4 scale-90 opacity-80 brightness-94',
	] as const;
	const topNote = $derived(top === undefined ? '' : noteOn(top));
	const next = $derived(
		round === 'area'
			? { href: resolve('/(app)/decide/swipe'), label: 'On to the attractions' }
			: counts.must + counts.maybe >= 2
				? { href: resolve('/(app)/decide/duels'), label: 'Start the duels' }
				: { href: resolve('/(app)/decide/board'), label: 'See the board' },
	);
	/** This round's calls so far, for the side panel. */
	const tally = $derived.by(() => {
		const v = Object.values(verdicts[round]);
		return (['must', 'maybe', 'skip'] as const).map((k) => ({
			k,
			n: v.filter((x) => x === k).length,
		}));
	});
	const upNext = $derived(items.slice(1, 6));
	const pctDone = $derived(all.length === 0 ? 0 : Math.round((done / all.length) * 100));
	const SMALL_BTN =
		'grid size-11 shrink-0 place-items-center rounded-full bg-card/80 text-muted-foreground shadow-flat ring-1 ring-border transition duration-200 ease-spring enabled:hover:text-foreground enabled:active:scale-90 disabled:cursor-not-allowed disabled:opacity-40';
	const KEYS = [
		['←', 'Skip'],
		['↑', 'Maybe'],
		['→', 'Must'],
		['↓', 'Later'],
		['Z', 'Undo'],
		['N', 'Note'],
		['F', 'Find'],
		['Space', 'Details'],
	] as const;
</script>

<svelte:window {onkeydown} />

{#snippet stamps(lean: Verdict | null)}
	<span
		data-stamp="must"
		class={cn(
			'pointer-events-none absolute top-16 left-5 z-10 -rotate-14 rounded-xl border-4 border-current bg-background/90 px-3.5 py-2 text-3xl leading-none font-extrabold tracking-widest text-must uppercase opacity-0 shadow-soft md:top-10',
			lean === 'must' && 'opacity-100',
		)}>Must</span
	>
	<span
		data-stamp="skip"
		class={cn(
			'pointer-events-none absolute top-16 right-5 z-10 rotate-14 rounded-xl border-4 border-current bg-background/90 px-3.5 py-2 text-3xl leading-none font-extrabold tracking-widest text-skip uppercase opacity-0 shadow-soft md:top-10',
			lean === 'skip' && 'opacity-100',
		)}>Skip</span
	>
	<span
		data-stamp="maybe"
		class={cn(
			'pointer-events-none absolute bottom-1/2 left-1/2 z-10 -translate-x-1/2 -rotate-4 rounded-xl border-4 border-current bg-background/90 px-3.5 py-2 text-3xl leading-none font-extrabold tracking-widest text-maybe uppercase opacity-0 shadow-soft',
			lean === 'maybe' && 'opacity-100',
		)}>Maybe</span
	>
	<span
		data-stamp="later"
		class="pointer-events-none absolute top-1/3 left-1/2 z-10 -translate-x-1/2 rotate-3 rounded-xl border-4 border-current bg-background/90 px-3.5 py-2 text-3xl leading-none font-extrabold tracking-widest text-muted-foreground uppercase opacity-0 shadow-soft"
		>Later</span
	>
{/snippet}

{#snippet cardBody(c: Card, noted: boolean)}
	{#if c.round === 'area'}
		<AreaCard area={c.item} categories={app.content.categories} {noted} fill />
	{:else}
		<PlaceCard place={c.item} {noted} fill />
	{/if}
{/snippet}

{#if all.length === 0}
	<Empty.Root>
		<Empty.Header>
			<Empty.Media
				><span class="text-5xl" aria-hidden="true">{round === 'area' ? '🗺️' : '🧭'}</span
				></Empty.Media
			>
			<Empty.Title><h1>{round === 'area' ? 'No area cards yet' : 'No places yet'}</h1></Empty.Title>
			<Empty.Description>
				{round === 'area'
					? 'The curator is still researching regions and cities (Harbin? Chongqing? Kyoto?). They’ll appear here as swipeable cards. Meanwhile, the attraction deck is ready.'
					: 'The curator hasn’t added attractions yet. Check back in a bit; this page refreshes itself.'}
			</Empty.Description>
		</Empty.Header>
		<Empty.Content>
			<Button href={round === 'area' ? resolve('/(app)/decide/swipe') : resolve('/(app)/decide')}>
				{round === 'area' ? 'Go to the swipe round' : 'Back to the overview'} →
			</Button>
		</Empty.Content>
	</Empty.Root>
{:else}
	<section class="page-wide flex deck-h flex-col gap-3 max-md:-mb-6 md:gap-4" data-deck={round}>
		<PageHeader
			eyebrow={round === 'area' ? 'Step 1 · Regions & cities' : 'Step 2 · Attractions'}
			title={round === 'area' ? 'Areas round' : 'Swipe round'}
			class="mb-0 flex-row items-end justify-between gap-4 md:mb-0"
		>
			{#snippet actions()}
				<div
					class="flex min-w-28 flex-col items-end gap-1.5 md:min-w-48"
					title={`${String(done)} of ${String(all.length)} swiped`}
					data-deck-progress
				>
					<span class="text-sm whitespace-nowrap text-muted-foreground nums"
						><b class="font-serif text-lg font-semibold text-foreground md:text-xl">{done}</b> / {all.length}
						<span class="mx-0.5 text-muted-foreground/50" aria-hidden="true">·</span>
						<span data-deck-left>{items.length} left</span></span
					>
					<Progress value={pctDone} max={100} aria-label="Swiped so far" />
				</div>
			{/snippet}
		</PageHeader>

		<div class="flex min-h-0 flex-1 gap-6 3xl:gap-8">
			<div class="flex min-h-0 min-w-0 flex-1 flex-col gap-3 md:gap-4">
				<div
					class={cn('flex items-center gap-2', items.length === 0 && filter === 'all' && 'hidden')}
				>
					<div
						class="-my-1 no-scrollbar min-w-0 flex-1 overflow-x-auto mask-r-from-85% py-1 md:mask-none"
					>
						<ToggleGroup.Root
							type="single"
							variant="pill"
							size="sm"
							spacing={1.5}
							value={filter}
							onValueChange={setFilter}
							aria-label="Country"
						>
							{#each filters as f (f.id)}
								<ToggleGroup.Item value={f.id}>
									{f.label} <span class="nums opacity-60">{f.count}</span>
								</ToggleGroup.Item>
							{/each}
							{#if filter !== 'all' && !filters.some((f) => f.id === filter)}
								<ToggleGroup.Item value={filter}
									>{countryName(filter)} <span class="opacity-60">0</span></ToggleGroup.Item
								>
							{/if}
						</ToggleGroup.Root>
					</div>
					{#if allLeft.length > 0}
						<Button
							variant="ghost"
							size="sm"
							class="shrink-0"
							aria-label="Find a card (F)"
							aria-keyshortcuts="F"
							title="Find a card among the ones left (F)"
							onclick={() => {
								findOpen = true;
							}}
						>
							<Search data-icon="inline-start" /><span class="max-md:sr-only">Find</span>
						</Button>
					{/if}
					{#if stack.length > 0}
						<Button
							variant="ghost"
							size="sm"
							class="shrink-0"
							disabled={items.length < 2}
							aria-label="Later (↓)"
							aria-keyshortcuts="ArrowDown"
							title="Decide later: send this card to the back of the deck (↓)"
							onclick={later}
						>
							<Clock data-icon="inline-start" /><span class="max-md:sr-only">Later</span>
						</Button>
						<Button
							variant="ghost"
							size="sm"
							class="shrink-0"
							aria-label="Details"
							aria-keyshortcuts="Space"
							onclick={() => {
								if (top !== undefined) openCard(top);
							}}
						>
							<Info data-icon="inline-start" /><span class="max-md:sr-only">Details</span>
						</Button>
					{/if}
				</div>

				{#if app.isGuest}
					<p class="-mt-1 text-sm text-muted-foreground">
						Read only: guests can look through the deck but not make calls.
					</p>
				{/if}

				<div class="relative mb-4 min-h-0 flex-1 touch-none select-none" data-deck-stack>
					{#if stack.length > 0}
						{#each stack.toReversed() as c (`${c.round}:${c.item.id}`)}
							{@const depth = stack.indexOf(c)}
							<div
								class={cn(
									'absolute inset-0 origin-bottom rounded-2xl transition duration-300 ease-spring',
									DEPTH[depth] ?? DEPTH[2],
									depth === 0 ? 'shadow-big' : 'shadow-soft',
								)}
								data-deck-card={c.item.id}
								data-depth={depth}
								aria-hidden={depth === 0 ? undefined : 'true'}
								{@attach depth === 0 ? drag(c) : undefined}
							>
								{@render cardBody(c, noteOn(c) !== '')}
								{@render stamps(null)}
								{#if depth === 0 && noteOpen}
									<DeckNotePanel
										round={c.round}
										id={c.item.id}
										name={c.item.name}
										short={c.round === 'place' ? (c.item.short ?? c.item.name) : c.item.name}
										onclose={() => {
											noteOpen = false;
										}}
									/>
								{/if}
							</div>
						{/each}
					{:else}
						<div
							class="flex h-full flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border bg-card/50 p-6 text-center"
							data-deck-done
						>
							<div
								class="grid size-20 place-items-center rounded-full bg-cat/10 text-4xl motion-safe:animate-in motion-safe:zoom-in-75"
								aria-hidden="true"
							>
								🎉
							</div>
							<h2 class="font-serif text-2xl font-semibold md:text-3xl">
								{filter !== 'all' ? `${countryName(filter)} cleared!` : 'Deck cleared!'}
							</h2>
							<p class="max-w-sm text-muted-foreground">
								{round === 'area'
									? `${String(counts.mustAreas)} must-go areas.`
									: `${String(counts.must)} Musts · ${String(counts.maybe)} Maybes so far.`} New cards
								from the curator land here automatically.
							</p>
							<Button href={next.href} class="mt-1">{next.label} →</Button>
							{#if filter !== 'all'}
								<Button
									variant="link"
									onclick={() => {
										setFilter('all');
									}}>Show all countries</Button
								>
							{/if}
						</div>
					{/if}
					{#each flying as f (f.key)}
						<div
							class="pointer-events-none absolute inset-0 z-40 rounded-2xl shadow-big"
							aria-hidden="true"
							{@attach flyOut(f)}
						>
							{@render cardBody(f.card, noteOn(f.card) !== '')}
							{@render stamps(f.verdict)}
						</div>
					{/each}
				</div>

				{#if stack.length > 0}
					<div class="flex shrink-0 items-center justify-center gap-3 md:gap-5" data-deck-controls>
						<button
							type="button"
							class={cn(SMALL_BTN)}
							disabled={!canUndo(round)}
							aria-label="Undo (Z)"
							aria-keyshortcuts="Z"
							title="Undo (Z)"
							onclick={undo}
						>
							<Undo2 class="size-5" aria-hidden="true" />
						</button>
						{#each ['skip', 'maybe', 'must'] as const as k (k)}
							{@const V = VERDICTS[k]}
							<button
								type="button"
								data-verdict={k}
								aria-label={`${V.label} (${V.key})`}
								aria-keyshortcuts={k === 'skip'
									? 'ArrowLeft'
									: k === 'must'
										? 'ArrowRight'
										: 'ArrowUp'}
								title={`${V.label} (${V.key})`}
								disabled={app.isGuest}
								onclick={() => {
									swipe(k);
								}}
								class={cn(
									'grid place-items-center content-center gap-0.5 rounded-full bg-card text-2xs font-bold tracking-widest uppercase shadow-soft ring-1 transition duration-200 ease-spring enabled:active:scale-90 disabled:cursor-not-allowed disabled:opacity-50',
									k === 'maybe' ? 'size-15 md:size-16' : 'size-17 md:size-18',
									k === 'must' &&
										'text-must ring-must/30 enabled:hover:bg-must enabled:hover:text-primary-foreground',
									k === 'skip' &&
										'text-skip ring-skip/30 enabled:hover:bg-skip enabled:hover:text-primary-foreground',
									k === 'maybe' &&
										'text-maybe ring-maybe/30 enabled:hover:bg-maybe enabled:hover:text-primary-foreground',
									pressed === k && 'scale-90 text-primary-foreground',
									pressed === k && k === 'must' && 'bg-must',
									pressed === k && k === 'skip' && 'bg-skip',
									pressed === k && k === 'maybe' && 'bg-maybe',
								)}
							>
								<V.icon
									class={k === 'maybe' ? 'size-5.5' : 'size-6.5'}
									strokeWidth={2.4}
									aria-hidden="true"
								/>
								<span>{V.label}</span>
							</button>
						{/each}
						<button
							type="button"
							class={cn(
								SMALL_BTN,
								'relative',
								noteOpen && 'bg-note/12 text-note ring-note/30',
								topNote !== '' && 'text-note',
							)}
							disabled={app.isGuest}
							aria-expanded={noteOpen}
							aria-keyshortcuts="N"
							aria-label={topNote !== '' ? 'Edit your note (N)' : 'Add a note (N)'}
							title={topNote !== '' ? 'Edit your note (N)' : 'Add a note (N)'}
							onclick={() => {
								noteOpen = !noteOpen;
							}}
						>
							<PenLine class="size-5" aria-hidden="true" />
							{#if topNote !== ''}
								<span
									class="absolute top-1.5 right-1.5 size-2 rounded-full bg-note ring-2 ring-card"
									aria-hidden="true"
								></span>
							{/if}
						</button>
					</div>
				{/if}
			</div>

			<aside
				class="hidden w-80 shrink-0 flex-col gap-5 overflow-y-auto panel p-5 xl:flex 3xl:w-96 3xl:p-6"
				aria-label="Round summary"
			>
				<div class="flex flex-col gap-3">
					<p class="eyebrow">Your calls this round</p>
					<div class="grid grid-cols-3 gap-2">
						{#each tally as t (t.k)}
							<div class="flex flex-col items-center rounded-xl bg-muted/60 py-3">
								<b
									class={cn(
										'font-serif text-2xl leading-none font-semibold nums',
										t.k === 'must' && 'text-must',
										t.k === 'maybe' && 'text-maybe',
										t.k === 'skip' && 'text-skip',
									)}>{t.n}</b
								>
								<span class="mt-1 text-xs text-muted-foreground">{VERDICTS[t.k].label}</span>
							</div>
						{/each}
					</div>
					<p class="text-sm text-muted-foreground">
						<b class="text-foreground nums">{pctDone}%</b> of the {round === 'area'
							? 'regions and cities'
							: 'attractions'} called.
					</p>
				</div>

				{#if upNext.length > 0}
					<div class="flex flex-col gap-2 border-t border-border/70 pt-5">
						<div class="flex items-center justify-between gap-2">
							<p class="eyebrow">Up next</p>
							<Button
								variant="link"
								size="xs"
								onclick={() => {
									findOpen = true;
								}}>All {allLeft.length} left</Button
							>
						</div>
						<ul class="-mx-2 flex flex-col">
							{#each upNext as c (`${c.round}:${c.item.id}`)}
								<li>
									<button
										type="button"
										class="flex w-full items-center gap-3 rounded-xl px-2 py-1.5 text-left transition-colors hover:bg-muted/70"
										onclick={() => {
											openCard(c);
										}}
									>
										<span
											class="grid size-9 shrink-0 place-items-center rounded-lg bg-muted text-lg"
											aria-hidden="true"
											>{c.round === 'area' ? c.item.flag || '🗺️' : c.item.card.categoryIcon}</span
										>
										<span class="flex min-w-0 flex-col">
											<span class="truncate text-sm font-medium">{c.item.name}</span>
											<span class="truncate text-xs text-muted-foreground"
												>{c.round === 'area'
													? (c.item.region ?? countryName(c.item.country))
													: `${c.item.cityName} · ${c.item.card.categoryLabel}`}</span
											>
										</span>
									</button>
								</li>
							{/each}
						</ul>
					</div>
				{/if}

				<div class="mt-auto flex flex-col gap-2 border-t border-border/70 pt-5">
					<p class="eyebrow">Keys</p>
					<dl class="grid grid-cols-2 gap-x-3 gap-y-1.5 text-sm text-muted-foreground">
						{#each KEYS as [key, label] (key)}
							<div class="flex items-center gap-2">
								<dt><Kbd>{key}</Kbd></dt>
								<dd>{label}</dd>
							</div>
						{/each}
					</dl>
					<p class="text-xs text-muted-foreground">
						Or drag the card: right for Must, left for Skip, up for Maybe, down for Later. Click it
						for the details.
					</p>
				</div>
			</aside>
		</div>
	</section>
{/if}

<Command.Dialog
	bind:open={findOpen}
	title="Find a card"
	description="Every card left to decide. Pick one to bring it to the top of the deck."
>
	<Command.Input placeholder={`Search the ${String(allLeft.length)} cards left…`} />
	<Command.List>
		<Command.Empty>No card left matches.</Command.Empty>
		{#each allLeft as c (`${c.round}:${c.item.id}`)}
			{@const where =
				c.round === 'area'
					? (c.item.region ?? countryName(c.item.country))
					: `${c.item.cityName} · ${c.item.card.categoryLabel}`}
			<Command.Item
				value={c.item.id}
				keywords={[c.item.name, where, countryName(c.item.country)]}
				data-find-card={c.item.id}
				onSelect={() => {
					pick(c);
				}}
			>
				<span aria-hidden="true"
					>{c.round === 'area' ? c.item.flag || '🗺️' : c.item.card.categoryIcon}</span
				>
				<span class="flex min-w-0 flex-1 flex-col">
					<span class="truncate font-medium">{c.item.name}</span>
					<span class="truncate text-xs text-muted-foreground">{where}</span>
				</span>
				{#if putOffIds.has(c.item.id)}
					<span class="shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground"
						>Later</span
					>
				{/if}
			</Command.Item>
		{/each}
	</Command.List>
</Command.Dialog>

<PlaceSheet
	target={sheet}
	onclose={() => {
		sheet = null;
	}}
/>
