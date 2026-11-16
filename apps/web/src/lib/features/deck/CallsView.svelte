<!--
	My calls (old game.js viewCalls): every swiped or noted card, areas first then places, grouped by country, with
	the call and the note editable inline. Filters: All / Areas / Places, Must / Maybe / Skip (a second tap clears),
	With notes, and the countries (when there are two or more). Calls are optimistic with rollback and toast
	"<Verdict>: <name>". The guest sees everything read only.
-->
<script lang="ts">
	import PenLine from '@lucide/svelte/icons/pen-line';
	import { resolve } from '$app/paths';
	import PlaceSheet from '#lib/components/shared/PlaceSheet.svelte';
	import type { SheetTarget } from '#lib/components/shared/PlaceSheet.types.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Empty from '#lib/components/ui/empty/index.js';
	import { Separator } from '#lib/components/ui/separator/index.js';
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
	<div class="flex flex-col gap-2">
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
	<section class="mx-auto flex max-w-3xl flex-col gap-4" data-calls>
		<header class="flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
			<div>
				<p class="text-xs font-semibold tracking-widest text-muted-foreground uppercase">
					Your verdicts and the reasons
				</p>
				<h1 class="font-serif text-3xl font-semibold">My calls</h1>
			</div>
			<p class="text-sm text-muted-foreground" data-calls-count>
				<b class="text-foreground">{calls}</b> calls · <b class="text-foreground">{noted}</b>
				{noted === 1 ? 'note' : 'notes'}
			</p>
		</header>
		<p class="text-ink-2">
			Change a call or write down why you made it. Notes save as you type and go to the curator with
			your swipes.
		</p>

		<div class="-mx-4 flex flex-col gap-2 overflow-x-auto px-4 pb-1">
			<div class="flex items-center gap-2">
				<ToggleGroup.Root
					type="single"
					variant="outline"
					size="sm"
					value={f.round}
					onValueChange={(v: string) => {
						if (v !== '') setF('round', v);
					}}
					aria-label="Cards"
				>
					<ToggleGroup.Item value="all"
						>All <span class="text-muted-foreground">{all.length}</span></ToggleGroup.Item
					>
					<ToggleGroup.Item value="area"
						>Areas <span class="text-muted-foreground">{cnt((x) => x.round === 'area')}</span
						></ToggleGroup.Item
					>
					<ToggleGroup.Item value="place"
						>Places <span class="text-muted-foreground">{cnt((x) => x.round === 'place')}</span
						></ToggleGroup.Item
					>
				</ToggleGroup.Root>
				<Separator orientation="vertical" class="h-6" />
				<ToggleGroup.Root
					type="single"
					variant="outline"
					size="sm"
					value={f.verdict === 'all' ? '' : f.verdict}
					onValueChange={(v: string) => {
						setF('verdict', v === '' ? f.verdict : v);
					}}
					aria-label="Call"
				>
					{#each ['must', 'maybe', 'skip'] as const as k (k)}
						<ToggleGroup.Item value={k}
							>{VERDICT_LABEL[k]}
							<span class="text-muted-foreground">{cnt((x) => x.verdict === k)}</span
							></ToggleGroup.Item
						>
					{/each}
				</ToggleGroup.Root>
				<Separator orientation="vertical" class="h-6" />
				<ToggleGroup.Root
					type="single"
					variant="outline"
					size="sm"
					value={f.noted ? 'noted' : ''}
					onValueChange={() => {
						setF('noted', '');
					}}
					aria-label="Notes"
				>
					<ToggleGroup.Item value="noted"
						><PenLine aria-hidden="true" />With notes
						<span class="text-muted-foreground">{noted}</span></ToggleGroup.Item
					>
				</ToggleGroup.Root>
			</div>
			{#if countries.length > 1}
				<ToggleGroup.Root
					type="single"
					variant="outline"
					size="sm"
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
							<span class="text-muted-foreground">{cnt((x) => x.country === c.id)}</span
							></ToggleGroup.Item
						>
					{/each}
				</ToggleGroup.Root>
			{/if}
		</div>

		{#if groups.length > 0}
			{#each groups as g (g.round)}
				{@const parts = groupByCountry(g.items)}
				<section class="flex flex-col gap-2" data-calls-group={g.round}>
					<h2 class="font-serif text-xl font-semibold">
						{g.round === 'area' ? 'Areas' : 'Places'}
						<span class="text-base font-normal text-muted-foreground">{g.items.length}</span>
					</h2>
					{#if g.round === 'area' && parts.length < 2}
						{@render rows(g.items)}
					{:else}
						{#each parts as part (part.country)}
							{@const c = country(part.country)}
							<h3 class="mt-2 text-sm font-semibold text-muted-foreground">
								{c.flag}
								{c.name} <span class="font-normal">{part.items.length}</span>
							</h3>
							{@render rows(part.items)}
						{/each}
					{/if}
				</section>
			{/each}
		{:else}
			<div
				class="flex flex-col items-start gap-2 rounded-xl border border-dashed border-border p-4"
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
					onclick={() => {
						callsFilter.value = { ...ALL_CALLS };
					}}>Show everything</Button
				>
			</div>
		{/if}
	</section>
{/if}

<PlaceSheet
	target={sheet}
	onclose={() => {
		sheet = null;
	}}
/>
