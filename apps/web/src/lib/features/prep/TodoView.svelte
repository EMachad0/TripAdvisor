<!--
	The To do screen (old game/public/trip.js viewTodo): open tasks, then the done ones, with progress. A tap on the
	box ticks a task off (an in-progress one too) or back; ⋯ edits it. Writes are pessimistic (old save()).
-->
<script lang="ts">
	import { localKey } from '@atr/shared/trip';
	import PlusIcon from '@lucide/svelte/icons/plus';
	import { SvelteSet } from 'svelte/reactivity';
	import type { ContentCountry } from '#lib/content/types.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Empty from '#lib/components/ui/empty/index.js';
	import { Progress } from '#lib/components/ui/progress/index.js';
	import { write } from '#lib/sync/write.js';
	import Chip from '../money/Chip.svelte';
	import PageHead from '../money/PageHead.svelte';
	import RecordDialog from '../money/record/RecordDialog.svelte';
	import type { RecordTarget } from '../money/record/schema.ts';
	import type { TripData } from '../money/trip-docs.ts';
	import CheckRow from './CheckRow.svelte';
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

<PageHead eyebrow={m.eyebrow} title="To do" section="Prep" lede={m.lede}>
	{#snippet actions()}
		{#if canEdit}
			<Button type="button" onclick={() => (editing = { col: 'tasks', id: null })}>
				<PlusIcon data-icon="inline-start" />Add task
			</Button>
		{/if}
	{/snippet}
</PageHead>

{#snippet row(x: TaskRow)}
	<CheckRow
		id={x.id}
		title={x.title}
		note={x.note}
		checked={x.status === 'done'}
		indeterminate={x.status === 'doing'}
		checkLabel={`${x.status === 'done' ? 'Mark not done' : 'Mark done'}: ${x.title}`}
		{canEdit}
		busy={busy.has(x.id)}
		ontoggle={() => void toggle(x)}
		onedit={() => (editing = { col: 'tasks', id: x.id })}
	>
		{#snippet extra()}
			{#if x.status === 'doing'}<Chip tone="planned">In progress</Chip>{/if}
			{#if x.suggested}<Chip tone="booked">Suggested</Chip>{/if}
		{/snippet}
	</CheckRow>
{/snippet}

{#if m.total === 0}
	<Empty.Root>
		<Empty.Header>
			<Empty.Title>No tasks yet</Empty.Title>
			<Empty.Description>Add the first thing you need to do.</Empty.Description>
		</Empty.Header>
	</Empty.Root>
{:else}
	<div class="flex max-w-2xl flex-col gap-4">
		<Progress
			value={m.done}
			max={m.total}
			aria-label={`${String(m.done)} of ${String(m.total)} done`}
		/>
		{#if m.open.length > 0}
			<ul
				class="flex flex-col divide-y divide-border rounded-xl border border-border bg-card"
				aria-label="Open tasks"
			>
				{#each m.open as x (x.id)}{@render row(x)}{/each}
			</ul>
		{:else}
			<p class="text-sm text-muted-foreground">Everything is ticked.</p>
		{/if}
		{#if m.closed.length > 0}
			<div
				class="mt-2 flex justify-between gap-2 text-xs font-bold tracking-widest text-muted-foreground uppercase"
			>
				<span>Done</span><span>{m.closed.length}</span>
			</div>
			<ul
				class="flex flex-col divide-y divide-border rounded-xl border border-border bg-card"
				aria-label="Done tasks"
			>
				{#each m.closed as x (x.id)}{@render row(x)}{/each}
			</ul>
		{/if}
	</div>
{/if}

{#if canEdit}
	<RecordDialog
		target={editing}
		{trip}
		{countries}
		spendDefaults={{ today, country: '', currency: 'BRL' }}
		onclose={() => (editing = null)}
	/>
{/if}
