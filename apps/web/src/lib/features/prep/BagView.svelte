<!--
	The Bag screen (old game/public/trip.js viewBag): items grouped by category with packed counts, a tick per item,
	and "Untick all" to repack before a move. Untick all asks first (old: arm, then "Confirm: untick all") and is one
	trip.bagUntickAll write (old: one POST per item).
-->
<script lang="ts">
	import { localKey } from '@atr/shared/trip';
	import PlusIcon from '@lucide/svelte/icons/plus';
	import { toast } from 'svelte-sonner';
	import { SvelteSet } from 'svelte/reactivity';
	import type { ContentCountry } from '#lib/content/types.js';
	import * as AlertDialog from '#lib/components/ui/alert-dialog/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Empty from '#lib/components/ui/empty/index.js';
	import { Progress } from '#lib/components/ui/progress/index.js';
	import { write } from '#lib/sync/write.js';
	import PageHead from '../money/PageHead.svelte';
	import RecordDialog from '../money/record/RecordDialog.svelte';
	import type { RecordTarget } from '../money/record/schema.ts';
	import type { TripData } from '../money/trip-docs.ts';
	import CheckRow from './CheckRow.svelte';
	import { bagModel, type BagItem } from './model.ts';

	interface Props {
		trip: TripData;
		countries: readonly ContentCountry[];
		canEdit: boolean;
	}

	let { trip, countries, canEdit }: Props = $props();

	const today = localKey();
	const m = $derived(bagModel(trip));
	const busy = new SvelteSet<string>();
	let editing: RecordTarget | null = $state(null);
	let confirmOpen = $state(false);

	async function toggle(x: BagItem): Promise<void> {
		if (busy.has(x.id)) return;
		busy.add(x.id);
		await write('trip.write', { col: 'bag', op: 'update', id: x.id, data: { packed: !x.packed } });
		busy.delete(x.id);
	}

	async function untickAll(): Promise<void> {
		confirmOpen = false;
		const outcome = await write('trip.bagUntickAll', {});
		if (outcome.ok) toast.success('All items unticked');
	}
</script>

<PageHead
	eyebrow={m.eyebrow}
	title="Bag"
	section="Prep"
	lede="One 40 L bag and a daily backpack for two winter months. Untick everything before each move to repack."
>
	{#snippet actions()}
		{#if canEdit}
			{#if m.packed > 0}
				<AlertDialog.Root bind:open={confirmOpen}>
					<AlertDialog.Trigger>
						{#snippet child({ props })}
							<Button {...props} type="button" variant="outline">Untick all</Button>
						{/snippet}
					</AlertDialog.Trigger>
					<AlertDialog.Content>
						<AlertDialog.Header>
							<AlertDialog.Title>Untick all {m.packed} packed items?</AlertDialog.Title>
							<AlertDialog.Description>
								Every item goes back to not packed, so you can repack before the move.
							</AlertDialog.Description>
						</AlertDialog.Header>
						<AlertDialog.Footer>
							<AlertDialog.Cancel>Cancel</AlertDialog.Cancel>
							<AlertDialog.Action variant="destructive" onclick={() => void untickAll()}>
								Confirm: untick all
							</AlertDialog.Action>
						</AlertDialog.Footer>
					</AlertDialog.Content>
				</AlertDialog.Root>
			{/if}
			<Button type="button" onclick={() => (editing = { col: 'bag', id: null })}>
				<PlusIcon data-icon="inline-start" />Add item
			</Button>
		{/if}
	{/snippet}
</PageHead>

{#if m.total === 0}
	<Empty.Root>
		<Empty.Header>
			<Empty.Title>Bag is empty</Empty.Title>
			<Empty.Description>Add the first thing to pack.</Empty.Description>
		</Empty.Header>
	</Empty.Root>
{:else}
	<div class="flex max-w-2xl flex-col gap-4">
		<Progress
			value={m.packed}
			max={m.total}
			aria-label={`${String(m.packed)} of ${String(m.total)} packed`}
		/>
		{#each m.groups as g (g.category)}
			<section class="flex flex-col gap-2" aria-label={g.category} data-testid="bag-group">
				<div
					class="mt-2 flex justify-between gap-2 text-xs font-bold tracking-widest text-muted-foreground uppercase"
				>
					<span>{g.category}</span><span>{g.packed}/{g.items.length}</span>
				</div>
				<ul class="flex flex-col divide-y divide-border rounded-xl border border-border bg-card">
					{#each g.items as x (x.id)}
						<CheckRow
							id={x.id}
							title={x.item}
							note={x.note}
							checked={x.packed}
							checkLabel={`Packed: ${x.item}`}
							{canEdit}
							busy={busy.has(x.id)}
							ontoggle={() => void toggle(x)}
							onedit={() => (editing = { col: 'bag', id: x.id })}
						>
							{#snippet extra()}
								{#if x.qtyLabel}
									<span class="text-ink-3 tabular-nums">{x.qtyLabel}</span>
								{/if}
							{/snippet}
						</CheckRow>
					{/each}
				</ul>
			</section>
		{/each}
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
