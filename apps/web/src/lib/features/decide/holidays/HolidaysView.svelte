<!--
	Holiday picks (old game.js viewHolidays and helpers). Christmas and New Year's Eve take one pick each: compare the
	options (locked one first, then by rating), duel them in a mini duel, then lock one in. Lunar New Year (pick-many)
	lists its options in day order, each with its own Must / Maybe / Skip.
	Locks are NOT optimistic (ops.ts): the button spins until the server answers, then the banner, the card and the
	badges change, with confetti and a toast. Mini-duel picks and calls are optimistic like everywhere else.
	The guest sees everything; Lock, Unlock, the duel and the calls are disabled.
-->
<script lang="ts">
	import { update } from '@atr/shared/elo';
	import { onDestroy } from 'svelte';
	import { flip } from 'svelte/animate';
	import { toast } from 'svelte-sonner';
	import PlaceSheet from '#lib/components/shared/PlaceSheet.svelte';
	import type { SheetTarget } from '#lib/components/shared/PlaceSheet.types.js';
	import { holdRefresh } from '#lib/components/shell/refresh.svelte.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import { setCall } from '#lib/features/cards/calls.svelte.js';
	import type { Verdict } from '#lib/features/cards/model.js';
	import { cn } from '#lib/utils.js';
	import { DecideData } from '../data.svelte.ts';
	import {
		brl,
		HOLIDAY_LIST,
		holidayPair,
		manySection,
		manyTally,
		manyWhenLine,
		oneWhenLine,
		oneSection,
		whereOn,
		type DecidePlace,
	} from '../model.ts';
	import { reducedMotion } from '../motion.svelte.ts';
	import { saveDuel, saveLock } from '../ops.ts';
	import { holidayDuels, reportRefusal } from '../state.svelte.ts';
	import { confetti } from './confetti.ts';
	import HolidayCard from './HolidayCard.svelte';
	import HolidayDuel from './HolidayDuel.svelte';

	const PICK_PAUSE_MS = 550;

	const d = new DecideData();
	const countries = $derived(d.app.content.countries);
	const readOnly = $derived(d.isGuest || !d.ready);

	/** Holiday id → the lock on its way: the place id, or null for an unlock. */
	const pending: Record<string, string | null> = $state({});
	/** Holiday id → the mini duel's last pick, shown for 550 ms. */
	const results: Record<string, { side: 'left' | 'right'; delta: number }> = $state({});
	let sheet: SheetTarget | null = $state(null);
	const reduced = $derived(reducedMotion.current);
	/** Refresh holds still open (a lock or a mini-duel pause), released if the page goes away first. */
	let holds: (() => void)[] = [];
	const hold = (): (() => void) => {
		const release = holdRefresh();
		holds.push(release);
		return () => {
			holds = holds.filter((r) => r !== release);
			release();
		};
	};
	onDestroy(() => {
		for (const release of holds) release();
		holds = [];
	});

	const country = (id: string): { flag: string; name: string } => d.country(id);
	const flag = (id: string): string => d.country(id).flag;
	const open = (id: string): void => {
		sheet = { kind: 'place', id };
	};

	async function lock(hid: string, id: string | null, el?: HTMLElement): Promise<void> {
		if (readOnly || pending[hid] !== undefined) return;
		pending[hid] = id;
		const release = hold();
		const outcome = await saveLock(hid, id);
		Reflect.deleteProperty(pending, hid);
		release();
		if (!outcome.ok) {
			reportRefusal(outcome, 'Couldn’t save the lock');
			return;
		}
		if (id !== null) {
			const r = el?.getBoundingClientRect();
			confetti(r ? r.left + r.width / 2 : innerWidth / 2, r ? r.top : innerHeight / 2);
			const h = HOLIDAY_LIST.find((x) => x.id === hid);
			toast(`${h?.emoji ?? ''} Locked: ${d.byId.get(id)?.name ?? id}`);
		}
	}

	function startDuel(hid: string): void {
		holidayDuels[hid] = holidayPair(d.places, hid, d.ratings, d.duels);
	}

	function stopDuel(hid: string): void {
		Reflect.deleteProperty(holidayDuels, hid);
		Reflect.deleteProperty(results, hid);
	}

	function duelSides(hid: string): readonly [DecidePlace, DecidePlace] | null {
		const pair = holidayDuels[hid];
		if (pair === undefined || pair === null) return null;
		const a = d.byId.get(pair[0]);
		const b = d.byId.get(pair[1]);
		return a === undefined || b === undefined ? null : [a, b];
	}

	function pickDuel(hid: string, side: 'left' | 'right'): void {
		const sides = duelSides(hid);
		if (readOnly || sides === null || results[hid] !== undefined) return;
		const [l, r] = sides;
		const winner = side === 'left' ? l : r;
		const loser = side === 'left' ? r : l;
		results[hid] = { side, delta: update(winner.rating ?? 1500, loser.rating ?? 1500).delta };
		const release = hold();
		void saveDuel(winner.id, loser.id).then((outcome) => {
			if (!outcome.ok) reportRefusal(outcome, 'Couldn’t save the duel');
		});
		setTimeout(
			() => {
				Reflect.deleteProperty(results, hid);
				if (holidayDuels[hid] !== undefined) startDuel(hid);
				release();
			},
			reduced ? 0 : PICK_PAUSE_MS,
		);
	}

	function call(p: DecidePlace, verdict: Verdict): void {
		if (readOnly) return;
		void setCall('place', p.id, verdict, p.verdict ?? undefined, { toastName: p.short ?? p.name });
	}

	const sections = $derived(
		HOLIDAY_LIST.map((h) =>
			h.pick === 'many'
				? { many: true as const, s: manySection(h, d.places, countries) }
				: { many: false as const, s: oneSection(h, d.places, countries, d.locks[h.id]) },
		),
	);
	const snow = Array.from({ length: 28 }, (_, i) => ({
		x: (i * 37) % 100,
		dur: 6 + (i % 7),
		r: 1.5 + ((i * 13) % 10) / 6,
	}));
