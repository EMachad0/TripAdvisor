<!--
	The To do screen: what is left before and during the trip, the most pressing first. Open tasks come in up to
	three groups (model.ts): the ones with a last day, the ones for any time, and the ones that cannot be done yet.
	Then the done ones, with progress. A tap on a title opens the task's notes and steps; only the box ticks it
	(an in-progress one too) or back; the pen edits it. Writes are pessimistic (old save()).

	Layout: one column on a phone and the Fold; on a laptop the open tasks fill the left and the progress and the
	done list sit in a column on the right.
-->
<script lang="ts">
	import { localKey } from '@atr/shared/trip';
	import ListChecksIcon from '@lucide/svelte/icons/list-checks';
	import PartyPopperIcon from '@lucide/svelte/icons/party-popper';
	import PlusIcon from '@lucide/svelte/icons/plus';
	import { onMount } from 'svelte';
	import { SvelteSet } from 'svelte/reactivity';
	import type { ContentCountry } from '#lib/content/types.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Empty from '#lib/components/ui/empty/index.js';
	import { write } from '#lib/sync/write.js';
	import PageHeader from '#lib/components/shell/PageHeader.svelte';
	import RecordDialog from '../money/record/RecordDialog.svelte';
	import type { RecordTarget } from '../money/record/schema.ts';
	import type { TripData } from '../money/trip-docs.ts';
	import PrepProgress from './PrepProgress.svelte';
	import TaskCard from './TaskCard.svelte';
	import { todoModel, toggleTaskFields, type StepRow, type TaskRow } from './model.ts';

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

	// Which tasks are open is a convenience of this browser: kept across visits, and fine to lose.
	const OPEN_KEY = 'atr.todo.open';
	function storedOpen(): string[] {
		try {
			const v: unknown = JSON.parse(localStorage.getItem(OPEN_KEY) ?? '[]');
			return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
		} catch {
			return [];
		}
	}
	const opened = new SvelteSet<string>();
	onMount(() => {
		for (const id of storedOpen()) opened.add(id);
	});
	function setOpen(id: string, open: boolean): void {
		if (open) opened.add(id);
		else opened.delete(id);
		try {
			localStorage.setItem(OPEN_KEY, JSON.stringify([...opened]));
		} catch {
			// private window or blocked storage: the page works without it
		}
	}

	async function toggle(x: TaskRow | StepRow): Promise<void> {
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

{#snippet row(x: TaskRow)}
	<TaskCard
		task={x}
		open={opened.has(x.id)}
		{canEdit}
		{busy}
		ontoggle={(t: TaskRow | StepRow) => void toggle(t)}
		onopen={(open: boolean) => {
			setOpen(x.id, open);
		}}
		onedit={(id: string) => (editing = { col: 'tasks', id })}
	/>
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
				class="contents xl:col-span-4 xl:col-start-9 xl:row-start-1 xl:flex xl:flex-col xl:gap-6"
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
							{#each m.closed as x (x.id)}{@render row(x)}{/each}
						</ul>
					</section>
				{/if}
			</div>

			<div
				class="order-2 flex min-w-0 flex-col gap-6 xl:order-none xl:col-span-8 xl:row-start-1"
				data-testid="open-tasks"
			>
				{#each m.groups as g (g.key)}
					<section class="flex flex-col gap-2" aria-labelledby={`todo-${g.key}`}>
						<div class="flex justify-between gap-2 px-1">
							<h2 id={`todo-${g.key}`} class="eyebrow">{g.title}</h2>
							<span class="eyebrow nums">{g.rows.length}</span>
						</div>
						<ul
							class="flex flex-col divide-y divide-border/70 overflow-hidden panel"
							aria-label={`${g.title} tasks`}
						>
							{#each g.rows as x (x.id)}{@render row(x)}{/each}
						</ul>
					</section>
				{:else}
					<div class="flex items-center gap-3 panel px-5 py-4 text-sm text-muted-foreground">
						<PartyPopperIcon class="size-5 text-cat" aria-hidden="true" />
						Everything is ticked.
					</div>
				{/each}
			</div>
		</div>
	{/if}
</div>

{#if canEdit}
	<RecordDialog
		target={editing}
		{trip}
		{countries}
		spendDefaults={{ today, country: '', currency: 'BRL' }}
		onretarget={(t: RecordTarget) => (editing = t)}
		onclose={() => (editing = null)}
	/>
{/if}
