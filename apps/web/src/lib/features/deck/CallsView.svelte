<!--
	My calls (old game.js viewCalls): every swiped or noted card, areas first then places, grouped by country, with
	the call and the note editable inline. Filters: All / Areas / Places, Must / Maybe / Skip (a second tap clears),
	With notes, and the countries (when there are two or more). Calls are optimistic with rollback and toast
	"<Verdict>: <name>". The guest sees everything read only.
	Phone and md: the filters are chip rows that scroll sideways above the list. From xl up they stand in a sticky
	panel beside the list; on the monitor the list takes two columns.
-->
<script lang="ts">
	import PenLine from '@lucide/svelte/icons/pen-line';
	import { resolve } from '$app/paths';
	import PageHeader from '#lib/components/shell/PageHeader.svelte';
	import PlaceSheet from '#lib/components/shared/PlaceSheet.svelte';
	import type { SheetTarget } from '#lib/components/shared/PlaceSheet.types.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Empty from '#lib/components/ui/empty/index.js';
	import * as ToggleGroup from '#lib/components/ui/toggle-group/index.js';
	import { getAppData } from '#lib/content/app-data.svelte.js';
	import { setCall, verdictsOf } from '#lib/features/cards/calls.svelte.js';
	import { VERDICT_LABEL, type Verdict } from '#lib/features/cards/model.js';
	import CallRow from './CallRow.svelte';
	import {
		ALL_CALLS,
		callItems,
		filterCalls,
		groupByCountry,
		toggleCallsFilter,
		type CallItem,
		type CallsFilter,
	} from './deck.ts';
	import { callsFilter } from './local.svelte.ts';
	import { cn } from '#lib/utils.js';

	const app = getAppData();
	const verdicts = $derived(verdictsOf(app.feedback));
	const notes = $derived(app.feedback?.notes ?? { area: {}, place: {} });
	const all = $derived(callItems(app.content, verdicts, notes));
	const countries = $derived(
		app.content.countries.filter((c) => all.some((x) => x.country === c.id)),
	);
	// A country filter with nothing left falls back to all countries.
	const f: CallsFilter = $derived(
		callsFilter.value.country !== 'all' &&
			!countries.some((c) => c.id === callsFilter.value.country)
			? { ...callsFilter.value, country: 'all' }
			: callsFilter.value,
	);
	const shown = $derived(filterCalls(all, f));
	const noted = $derived(all.filter((x) => x.note !== '').length);
	const calls = $derived(all.filter((x) => x.verdict !== undefined).length);
	const cnt = (pred: (x: CallItem) => boolean): number => all.filter(pred).length;
	const groups = $derived(
		(['area', 'place'] as const)
			.map((round) => ({ round, items: shown.filter((x) => x.round === round) }))
			.filter((g) => g.items.length > 0),
	);
	const country = (id: string): { flag: string; name: string } => {
		const c = app.content.countries.find((x) => x.id === id);
		return { flag: c?.flag ?? '', name: c?.name ?? id };
	};
	const areasLeft = $derived(app.content.areas.some((a) => verdicts.area[a.id] === undefined));

	function setF(key: 'round' | 'verdict' | 'country' | 'noted', value: string): void {
		callsFilter.value = toggleCallsFilter(f, key, value);
	}

	let sheet: SheetTarget | null = $state(null);
</script>

