<!--
	Duels (old game.js viewDuels, pickDuel, skipDuel): this-or-that between Must and Maybe picks, mostly within one
	country (pickPair from @atr/shared, same rules as game/lib/pairing.js), with the ranking confidence, the country
	filters and the live ranking beside the arena.
	Keys: ←, A or 1 pick left; →, D or 2 pick right; ↓ or S "Can't decide" (logs nothing). Haptic 12 ms on a pick.
	A pick is optimistic: the ranking moves at once, the next pair comes 620 ms later.
	The guest sees the pairs and the ranking and can skip; picking is disabled.
-->
<script lang="ts">
	import { update } from '@atr/shared/elo';
	import { onDestroy } from 'svelte';
	import { fly } from 'svelte/transition';
	import { resolve } from '$app/paths';
	import PlaceSheet from '#lib/components/shared/PlaceSheet.svelte';
	import type { SheetTarget } from '#lib/components/shared/PlaceSheet.types.js';
	import { holdRefresh } from '#lib/components/shell/refresh.svelte.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Empty from '#lib/components/ui/empty/index.js';
	import { Kbd } from '#lib/components/ui/kbd/index.js';
	import { Progress } from '#lib/components/ui/progress/index.js';
	import { Skeleton } from '#lib/components/ui/skeleton/index.js';
	import * as ToggleGroup from '#lib/components/ui/toggle-group/index.js';
	import { haptic } from '#lib/features/cards/haptic.js';
	import { DecideData } from './data.svelte.ts';
	import DuelSide from './DuelSide.svelte';
	import LiveRanking from './LiveRanking.svelte';
	import {
		duelFilters,
		duelPool,
		effectiveFilter,
		liveRanking,
		nextPair,
		pairStands,
		plural,
	} from './model.ts';
	import { reducedMotion } from './motion.svelte.ts';
	import { saveDuel } from './ops.ts';
	import { duelState, reportRefusal } from './state.svelte.ts';

	const PICK_PAUSE_MS = 620;

	const d = new DecideData();
	const pool = $derived(duelPool(d.places));
	const filters = $derived(duelFilters(pool, d.app.content.countries));
	const filter = $derived(effectiveFilter(pool, duelState.filter));
	const conf = $derived(Math.round(d.counts.conf * 100));

	let busy = $state(false);
	let result: { side: 'left' | 'right'; delta: number } | null = $state(null);
	let liveCountry: string | null = $state(null);
	let sheet: SheetTarget | null = $state(null);
	const reduced = $derived(reducedMotion.current);
	let releaseHold: (() => void) | null = null;

	// A pair is picked in the browser only (pickPair is random): a new one whenever the current one no longer stands.
	$effect(() => {
		if (busy || !d.ready) return;
		if (!pairStands(duelState.pair, pool, filter)) {
			duelState.pair = nextPair(pool, d.ratings, d.duels, filter);
		}
	});

	const sides = $derived.by(() => {
		const pair = duelState.pair;
		if (pair === null) return null;
		const a = d.byId.get(pair[0]);
		const b = d.byId.get(pair[1]);
		return a === undefined || b === undefined ? null : ([a, b] as const);
	});
	const sameCountry = $derived(
		sides !== null && sides[0].country === sides[1].country ? sides[0].country : null,
	);
	const rankCountry = $derived(liveCountry ?? sameCountry ?? sides?.[0].country ?? null);
	const ranking = $derived(rankCountry === null ? [] : liveRanking(pool, rankCountry));

	function setFilter(v: string): void {
		if (v === '' || busy) return;
		duelState.filter = v;
		duelState.pair = null;
		liveCountry = null;
	}

	function pick(side: 'left' | 'right'): void {
		if (busy || sides === null || d.isGuest || !d.ready) return;
		const [l, r] = sides;
		const winner = side === 'left' ? l : r;
		const loser = side === 'left' ? r : l;
		const { delta } = update(winner.rating ?? 1500, loser.rating ?? 1500);
		busy = true;
		releaseHold = holdRefresh();
		result = { side, delta };
		liveCountry = winner.country;
		haptic(12);
		void saveDuel(winner.id, loser.id).then((outcome) => {
			if (!outcome.ok) reportRefusal(outcome, 'Couldn’t save the duel');
		});
		setTimeout(
			() => {
				result = null;
				liveCountry = null;
				duelState.pair = nextPair(pool, d.ratings, d.duels, filter);
				busy = false;
				releaseHold?.();
				releaseHold = null;
			},
			reduced ? 0 : PICK_PAUSE_MS,
		);
	}

	/** "Can't decide": nothing is logged; the pair counts as met locally so it is not offered again right away. */
	function skip(): void {
		if (busy || duelState.pair === null) return;
		duelState.skipped.push({ winner: duelState.pair[0], loser: duelState.pair[1] });
		duelState.pair = nextPair(pool, d.ratings, [...d.duels, ...duelState.skipped], filter);
		liveCountry = null;
	}

	function onkeydown(e: KeyboardEvent): void {
		const t = e.target;
		if (t instanceof Element && t.closest('input, textarea, select, [contenteditable]')) return;
		if (e.metaKey || e.ctrlKey || e.altKey || sheet !== null || sides === null) return;
		if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === '1') {
			e.preventDefault();
			pick('left');
		} else if (e.key === 'ArrowRight' || e.key === 'd' || e.key === '2') {
			e.preventDefault();
			pick('right');
		} else if (e.key === 'ArrowDown' || e.key === 's') {
			e.preventDefault();
			skip();
		}
	}

	onDestroy(() => {
		releaseHold?.();
	});

	const pairKey = $derived(duelState.pair === null ? '' : duelState.pair.join('|'));
