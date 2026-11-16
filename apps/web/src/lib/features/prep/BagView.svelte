<!--
	The Bag screen (old game/public/trip.js viewBag): items grouped by category with packed counts, a tick per item,
	and "Untick all" to repack before a move. Untick all asks first (old: arm, then "Confirm: untick all") and is one
	trip.bagUntickAll write (old: one POST per item).

	Layout: the categories flow into columns (one on a phone, two on the Fold, three on a laptop, four on the
	monitor) under a progress panel that counts each category.
-->
<script lang="ts">
	import { localKey } from '@atr/shared/trip';
	import BackpackIcon from '@lucide/svelte/icons/backpack';
	import PlusIcon from '@lucide/svelte/icons/plus';
	import { toast } from 'svelte-sonner';
	import { SvelteSet } from 'svelte/reactivity';
	import type { ContentCountry } from '#lib/content/types.js';
	import * as AlertDialog from '#lib/components/ui/alert-dialog/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Empty from '#lib/components/ui/empty/index.js';
	import { write } from '#lib/sync/write.js';
	import PageHeader from '#lib/components/shell/PageHeader.svelte';
	import { cn } from '#lib/utils.js';
	import RecordDialog from '../money/record/RecordDialog.svelte';
	import type { RecordTarget } from '../money/record/schema.ts';
	import type { TripData } from '../money/trip-docs.ts';
	import CheckRow from './CheckRow.svelte';
	import PrepProgress from './PrepProgress.svelte';
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

<svelte:head>
	<title>Bag · Asia Trip Ranker</title>
</svelte:head>

<div class="page-wide">
	<PageHeader
		eyebrow="Prep"
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
								<Button {...props} type="button" variant="outline" size="lg" class="max-md:flex-1"
									>Untick all</Button
								>
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
				<Button
					type="button"
					size="lg"
					class="max-md:flex-1"
					onclick={() => (editing = { col: 'bag', id: null })}
				>
					<PlusIcon data-icon="inline-start" />Add item
				</Button>
			{/if}
		{/snippet}
	</PageHeader>

	{#if m.total === 0}
		<div class="panel">
			<Empty.Root>
				<Empty.Header>
					<Empty.Media variant="icon"><BackpackIcon /></Empty.Media>
					<Empty.Title>Bag is empty</Empty.Title>
					<Empty.Description>Add the first thing to pack.</Empty.Description>
				</Empty.Header>
			</Empty.Root>
		</div>
	{:else}
		<div class="flex flex-col gap-6 md:gap-8">
			<PrepProgress
				label={m.eyebrow}
				value={m.packed}
				max={m.total}
				barLabel={`${String(m.packed)} of ${String(m.total)} packed`}
				word="packed"
			>
				<ul class="flex flex-wrap gap-1.5" aria-label="Packed by category">
					{#each m.groups as g (g.category)}
						{@const full = g.packed === g.items.length}
						<li
							class={cn(
								'inline-flex h-7 items-center gap-1.5 rounded-full px-3 text-xs font-medium',
								full ? 'bg-ok/12 text-ok' : 'bg-muted/80 text-muted-foreground',
							)}
						>
							{g.category}
							<span class="font-semibold nums">{g.packed}/{g.items.length}</span>
						</li>
					{/each}
				</ul>
			</PrepProgress>

			<div class="gap-6 md:columns-2 xl:columns-3 3xl:columns-4">
				{#each m.groups as g (g.category)}
					<section
						class="mb-6 flex break-inside-avoid flex-col gap-2"
						aria-label={g.category}
						data-testid="bag-group"
					>
						<div class="flex justify-between gap-2 px-1">
							<h2 class="eyebrow">{g.category}</h2>
							<span class={cn('eyebrow nums', g.packed === g.items.length && 'text-ok')}
								>{g.packed}/{g.items.length}</span
							>
						</div>
						<ul class="flex flex-col divide-y divide-border/70 overflow-hidden panel">
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
											<span
												class="inline-flex h-5 items-center rounded-full bg-muted px-1.5 text-xs font-semibold text-muted-foreground nums"
												>{x.qtyLabel}</span
											>
										{/if}
									{/snippet}
								</CheckRow>
							{/each}
						</ul>
					</section>
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
		onclose={() => (editing = null)}
	/>
{/if}
