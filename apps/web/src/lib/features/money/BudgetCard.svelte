<!-- One country's daily budget (old viewMoney "Per day, by country" card): split bar, spend so far, how to pay. -->
<script lang="ts">
	import { TZ_OFFSET } from '@atr/shared/trip';
	import ChevronDownIcon from '@lucide/svelte/icons/chevron-down';
	import * as Card from '#lib/components/ui/card/index.js';
	import * as Collapsible from '#lib/components/ui/collapsible/index.js';
	import Bar from './Bar.svelte';
	import EditButton from './EditButton.svelte';
	import { cn } from '#lib/utils.js';
	import RichText from './RichText.svelte';
	import { CAT_LABEL, CATEGORIES, fmtR, plural, type CountryCard } from './model.ts';

	interface Props {
		card: CountryCard;
		canEdit: boolean;
		onedit: (id: string) => void;
	}

	let { card, canEdit, onedit }: Props = $props();
	const row = $derived(card.row);
	const FILL = { bed: 'fill-k3', food: 'fill-k4', other: 'fill-k5' } as const;
	const DOT = { bed: 'bg-k3', food: 'bg-k4', other: 'bg-k5' } as const;
</script>

<Card.Root size="sm" data-testid="budget-card" data-country={row.country}>
	<Card.Header>
		<Card.Title><h3>{row.flag} {row.name}</h3></Card.Title>
		{#if canEdit}
			<Card.Action>
				<EditButton
					label={`${row.name} budget`}
					onclick={() => {
						onedit(row.id);
					}}
				/>
			</Card.Action>
		{/if}
	</Card.Header>
	<Card.Content>
		<div class="flex flex-col gap-3">
			<p class="text-sm">
				<b>{fmtR(card.daily)}</b> / day · {plural(row.days, 'day')} · {fmtR(card.planned)}
			</p>
			<Bar
				segments={CATEGORIES.map((k) => ({ key: k, pct: card.split[k], fill: FILL[k] }))}
				size="md"
			/>
			<div class="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
				{#each CATEGORIES as k (k)}
					<span class="inline-flex items-center gap-1.5">
						<i class={cn('size-2 rounded-full', DOT[k])}></i>{CAT_LABEL[k]}
						<b class="text-foreground">{fmtR(row[k])}</b>
					</span>
				{/each}
			</div>
			{#if card.spent}
				<p class="text-sm">Spent {fmtR(card.spent)} of {fmtR(card.planned)}</p>
				<Bar
					segments={[
						{ key: 'spent', pct: card.spentPct, fill: card.over ? 'fill-seal' : 'fill-ok' },
					]}
					size="sm"
				/>
			{/if}
		</div>
	</Card.Content>
	{#if row.pay}
		<Card.Footer>
			<Collapsible.Root class="w-full">
				<Collapsible.Trigger>
					{#snippet child({ props })}
						<button
							{...props}
							type="button"
							class="group flex w-full items-center justify-between gap-2 text-left text-sm font-semibold text-cat"
						>
							How to pay in {row.name}
							<ChevronDownIcon
								class="size-4 transition-transform group-data-[state=open]:rotate-180"
							/>
						</button>
					{/snippet}
				</Collapsible.Trigger>
				<Collapsible.Content>
					<RichText
						class="mt-2 text-sm text-ink-2"
						text={row.pay}
						offset={Object.hasOwn(TZ_OFFSET, row.country) ? TZ_OFFSET[row.country] : null}
					/>
				</Collapsible.Content>
			</Collapsible.Root>
		</Card.Footer>
	{/if}
</Card.Root>