</script>

<svelte:window {onkeydown} />

{#if pool.length < 2}
	<Empty.Root>
		<Empty.Header>
			<Empty.Media><span class="text-5xl" aria-hidden="true">⚔️</span></Empty.Media>
			<Empty.Title><h1>Duels need contenders</h1></Empty.Title>
			<Empty.Description>
				Mark at least two places Must or Maybe in the swipe round, then come back for quick
				this-or-that calls. You have {pool.length}.
			</Empty.Description>
		</Empty.Header>
		<Empty.Content>
			<Button href={resolve('/(app)/decide/swipe')}>Go swipe →</Button>
		</Empty.Content>
	</Empty.Root>
{:else}
	<section class="mx-auto flex max-w-5xl flex-col gap-4" data-duels>
		<header class="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
			<div>
				<p class="text-xs font-semibold tracking-widest text-muted-foreground uppercase">
					Step 3 · this or that
				</p>
				<h1 class="font-serif text-3xl font-semibold">Duels</h1>
			</div>
			<div
				class="flex w-44 flex-col gap-1 sm:w-56"
				title="Ranking confidence: how many duels each pick has had"
				data-duel-progress
			>
				<span class="text-right text-sm text-muted-foreground"
					><b class="text-foreground">{conf}%</b> confident · {plural(d.duels.length, 'duel')}</span
				>
				<Progress value={conf} max={100} aria-label="Ranking confidence" />
			</div>
		</header>

		<div class="-mx-4 overflow-x-auto px-4 pb-1">
			<ToggleGroup.Root
				type="single"
				variant="outline"
				size="sm"
				value={filter}
				onValueChange={setFilter}
				aria-label="Duel filter"
			>
				{#each filters as f (f.id)}
					<ToggleGroup.Item value={f.id}>{f.label}</ToggleGroup.Item>
				{/each}
			</ToggleGroup.Root>
		</div>

		{#if d.isGuest}
			<p class="text-sm text-muted-foreground">
				Read only: guests can look at the duels and the ranking but not pick.
			</p>
		{/if}

		<div class="flex flex-col items-start gap-6 lg:flex-row">
			<div class="flex w-full min-w-0 flex-1 flex-col gap-4" data-arena>
				<p class="text-center font-serif text-xl font-semibold" data-duel-question>
					{#if sameCountry !== null}
						{d.country(sameCountry).flag} Which is more worth a day in {d.country(sameCountry)
							.name}?
					{:else}
						Which would you rather do?
					{/if}
				</p>
				{#if sides === null}
					<div class="flex gap-4" aria-hidden="true">
						<Skeleton class="h-80 flex-1" />
						<Skeleton class="h-80 flex-1" />
					</div>
				{:else}
					{#key pairKey}
						<div
							class="flex flex-row items-stretch"
							data-duel={pairKey}
							in:fly={{ y: 18, duration: reduced ? 0 : 450 }}
						>
							<DuelSide
								place={sides[0]}
								side="left"
								result={result === null
									? null
									: { won: result.side === 'left', delta: result.delta }}
								disabled={busy || d.isGuest || !d.ready}
								onpick={() => {
									pick('left');
								}}
								onopen={() => {
									sheet = { kind: 'place', id: sides[0].id };
								}}
							/>
							<div
								class="z-30 -mx-3 grid shrink-0 place-items-center self-center font-serif text-lg font-bold text-muted-foreground"
								aria-hidden="true"
							>
								<span
									class="grid size-12 place-items-center rounded-full border border-border bg-background shadow-soft"
									>VS</span
								>
							</div>
							<DuelSide
								place={sides[1]}
								side="right"
								result={result === null
									? null
									: { won: result.side === 'right', delta: result.delta }}
								disabled={busy || d.isGuest || !d.ready}
								onpick={() => {
									pick('right');
								}}
								onopen={() => {
									sheet = { kind: 'place', id: sides[1].id };
								}}
							/>
						</div>
					{/key}
				{/if}
				<div class="mt-2 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-sm">
					<Button
						variant="ghost"
						size="sm"
						disabled={busy || sides === null}
						aria-keyshortcuts="ArrowDown S"
						onclick={skip}>Can’t decide <Kbd>↓</Kbd></Button
					>
					<span class="hidden text-muted-foreground md:inline"
						><Kbd>←</Kbd> left · <Kbd>→</Kbd> right</span
					>
				</div>
			</div>
			{#if rankCountry !== null}
				<div class="w-full lg:sticky lg:top-24 lg:w-72 lg:shrink-0">
					<LiveRanking flag={d.country(rankCountry).flag} places={ranking} {reduced} />
				</div>
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