</script>

<section class="page-wide flex flex-col gap-10 md:gap-12 3xl:gap-14" data-holidays>
	<header
		class="relative -mx-4 -mt-1 overflow-hidden bg-linear-150 from-scrim via-scrim/95 to-seal px-5 py-8 text-on-scrim shadow-soft md:mx-0 md:mt-0 md:rounded-3xl md:px-8 md:py-10 xl:px-12 xl:py-12 dark:to-seal/45 dark:ring-1 dark:ring-border"
	>
		<svg
			class="pointer-events-none absolute inset-0 size-full motion-reduce:hidden"
			aria-hidden="true"
		>
			{#each snow as f, i (i)}
				<circle cx="{f.x}%" cy="-5%" r={f.r} class="fill-on-scrim/60">
					<animate
						attributeName="cy"
						from="-5%"
						to="110%"
						dur="{f.dur}s"
						begin="-{(i * 0.37) % f.dur}s"
						repeatCount="indefinite"
					/>
				</circle>
			{/each}
		</svg>
		<div class="relative grid gap-8 md:grid-cols-5 md:items-end md:gap-8 xl:gap-12">
			<div class="flex flex-col gap-3 md:col-span-3">
				<p class="text-2xs font-semibold tracking-widest uppercase opacity-75">
					Step 5 · the big nights
				</p>
				<h1
					class="font-serif text-4xl leading-none font-semibold tracking-tight md:text-5xl 3xl:text-6xl"
				>
					Holiday picks
				</h1>
				<p class="max-w-prose font-serif text-sm leading-relaxed italic opacity-85 md:text-lg">
					Christmas and New Year’s Eve are one night each: compare the options, duel them if you
					can’t decide, then lock one in. Lunar New Year in Hong Kong runs for days, so there you
					can say yes to as many as you like.
				</p>
			</div>
			<nav aria-label="Holidays" class="md:col-span-2">
				<ul class="flex flex-col gap-1.5">
					{#each sections as sec (sec.s.holiday.id)}
						{@const h = sec.s.holiday}
						{@const status = sec.many
							? sec.s.opts.length === 0
								? 'No options yet'
								: `${String(sec.s.opts.filter((p) => p.verdict === 'must').length)} of ${String(sec.s.opts.length)} Must`
							: sec.s.locked !== undefined
								? `🔒 ${sec.s.locked.short ?? sec.s.locked.name}`
								: `${String(sec.s.opts.length)} options · open`}
						{@const done = sec.many ? false : sec.s.locked !== undefined}
						<li>
							<a
								href={`#hol-${h.id}`}
								class="flex min-h-11 items-center gap-3 rounded-xl bg-on-scrim/8 px-3 py-2 ring-1 ring-on-scrim/12 transition-colors hover:bg-on-scrim/14"
							>
								<span class="text-xl" aria-hidden="true">{h.emoji}</span>
								<span class="flex min-w-0 flex-1 flex-col">
									<span class="text-sm font-semibold">{h.short}</span>
									<span class={cn('truncate text-xs', done ? 'text-on-scrim' : 'opacity-70')}
										>{status}</span
									>
								</span>
								<span aria-hidden="true" class="opacity-60">↓</span>
							</a>
						</li>
					{/each}
				</ul>
			</nav>
		</div>
	</header>

	{#if d.isGuest}
		<p class="-mt-6 text-sm text-muted-foreground">
			Read only: guests can look at the options but not lock, duel or call them.
		</p>
	{/if}

	{#each sections as sec (sec.s.holiday.id)}
		{@const h = sec.s.holiday}
		<section
			id={`hol-${h.id}`}
			data-holiday={h.id}
			class="flex scroll-mt-24 flex-col gap-4 md:gap-5"
		>
			{#if sec.many}
				{@const m = sec.s}
				<header>
					<h2 class="font-serif text-2xl leading-tight font-semibold md:text-3xl">
						<span aria-hidden="true">{h.emoji}</span>
						{h.title}
					</h2>
					<p class="mt-1 text-sm text-muted-foreground" data-holiday-when>
						{manyWhenLine(m, country)}
					</p>
				</header>
				{#if m.opts.length > 0}
					<p class="max-w-prose text-sm text-ink-2">
						{m.apart
							? `These don’t compete: each is on a different day, so you can do all ${String(m.opts.length)}.`
							: 'These don’t compete: they are spread over the holiday, so you can do more than one.'}
						Call each one Must, Maybe or Skip.
						<span class="mt-1 block font-semibold text-muted-foreground" data-tally
							>{manyTally(m.opts)}</span
						>
					</p>
					<div class="grid gap-4 md:grid-cols-2 md:gap-5 xl:grid-cols-3 3xl:grid-cols-4">
						{#each m.opts as p, i (p.id)}
							<HolidayCard
								place={p}
								holidayShort={h.short}
								{country}
								where={whereOn(m.days[i] ?? null, m.where, countries)}
								day={m.days[i] ?? null}
								many
								locked={false}
								topPick={false}
								pending={undefined}
								disabled={readOnly}
								onopen={() => {
									open(p.id);
								}}
								oncall={(v: Verdict) => {
									call(p, v);
								}}
							/>
						{/each}
					</div>
				{:else}
					{@render empty(h.emoji, h.short, h.tag, 'in day order')}
				{/if}
			{:else}
				{@const o = sec.s}
				{@const sides = duelSides(h.id)}
				{@const lockedId = o.locked?.id}
				<header class="flex flex-wrap items-end justify-between gap-3">
					<div>
						<h2 class="font-serif text-2xl leading-tight font-semibold md:text-3xl">
							<span aria-hidden="true">{h.emoji}</span>
							{h.title}
						</h2>
						<p class="mt-1 text-sm text-muted-foreground" data-holiday-when>
							{oneWhenLine(o, country)}
						</p>
					</div>
					{#if o.opts.length >= 2 && holidayDuels[h.id] === undefined}
						<Button
							variant="outline"
							disabled={readOnly}
							onclick={() => {
								startDuel(h.id);
							}}>⚔️ Duel them</Button
						>
					{/if}
				</header>
				{#if o.locked !== undefined}
					{@const p = o.locked}
					<div
						class="flex items-center gap-3 rounded-2xl border border-must/30 bg-must/10 px-4 py-3 md:max-w-2xl"
						data-locked-banner={h.id}
					>
						<span
							class="grid size-11 shrink-0 place-items-center rounded-full bg-must/20 text-xl"
							aria-hidden="true">🔒</span
						>
						<div class="grid min-w-0 flex-1 gap-0.5">
							<small class="text-2xs font-bold tracking-widest text-must uppercase"
								>Locked in for {h.short}</small
							>
							<b class="truncate font-serif text-lg leading-tight font-semibold">{p.name}</b>
							<span class="text-sm text-muted-foreground"
								>{flag(p.country)} {p.cityName} · {brl(p.brl)}</span
							>
						</div>
						<Button
							variant="link"
							size="sm"
							disabled={readOnly || pending[h.id] !== undefined}
							onclick={() => {
								void lock(h.id, null);
							}}>Unlock</Button
						>
					</div>
				{/if}
				{#if sides !== null}
					<HolidayDuel
						emoji={h.emoji}
						short={h.short}
						{sides}
						result={results[h.id] ?? null}
						{flag}
						disabled={readOnly}
						onpick={(side: 'left' | 'right') => {
							pickDuel(h.id, side);
						}}
						ondone={() => {
							stopDuel(h.id);
						}}
					/>
				{/if}
				{#if o.opts.length > 0}
					<div class="grid gap-4 md:grid-cols-2 md:gap-5 xl:grid-cols-3 3xl:grid-cols-4">
						{#each o.opts as p, i (p.id)}
							<div animate:flip={{ duration: reduced ? 0 : 420 }} class="grid">
								<HolidayCard
									place={p}
									holidayShort={h.short}
									{country}
									where={o.where}
									many={false}
									locked={p.id === lockedId}
									topPick={i === 0 && p.games > 0 && p.id !== lockedId}
									pending={pending[h.id]}
									disabled={readOnly}
									onopen={() => {
										open(p.id);
									}}
									onlock={(el: HTMLElement) => {
										void lock(h.id, p.id, el);
									}}
									onunlock={() => {
										void lock(h.id, null);
									}}
								/>
							</div>
						{/each}
					</div>
				{:else}
					{@render empty(h.emoji, h.short, h.tag, 'side by side')}
				{/if}
			{/if}
		</section>
	{/each}
</section>

{#snippet empty(emoji: string, short: string, tag: string, how: string)}
	<div
		class={cn(
			'flex items-center gap-4 rounded-2xl border-2 border-dashed border-border p-6 text-ink-2 md:max-w-2xl',
		)}
		data-holiday-empty
	>
		<span class="text-4xl grayscale-30" aria-hidden="true">{emoji}</span>
		<p>
			<b>No {short} options yet.</b> The curator tags places with <code>{tag}</code>; they’ll show
			up here {how}.
		</p>
	</div>
{/snippet}

<PlaceSheet
	target={sheet}
	onclose={() => {
		sheet = null;
	}}
/>
