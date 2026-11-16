<!--
	The Decide overview (old game.js viewHome): the trip span, Must / Maybe / Duels counts, the "new cards" pill, the
	My calls and Route map links, and the five steps with a meter each. Read only for everyone (links only).
	Phone: one column, the tally first, then the steps. From md up the steps are the main column and the tally, the
	links and the footnote sit beside them.
-->
<script lang="ts">
	import ArrowRight from '@lucide/svelte/icons/arrow-right';
	import PenLine from '@lucide/svelte/icons/pen-line';
	import RouteIcon from '@lucide/svelte/icons/route';
	import Sparkles from '@lucide/svelte/icons/sparkles';
	import { resolve } from '$app/paths';
	import PageHeader from '#lib/components/shell/PageHeader.svelte';
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
	const stats = $derived([
		{ label: 'Must', value: n.must, tone: 'text-must' },
		{ label: 'Maybe', value: n.maybe, tone: 'text-maybe' },
		{ label: 'Duels', value: n.duels, tone: 'text-cat' },
	]);
</script>

<section class="page 3xl:page-wide" data-decide-overview>
	<PageHeader
		eyebrow={`Decide · ${plural(content.countries.length, 'country', 'countries')} · ${String(span.days)} days`}
		title="Rank the trip, "
		accent="one swipe at a time."
	>
		<p>
			{#if span.from !== ''}<span class="font-medium text-foreground nums"
					>{fmtDate(span.from)} → {fmtDate(span.to)}</span
				>
				·{/if}
			{#each content.countries as c, i (c.id)}{#if i > 0}<span
						class="mx-1.5 text-muted-foreground/50"
						aria-hidden="true">·</span
					>{/if}<span class="whitespace-nowrap">{c.flag} {c.name}</span>{/each}
		</p>
		{#snippet actions()}
			{#if n.newCount > 0}
				<a
					href={resolve(routes.swipe)}
					class="inline-flex h-10 items-center gap-2 rounded-full bg-cat/12 px-4 text-sm font-semibold text-cat transition-colors hover:bg-cat/20"
					data-new-pill
					><Sparkles class="size-4" aria-hidden="true" />{n.newCount} new card{n.newCount === 1
						? ''
						: 's'} from the curator</a
				>
			{/if}
		{/snippet}
	</PageHeader>

	<div class="grid gap-5 md:grid-cols-12 md:gap-6 xl:gap-8">
		<aside
			class="flex flex-col gap-3 md:sticky md:top-6 md:col-span-5 md:col-start-8 md:row-start-1 md:self-start xl:col-span-4 xl:col-start-9"
		>
			<div class="grid grid-cols-3 divide-x divide-border/70 panel py-4" data-decide-stats>
				{#each stats as s (s.label)}
					<div class="flex flex-col items-center gap-1.5">
						<b class={cn('font-serif text-3xl leading-none font-semibold nums md:text-4xl', s.tone)}
							>{s.value}</b
						>
						<span class="eyebrow">{s.label}</span>
					</div>
				{/each}
			</div>

			<div class="grid grid-cols-1 gap-2">
				<a
					href={resolve('/(app)/decide/calls')}
					class="flex min-h-16 panel-lift items-center gap-3 panel px-4 py-3"
					data-calls-link
				>
					<span class="grid size-10 shrink-0 place-items-center rounded-xl bg-note/12 text-note">
						<PenLine class="size-4.5" aria-hidden="true" />
					</span>
					<span class="flex min-w-0 flex-1 flex-col text-sm"
						><b class="font-semibold">My calls</b>&#32;<span class="text-muted-foreground"
							>{n.swiped + n.areasSwiped} swiped · {plural(n.notes, 'note')}</span
						></span
					>
					<ArrowRight class="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
				</a>
				{#if summary !== undefined}
					<a
						href={routeHref}
						class="flex min-h-16 panel-lift items-center gap-3 panel px-4 py-3"
						data-route-link
					>
						<span class="grid size-10 shrink-0 place-items-center rounded-xl bg-cat/12 text-cat">
							<RouteIcon class="size-4.5" aria-hidden="true" />
						</span>
						<span class="flex min-w-0 flex-1 flex-col text-sm"
							><b class="font-semibold">Route map</b>&#32;<span class="text-muted-foreground"
								>{plural(summary.stops, 'stop')} in order{#if summary.unplaced > 0}{` · ${String(summary.unplaced)} must ${summary.unplaced === 1 ? 'city' : 'cities'} not placed`}{/if}</span
							></span
						>
						<ArrowRight class="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
					</a>
				{/if}
			</div>

			<p class="hidden px-1 text-sm text-muted-foreground md:block">
				The game ranks; it never writes a day-by-day schedule. Swipes, duels and notes go to <code
					class="font-mono text-xs">feedback/</code
				>
				for the curator.{#if content.fixtures}<b class="ms-1">Test data.</b>{/if}
			</p>
		</aside>

		<ol
			class="flex flex-col gap-2.5 md:col-span-7 md:col-start-1 md:row-start-1 xl:col-span-8 3xl:grid 3xl:grid-cols-2 3xl:gap-4"
			data-decide-steps
		>
			{#each list as s (s.id)}
				<li data-step={s.id} class="3xl:last:col-span-2">
					<a
						href={resolve(routes[s.id])}
						class="group flex h-full panel-lift items-start gap-4 panel p-4 md:gap-5 md:p-5"
					>
						<span
							class={cn(
								'grid size-10 shrink-0 place-items-center rounded-full font-serif text-lg font-semibold md:size-12 md:text-xl',
								s.festive ? 'bg-seal text-primary-foreground' : 'bg-cat/10 text-cat',
							)}
							aria-hidden="true">{s.n}</span
						>
						<span class="flex min-w-0 flex-1 flex-col gap-1">
							<span class="flex items-center justify-between gap-3">
								<b class="font-serif text-lg leading-tight font-semibold md:text-xl">{s.title}</b>
								<span
									class={cn(
										'inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold whitespace-nowrap transition-transform duration-200 ease-soft group-hover:translate-x-0.5',
										s.empty
											? 'bg-muted text-muted-foreground'
											: 'bg-primary text-primary-foreground',
									)}>{s.cta}<ArrowRight class="size-3.5" aria-hidden="true" /></span
								>
							</span>
							<span class="text-sm text-muted-foreground">{s.text}</span>
							<span class="mt-2 flex items-center gap-3">
								<Progress
									value={pct(s.done, s.total)}
									max={100}
									aria-label={`${s.title} progress`}
									class="flex-1"
								/>
								<small class="shrink-0 text-xs text-muted-foreground nums" data-step-line
									>{stepLine(s)}</small
								>
							</span>
						</span>
					</a>
				</li>
			{/each}
		</ol>

		<p class="px-1 text-sm text-muted-foreground md:hidden">
			The game ranks; it never writes a day-by-day schedule. Swipes, duels and notes go to <code
				class="font-mono text-xs">feedback/</code
			>
			for the curator.{#if content.fixtures}<b class="ms-1">Test data.</b>{/if}
		</p>
	</div>
</section>
