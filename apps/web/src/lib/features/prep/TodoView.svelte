<!--
	The To do screen (old game/public/trip.js viewTodo): open tasks, then the done ones, with progress. A tap on the
	box ticks a task off (an in-progress one too) or back; ⋯ edits it. Writes are pessimistic (old save()).

	Layout: one column on a phone and the Fold; on a laptop the open tasks fill the left and the progress and the done
	list sit in a sticky column on the right; on the monitor the open tasks become cards in two columns.
-->
<script lang="ts">
	import { localKey } from '@atr/shared/trip';
	import ListChecksIcon from '@lucide/svelte/icons/list-checks';
	import PartyPopperIcon from '@lucide/svelte/icons/party-popper';
	import PlusIcon from '@lucide/svelte/icons/plus';
	import { SvelteSet } from 'svelte/reactivity';
	import type { ContentCountry } from '#lib/content/types.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Empty from '#lib/components/ui/empty/index.js';
	import { write } from '#lib/sync/write.js';
	import Chip from '../money/Chip.svelte';
	import PageHeader from '#lib/components/shell/PageHeader.svelte';
	import RecordDialog from '../money/record/RecordDialog.svelte';
	import type { RecordTarget } from '../money/record/schema.ts';
	import type { TripData } from '../money/trip-docs.ts';
	import CheckRow from './CheckRow.svelte';
	import PrepProgress from './PrepProgress.svelte';
	import { todoModel, toggleTaskFields, type TaskRow } from './model.ts';

	interface Props {
		trip: TripData;
		countries: readonly ContentCountry[];
		canEdit: boolean;
	}

	let { trip, countries, canEdit }: Props = $props();

	const today = localKey();
	const m = $derived(todoModel(trip, today));
	const busy = new SvelteSet<string>();
	let editing: RecordTarget | null = $state(null);

	async function toggle(x: TaskRow): Promise<void> {
		if (busy.has(x.id)) return;
		busy.add(x.id);
		await write('trip.write', {
			col: 'tasks',
			op: 'update',
			id: x.id,
			data: toggleTaskFields(x.status),
		});
		busy.delete(x.id);
	}
</script>

<svelte:head>
	<title>To do · Asia Trip Ranker</title>
</svelte:head>

{#snippet row(x: TaskRow, card: boolean)}
	<CheckRow
		id={x.id}
		title={x.title}
		note={x.note}
		checked={x.status === 'done'}
		indeterminate={x.status === 'doing'}
		checkLabel={`${x.status === 'done' ? 'Mark not done' : 'Mark done'}: ${x.title}`}
		{canEdit}
		busy={busy.has(x.id)}
		class={card ? '3xl:mb-4 3xl:break-inside-avoid 3xl:panel 3xl:py-4' : ''}
		ontoggle={() => void toggle(x)}
		onedit={() => (editing = { col: 'tasks', id: x.id })}
	>
		{#snippet extra()}
			{#if x.status === 'doing'}<Chip tone="planned">In progress</Chip>{/if}
			{#if x.suggested}<Chip tone="booked">Suggested</Chip>{/if}
		{/snippet}
	</CheckRow>
{/snippet}

<div class="page-wide">
	<PageHeader eyebrow="Prep" title="To do" section="Prep" lede={m.lede}>
		{#snippet actions()}
			{#if canEdit}
				<Button
					type="button"
					size="lg"
					class="max-md:w-full"
					onclick={() => (editing = { col: 'tasks', id: null })}
				>
					<PlusIcon data-icon="inline-start" />Add task
				</Button>
			{/if}
		{/snippet}
	</PageHeader>

	{#if m.total === 0}
		<div class="panel">
			<Empty.Root>
				<Empty.Header>
					<Empty.Media variant="icon"><ListChecksIcon /></Empty.Media>
					<Empty.Title>No tasks yet</Empty.Title>
					<Empty.Description>Add the first thing you need to do.</Empty.Description>
				</Empty.Header>
			</Empty.Root>
		</div>
	{:else}
		<div class="flex flex-col gap-6 xl:grid xl:grid-cols-12 xl:items-start xl:gap-8 3xl:gap-10">
			<!-- On a phone: progress, open, done. On a laptop: open on the left, progress and done on the right. -->
			<div
				class="contents xl:col-span-4 xl:col-start-9 xl:row-start-1 xl:flex xl:flex-col xl:gap-6 3xl:col-span-3 3xl:col-start-10"
			>
				<div class="order-1 xl:order-none">
					<PrepProgress
						label={m.eyebrow}
						value={m.done}
						max={m.total}
						barLabel={`${String(m.done)} of ${String(m.total)} done`}
						word="done"
					/>
				</div>
				{#if m.closed.length > 0}
					<section class="order-3 flex flex-col gap-2 xl:order-none" aria-labelledby="todo-done">
						<div class="flex justify-between gap-2 px-1">
							<h2 id="todo-done" class="eyebrow">Done</h2>
							<span class="eyebrow nums">{m.closed.length}</span>
						</div>
						<ul
							class="flex flex-col divide-y divide-border/70 overflow-hidden panel"
							aria-label="Done tasks"
						>
							{#each m.closed as x (x.id)}{@render row(x, false)}{/each}
						</ul>
					</section>
				{/if}
			</div>

			<section
				class="order-2 flex min-w-0 flex-col gap-2 xl:order-none xl:col-span-8 xl:row-start-1 3xl:col-span-9"
				aria-labelledby="todo-open"
			>
				<div class="flex justify-between gap-2 px-1">
					<h2 id="todo-open" class="eyebrow">Open</h2>
					<span class="eyebrow nums">{m.open.length}</span>
				</div>
				{#if m.open.length > 0}
					<ul
						class="flex flex-col divide-y divide-border/70 overflow-hidden rounded-2xl border border-border/80 bg-card shadow-flat 3xl:block 3xl:columns-2 3xl:gap-4 3xl:divide-y-0 3xl:overflow-visible 3xl:rounded-none 3xl:border-0 3xl:bg-transparent 3xl:shadow-none"
						aria-label="Open tasks"
					>
						{#each m.open as x (x.id)}{@render row(x, true)}{/each}
					</ul>
				{:else}
					<div class="flex items-center gap-3 panel px-5 py-4 text-sm text-muted-foreground">
						<PartyPopperIcon class="size-5 text-cat" aria-hidden="true" />
						Everything is ticked.
					</div>
				{/if}
			</section>
		</div>
	{/if}
</div>

{#if canEdit}
	<RecordDialog
		target={editing}
		{trip}
		{countries}
		spendDefaults={{ today, country: '', currency: 'BRL' }}
		onclose={() => (editing = null)}
	/>
{/if}