{#snippet rows(items: CallItem[])}
	<div class="grid gap-2.5 3xl:grid-cols-2 3xl:gap-3">
		{#each items as row (`${row.round}:${row.id}`)}
			{@const c = country(row.country)}
			<CallRow
				{row}
				flag={c.flag}
				countryName={c.name}
				category={row.place === null ? undefined : app.content.categories[row.place.category]}
				readonly={app.isGuest}
				onopen={() => {
					sheet = { kind: row.round, id: row.id };
				}}
				onpick={(v: Verdict) =>
					void setCall(row.round, row.id, v, row.verdict, { toastName: row.short ?? row.name })}
			/>
		{/each}
	</div>
{/snippet}

{#if all.length === 0}
	<Empty.Root>
		<Empty.Header>
			<Empty.Media><span class="text-5xl" aria-hidden="true">✍️</span></Empty.Media>
			<Empty.Title><h1>No calls yet</h1></Empty.Title>
			<Empty.Description>
				Swipe a few cards first. Every Must, Maybe and Skip shows up here, and you can add the
				reason behind each one: tap Note on any card.
			</Empty.Description>
		</Empty.Header>
		<Empty.Content>
			<Button href={areasLeft ? resolve('/(app)/decide/areas') : resolve('/(app)/decide/swipe')}
				>Start swiping →</Button
			>
		</Empty.Content>
	</Empty.Root>
{:else}
	<section class="page-wide" data-calls>
		<PageHeader
			eyebrow="Your verdicts and the reasons"
			title="My calls"
			lede="Change a call or write down why you made it. Notes save as you type and go to the curator with your swipes."
		>
			{#snippet actions()}
				<p class="flex items-baseline gap-1.5 text-sm text-muted-foreground nums" data-calls-count>
					<b class="font-serif text-2xl leading-none font-semibold text-foreground">{calls}</b>
					calls <span aria-hidden="true" class="text-muted-foreground/50">·</span>
					<b class="font-serif text-2xl leading-none font-semibold text-note">{noted}</b>
					{noted === 1 ? 'note' : 'notes'}
				</p>
			{/snippet}
		</PageHeader>

		<div class="flex flex-col gap-5 xl:grid xl:grid-cols-12 xl:items-start xl:gap-8">
			<div class="flex flex-col gap-2 xl:sticky xl:top-6 xl:col-span-3 xl:gap-5 xl:panel xl:p-5">
				<div
					class="-mx-4 no-scrollbar flex items-center gap-2 overflow-x-auto px-4 py-0.5 md:-mx-6 md:px-6 xl:mx-0 xl:flex-col xl:items-stretch xl:gap-5 xl:overflow-visible xl:p-0"
				>
					<div class="flex shrink-0 flex-col gap-2">
						<p class="hidden eyebrow xl:block">Cards</p>
						<ToggleGroup.Root
							type="single"
							variant="pill"
							size="sm"
							spacing={1.5}
							class="xl:flex-wrap"
							value={f.round}
							onValueChange={(v: string) => {
								if (v !== '') setF('round', v);
							}}
							aria-label="Cards"
						>
							<ToggleGroup.Item value="all"
								>All <span class="nums opacity-60">{all.length}</span></ToggleGroup.Item
							>
							<ToggleGroup.Item value="area"
								>Areas <span class="nums opacity-60">{cnt((x) => x.round === 'area')}</span
								></ToggleGroup.Item
							>
							<ToggleGroup.Item value="place"
								>Places <span class="nums opacity-60">{cnt((x) => x.round === 'place')}</span
								></ToggleGroup.Item
							>
						</ToggleGroup.Root>
					</div>
					<span class="h-5 w-px shrink-0 bg-border xl:hidden" aria-hidden="true"></span>
					<div class="flex shrink-0 flex-col gap-2">
						<p class="hidden eyebrow xl:block">Call</p>
						<ToggleGroup.Root
							type="single"
							variant="pill"
							size="sm"
							spacing={1.5}
							class="xl:flex-wrap"
							value={f.verdict === 'all' ? '' : f.verdict}
							onValueChange={(v: string) => {
								setF('verdict', v === '' ? f.verdict : v);
							}}
							aria-label="Call"
						>
							{#each ['must', 'maybe', 'skip'] as const as k (k)}
								<ToggleGroup.Item value={k}
									><span
										class={cn(
											'size-2 rounded-full',
											k === 'must' && 'bg-must',
											k === 'maybe' && 'bg-maybe',
											k === 'skip' && 'bg-skip',
										)}
										aria-hidden="true"
									></span>{VERDICT_LABEL[k]}
									<span class="nums opacity-60">{cnt((x) => x.verdict === k)}</span
									></ToggleGroup.Item
								>
							{/each}
						</ToggleGroup.Root>
					</div>
					<span class="h-5 w-px shrink-0 bg-border xl:hidden" aria-hidden="true"></span>
					<div class="flex shrink-0 flex-col gap-2">
						<p class="hidden eyebrow xl:block">Notes</p>
						<ToggleGroup.Root
							type="single"
							variant="pill"
							size="sm"
							spacing={1.5}
							value={f.noted ? 'noted' : ''}
							onValueChange={() => {
								setF('noted', '');
							}}
							aria-label="Notes"
						>
							<ToggleGroup.Item value="noted"
								><PenLine aria-hidden="true" />With notes
								<span class="nums opacity-60">{noted}</span></ToggleGroup.Item
							>
						</ToggleGroup.Root>
					</div>
				</div>
				{#if countries.length > 1}
					<div
						class="-mx-4 no-scrollbar flex flex-col gap-2 overflow-x-auto px-4 py-0.5 md:-mx-6 md:px-6 xl:mx-0 xl:overflow-visible xl:p-0"
					>
						<p class="hidden eyebrow xl:block">Country</p>
						<ToggleGroup.Root
							type="single"
							variant="pill"
							size="sm"
							spacing={1.5}
							class="xl:flex-wrap"
							value={f.country}
							onValueChange={(v: string) => {
								setF('country', v === '' ? f.country : v);
							}}
							aria-label="Country"
						>
							<ToggleGroup.Item value="all">All countries</ToggleGroup.Item>
							{#each countries as c (c.id)}
								<ToggleGroup.Item value={c.id}
									>{c.flag}
									{c.name}
									<span class="nums opacity-60">{cnt((x) => x.country === c.id)}</span
									></ToggleGroup.Item
								>
							{/each}
						</ToggleGroup.Root>
					</div>
				{/if}
			</div>

			<div class="flex min-w-0 flex-col gap-8 xl:col-span-9">
				{#if groups.length > 0}
					{#each groups as g (g.round)}
						{@const parts = groupByCountry(g.items)}
						<section class="flex flex-col gap-3" data-calls-group={g.round}>
							<h2 class="flex items-baseline gap-2 font-serif text-2xl font-semibold">
								{g.round === 'area' ? 'Areas' : 'Places'}
								<span class="font-sans text-sm font-medium text-muted-foreground nums"
									>{g.items.length}</span
								>
							</h2>
							{#if g.round === 'area' && parts.length < 2}
								{@render rows(g.items)}
							{:else}
								{#each parts as part (part.country)}
									{@const c = country(part.country)}
									<h3
										class="mt-2 flex items-center gap-2 text-sm font-semibold text-ink-2 first-of-type:mt-0"
									>
										<span aria-hidden="true">{c.flag}</span>{c.name}
										<span class="font-normal text-muted-foreground nums">{part.items.length}</span>
										<span class="h-px flex-1 bg-border/70" aria-hidden="true"></span>
									</h3>
									{@render rows(part.items)}
								{/each}
							{/if}
						</section>
					{/each}
				{:else}
					<div
						class="flex flex-col items-start gap-2 rounded-2xl border border-dashed border-border bg-card/50 p-5"
					>
						{#if f.noted && noted === 0}
							<p>
								<b>No notes yet.</b> Tap <b>Note</b> on any card, or write one right here under any call.
							</p>
						{:else}
							<p><b>Nothing matches these filters.</b></p>
						{/if}
						<Button
							variant="link"
							class="-ml-3"
							onclick={() => {
								callsFilter.value = { ...ALL_CALLS };
							}}>Show everything</Button
						>
					</div>
				{/if}
			</div>
		</div>
	</section>
{/if}

<PlaceSheet
	target={sheet}
	onclose={() => {
		sheet = null;
	}}
/>
