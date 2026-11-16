<!--
	The Areas and Swipe rounds (old game.js viewDeck, bindTopCard, swipeTop, undo, the deck note panel and the deck
	keys). Three cards stacked; drag the top one (110 px or a 0.6 px/ms flick sideways, 110 px up) or use the
	buttons or keys: ← Skip, ↑ Maybe, → Must; Z or Backspace undo (local only); Space or Enter open; N note;
	Escape closes the note panel. Haptics: 8 ms on Skip, 14 on Must and Maybe. A tap opens the place or area sheet.
	The guest sees the deck and opens cards; the calls and the note are disabled.
-->
<script lang="ts">
	import PenLine from '@lucide/svelte/icons/pen-line';
	import Undo2 from '@lucide/svelte/icons/undo-2';
	import { onDestroy, untrack } from 'svelte';
	import { toast } from 'svelte-sonner';
	import { resolve } from '$app/paths';
	import PlaceSheet from '#lib/components/shared/PlaceSheet.svelte';
	import type { SheetTarget } from '#lib/components/shared/PlaceSheet.types.js';
	import { holdRefresh } from '#lib/components/shell/refresh.svelte.js';
	import { Button } from '#lib/components/ui/button/index.js';
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
		deckFilters,
		hapticMs,
		KEY_VERDICT,
		leanAmount,
		leanOf,
		leftByCountry,
		placeDeck,
		releaseVerdict,
		TAP_SLOP,
	} from './deck.ts';
	import { deckFilter } from './local.svelte.ts';

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
	const items: Card[] = $derived(
		round === 'area'
			? areaDeck(app.content.areas, app.content.countries, verdicts, filter).map((item) => ({
					round: 'area' as const,
					item,
				}))
			: placeDeck(
					app.content.places,
					app.content.areas,
					app.content.countries,
					verdicts,
					filter,
				).map((item) => ({ round: 'place' as const, item })),
	);
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
			const setLean = (lean: Verdict | null, amount: number): void => {
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
				setLean(leanOf(dx, dy), leanAmount(dx, dy));
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

	function undo(): void {
		if (undoLast(round) === null) return;
		noteOpen = false;
		toast('Card is back. Swipe it again to change your call.');
	}

	function onkeydown(e: KeyboardEvent): void {
		const t = e.target;
		if (t instanceof Element && t.closest('input, textarea, select, [contenteditable]')) return;
		if (e.metaKey || e.ctrlKey || e.altKey) return;
		if (sheet !== null) return; // the sheet handles Escape itself
		const k = KEY_VERDICT[e.key];
		if (k !== undefined && top !== undefined) {
			e.preventDefault();
			if (app.isGuest) return;
			press(k);
			swipe(k);
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

	const DEPTH = [
		'z-30 cursor-grab active:cursor-grabbing',
		'z-20 translate-y-3.5 scale-95 brightness-97',
		'z-10 translate-y-7 scale-91 opacity-90 brightness-94',
	] as const;
	const topNote = $derived(top === undefined ? '' : noteOn(top));
	const next = $derived(
		round === 'area'
			? { href: resolve('/(app)/decide/swipe'), label: 'On to the attractions' }
			: counts.must + counts.maybe >= 2
				? { href: resolve('/(app)/decide/duels'), label: 'Start the duels' }
				: { href: resolve('/(app)/decide/board'), label: 'See the board' },
	);
</script>

<svelte:window {onkeydown} />

{#snippet stamps(lean: Verdict | null)}
	<span
		data-stamp="must"
		class={cn(
			'pointer-events-none absolute top-24 left-5 z-10 -rotate-14 rounded-xl border-4 border-current bg-background/90 px-3.5 py-2 text-3xl leading-none font-extrabold tracking-widest text-must uppercase opacity-0 md:top-10',
			lean === 'must' && 'opacity-100',
		)}>Must</span
	>
	<span
		data-stamp="skip"
		class={cn(
			'pointer-events-none absolute top-24 right-5 z-10 rotate-14 rounded-xl border-4 border-current bg-background/90 px-3.5 py-2 text-3xl leading-none font-extrabold tracking-widest text-skip uppercase opacity-0 md:top-10',
			lean === 'skip' && 'opacity-100',
		)}>Skip</span
	>
	<span
		data-stamp="maybe"
		class={cn(
			'pointer-events-none absolute bottom-1/2 left-1/2 z-10 -translate-x-1/2 -rotate-4 rounded-xl border-4 border-current bg-background/90 px-3.5 py-2 text-3xl leading-none font-extrabold tracking-widest text-maybe uppercase opacity-0',
			lean === 'maybe' && 'opacity-100',
		)}>Maybe</span
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
	<section class="mx-auto flex max-w-3xl flex-col gap-3" data-deck={round}>
		<header class="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
			<div>
				<p class="text-xs font-semibold tracking-widest text-muted-foreground uppercase">
					{round === 'area' ? 'Step 1 · regions & cities' : 'Step 2 · attractions'}
				</p>
				<h1 class="font-serif text-3xl font-semibold">
					{round === 'area' ? 'Areas round' : 'Swipe round'}
				</h1>
			</div>
			<div
				class="flex w-28 flex-col gap-1 sm:w-40"
				title={`${String(done)} of ${String(all.length)} swiped`}
				data-deck-progress
			>
				<span class="text-right text-sm text-muted-foreground"
					><b class="text-foreground">{done}</b> / {all.length}</span
				>
				<Progress value={all.length === 0 ? 0 : Math.round((done / all.length) * 100)} max={100} />
			</div>
		</header>

		<div class="-mx-4 overflow-x-auto px-4 pb-1">
			<ToggleGroup.Root
				type="single"
				variant="outline"
				size="sm"
				value={filter}
				onValueChange={setFilter}
				aria-label="Country"
			>
				{#each filters as f (f.id)}
					<ToggleGroup.Item value={f.id}>
						{f.label} <span class="text-muted-foreground">{f.count}</span>
					</ToggleGroup.Item>
				{/each}
				{#if filter !== 'all' && !filters.some((f) => f.id === filter)}
					<ToggleGroup.Item value={filter}>{countryName(filter)} <span>0</span></ToggleGroup.Item>
				{/if}
			</ToggleGroup.Root>
		</div>

		{#if app.isGuest}
			<p class="text-sm text-muted-foreground">
				Read only: guests can look through the deck but not make calls.
			</p>
		{/if}

		<div class="flex flex-col items-center gap-4">
			<div
				class={cn(
					'relative mx-auto mt-1 mb-7 w-full max-w-95 touch-none select-none',
					'h-96 sm:h-128',
					round === 'place' ? 'md:h-108 md:max-w-180' : 'md:h-120 md:max-w-205',
				)}
				data-deck-stack
			>
				{#if stack.length > 0}
					{#each stack.toReversed() as c (`${c.round}:${c.item.id}`)}
						{@const depth = stack.indexOf(c)}
						<div
							class={cn(
								'absolute inset-0 origin-bottom transition duration-300 ease-spring',
								DEPTH[depth] ?? DEPTH[2],
								depth === 0 && 'rounded-2xl shadow-big',
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
						class="flex h-full flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border p-6 text-center"
						data-deck-done
					>
						<div class="text-5xl" aria-hidden="true">🎉</div>
						<h2 class="font-serif text-2xl font-semibold">
							{filter !== 'all' ? `${countryName(filter)} cleared!` : 'Deck cleared!'}
						</h2>
						<p class="text-muted-foreground">
							{round === 'area'
								? `${String(counts.mustAreas)} must-go areas.`
								: `${String(counts.must)} Musts · ${String(counts.maybe)} Maybes so far.`} New cards from
							the curator land here automatically.
						</p>
						<Button href={next.href}>{next.label} →</Button>
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
				<div class="flex items-center gap-5" data-deck-controls>
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
							disabled={app.isGuest}
							onclick={() => {
								swipe(k);
							}}
							class={cn(
								'grid place-items-center content-center gap-1 rounded-full border border-border bg-card pt-0.5 text-xs font-bold tracking-widest uppercase shadow-soft transition duration-200 ease-spring enabled:hover:-translate-y-0.5 enabled:hover:scale-105 enabled:active:scale-90 disabled:cursor-not-allowed disabled:opacity-50',
								k === 'maybe' ? 'size-16' : 'size-18',
								k === 'must' &&
									'text-must enabled:hover:bg-must enabled:hover:text-primary-foreground',
								k === 'skip' &&
									'text-skip enabled:hover:bg-skip enabled:hover:text-primary-foreground',
								k === 'maybe' &&
									'text-maybe enabled:hover:bg-maybe enabled:hover:text-primary-foreground',
								pressed === k && 'scale-90 text-primary-foreground',
								pressed === k && k === 'must' && 'bg-must',
								pressed === k && k === 'skip' && 'bg-skip',
								pressed === k && k === 'maybe' && 'bg-maybe',
							)}
						>
							<V.icon class={k === 'maybe' ? 'size-5.5' : 'size-6.5'} aria-hidden="true" />
							<span>{V.label}</span>
						</button>
					{/each}
				</div>
				<div
					class="flex flex-wrap items-center justify-center gap-x-1 gap-y-1 text-sm"
					data-deck-subcontrols
				>
					<Button
						variant={noteOpen ? 'secondary' : 'ghost'}
						size="sm"
						disabled={app.isGuest}
						aria-expanded={noteOpen}
						aria-keyshortcuts="N"
						aria-label={topNote !== '' ? 'Edit your note (N)' : 'Add a note (N)'}
						onclick={() => {
							noteOpen = !noteOpen;
						}}
					>
						<PenLine data-icon="inline-start" />
						<span class={cn(topNote !== '' && 'text-note')}>Note</span>
						<Kbd>N</Kbd>
					</Button>
					<Button variant="ghost" size="sm" disabled={!canUndo(round)} onclick={undo}>
						<Undo2 data-icon="inline-start" />
						Undo <Kbd>Z</Kbd>
					</Button>
					<Button
						variant="ghost"
						size="sm"
						onclick={() => {
							if (top !== undefined) openCard(top);
						}}
					>
						Details <Kbd>Space</Kbd>
					</Button>
					<span class="px-2 text-muted-foreground" data-deck-left>{items.length} left</span>
				</div>
				<p class="hidden text-sm text-muted-foreground md:block">
					Drag the card, or use <Kbd>←</Kbd> Skip · <Kbd>↑</Kbd> Maybe · <Kbd>→</Kbd> Must
				</p>
			{/if}
		</div>
	</section>
{/if}

<PlaceSheet
	target={sheet}
	onclose={() => {
		sheet = null;
	}}
/>
