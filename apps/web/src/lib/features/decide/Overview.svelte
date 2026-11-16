<!--
	The Decide overview (old game.js viewHome): the trip span, Must / Maybe / Duels counts, the "new cards" pill, the
	My calls and Route map links, and the five steps with a meter each. Read only for everyone (links only).
-->
<script lang="ts">
	import PenLine from '@lucide/svelte/icons/pen-line';
	import RouteIcon from '@lucide/svelte/icons/route';
	import { resolve } from '$app/paths';
	import { Progress } from '#lib/components/ui/progress/index.js';
	import { cn } from '#lib/utils.js';
	import { DecideData } from './data.svelte.ts';
	import { fmtDate, pct, plural, stepLine, steps, tripSpan, type StepId } from './model.ts';

	const d = new DecideData();
	const content = $derived(d.app.content);
	const n = $derived(d.counts);
	const span = $derived(tripSpan(content.countries));
	const list = $derived(steps(n, span.days));
	const summary = $derived(d.app.currentRoute?.summary);
	const routes = {
		areas: '/(app)/decide/areas',
		swipe: '/(app)/decide/swipe',
		duels: '/(app)/decide/duels',
		board: '/(app)/decide/board',
		holidays: '/(app)/decide/holidays',
	} as const satisfies Record<StepId, string>;
	// The Route map page belongs to slice C.
	const routeHref = resolve('/(app)/trip/map');
</script>

<section class="mx-auto flex max-w-3xl flex-col gap-6" data-decide-overview>
	<header class="flex flex-col gap-3">
		<p class="text-xs font-semibold tracking-widest text-muted-foreground uppercase">
			Decide · {plural(content.countries.length, 'country', 'countries')} · {span.days} days
		</p>
		<h1 class="font-serif text-4xl leading-tight font-semibold sm:text-5xl">
			Rank the trip,<br /><em class="text-cat">one swipe at a time.</em>
		</h1>
		<p class="text-muted-foreground">
			{#if span.from !== ''}{fmtDate(span.from)} → {fmtDate(span.to)} ·{/if}
			{content.countries.map((c) => `${c.flag} ${c.name}`).join(' · ')}
		</p>
		{#if n.newCount > 0}
			<a
				href={resolve(routes.swipe)}
				class="self-start rounded-full bg-cat/10 px-3 py-1.5 text-sm font-semibold text-cat hover:bg-cat/20"
				data-new-pill>✨ {n.newCount} new card{n.newCount === 1 ? '' : 's'} from the curator</a
			>
		{/if}
	</header>

	<div class="grid grid-cols-3 gap-3" data-decide-stats>
		{#each [{ label: 'Must', value: n.must, tone: 'text-must' }, { label: 'Maybe', value: n.maybe, tone: 'text-maybe' }, { label: 'Duels', value: n.duels, tone: 'text-cat' }] as s (s.label)}
			<div
				class="flex flex-col items-center rounded-2xl border border-border bg-card p-3 shadow-soft"
			>
				<b class={cn('font-serif text-3xl font-semibold', s.tone)}>{s.value}</b>
				<span class="text-xs font-semibold tracking-widest text-muted-foreground uppercase"
					>{s.label}</span
				>
			</div>
		{/each}
	</div>

	<div class="grid gap-2 sm:grid-cols-2">
		<a
			href={resolve('/(app)/decide/calls')}
			class="flex items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3 shadow-soft hover:border-cat"
			data-calls-link
		>
			<PenLine class="size-4.5 shrink-0 text-note" aria-hidden="true" />
			<span class="min-w-0 flex-1 text-sm"
				><b>My calls</b>
				<span class="text-muted-foreground"
					>{n.swiped + n.areasSwiped} swiped · {plural(n.notes, 'note')}</span
				></span
			>
			<span aria-hidden="true">→</span>
		</a>
		{#if summary !== undefined}
			<a
				href={routeHref}
				class="flex items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3 shadow-soft hover:border-cat"
				data-route-link
			>
				<RouteIcon class="size-4.5 shrink-0 text-cat" aria-hidden="true" />
				<span class="min-w-0 flex-1 text-sm"
					><b>Route map</b>
					<span class="text-muted-foreground"
						>{plural(summary.stops, 'stop')} in order{#if summary.unplaced > 0}&#32;·&#32;{summary.unplaced}
							must {summary.unplaced === 1 ? 'city' : 'cities'} not placed{/if}</span
					></span
				>
				<span aria-hidden="true">→</span>
			</a>
		{/if}
	</div>

	<ol class="flex flex-col gap-3" data-decide-steps>
		{#each list as s (s.id)}
			<li data-step={s.id}>
				<a
					href={resolve(routes[s.id])}
					class={cn(
						'flex flex-wrap items-center gap-x-4 gap-y-3 rounded-2xl border border-border bg-card p-4 shadow-soft transition duration-200 ease-soft hover:-translate-y-0.5 hover:border-cat hover:shadow-big sm:flex-nowrap',
					)}
				>
					<span
						class={cn(
							'grid size-11 shrink-0 place-items-center rounded-full font-serif text-xl font-semibold',
							s.festive ? 'bg-seal text-primary-foreground' : 'bg-cat/10 text-cat',
						)}
						aria-hidden="true">{s.n}</span
					>
					<span class="flex min-w-0 flex-1 flex-col gap-1">
						<b class="text-base">{s.title}</b>
						<span class="text-sm text-muted-foreground">{s.text}</span>
						<Progress value={pct(s.done, s.total)} max={100} aria-label={`${s.title} progress`} />
						<small class="text-xs text-muted-foreground" data-step-line>{stepLine(s)}</small>
					</span>
					<span
						class={cn(
							'inline-flex w-full items-center justify-center gap-2 rounded-full px-4 py-2 text-sm font-semibold whitespace-nowrap sm:w-auto',
							s.empty ? 'bg-muted text-muted-foreground' : 'bg-primary text-primary-foreground',
						)}>{s.cta}<span aria-hidden="true">→</span></span
					>
				</a>
			</li>
		{/each}
	</ol>

	<p class="text-sm text-muted-foreground">
		The game ranks; it never writes a day-by-day schedule. Swipes, duels and notes go to <code
			>feedback/</code
		>
		for the curator.{#if content.fixtures}<b class="ms-1">Test data.</b>{/if}
	</p>
</section>
